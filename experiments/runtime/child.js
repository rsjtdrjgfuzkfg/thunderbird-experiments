var ex_runtime = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { ExtensionCommon } = ChromeUtils.import(
        "resource://gre/modules/ExtensionCommon.jsm");
    const { AddonManager } = ChromeUtils.import(
        "resource://gre/modules/AddonManager.jsm");
    const { setTimeout } = ChromeUtils.import(
        "resource://gre/modules/Timer.jsm");
    const tManager = Cc["@mozilla.org/thread-manager;1"].getService();

    return {
      ex_runtime: {
        onDisable: new ExtensionCommon.EventManager({
          context,
          name: "ex_runtime.onDisable",
          register: fire => {
            const handleDisablingAction = function(addon) {
              if (addon.id !== context.extension.id) {
                return;
              }
              const promise = fire.sync();
              if (promise && promise.then) {
                // listener started some async operation, wait up to 5 seconds
                // for its resolution.
                let done = false;
                promise.then(() => done = true).catch(e => {
                  console.error(e);
                  done = true;
                });
                setTimeout(() => done = true, 5000);
                while (!done) {
                  tManager.currentThread.processNextEvent(true);
                }
              }
            };
            const listener = {
              onDisabling(addon, needsRestart) {
                handleDisablingAction(addon);
              },
              onUninstalling(addon, needsRestart) {
                handleDisablingAction(addon);
              },
            };
            AddonManager.addAddonListener(listener);
            return () => { AddonManager.removeAddonListener(listener); };
          }
        }).api()
      }
    };
  }
};
