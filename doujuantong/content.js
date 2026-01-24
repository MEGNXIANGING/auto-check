// content.js - 负责页面DOM操作（区域选择、填分、提交）

// ============ 日志函数 ============
function log(...args) {
  console.log('[香猫阅卷-Content]', ...args);
}

function logError(...args) {
  console.error('[香猫阅卷-Content]', ...args);
}

// ============ 平台配置 ============
const PLATFORM_CONFIG = {
  // 智学网平台
  zxw: {
    scoreInput: [
      'input[type="number"]',
      'input.score-input',
      'input[placeholder*="分"]',
      'input[placeholder*="score"]'
    ],
    submitButton: [
      'button.submit-btn',
      'button[type="submit"]',
      '.submit-button',
      'button.el-button--primary'
    ],
    nextButton: [
      '.next-btn',
      'button.next'
    ],
    nextButtonText: ['下一份', '下一个', '下一题']
  },
  // 懂你教育平台
  dnjy: {
    scoreInput: [
      'input.el-input__inner[placeholder="得分"]',
      'input[placeholder="得分"]',
      'input.el-input__inner[placeholder*="得分"]',
      'input.el-input__inner[placeholder*="分"]'
    ],
    submitButton: [
      'button.el-button.el-button--primary.el-button--small',
      'button.el-button--primary.el-button--small',
      'button.el-button.el-button--primary',
      'button.el-button--primary'
    ],
    nextButton: [],
    nextButtonText: ['下一份', '下一个']
  }
};

// ============ 区域选择功能 ============
let overlay = null;
let selectBox = null;
let confirmBtn = null;
let cancelBtn = null;
let tipDiv = null;
let firstPoint = null;
let secondPoint = null;
let selectResolve = null;
let selectReject = null;

// 创建覆盖层
function createOverlay() {
  cleanup();
  
  return new Promise((resolve, reject) => {
    selectResolve = resolve;
    selectReject = reject;
    
    // 创建半透明覆盖层
    overlay = document.createElement('div');
    overlay.id = 'xiangmao-overlay';
    overlay.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483640;
      background: rgba(0, 0, 0, 0.15);
      cursor: crosshair;
    `;
    overlay.tabIndex = 0;
    document.body.appendChild(overlay);
    overlay.focus();
    
    // 事件监听
    overlay.addEventListener('mousedown', onOverlayMouseDown, true);
    overlay.addEventListener('keydown', onOverlayKeyDown);
    
    // 显示提示
    showTip('请点击选区左上角');
    
    log('区域选择覆盖层已创建');
  });
}

// 显示提示信息
function showTip(text) {
  if (tipDiv) tipDiv.remove();
  
  tipDiv = document.createElement('div');
  tipDiv.id = 'xiangmao-tip';
  tipDiv.textContent = text;
  tipDiv.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    background: linear-gradient(90deg, #007bff 60%, #00c6ff 100%);
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
    pointer-events: none;
  `;
  document.body.appendChild(tipDiv);
}

// 鼠标按下事件
function onOverlayMouseDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  
  if (!firstPoint) {
    // 第一个点：左上角
    firstPoint = { x: e.clientX, y: e.clientY };
    showTip('请点击选区右下角');
    log('选择第一点:', firstPoint);
  } else if (!secondPoint) {
    // 第二个点：右下角
    secondPoint = { x: e.clientX, y: e.clientY };
    log('选择第二点:', secondPoint);
    
    // 绘制选框
    if (!drawSelectBox()) {
      // 区域太小，重置
      firstPoint = null;
      secondPoint = null;
      return;
    }
    
    // 显示确认按钮
    createConfirmButtons();
    showTip('点击 ✓ 确认，✗ 取消，或按 ESC 重新选择');
  }
}

// 键盘事件
function onOverlayKeyDown(e) {
  if (e.key === 'Escape') {
    log('用户按ESC取消选择');
    cleanup();
    if (selectReject) {
      selectReject(new Error('用户取消选择'));
    }
  }
}

// 绘制选框
function drawSelectBox() {
  if (selectBox) selectBox.remove();
  
  const x = Math.min(firstPoint.x, secondPoint.x);
  const y = Math.min(firstPoint.y, secondPoint.y);
  const w = Math.abs(secondPoint.x - firstPoint.x);
  const h = Math.abs(secondPoint.y - firstPoint.y);
  
  // 检查区域大小
  if (w < 30 || h < 30) {
    showTip('区域太小，请重新选择（至少30x30像素）');
    return false;
  }
  
  selectBox = document.createElement('div');
  selectBox.id = 'xiangmao-selectbox';
  selectBox.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: ${w}px;
    height: ${h}px;
    border: 3px solid #007bff;
    background: rgba(0, 123, 255, 0.1);
    z-index: 2147483645;
    box-sizing: border-box;
    pointer-events: none;
  `;
  document.body.appendChild(selectBox);
  
  log('选框绘制完成:', { x, y, w, h });
  return true;
}

// 创建确认/取消按钮
function createConfirmButtons() {
  if (confirmBtn) confirmBtn.remove();
  if (cancelBtn) cancelBtn.remove();
  
  const boxRect = selectBox.getBoundingClientRect();
  
  // 确认按钮
  confirmBtn = document.createElement('button');
  confirmBtn.id = 'xiangmao-confirm';
  confirmBtn.innerHTML = '✓';
  confirmBtn.title = '确认选择';
  confirmBtn.style.cssText = `
    position: fixed;
    left: ${boxRect.right - 30}px;
    top: ${boxRect.top - 50}px;
    width: 44px;
    height: 44px;
    background: #28a745;
    color: #fff;
    border: none;
    border-radius: 50%;
    font-size: 24px;
    font-weight: bold;
    z-index: 2147483648;
    box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  confirmBtn.onmouseover = () => {
    confirmBtn.style.transform = 'scale(1.1)';
  };
  confirmBtn.onmouseout = () => {
    confirmBtn.style.transform = 'scale(1)';
  };
  confirmBtn.onclick = onConfirm;
  document.body.appendChild(confirmBtn);
  
  // 取消按钮
  cancelBtn = document.createElement('button');
  cancelBtn.id = 'xiangmao-cancel';
  cancelBtn.innerHTML = '✗';
  cancelBtn.title = '取消选择';
  cancelBtn.style.cssText = `
    position: fixed;
    left: ${boxRect.right + 20}px;
    top: ${boxRect.top - 50}px;
    width: 44px;
    height: 44px;
    background: #dc3545;
    color: #fff;
    border: none;
    border-radius: 50%;
    font-size: 24px;
    font-weight: bold;
    z-index: 2147483648;
    box-shadow: 0 4px 12px rgba(220, 53, 69, 0.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  cancelBtn.onmouseover = () => {
    cancelBtn.style.transform = 'scale(1.1)';
  };
  cancelBtn.onmouseout = () => {
    cancelBtn.style.transform = 'scale(1)';
  };
  cancelBtn.onclick = onCancel;
  document.body.appendChild(cancelBtn);
}

// 确认选择
function onConfirm() {
  const x = Math.min(firstPoint.x, secondPoint.x);
  const y = Math.min(firstPoint.y, secondPoint.y);
  const w = Math.abs(secondPoint.x - firstPoint.x);
  const h = Math.abs(secondPoint.y - firstPoint.y);
  
  const area = { x, y, w, h };
  log('区域选择确认:', area);
  
  // 保存到storage
  chrome.storage.local.set({ selectedArea: area }, () => {
    cleanup();
    if (selectResolve) {
      selectResolve(area);
    }
  });
}

// 取消选择
function onCancel() {
  log('用户取消选择');
  cleanup();
  if (selectReject) {
    selectReject(new Error('用户取消选择'));
  }
}

// 清理UI元素
function cleanup() {
  if (overlay) { overlay.remove(); overlay = null; }
  if (selectBox) { selectBox.remove(); selectBox = null; }
  if (confirmBtn) { confirmBtn.remove(); confirmBtn = null; }
  if (cancelBtn) { cancelBtn.remove(); cancelBtn = null; }
  if (tipDiv) { tipDiv.remove(); tipDiv = null; }
  firstPoint = null;
  secondPoint = null;
  selectResolve = null;
  selectReject = null;
}

// ============ 图片裁剪功能 ============
function cropImage(dataUrl, area) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = function() {
        try {
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
          
          const croppedUrl = canvas.toDataURL('image/png');
          log('图片裁剪完成');
          resolve(croppedUrl);
        } catch (error) {
          logError('裁剪图片canvas操作失败:', error);
          reject(error);
        }
      };
      
      img.onerror = function() {
        logError('加载截图图片失败');
        reject(new Error('加载截图图片失败'));
      };
      
      img.src = dataUrl;
    } catch (error) {
      logError('裁剪图片初始化失败:', error);
      reject(error);
    }
  });
}

// ============ DOM操作功能 ============

// 查找元素（支持多个选择器和:contains伪类）
function findElement(selectors) {
  for (const selector of selectors) {
    try {
      // 处理 :contains 伪类
      if (selector.includes(':contains(')) {
        const match = selector.match(/^(.+?):contains\("(.+?)"\)$/);
        if (match) {
          const baseSelector = match[1];
          const containsText = match[2];
          const elements = document.querySelectorAll(baseSelector);
          for (const el of elements) {
            if (el.textContent.includes(containsText)) {
              log('找到元素 (contains):', selector);
              return el;
            }
          }
        }
        continue;
      }
      
      // 常规选择器
      const element = document.querySelector(selector);
      if (element) {
        log('找到元素:', selector);
        return element;
      }
    } catch (e) {
      // 选择器语法错误，跳过
    }
  }
  return null;
}

// 填入分数
function fillScore(score, platform) {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.dnjy;
  let input = findElement(config.scoreInput);
  
  // 如果通过配置找不到，尝试更通用的方式
  if (!input) {
    // 尝试通过placeholder文本查找
    const allInputs = document.querySelectorAll('input');
    for (const inp of allInputs) {
      if (inp.placeholder && inp.placeholder.includes('得分')) {
        input = inp;
        log('通过placeholder找到输入框');
        break;
      }
    }
  }
  
  if (!input) {
    logError('未找到分数输入框，平台:', platform);
    
    // 调试：列出所有输入框
    const allInputs = document.querySelectorAll('input');
    log('页面上的所有输入框:', allInputs.length);
    allInputs.forEach((inp, i) => {
      log(`输入框${i}: placeholder="${inp.placeholder}", class="${inp.className}", type="${inp.type}"`);
    });
    
    return false;
  }
  
  log('找到分数输入框:', input.placeholder, input.className);
  
  // 聚焦输入框
  input.focus();
  input.click();
  
  // 清空当前值
  input.value = '';
  
  // 使用原生setter设置值（绕过Vue的getter/setter）
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(input, score.toString());
  
  // 触发input事件（Vue v-model监听这个事件）
  const inputEvent = new Event('input', { bubbles: true, cancelable: true });
  input.dispatchEvent(inputEvent);
  
  // 触发change事件
  const changeEvent = new Event('change', { bubbles: true, cancelable: true });
  input.dispatchEvent(changeEvent);
  
  // 触发keyup事件
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
  
  // 对于Element UI，可能需要触发blur来确认输入
  setTimeout(() => {
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }, 50);
  
  log('分数已填入:', score, '当前input.value:', input.value);
  return true;
}

// 点击提交按钮
function clickSubmit(platform) {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.dnjy;
  let btn = findElement(config.submitButton);
  
  // 如果没找到，尝试通过文本内容查找
  if (!btn) {
    const allButtons = Array.from(document.querySelectorAll('button'));
    // 优先找包含"提交"文本的primary按钮
    btn = allButtons.find(b => {
      const text = b.textContent.trim();
      const isPrimary = b.classList.contains('el-button--primary');
      return text.includes('提交') && isPrimary;
    });
    
    // 如果还没找到，放宽条件
    if (!btn) {
      btn = allButtons.find(b => {
        const text = b.textContent.trim();
        return text === '提交' || text.includes('提交');
      });
    }
    
    // 最后尝试找任何包含确定/保存的按钮
    if (!btn) {
      btn = allButtons.find(b => {
        const text = b.textContent.trim();
        return text.includes('确定') || text.includes('保存');
      });
    }
  }
  
  if (!btn) {
    logError('未找到提交按钮，平台:', platform);
    
    // 调试：列出所有按钮
    const allButtons = document.querySelectorAll('button');
    log('页面上的所有按钮:', allButtons.length);
    allButtons.forEach((b, i) => {
      log(`按钮${i}: text="${b.textContent.trim().substring(0, 20)}", class="${b.className}"`);
    });
    
    return false;
  }
  
  log('找到提交按钮:', btn.textContent.trim(), btn.className);
  
  // 确保按钮可点击
  if (btn.disabled) {
    btn.disabled = false;
    btn.removeAttribute('disabled');
    log('已移除按钮禁用状态');
  }
  
  // 模拟真实点击
  const rect = btn.getBoundingClientRect();
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  });
  btn.dispatchEvent(clickEvent);
  
  log('提交按钮已点击');
  return true;
}

// 点击下一份按钮
function clickNext(platform) {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.dnjy;
  const nextTexts = config.nextButtonText || ['下一份', '下一个', '下一题'];
  
  let element = null;
  
  // 1. 首先尝试通过配置的选择器查找
  if (config.nextButton && config.nextButton.length > 0) {
    element = findElement(config.nextButton);
  }
  
  // 2. 尝试查找包含"下一份"文本的按钮
  if (!element) {
    const allButtons = Array.from(document.querySelectorAll('button'));
    for (const text of nextTexts) {
      element = allButtons.find(b => b.textContent.includes(text));
      if (element) {
        log('通过按钮文本找到:', text);
        break;
      }
    }
  }
  
  // 3. 尝试查找包含"下一份"文本的链接（懂你教育使用链接）
  if (!element) {
    const allLinks = Array.from(document.querySelectorAll('a'));
    for (const text of nextTexts) {
      element = allLinks.find(a => a.textContent.includes(text));
      if (element) {
        log('通过链接文本找到:', text);
        break;
      }
    }
  }
  
  // 4. 尝试查找包含"下一份"文本的任意可点击元素
  if (!element) {
    const allElements = Array.from(document.querySelectorAll('*'));
    for (const text of nextTexts) {
      element = allElements.find(el => {
        const elText = el.textContent.trim();
        // 只匹配文本正好是"下一份"的元素，避免匹配到包含该文本的父元素
        return elText === text || (elText.includes(text) && elText.length < 10);
      });
      if (element) {
        log('通过任意元素文本找到:', text, element.tagName);
        break;
      }
    }
  }
  
  if (!element) {
    logError('未找到下一份按钮/链接，平台:', platform);
    
    // 调试信息
    const allClickables = document.querySelectorAll('a, button, [role="button"]');
    log('页面上的可点击元素:', allClickables.length);
    allClickables.forEach((el, i) => {
      const text = el.textContent.trim().substring(0, 30);
      if (text.includes('一份') || text.includes('一个')) {
        log(`可点击元素${i}: tag="${el.tagName}", text="${text}"`);
      }
    });
    
    return false;
  }
  
  log('找到下一份元素:', element.tagName, element.textContent.trim());
  
  // 确保元素可点击
  if (element.disabled) {
    element.disabled = false;
    element.removeAttribute('disabled');
  }
  
  // 模拟点击
  element.click();
  
  log('下一份已点击');
  return true;
}

// ============ 消息监听 ============
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  log('收到消息:', msg.action);
  
  switch (msg.action) {
    case 'select_area':
      // 选择区域
      createOverlay()
        .then(area => sendResponse({ success: true, area }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'crop_image':
      // 裁剪图片
      cropImage(msg.dataUrl, msg.area)
        .then(croppedUrl => sendResponse({ croppedUrl }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    
    case 'fill_score_and_submit':
      // 填分并提交
      try {
        log('收到填分提交请求, 分数:', msg.score, '平台:', msg.platform);
        
        const filled = fillScore(msg.score, msg.platform);
        if (!filled) {
          sendResponse({ success: false, error: '未找到分数输入框' });
          return false;
        }
        
        // 等待Vue响应式系统更新后再提交
        setTimeout(() => {
          log('准备点击提交按钮...');
          const submitted = clickSubmit(msg.platform);
          if (submitted) {
            log('提交成功');
            sendResponse({ success: true });
          } else {
            log('提交失败：未找到提交按钮');
            sendResponse({ success: false, error: '未找到提交按钮' });
          }
        }, 500);
        
        return true;
      } catch (error) {
        logError('填分提交出错:', error);
        sendResponse({ success: false, error: error.message });
        return false;
      }
    
    case 'click_next':
      // 点击下一份
      try {
        const clicked = clickNext(msg.platform);
        sendResponse({ success: clicked, error: clicked ? null : '未找到下一份按钮' });
      } catch (error) {
        logError('点击下一份出错:', error);
        sendResponse({ success: false, error: error.message });
      }
      return false;
    
    case 'fill_score':
      // 仅填分（不提交）
      try {
        const filled = fillScore(msg.score, msg.platform);
        sendResponse({ success: filled });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return false;
    
    case 'ping':
      // 心跳检测
      sendResponse({ success: true });
      return false;
    
    default:
      log('未知消息类型:', msg.action);
      return false;
  }
});

log('香猫阅卷 Content Script 已加载');
