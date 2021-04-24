var ex_implementationprovider = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { AsyncMessageManagerLink } = ChromeUtils.import(
        this.extension.rootURI.resolve(
          "experiments/implementationprovider/AsyncMessageManagerLink.jsm"));
    const { ImplementationManager } = ChromeUtils.import(
        this.extension.rootURI.resolve(
          "experiments/implementationprovider/ImplementationManager.jsm"));

    // Mapping towards things in the child process
    const constructorByName = new Map(); // name to constructor instance id

    // Mapping towards things in the parent process
    const listenersByInstance = new Map(); // instance id to set of listeners

    // Our link with the child API instance for this context
    const link = new AsyncMessageManagerLink(context.messageManagerProxy,
        "ex_implementationprovider", {

      // Registers a constructor, overriding previous ones (from any context)
      register: async function(name, constructorInstance) {
        const asyncConstructor = async (...args) => {
          const result = new Object();
          const {instance, functions} = await link.call("create",
              constructorInstance, args);
          for (let key of functions) {
            result[key] = (...args) => link.call("call", instance, key, args);
          }
          // Fixed methods provided by the API
          const listeners = new Set();
          result.addListener = listener => listeners.add(listener);
          result.removeListener = listener => listeners.delete(listener);
          listenersByInstance.set(instance, listeners);
          result.close = () => {
            listenersByInstance.delete(instance);
            link.call("release", instance).catch(console.error);
          };
          return result;
        };
        ImplementationManager.registerImplementation(name, asyncConstructor);
        constructorByName.set(name, constructorInstance);
      },

      // Unregisters current constructor without setting a new one
      unregister: async function(name) {
        // The unregistration of child process resources occurs from the
        // listener in the context that provides them.
        ImplementationManager.unregisterImplementation(name);
      },

      notifyListeners: async function(instance, functionName, args) {
        const listeners = listenersByInstance.get(instance);
        if (!listeners) {
          return; // race condition: notify after close
        }
        for (let listener of listeners) {
          const method = listener[functionName]
          if (method) {
            method.apply(listener, args);
          }
        }
      }

    });
    context.callOnClose(link);

    // Monitor the ImplementationManager to release unregistered constructors
    ImplementationManager.addListener({
      onUnregisterImplementation: function(name) {
        const constructorInstance = constructorByName.get(name);
        if (constructorInstance != undefined) {
          constructorByName.delete(name);
          link.call("release", constructorInstance).catch(console.error);
        }
      }
    }, false);

    // Return a single function the client script can prime API loading with
    return {ex_implementationprovider: {_loadParentAPI: async function(){}}};
  }
};
