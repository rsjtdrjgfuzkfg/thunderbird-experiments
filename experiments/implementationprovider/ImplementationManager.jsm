/* This module holds a singleton list of add-on-provided class implementations,
 * registered through the ex_implementationprovider API. This is only necessary
 * for this proof of concept: when using the same approach for a core-level API,
 * the parent script of the API could directly register/unregister their
 * implementations with native Thunderbird interfaces instead.
 *
 * This JSM is only intended to be loaded from within the parent process;
 * trying to use it from other processes will not work (as JSM scopes are
 * per-process and the manager is only populated on the parent process).
 */

/** @class Implementation of the implementation manager. */
class ImplementationManagerImpl {

  /**
   * Constructs an implementation manager; only one instance should exist.
   * @private
   */
  constructor() {
    /**
     * Maps implementation names to async functions that behave just like the
     * contructor registered through the child class (except for being async).
     * @private
     */
    this._registry = new Map();
    /** List of registered listeners. @private */
    this._listeners = new Set();
  }

  /**
   * Registers a new implementation.
   * @param {string} name name of the implementation to register
   * @param {function} asyncConstructor async function that takes constructor
   * arguments and returns a constructed instance of the implemented interface
   */
  registerImplementation(name, asyncConstructor) {
    this.unregisterImplementation(name);
    this._registry.set(name, asyncConstructor);
    this._notifyListeners('onRegisterImplementation', name, asyncConstructor);
  }

  /**
   * Unregisters an implementation previously registered with
   * {@linkcode #registerImplementation}.
   * @param {string} name name of the implementation to unregister
   */
  unregisterImplementation(name) {
    if (this._registry.delete(name)) {
      this._notifyListeners('onUnregisterImplementation', name);
      return true;
    }
    return false;
  }

  /**
   * Registers a listener to be notified when implementations are registered
   * or unregistered, as well as (optionally) receive all current registrations.
   *
   * The following methods may be called on the listener object, if they are
   * present:
   * - <code>onRegisterImplementation</code> with the name of the implementation
   *   and an async function operating as its constructor whenever a new
   *   implementation is registered
   * - <code>onUnregisterImplementation</code> with the name of the
   *   implementation whenever a new implementation is unregistered or replaced
   *
   * @param {object} listener listener object to register
   * @param {boolean} includeAllPrevious if true, the listener will be
   * immediately notified of all currently registered implementations
   */
  addListener(listener, includeAllPrevious = true) {
    this._listeners.add(listener);
    if (includeAllPrevious && listener.onRegisterImplementation) {
      for (let entry of this._registry.entries()) {
        listener.onRegisterImplementation(entry[0], entry[1]);
      }
    }
  }

  /**
   * Unregisters a listener previously registered with {@link #addListener}.
   *
   * @param {object} listener listener object to unregister
   * @returns {boolean} true iff the listener was registered
   */
  removeListener(listener) {
    return this._listeners.delete(listener);
  }

  /**
   * Notifies all listeners, calling the given function with the given arguments
   * iff such a method exists.
   * @param {string} functionName name of the function to call on listeners
   * @param args arguments to call the method with
   * @private
   */
  _notifyListeners(functionName, ...args) {
    for (let listener of this._listeners) {
      const method = listener[functionName]
      if (method) {
        method.apply(listener, args);
      }
    }
  }
}

/**
 * Central class permitting code to access implementations registered from the
 * WebExtension part through the ex_implementationprovider API.
 *
 * This class provides access to async functions that operate like constructors:
 * arguments are passed to the constructor in the WebExtension part and the
 * result – once resolved – is an object that can be used like the WebExtension
 * counterpart, with the following additions:
 * - <code>addListener</code> and <code>removeListener</code> are synchronous
 *   methods to add and remove classes from the listener list. WebExtension
 *   code can call functions on all registered listeners through the
 *   providerInterface's notifyListeners method.
 * - <code>close</code> a synchronous method that *must* be called once the
 *   parent code is done with the object, in order to release a referencet that
 *   blocks GC of the object in the WebExtension part.
 */
const ImplementationManager = new ImplementationManagerImpl();

const EXPORTED_SYMBOLS = ["ImplementationManager"];
