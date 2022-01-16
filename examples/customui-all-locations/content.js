addEventListener("load", () => {
  const contextLabel = document.getElementById("context");
  let lastContext = null;

  // Use a different color schema depending on the URL we're registered with
  const isSecond = window.location.hash === "#second";
  if (isSecond) {
    document.documentElement.classList.add("second");
  }
  
  // Display the current context
  const onContextChange = async function(context) {
    lastContext = context;
    contextLabel.textContent = JSON.stringify(context, null, 2);
  };
  messenger.ex_customui.getContext().then(onContextChange).catch(console.error);
  
  // Update the context on changes and log events to the console
  messenger.ex_customui.onEvent.addListener((type, details) => {
    switch (type) {
      case "context": // the context changed
        onContextChange(details).catch(console.error);
        return;
      default: // a location-specific event happened
        console.log("customui non-context event", type, details,
            "; received in ", window, "with context", lastContext);
        return; // some events permit you to return something!
    }
  });


  // Register actions to perform via action links

  // Re-register other frame on same location with given options. We need to do
  // so through the background page, as we want all frames to be tied to the
  // background context.
  const reregisterAction = async function(options) {
    await messenger.runtime.sendMessage({
      action: 'invoke-customui',
      method: 'remove',
      args: [
        lastContext.location,
        "content.html" + (isSecond ? "" : "#second")
      ]
    });
    await messenger.runtime.sendMessage({
      action: 'invoke-customui',
      method: 'add',
      args: [
        lastContext.location,
        "content.html" + (isSecond ? "" : "#second"),
        options
      ]
    });
  };

  // Action links
  for (let a of document.getElementsByTagName("a")) {
    a.href = "#";
    a.addEventListener("click", e => (async function(e){
      switch (e.target.id) {
        case "action-reregister1":
          return await reregisterAction({});
        case "action-reregister2":
          return await reregisterAction({'width': 100, 'height': 200});
        case "action-reregister3":
          return await reregisterAction({'width': 200, 'height': 100});
        case "action-reregister4":
          return await reregisterAction({'hidden': true});
        case "action-options1":
          return await messenger.ex_customui.setLocalOptions(
              {'width': 100, 'height': 200});
        case "action-options2":
          return await messenger.ex_customui.setLocalOptions(
              {'width': 200, 'height': 100});
        case "action-options3":
          await messenger.ex_customui.setLocalOptions(
              {'hidden': true});
          await new Promise(r => setTimeout(r, 1000));
          await messenger.ex_customui.setLocalOptions(
              {'hidden': false});
      }
    })(e).catch(console.error));
  }
});
