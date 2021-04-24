# ImplementationProvider: Aggregators Example

**You must use a version of git that supports symbolic links or copy the customui experiment into the experiments folder to use this example.**

This example showcases using classes defined on a WebExtension background page from an experiment's parent script: it features two distinct classes that operate on a similar interface, hold state and have side-effects (in pure WebExtension code).

The classes permit to add/multiply individual numbers with a state kept in the class, and issue listener notifications whenever the number changes. A dummy experiment instantiates the classes, does a few useless calculations and gets callbacks on listeners it registered. Look in the error console to see output from both WebExtension and Experiment code.

This example is primarily intended to demonstrate the usage of the ImplementationProvider API and to serve as quick test case to test the Experiment.
