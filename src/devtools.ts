chrome.devtools.panels.create('GraphLens', '', 'panel.html', panel => {
  panel.onShown.addListener(win => {
    // Tell the panel it's now visible so it can resume auto-following new requests.
    // Cast needed: Chrome's DevTools Window type doesn't expose CustomEvent in TS defs.
    const panelWin = win as unknown as Window & typeof globalThis
    panelWin.dispatchEvent(new panelWin.CustomEvent('graphlens:shown'))
  })
})
