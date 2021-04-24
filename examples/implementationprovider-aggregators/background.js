(async function() {
  console.log("WEBEXTENSION: ImplementationProvider dummy add-on started.");

  // For this demo, we're providing implementations of an aggregator interface
  // for numbers, for exciting tasks like 'adding' and 'multiplying'!

  class SumAggregator {
    constructor(providerInterface, initialValue) {
      this._notifyListeners = providerInterface.notifyListeners;
      this.value = initialValue;
    }
    async append(value) {
      this.value += value;
      // await = we're waiting until listeners return.
      await this._notifyListeners("onTotalChange", this.value);
      console.log("WEBEXTENSION: updated a SumAggregator to", this.value);
    }
    async getTotal() {
      return this.value;
    }
  }
  console.log("WEBEXTENSION: registering SumAggregator...");
  await messenger.ex_implementationprovider.provideImplementation(
      "Aggregator:Sum", SumAggregator);

  // small delay to keep the logs in order, not useful in a real add-on!
  await new Promise(resolve => setTimeout(resolve, 100));
  
  class MulAggregator {
    constructor(providerInterface, initialValue) {
      this._notifyListeners = providerInterface.notifyListeners;
      this.value = initialValue;
    }
    async append(value) {
      this.value *= value;
      // no await = we return immediately. Errors are already logged by the API!
      this._notifyListeners("onTotalChange", this.value);
      console.log("WEBEXTENSION: updated a MulAggregator to", this.value);
    }
    async getTotal() {
      return this.value;
    }
  }
  console.log("WEBEXTENSION: registering MulAggregator...");
  await messenger.ex_implementationprovider.provideImplementation(
      "Aggregator:Multiply", MulAggregator);

  // small delay to keep the logs in order, not useful in a real add-on!
  await new Promise(resolve => setTimeout(resolve, 100));

  // Not sure if there are useful applications for this, but you can undo a
  // registration without closing the context:
  await messenger.ex_implementationprovider.provideImplementation(
      "Aggregator:Sum", null);
  await messenger.ex_implementationprovider.provideImplementation(
      "Aggregator:Multiply", null);

  console.log("WEBEXTENSION: done.");

})().catch(console.error);
