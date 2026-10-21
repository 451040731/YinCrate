// Reuse the converter tab without requesting access to any web page.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('index.html');
  const tabs = await chrome.tabs.query({ url });
  const existing = tabs[0];
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
