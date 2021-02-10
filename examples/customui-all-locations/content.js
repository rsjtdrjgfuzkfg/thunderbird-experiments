addEventListener("load", () => {
  const contextLabel = document.getElementById("context");
  let lastContext = null;

  // Use a different color schema depending on the URL we're registered with
  if (window.location.hash === "#second") {
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
});
