/* This module holds a simple class enabling async function calls to serialize
 * through a MessageManager.
 */


/**
 * A class representing a uniquely-named bidirectional interface to
 * asynchronously call methods through a specific MessageManager.
 *
 * Arguments and return values must be compatible with the structured clone
 * algorithm. Thrown objects will get logged and rewritten into generic Error
 * instances.
 */
class AsyncMessageManagerLink {

  /**
   * Establishes a link to handle function calls over the given MessageManager,
   * which will use the given message name. Besides the other end of the
   * link, no other code may send or receive messages with the given name – so
   * the caller needs to ensure it is unique and unlikely to conflict with
   * Thunderbird core code.
   *
   * Function calls form the other end will be issued on the given local object.
   * Functions must be set on the object itself, functions inherited from
   * prototypes are not supported.
   *
   * The link must get closed after using, see {@link #close}.
   */
  constructor(messageManager, messageName, localObject) {
    /** Message manager to use. @private */
    this._messageManager = messageManager,
    /** Message name to use. @private */
    this._name = messageName;
    /** Local object to issue calls on. @private*/
    this._localObject = localObject;
    /**
     * Maps pending call ids to {resolve, reject} methods if there is a call
     * with the id, or undefined if there is not.
     * @private
     */
    this._pendingCalls = [];
    /** Resolves to true iff we received a "open" test message. @private */
    this._opened = new Promise(resolve => this._resolveOpened = resolve);
    /** True iff the link was closed. @private */
    this._closed = false;
    messageManager.addMessageListener(this._name, this);
    messageManager.sendAsyncMessage(this._name, {open: true});
  }

  /**
   * Parses the given message and calls remote functions / resolves local
   * promises. (Implementation of MessageListener)
   * @private
   */
  receiveMessage(message) {
    const data = message.data;
    if (data.hasOwnProperty("open")) {
      // A confirmation that the link is open
      this._resolveOpened(true);
      if (data.open) { // send confirmation to the other side as well
        this._messageManager.sendAsyncMessage(this._name, {open: false});
      }
    } else if (data.hasOwnProperty("functionName")) {
      // New call from other end to us: execute call + return result
      if (!this._localObject.hasOwnProperty(data.functionName)) {
        console.error("Tried to use a link to call non-existing function",
            data.functionName, data.args);
        return;
      }
      this._localObject[data.functionName](...data.args).then(result => {
        this._messageManager.sendAsyncMessage(this._name, {
          callIndex: data.callIndex, result
        });
      }).catch(error => {
        console.error("Callback failed, sending error", error);
        this._messageManager.sendAsyncMessage(this._name, {
          callIndex: data.callIndex, error: error.toString()
        });
      }).catch(console.error);
    } else if (data.hasOwnProperty("result")) {
      // Response to our call: resolve local promise
      this._pendingCalls[data.callIndex].resolve(data.result);
      delete this._pendingCalls[data.callIndex];
    } else if (data.hasOwnProperty("error")) {
      // Response to our call: reject local promise
      this._pendingCalls[data.callIndex].reject(new Error(
          "Remote error:" + data.error));
      delete this._pendingCalls[data.callIndex];
    } else {
      console.error("Unknown message received:", argument);
    }
  }

  /**
   * Calls the function with the given name on the local object on the other
   * side of the link.
   * @param {string} functionName name of the function to call
   * @param args function arguments to call the function with (must be
   * compatible with structured clone)
   * @returns {Promise} promise resolving to the return value or an error if
   * the call fails
   */
  async call(functionName, ...args) {
    if (this._closed) {
      throw new Error("Link closed");
    }
    await this._opened;
    return await new Promise((resolve, reject) => {
      let callIndex = 0;
      while (this._pendingCalls[callIndex]) {
        ++callIndex;
      }
      this._pendingCalls[callIndex] = {resolve, reject};
      this._messageManager.sendAsyncMessage(this._name, {
        callIndex, functionName, args
      });
    });
  }

  /**
   * Closes the link, preventing methods from being called or method calls from
   * succeeding. Each link must be evenutally closed from both sides.
   */
  close() {
    this._closed = true;
    try {
      this._messageManager.removeMessageListener(this._name, this);
    } catch (e) {
      // The message manager might already be down when we're called, so ignore
      // errors that might occur here.
    }
    for (let pendingCall of this._pendingCalls) {
      if (pendingCall) {
        pendingCall.reject(new Error("Link closed"));
      }
    }
  }
}

const EXPORTED_SYMBOLS = ["AsyncMessageManagerLink"];
