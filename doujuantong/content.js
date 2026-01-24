// content.js：自动检测 jpg 图片加载并自动触发阅卷
let overlay, selectBox, confirmBtn, tipDiv;
let firstPoint = null, secondPoint = null;

function createOverlay() {
  cleanup();
  overlay = document.createElement('div');
  overlay.style = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;background:rgba(0,0,0,0.10);cursor:crosshair;';
  overlay.tabIndex = 0;
  document.body.appendChild(overlay);
  overlay.focus();
  overlay.addEventListener('mousedown', onOverlayMouseDown, true);
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') cleanup(); });
  overlay.addEventListener('click', e => {
    if (e.target === overlay && !firstPoint) cleanup();
  });
  createTip('请点击选区左上角');
}

function createTip(text) {
  if (tipDiv) tipDiv.remove();
  tipDiv = document.createElement('div');
  tipDiv.textContent = text;
  tipDiv.style = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483648;background:#007bff;color:#fff;padding:6px 18px;border-radius:8px;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.10);';
  document.body.appendChild(tipDiv);
}

function onOverlayMouseDown(e) {
  if (e.button !== 0) return;
  if (!firstPoint) {
    firstPoint = {x: e.clientX, y: e.clientY};
    createTip('请点击选区右下角');
  } else if (!secondPoint) {
    secondPoint = {x: e.clientX, y: e.clientY};
    drawBox();
    createConfirmBtn();
    createTip('如需重选请点击遮罩或按ESC，点击✔确认区域');
  }
}

function drawBox() {
  if (selectBox) selectBox.remove();
  const x = Math.min(firstPoint.x, secondPoint.x);
  const y = Math.min(firstPoint.y, secondPoint.y);
  const w = Math.abs(secondPoint.x - firstPoint.x);
  const h = Math.abs(secondPoint.y - firstPoint.y);
  if (w < 20 || h < 20) {
    createTip('区域太小，请重新选择');
    firstPoint = secondPoint = null;
    if (selectBox) selectBox.remove();
    if (confirmBtn) confirmBtn.remove();
    return;
  }
  selectBox = document.createElement('div');
  selectBox.style = 'position:fixed;border:2px solid #007bff;background:rgba(0,123,255,0.08);z-index:2147483648;box-sizing:border-box;';
  selectBox.style.left = x + 'px';
  selectBox.style.top = y + 'px';
  selectBox.style.width = w + 'px';
  selectBox.style.height = h + 'px';
  document.body.appendChild(selectBox);
}

function createConfirmBtn() {
  if (confirmBtn) confirmBtn.remove();
  confirmBtn = document.createElement('button');
  confirmBtn.innerHTML = '✔';
  confirmBtn.title = '确认选择';
  confirmBtn.style = `
    position:fixed;
    width:48px;height:48px;
    background:#28a745;color:#fff;
    border:none;border-radius:50%;
    font-size:32px;
    z-index:2147483649;
    box-shadow:0 2px 8px rgba(0,0,0,0.15);
    cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    left:${parseInt(selectBox.style.left) + parseInt(selectBox.style.width) - 24}px;
    top:${parseInt(selectBox.style.top) - 24}px;
  `;
  document.body.appendChild(confirmBtn);
  confirmBtn.onclick = () => {
    const x = Math.min(firstPoint.x, secondPoint.x);
    const y = Math.min(firstPoint.y, secondPoint.y);
    const w = Math.abs(secondPoint.x - firstPoint.x);
    const h = Math.abs(secondPoint.y - firstPoint.y);
    const area = {x, y, w, h};
    chrome.storage.local.set({selectedArea: area}, () => {
      cleanup();
      if (window._sendResponseForArea) { window._sendResponseForArea({area}); window._sendResponseForArea = null; }
    });
  };
}

function cleanup() {
  if (overlay) overlay.remove(); overlay = null;
  if (selectBox) selectBox.remove(); selectBox = null;
  if (confirmBtn) confirmBtn.remove(); confirmBtn = null;
  if (tipDiv) tipDiv.remove(); tipDiv = null;
  firstPoint = null; secondPoint = null;
}

function cropImageInContent(dataUrl, area) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = function() {
      const scale = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = area.w * scale;
      canvas.height = area.h * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        area.x * scale,
        area.y * scale,
        area.w * scale,
        area.h * scale,
        0, 0,
        area.w * scale,
        area.h * scale
      );
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

// 自动填分并提交
function fillScoreAndSubmit(score) {
  console.log('Starting fillScoreAndSubmit with score:', score);
  
  // 直接在当前页面执行操作，不依赖chrome.storage.local.get
  try {
    // 1. 找到分数输入框 - 懂你教育
    console.log('Looking for score input...');
    const input = document.querySelector('input.el-input__inner[placeholder="得分"]');
    if (input) {
      console.log('Found score input:', input);
      input.value = score;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('Filled score input with:', score);
    } else {
      console.log('Score input not found');
    }
    
    // 2. 找到提交按钮并点击 - 懂你教育
    console.log('Looking for submit button...');
    const btn = document.querySelector('button.el-button.el-button--primary');
    if (btn) {
      console.log('Found submit button:', btn);
      // 添加点击事件的回调，以便观察是否有错误
      btn.addEventListener('click', function() {
        console.log('Submit button clicked');
      });
      btn.click();
      console.log('Clicked submit button');
    } else {
      console.log('Submit button not found');
      // 尝试使用更具体的选择器
      const allButtons = document.querySelectorAll('button');
      console.log('All buttons on page:', allButtons.length);
      allButtons.forEach((button, index) => {
        console.log(`Button ${index}:`, button.textContent, button.className);
      });
    }
  } catch (error) {
    console.error('Error in fillScoreAndSubmit:', error);
  }
  
  // 检查当前页面的URL，确保扩展程序有权限访问
  console.log('Current page URL:', window.location.href);
}

// 自动检测分数输入框并自动触发阅卷
function tryAutoStartReview() {
  console.log('Trying to auto start review');
  try {
    // 直接检查是否有选中区域，不依赖chrome.storage.local.get
    // 简化逻辑，直接触发自动阅卷
    chrome.runtime.sendMessage({action: 'auto_start_review'});
  } catch (error) {
    console.error('Error in tryAutoStartReview:', error);
  }
}

// 监听整个 body 的 DOM 变化
let observer = null;
function setupObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    try {
      console.log('MutationObserver triggered');
      // 直接检查懂你教育的输入框
      const input = document.querySelector('input.el-input__inner[placeholder="得分"]');
      if (input && !window._autoReviewTriggered) {
        console.log('Found score input, triggering auto review');
        window._autoReviewTriggered = true;
        tryAutoStartReview();
        // 触发一次后停止观察，避免重复触发
        if (observer) observer.disconnect();
      }
    } catch (error) {
      console.error('Error in MutationObserver:', error);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
setupObserver();

// 页面初次加载也尝试一次
tryAutoStartReview();

// 监听来自 popup 的自动填分请求
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'auto_fill_score' && msg.score !== undefined) {
    console.log('Received auto_fill_score message with score:', msg.score);
    try {
      fillScoreAndSubmit(msg.score);
      sendResponse({ok: true});
    } catch (error) {
      console.error('Error in auto_fill_score:', error);
      sendResponse({ok: false, error: error.message});
    }
  }
  if (msg.action === 'select_area') {
    try {
      createOverlay();
      window._sendResponseForArea = sendResponse;
      return true;
    } catch (error) {
      console.error('Error in select_area:', error);
      sendResponse({error: error.message});
      return false;
    }
  }
  if (msg.action === 'capture_area') {
    try {
      chrome.storage.local.get('selectedArea', (data) => {
        const area = data.selectedArea;
        if (!area) {
          sendResponse({imageUrl: null});
          return;
        }
        chrome.runtime.sendMessage({action: 'capture_visible_tab'}, (res) => {
          if (res && res.dataUrl) {
            cropImageInContent(res.dataUrl, area).then(croppedUrl => {
              sendResponse({imageUrl: croppedUrl});
            }).catch(error => {
              console.error('Error in cropImageInContent:', error);
              sendResponse({imageUrl: null, error: error.message});
            });
          } else {
            sendResponse({imageUrl: null});
          }
        });
      });
      return true;
    } catch (error) {
      console.error('Error in capture_area:', error);
      sendResponse({imageUrl: null, error: error.message});
      return false;
    }
  }
});

// ========== 自动检测 jpg 图片加载并自动触发阅卷 ==========
// 监听 img 标签 src 变化
let imgObserver = null;
function setupImgObserver() {
  if (imgObserver) imgObserver.disconnect();
  imgObserver = new MutationObserver(() => {
    try {
      const imgs = Array.from(document.querySelectorAll('img'));
      for (const img of imgs) {
        if (img.src && /\.jpg(\?|$)/i.test(img.src)) {
          if (!window._lastAutoReviewImg || window._lastAutoReviewImg !== img.src) {
            window._lastAutoReviewImg = img.src;
            tryAutoStartReview();
          }
        }
      }
    } catch (error) {
      console.error('Error in imgObserver:', error);
    }
  });
  imgObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
}
setupImgObserver();

// 劫持 XHR 和 fetch
(function() {
  const originOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    if (/\.jpg(\?|$)/i.test(url)) {
      if (!window._lastAutoReviewImg || window._lastAutoReviewImg !== url) {
        window._lastAutoReviewImg = url;
        setTimeout(tryAutoStartReview, 100);
      }
    }
    return originOpen.call(this, method, url, ...args);
  };

  const originFetch = window.fetch;
  window.fetch = function(input, init) {
    let url = typeof input === 'string' ? input : (input && input.url);
    if (url && /\.jpg(\?|$)/i.test(url)) {
      if (!window._lastAutoReviewImg || window._lastAutoReviewImg !== url) {
        window._lastAutoReviewImg = url;
        setTimeout(tryAutoStartReview, 100);
      }
    }
    return originFetch.apply(this, arguments);
  };
})();

// 页面初次加载也尝试一次
tryAutoStartReview();