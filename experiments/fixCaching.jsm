// Workaround to automatically fix caching issues with experiments in TB 78 by
// performing some cleanup tasks whenever the add-on's background page unloads:
// - Unloads all JSMs imported from file://-URIs of the add-on
// - Invalidates startup caches
// This workaround is not sufficient if your add-on keeps using any
// Experiments after the background page is unloaded, loads JSMs during
// cleanup or uses chrome://-URIs for JSMs. This workaround is further no
// replacement for proper cleanup procedure (other than unloading JSMs),
// so you still need to undo your XPCOM registrations, etc.
//
// Usage: add the following line to your parent implementation of your API:
//
// ChromeUtils.import(context.extension.rootURI.resolve(
//     "path/to/this/file.jsm")).fixCaching(context.extension);

const EXPORTED_SYMBOLS = ["fixCaching"]

// Fix caching for the given parent extension object
function fixCaching(extension) {
  const backgroundContext = Array.from(extension.views).find(
      view => view.viewType === "background");
  if (!backgroundContext) {
    throw new Error("Background page not (yet?) loaded.");
  }
  if (backgroundContext.__has_fixCaching_jsm_workaround__) {
    return; // we're already injected
  }
  backgroundContext.__has_fixCaching_jsm_workaround__ = true;
  const Cu = Components.utils;
  const { Services } = ChromeUtils.import(
      "resource://gre/modules/Services.jsm");
  const rootURI = extension.rootURI.spec;
  backgroundContext.callOnClose({close(){
    for (let module of Cu.loadedModules) {
      if (module.startsWith(rootURI)) {
        Cu.unload(module);
      }
    }
    Services.obs.notifyObservers(null, "startupcache-invalidate", null);
  }});
}
