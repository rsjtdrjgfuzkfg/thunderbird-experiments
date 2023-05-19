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
    
    // Array of sockets as {socket, socketIn, socketInBinary, socketOut},
    // indices within this array represent the socket
    let openSockets = [];

    context.callOnClose({close(){
      for (let socket of openSockets) {
        if (!socket) {
          continue; // skip over unused indices
        }
        console.warn("Aborting socket due to experiment shutdown", socket);
        try {
          socket.socket.close(Cr.NS_ERROR_ABORT);
        } catch (e) {
          console.error(e);
        }
      }
      openSockets = [];
    }});

    // Provide an API to the child script, permitting it to use the sockets
    // that are defined here in this parent script.
    return {ex_tcp: {
      // Connect a socket, return an index
      async _connect(host, port, options) {
        options = options ? options : {};

        const socket = stService.createTransport([], host, port, null, null);
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

        let socketIndex = 0;
        while (openSockets[socketIndex]) ++socketIndex;
        openSockets[socketIndex] = {socket, socketIn, socketInBinary, socketOut};
        return socketIndex;
      },

      // Read a fixed amount of bytes from a socket, waiting if necessary
      async _read(socketIndex, byteLength) {
        const {socketIn, socketInBinary} = openSockets[socketIndex];
        const buffer = new ArrayBuffer(byteLength);
        let offset = 0;
        let remaining = buffer.byteLength;
        while (true) {
          let bytesToRead = socketInBinary.available();
          if (bytesToRead > 0) {
            if (bytesToRead > remaining) {
              bytesToRead = remaining;
            }
            let read;
            if (offset == 0) {
              read = socketInBinary.readArrayBuffer(bytesToRead, buffer);
            } else {
              let tempArray = new Uint8Array(new ArrayBuffer(bytesToRead));
              read = socketInBinary.readArrayBuffer(bytesToRead,
                  tempArray.buffer);
              if (read > 0) {
                let bufferArray = new Uint8Array(buffer, offset, bytesToRead);
                bufferArray.set(tempArray);
              }
            }
            if (read != bytesToRead) {
              throw Error("Could not read available bytes into buffer");
            }
            remaining -= read;
            if (remaining <= 0) {
              break;
            }
            offset += read;
          }
          await new Promise(resolve => socketIn.asyncWait({
              QueryInterface: ChromeUtils.generateQI([
                  Ci.nsIInputStreamCallback]),
              onInputStreamReady() {
                resolve();
              }
            }, 0, remaining, tmService.mainThreadEventTarget));
        }
        return buffer;
      },

      // Write to a socket
      async _write(socketIndex, buffer) {
        const {socketOut} = openSockets[socketIndex];
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
      },

      // Close a socket
      async _close(socketIndex) {
        const {socket} = openSockets[socketIndex];
        openSockets[socketIndex] = null;
        socket.close(Cr.NS_OK);
      }
    }};
  }
};
