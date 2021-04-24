# ImplementationProvider

This WebExtension Experiment is a proof-of-concept to demonstrate
a generic pattern Thunderbird could adapt for APIs that enable and add-on
to provide implementations of native-defined interfaces.

This implementation serves two purposes:

1. Demonstrate feasibility of API designs that build on using OOP concepts
   as part of a WebExtension API

2. Enable add-on developers to play around with provider-like APIs, without
   requireing them to reinvent the wheel. Note that 'proper' API drafts will
   likely benefit from less generic code (but this experiment may still serve
   as a starting point)

If you play around, make sure to set up automatic JSM unloading in addition
to adding this experiment; a simple way is to add the cachingfix experiment
also available in this repository. **Not unloading modules will cause
problems when updating your add-on later on.**

## Usage

Read the documentation comments for detailed information, the gist is to
register a class from a WebExtension context:
```
class SomeClassToProvide {
  constructor(providerInterface /* , ... */) {
    // providerInterface.notifyListeners("functionName", ...args) can be used
    // to call functions on objects registered by addListener / removeListener
    // in the experiment
  }
  /* ... class should include some async functions ... */
}
await messenger.ex_implementationprovider.provideImplementation(
    "SomeUniqueName", SomeClassToProvide);
```
And to then react on class registration / unregistration in a (parent)
experiment:
```
const extension = /* your extension object */;
const { ImplementationManager } = ChromeUtils.import(extension.rootURI.resolve(
    "experiments/implementationprovider/ImplementationManager.jsm"));
ImplementationManager.addListener({
  onRegisterImplementation: function(name, asyncConstructor) {
    asyncConstructor(/* constructor args */).then(instance => {
       // instance now supports all async functions of 'SomeClassToProvide',
       // as well as addListener / removeListener. Once you're done, call:
       instance.close();
    }); // proper code would handle promise rejection here
  }
  // proper code would handle onUnregisterImplementation here
});
```

You can find a complete example in the examples folder of this repository.
