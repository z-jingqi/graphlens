// Runs in the ISOLATED world. Forwards patch postMessages to the background service worker,
// which routes them to the matching devtools panel by tabId.

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window) return
  const data = e.data as { source?: string } | null
  if (!data || data.source !== 'graphlens-patch') return
  try {
    chrome.runtime.sendMessage(data).catch(() => {})
  } catch {}
})

export {}
