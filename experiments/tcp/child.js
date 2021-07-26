var ex_tcp = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const Cc = Components.classes;
    const Ci = Components.interfaces;
    const Cr = Components.results;

    const { NetUtil } = ChromeUtils.import(
        "resource://gre/modules/NetUtil.jsm");

    const stService = Cc["@mozilla.org/network/socket-transport-service;1"]
        .getService(Ci.nsISocketTransportService);
    const tmService = Cc["@mozilla.org/thread-manager;1"].getService(
        Ci.nsIThreadManager);
    
    let unclosedSockets = []; // sockets that have not yet been closed

    context.callOnClose({close(){
      for (let socket of unclosedSockets) {
        console.warn("Aborting socket due to experiment shutdown", socket);
        try {
          socket.close(Cr.NS_ERROR_ABORT);
        } catch (e) {
          console.error(e);
        }
      }
      unclosedSockets = [];
    }});

    return {
      ex_tcp: {
        connect(host, port, options) {
          options = options ? options : {};

          
          // Creating the underlying socket -----------------------------------

          const socket = stService.createTransport([], host, port, null, null);
          unclosedSockets.push(socket);
          if (options.hasOwnProperty("connect_timeout")) {
            socket.setTimeout(Ci.nsISocketTransport.TIMEOUT_CONNECT,
                options.connect_timeout);
          }
          if (options.hasOwnProperty("timeout")) {
            socket.setTimeout(Ci.nsISocketTransport.TIMEOUT_READ_WRITE,
                options.timeout);
          }
          const socketIn = socket.openInputStream(0, 0, 0).QueryInterface(
              Ci.nsIAsyncInputStream);
          const socketInBinary = Cc["@mozilla.org/binaryinputstream;1"]
              .createInstance(Ci.nsIBinaryInputStream);
          socketInBinary.setInputStream(socketIn)
          const socketOut = socket.openOutputStream(
              Ci.nsITransport.OPEN_UNBUFFERED, 0, 0);

         
          // Public API of the result object ----------------------------------

          // Reads into an ArrayBuffer, returns the number of bytes read
          const read = async function(buffer) {
            return socketInBinary.readArrayBuffer(buffer.byteLength, buffer);
          };

          // Completely fills the given ArrayBuffer with read data
          const readFully = async function(buffer) {
            const remaining = buffer.byteLength;
            while (socketIn.available() < remaining) {
              await new Promise(resolve => socketIn.asyncWait({
                  QueryInterface: ChromeUtils.generateQI([
                      Ci.nsIInputStreamCallback]),
                  onInputStreamReady() {
                    resolve();
                  }
                }, 0, remaining, tmService.mainThreadEventTarget));
            }
            if (socketInBinary.readArrayBuffer(remaining, buffer)
                !== remaining) {
              throw new Error("Could not read available bytes into buffer");
            }
          };

          // Writes the content of the given ArrayBuffer
          const write = async function(buffer) {
            const stream = Cc["@mozilla.org/io/arraybuffer-input-stream;1"]
                .createInstance(Ci.nsIArrayBufferInputStream);
            stream.setData(buffer, 0, buffer.byteLength);
            const bstream = Cc["@mozilla.org/binaryinputstream;1"]
                .createInstance(Ci.nsIBinaryInputStream);
            bstream.setInputStream(stream);
            const status = await new Promise(resolve => NetUtil.asyncCopy(
                bstream, socketOut, resolve));
            if (!Components.isSuccessCode(status)) {
              throw new Error("Could not write bytes onto socket");
            }
          };

          // Closes the socket
          const close = async function() {
              socket.close(Cr.NS_OK);
              const index = unclosedSockets.indexOf(socket);
              if (index >= 0) {
                unclosedSockets.splice(index, 1);
              }
          };

          
          // Building the result object in the WebExtension scope -------------

          const wrapAsyncFunction = func => function() {
            return context.wrapPromise(func.apply(null, arguments));
          };
          return context.cloneScope.Promise.resolve(Cu.cloneInto({
            read: wrapAsyncFunction(read),
            readFully: wrapAsyncFunction(readFully),
            write: wrapAsyncFunction(write),
            close: wrapAsyncFunction(close),
          }, context.cloneScope, {cloneFunctions: true}));
        }
      }
    }
  }
};
