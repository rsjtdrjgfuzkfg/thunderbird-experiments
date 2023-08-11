var ex_osfile = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      ex_osfile: {
        read: (
          // Thunderbird 115 and later
          globalThis.IOUtils
          // Thunderbird 102 and earlier
          || ChromeUtils.import("resource://gre/modules/osfile.jsm").OS.File
        ).read
      }
    };
  }
};
