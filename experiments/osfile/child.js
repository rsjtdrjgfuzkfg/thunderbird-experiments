var ex_osfile = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const Cc = Components.classes;
    const Ci = Components.interfaces;
    const Cr = Components.results;
    const Cu = Components.utils;
    const { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
    return {
      // our API is a true subset of OS.File, so we can be lazy:
      ex_osfile: OS.File
    };
  }
};
