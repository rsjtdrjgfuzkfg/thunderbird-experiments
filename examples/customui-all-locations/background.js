(async function() {

  // Don't do this at home:
  // If you want to use the customui API in the real world, you can use the
  // LOCATION_* constants of the API directly.
  //
  // We only iterate over all locations here, as this example is intended to
  // demonstrate *all* locations and we're too lazy to update the example when
  // locations are added or renamed during the development process.
  for (let prop of Object.keys(messenger.ex_customui)) {
    const location = messenger.ex_customui[prop];
    if (typeof location !== "string") {
      continue;
    }

    // Register two locations with default settings. In the real world, you
    // usually only want one, and might want to specify width or height in the
    // object at the end.
    messenger.ex_customui.add(location, 'content.html', {});
    messenger.ex_customui.add(location, 'content.html#second', {});
  }

})().catch(console.error);
