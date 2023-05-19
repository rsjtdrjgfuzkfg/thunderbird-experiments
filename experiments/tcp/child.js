var ex_tcp = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const Cc = Components.classes;
    const Ci = Components.interfaces;
    const Cr = Components.results;


    return {
      ex_tcp: {
        connect(host, port, options) {
          const socketIndexPromise =
              context.childManager.callParentAsyncFunction("ex_tcp._connect",
                [host, port, options]);
         
          // Public API of the result object ----------------------------------

          // Reads a fixed number of byte into a fresh ArrayBuffer of the given
          // length
          const read = async function(byteLength) {
            return await context.childManager.callParentAsyncFunction(
                  "ex_tcp._read", [await socketIndexPromise, byteLength]);
          };

          // Writes the content of the given ArrayBuffer
          const write = async function(buffer) {
            await context.childManager.callParentAsyncFunction(
              "ex_tcp._write", [await socketIndexPromise, buffer]);
          };

          // Closes the socket
          const close = async function() {
            await context.childManager.callParentAsyncFunction(
              "ex_tcp._close", [await socketIndexPromise]);
          };

          
          // Building the result object in the WebExtension scope -------------

          const wrapAsyncFunction = func => function() {
            return context.wrapPromise(func.apply(null, arguments));
          };
          return context.cloneScope.Promise.resolve(Cu.cloneInto({
            read: wrapAsyncFunction(read),
            write: wrapAsyncFunction(write),
            close: wrapAsyncFunction(close),
          }, context.cloneScope, {cloneFunctions: true}));
        }
      }
    }
  }
};
