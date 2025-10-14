chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setIcon({
      path: {
        "16": "icons/recipevino.png",
        "32": "icons/recipevino.png",
        "48": "icons/recipevino.png",
        "128": "icons/recipevino.png"
      },
      tabId
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to reset icon:", chrome.runtime.lastError.message);
      }
    });
  }
});