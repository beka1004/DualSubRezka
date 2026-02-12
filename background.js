const DEFAULT_SETTINGS = {
  enabled: true,
  swapOrder: false,
  fontSize: 28,
  toleranceMs: 300
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const next = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.sync.set(next);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_DEFAULT_SETTINGS') {
    sendResponse(DEFAULT_SETTINGS);
    return true;
  }

  return false;
});
