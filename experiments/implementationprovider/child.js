var ex_implementationprovider = class extends ExtensionCommon.ExtensionAPI {
  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return; // the application gets unloaded anyway
    }
    // Unload child-loaded JSMs as they do not get unloaded by cachingfix
    Components.utils.unload(this.extension.baseURI.resolve(
          "experiments/implementationprovider/AsyncMessageManagerLink.jsm"));
  }

  getAPI(context) {
    const Cu = Components.utils;
    const { AsyncMessageManagerLink } = ChromeUtils.import(
        this.extension.baseURI.resolve(
          "experiments/implementationprovider/AsyncMessageManagerLink.jsm"));
    const { ExtensionUtils } = ChromeUtils.import(
      "resource://gre/modules/ExtensionUtils.jsm"
    );
    const { ExtensionError } = ExtensionUtils;

    // Force lazy Thunderbird to load the parent script as well, which we need
    // to communicate with (although it provides no methods for the API).
    context.childManager.callParentAsyncFunction(
        "ex_implementationprovider._loadParentAPI", []);

    // Things that live in this WebExtension context
    const instances = new Map(); // by instance id
    let lastInstanceId = 0; // strictly monotonically increasing

    // Because this is a generic proof of concept, we need to determine the
    // interface to pass on to the parent script dynamically. This is the
    // heuristics we're going to use:
    const getFunctionsForConstructed = function(constructed) {
      const result = [];
      const objectPrototype = Cu.waiveXrays(
          context.cloneScope.Object.prototype);
      let prototype = constructed;
      while (prototype != null && prototype != objectPrototype) {
        for (let key of Object.getOwnPropertyNames(prototype)) {
          if ((typeof prototype[key]) == "function") {
            result.push(key);
          }
        }
        prototype = Object.getPrototypeOf(prototype);
      }
      return result;
    };

    // Our link with the parent API instance for this context
    const link = new AsyncMessageManagerLink(context.messageManager,
        "ex_implementationprovider", {

      // Invoke constructor
      create: async function(constructorInstance, args) {
        const instance = ++lastInstanceId;
        const providerInterface = Cu.cloneInto({
          notifyListeners: function(functionName, ...args) {
            if (!instances.has(instance)) {
              return; // prevent notifications after instance was released
            }
            const result = link.call("notifyListeners", instance,
                functionName, args);
            result.catch(console.error);
            return context.wrapPromise(result);
          }
        }, context.cloneScope, {cloneFunctions: true});
        const constructed = Cu.waiveXrays(new (instances.get(
            constructorInstance))(providerInterface, ...args));
        instances.set(instance, constructed);
        return {instance, functions: getFunctionsForConstructed(constructed)};
      },

      // Invoke async function
      call: async function(instance, functionName, args) {
        return await instances.get(instance)[functionName](...args);
      },

      // Release something by instance id
      release: async function(instance) {
        instances.delete(instance);
      }

    });
    context.callOnClose(link);

    return {
      ex_implementationprovider: {
        async provideImplementation(name, implementation) {
          if (!implementation) {
            await link.call("unregister", name);
            return;
          }
          // Polished APIs would likely want to to fail-fast if an obviously
          // incompatible implementation is provided. For this proof of concept,
          // we 'just' fail for stuff that is not constructable, as we don't
          // have a fixed interface / prototype / thing to look out for.
          try {
            // This throws unless implementation is constructable, but never
            // executes the function: see https://stackoverflow.com/a/46759625
            Reflect.construct(String, [], implementation);
          } catch (e) {
            throw new ExtensionError(
                "Incorrect argument: implementation is not constructable.");
          }
          const constructorInstance = ++lastInstanceId;
          instances.set(constructorInstance, implementation);
          await link.call("register", name, constructorInstance);
        }
      }
    };
  }
};
