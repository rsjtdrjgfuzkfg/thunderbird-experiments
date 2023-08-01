var ex_osfile = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      // our API is a true subset of IOUtils, so we can be lazy:
      ex_osfile: IOUtils
    };
  }
};
