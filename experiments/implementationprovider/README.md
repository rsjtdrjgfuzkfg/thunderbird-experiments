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

