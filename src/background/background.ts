// Relays patch events from content scripts to the matching devtools panel by tabId.

const panels = new Map<number, chrome.runtime.Port>()

chrome.runtime.onConnect.addListener(port => {
  const match = port.name.match(/^panel:(\d+)$/)
  if (!match) return
  const tabId = Number(match[1])
  panels.set(tabId, port)
  port.onDisconnect.addListener(() => {
    if (panels.get(tabId) === port) panels.delete(tabId)
  })
})

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id
  if (tabId == null) return
  const port = panels.get(tabId)
  if (!port) return
  try { port.postMessage(msg) } catch {}
})

export {}
