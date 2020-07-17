var ex_customui = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const Cc = Components.classes;
    const { Services } = ChromeUtils.import(
        "resource://gre/modules/Services.jsm");
    const { ExtensionParent } = ChromeUtils.import(
        "resource://gre/modules/ExtensionParent.jsm");
    const { setTimeout } = ChromeUtils.import(
        "resource://gre/modules/Timer.jsm");

    // Window monitoring helper ===============================================
    const windowLoadListeners = []; // called with each newly loaded DOM window
    const loadedWindows = []; // array of all currently loaded DOM windows
    {
      let active = true;
      const windowMonitor = {
        onOpenWindow(window) {
          // this method may be called with a interface requestor or a dom window
          if (!(window instanceof Ci.nsIDOMWindow)) {
            window = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(
                Ci.nsIDOMWindow);
          }
          if (window.document.readyState === "complete") {
            loadedWindows.push(window);
          } else {
            window.addEventListener("load", () => {
              if (!active) return; // prevent callbacks after unloading
              loadedWindows.push(window);
              for (let listener of windowLoadListeners) {
                try {
                  const listenerResult = listener(window);
                  if (listenerResult instanceof Promise) {
                    listenerResult.catch(console.error);
                  }
                } catch(e) {
                  console.error(e);
                }
              }
            }, {once: true})
          }
        },
        onCloseWindow(window) {
          window = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(
              Ci.nsIDOMWindow);
          const index = loadedWindows.indexOf(window);
          if (index >= 0) {
            loadedWindows.splice(index, 1);
          }
        },
        onWindowTitleChange(window, title) {
           // not interested
        }
      };
      Services.wm.addListener(windowMonitor);
      for (let window of Services.wm.getEnumerator(null)) {
        windowMonitor.onOpenWindow(window);
      }
      context.callOnClose({close(){
        active = false;
        Services.wm.removeListener(windowMonitor);
      }});
    }

    // WebExtension frame helper ==============================================

    // Causes listeners on the onEvent API to fire within the given frame, for
    // an event with the given type and details. If expectResult is set, the
    // method returns a promise resolving to a truthy listener result or null
    // if no listener returned a truthy value or the request timed out.
    const fireWebextFrameEvent = function(frame, type, details, expectResult) {
      let result = undefined;
      let data = {type, details};
      if (expectResult) {
        // We register a temporary message listener that will resolve our result
        // promise, but is guaranteed to unregister after some time. To ensure
        // that the listener only catches the correct event, we add a message
        // token that should be sufficiently unique.
        // Note that we will always run into the timeout if the client API is
        // not loaded in the frame.
        data.token = Math.random().toString(36).substring(2, 15);
        result = new Promise(resolve => {
          let listener;
          const done = function(result) {
            // it is possible that the frame is already detached, in that case
            // we can't remove our listener.
            if (frame.messageManager) {
              frame.messageManager.removeMessageListener("ex:customui:onEvent",
                  listener);
            }
            resolve(result);
          };
          listener = {
            receiveMessage(message) {
              if (message.data.type === type
                  && message.data.token === data.token) {
                done(message.data.result);
              }
            }
          };
          frame.messageManager.addMessageListener("ex:customui:onEvent",
              listener);
          setTimeout(() => done(null), 1000); // maximal delay: 1 second
        });
      }
      frame.messageManager.sendAsyncMessage("ex:customui:onEvent", data);
      return result;
    };

    // Creates and inserts the WebExtension frame for the given URL and location
    // id as child of the given parent node (inserted before the given reference
    // node, if any), and returns an element containing it (which can be styled
    // to set height / with, and has a setCustomUIContextProperty(key, value)
    // function to set structured-clone-able data on the context exposed to the
    // WebExtension).
    const insertWebextFrame = function(location, url, parentNode,
        referenceNode) {
      const result = parentNode.ownerDocument.createXULElement("browser");
      result.setAttribute("type", "content");
      result.setAttribute("transparent", "true");
      result.setAttribute("disablehistory", "true");
      result.setAttribute("id", "customui-" + location + "-"
          + context.contextid + "-" + url);
      parentNode.insertBefore(result, referenceNode || null);
      ExtensionParent.apiManager.emit("extension-browser-inserted", result);
      const uiContext = {location};
      result.messageManager.addMessageListener("ex:customui:getContext",
          {receiveMessage(message) { return uiContext; }});
      result.setCustomUIContextProperty = function(key, value) {
        uiContext[key] = value;
        fireWebextFrameEvent(result, "context", uiContext, false);
      };
      result.src = url;
      return result;
    };

    // Removes the WebExtension frame with the given tag and URL from the given
    // document, and returns its parent node (or null if there is no such
    // frame.
    const removeWebextFrame = function(tag, url, document) {
      const frame = document.getElementById("customui-" + tag + "-"
          + context.contextid + "-" + url);
      if (!frame) {
        return null;
      }
      const result = frame.parentNode;
      result.removeChild(frame);
      return result;
    };

    // Location-specific handlers =============================================
    const locationHandlers = {};
    {
      // Helper to reduce boilerplate: adds mandatory handler components with
      // reasonable default implementations and initializes the result.
      function makeLocationHandler(handler) {
        // Map from registered urls to their options
        handler.registered = new Map();
        // Registers an URL, if it has not been registered before.
        handler.onAdd = function(url, options) {
          if (this.registered.has(url)) {
            // already registered, unregister first to trigger a reload
            this.onRemove(url);
          }
          this.registered.set(url, options);
          if (this.injectIntoWindow) {
            for (let window of loadedWindows) {
              this.injectIntoWindow(window, url, options);
            }
          }
        };
        // Unregisters an URL, if it has been registered before.
        handler.onRemove = function(url) {
          if (!this.registered.has(url)) {
            return; // was not registered
          }
          this.registered.delete(url);
          if (this.uninjectFromWindow) {
            for (let window of loadedWindows) {
              this.uninjectFromWindow(window, url);
            }
          }
        };
        // Unregisters all registered URLs
        handler.onRemoveAll = function() {
          for (let url of this.registered.keys()) {
            this.onRemove(url);
          }
        };
        // Create listeners
        if (handler.injectIntoWindow) {
          windowLoadListeners.push((window) => {
            for (let [url, options] of handler.registered) {
              handler.injectIntoWindow(window, url, options);
            }
          });
        }
        // Return updated handler
        return handler;
      }

      // Address Book ---------------------------------------------------------
      locationHandlers.addressbook = makeLocationHandler({
        injectIntoWindow(window, url, options) {
          if (window.location.toString()
              !== "chrome://messenger/content/addressbook/addressbook.xhtml") {
            return; // incompatible window
          }
          const sidebar = window.document.getElementById("dirTreeBox");
          const frame = insertWebextFrame("addressbook", url, sidebar);
          frame.width = "100%";
          frame.height = (options.height || 100) + "px";
        },
        uninjectFromWindow(window, url) {
          removeWebextFrame("addressbook", url, window.document);
        }
      });

      // Contact editing ------------------------------------------------------
      const cardWindowLocations = [
        "chrome://messenger/content/addressbook/abNewCardDialog.xhtml",
        "chrome://messenger/content/addressbook/abEditCardDialog.xhtml"
      ];
      for (let [suffix, tabId] of [
          ["", "abOtherTab"],
          ["_home", "abHomeTab"],
          ["_work", "abBusinessTab"]]) {
        const locationName = "addressbook_contact_edit" + suffix;
        locationHandlers[locationName] = makeLocationHandler({
          injectIntoWindow(window, url, options) {
            const dialogType = cardWindowLocations.indexOf(
                window.location.toString()); // 0 for new, 1 for editing
            if (dialogType < 0) {
              return; // incompatible window
            }
            const tab = window.document.getElementById(tabId);
            const frame = insertWebextFrame(locationName, url, tab);
            frame.width = "100%";
            frame.height = (options.height || 100) + "px";

            // Hook up the 'id' and 'parentid' context properties
            if (dialogType === 1) { // editing existing card
              frame.setCustomUIContextProperty("id", window.gEditCard
                  && window.gEditCard.card ? window.gEditCard.card.UID : null);
              const containingDir = window.gEditCard && window.gEditCard.abURI
                  ? window.getContainingDirectory() : null;
              frame.setCustomUIContextProperty("parentid", containingDir
                  ? containingDir.UID : null);
              const origGetCardValues = window.GetCardValues;
              window.GetCardValues = function(card, document) {
                if (window.document.contains(frame) && card
                    && document === window.document) {
                  try {
                    frame.setCustomUIContextProperty("id", card.UID);
                    frame.setCustomUIContextProperty("parentid",
                        window.getContainingDirectory().UID);
                  } catch (e) {
                    // Never block the original implementation, just log issues
                    console.error(e);
                  }
                }
                return origGetCardValues.apply(this, arguments);
              }
            } else { // creating new card
              frame.setCustomUIContextProperty("id", null);
              const abPopup = window.document.getElementById("abPopup");
              const getDirUID = () => {
                const value = abPopup ? abPopup.value : null;
                return value ? window.GetDirectoryFromURI(value).UID : null;
              };
              frame.setCustomUIContextProperty("parentid", getDirUID());
              if (abPopup) {
                abPopup.addEventListener("command", () => {
                  if (window.document.contains(frame)) {
                    frame.setCustomUIContextProperty("parentid", getDirUID());
                  }
                });
              } else {
                console.warn("New contact window missing abPopup");
              }
            }

            // Hook up the 'apply' event, permitting WebExtensions to alter
            // properties on the card before saving.
            const origCheckAndSetCardValues = window.CheckAndSetCardValues;
            window.CheckAndSetCardValues = function(card, doc, check) {
              const result = origCheckAndSetCardValues.apply(this, arguments);
              if (window.document.contains(frame) && window.document === doc
                  && card) {
                let props = {};
                for (let prop of card.properties) {
                  props[prop.name] = prop.value;
                }
                // Temporarily disable the dialog, while we asynchronously
                // do our event thing. As we're hooking into a synchronous API,
                // we will block until the method ends by repeatedly yielding
                // to other tasks (which keeps the UI responsive).
                const dialog = window.document.getElementById("abcardDialog");
                const origVisibility = dialog.style.visibility;
                dialog.style.visibility = "hidden";
                let done = false;
                let error = null;
                let newProps = null;
                fireWebextFrameEvent(frame, "apply", props, true).then(
                    p => newProps = p).catch(e => error = e).finally(
                    () => done = true);
                const thread = Cc["@mozilla.org/thread-manager;1"].getService()
                    .currentThread;
                while (!done) {
                  thread.processNextEvent(true);
                }
                dialog.style.visibility = origVisibility;
                if (error !== null) {
                  throw error;
                }
                if (newProps) {
                  for (let prop of Object.keys(newProps)) {
                    // note: if this experiment should get migrated to the core,
                    // it might be reasonable to apply a blacklist here for
                    // consistency with the contacts API (preventing changes of
                    // internal properties).
                    card.setProperty(prop, newProps[prop]);
                  }
                }
              }
              return result;
            };
          },
          uninjectFromWindow(window, url) {
            removeWebextFrame(locationName, url, window.document);
            // Contact editing windows don't live long, so cleanup of our
            // injections is not really necessary (as they become transparent
            // once the frame is gone).
          }
        });
      }

      // Calendar -------------------------------------------------------------
      locationHandlers.calendar = makeLocationHandler({
        injectIntoWindow(window, url, options) {
          if (window.location.toString()
              !== "chrome://messenger/content/messenger.xhtml") {
            return; // incompatible window
          }
          const sidebar = window.document.getElementById("ltnSidebar");
          const frame = insertWebextFrame("calendar", url, sidebar);
          frame.width = "100%";
          frame.height = (options.height || 100) + "px";
        },
        uninjectFromWindow(window, url) {
          removeWebextFrame("calendar", url, window.document);
        }
      });
    }

    // The actual API =========================================================
    context.callOnClose({close(){
      for (let locationHandler of Object.values(locationHandlers)) {
        locationHandler.onRemoveAll();
      }
    }});
    return {
      ex_customui: {
        async add(location, url, options) {
          if (!locationHandlers[location]) {
            throw new context.cloneScope.Error("Unsupported location: "
                + location);
          }
          url = context.extension.baseURI.resolve(url);
          locationHandlers[location].onAdd(url, options || {});
        },
        async remove(location, url) {
          if (!locationHandlers[location]) {
            throw new context.cloneScope.Error("Unsupported location: "
                + location);
          }
          url = context.extension.baseURI.resolve(url);
          locationHandlers[location].onRemove(url);
        }
      }
    };
  }
};
