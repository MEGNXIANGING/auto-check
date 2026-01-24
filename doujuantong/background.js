// background.js
// 只负责截图

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'capture_visible_tab') {
    chrome.tabs.captureVisibleTab(null, {format: 'png'}, (dataUrl) => {
      sendResponse({dataUrl});
    });
    return true;
  }
}); 