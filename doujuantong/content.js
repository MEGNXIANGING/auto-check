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

// 填入分数（增强版，确保Vue能检测到变化）
function fillScore(score, platform) {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.dnjy;
  let input = findElement(config.scoreInput);
  
  // 如果通过配置找不到，尝试更通用的方式
  if (!input) {
    // 尝试通过placeholder文本查找
    const allInputs = document.querySelectorAll('input');
    for (const inp of allInputs) {
      if (inp.placeholder && (inp.placeholder.includes('得分') || inp.placeholder.includes('分'))) {
        input = inp;
        log('通过placeholder找到输入框');
        break;
      }
    }
  }
  
  // 再尝试查找el-input组件内的input
  if (!input) {
    const elInputs = document.querySelectorAll('.el-input .el-input__inner');
    for (const inp of elInputs) {
      // 检查是否在评分区域内
      const parent = inp.closest('.el-input');
      if (parent) {
        input = inp;
        log('通过el-input组件找到输入框');
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
      log(`输入框${i}: placeholder="${inp.placeholder}", class="${inp.className}", type="${inp.type}", value="${inp.value}"`);
    });
    
    return false;
  }
  
  log('找到分数输入框:', input.placeholder, input.className, '当前值:', input.value);
  
  const scoreStr = score.toString();
  
  // 方法1: 模拟用户输入过程
  // 先聚焦
  input.focus();
  
  // 选中所有内容
  input.select();
  
  // 模拟键盘输入 - 先清空
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  
  // 逐字符输入（模拟真实用户输入）
  for (const char of scoreStr) {
    const keydownEvent = new KeyboardEvent('keydown', {
      key: char,
      code: `Digit${char}`,
      keyCode: char.charCodeAt(0),
      which: char.charCodeAt(0),
      bubbles: true
    });
    input.dispatchEvent(keydownEvent);
    
    // 使用insertText命令插入字符
    document.execCommand('insertText', false, char);
    
    const keyupEvent = new KeyboardEvent('keyup', {
      key: char,
      code: `Digit${char}`,
      keyCode: char.charCodeAt(0),
      which: char.charCodeAt(0),
      bubbles: true
    });
    input.dispatchEvent(keyupEvent);
  }
  
  // 方法2: 如果execCommand不生效，使用原生setter
  if (input.value !== scoreStr) {
    log('execCommand方式未生效，使用原生setter');
    
    // 使用原生setter设置值
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, scoreStr);
    
    // 触发input事件
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }
  
  // 触发change事件
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  
  // 触发compositionend（某些Vue组件需要）
  input.dispatchEvent(new CompositionEvent('compositionend', { 
    bubbles: true, 
    data: scoreStr 
  }));
  
  // 触发blur确认输入
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  
  // 验证值是否正确设置
  log('分数填入完成, input.value:', input.value, '期望值:', scoreStr);
  
  if (input.value !== scoreStr) {
    logError('警告：输入框值与期望不符！尝试强制设置...');
    input.value = scoreStr;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  return true;
}

// 点击提交按钮（精确版，确保只点击提交按钮）
function clickSubmit(platform) {
  log('');
  log('╔══════════════════════════════════════╗');
  log('║      开始查找并点击提交按钮          ║');
  log('╚══════════════════════════════════════╝');
  
  // 获取所有按钮
  const allButtons = Array.from(document.querySelectorAll('button'));
  log('页面按钮总数:', allButtons.length);
  
  // 详细列出所有按钮
  log('--- 页面所有按钮列表 ---');
  allButtons.forEach((b, i) => {
    const text = b.textContent.trim().replace(/\s+/g, ' ');
    const rect = b.getBoundingClientRect();
    log(`  [${i}] text="${text}" | class="${b.className}" | pos=(${Math.round(rect.left)},${Math.round(rect.top)})`);
  });
  log('--- 按钮列表结束 ---');
  
  // 只找文本完全是"提交"的按钮（去除空白后）
  let submitBtn = null;
  
  for (const btn of allButtons) {
    const text = btn.textContent.trim().replace(/\s+/g, '');
    
    // 只匹配文本完全是"提交"的按钮
    if (text === '提交') {
      log(`找到候选按钮: text="${text}", class="${btn.className}"`);
      
      // 确认是primary按钮（绿色提交按钮）
      if (btn.classList.contains('el-button--primary')) {
        submitBtn = btn;
        log('✓ 确认是primary提交按钮');
        break;
      } else {
        // 如果不是primary但文本是"提交"，也记录下来作为备选
        if (!submitBtn) {
          submitBtn = btn;
          log('⚠ 非primary按钮，作为备选');
        }
      }
    }
  }
  
  if (!submitBtn) {
    logError('✗ 未找到提交按钮！');
    return false;
  }
  
  // 详细记录将要点击的按钮
  const btnText = submitBtn.textContent.trim().replace(/\s+/g, '');
  const btnClass = submitBtn.className;
  const btnRect = submitBtn.getBoundingClientRect();
  
  log('');
  log('>>> 将要点击的按钮 <<<');
  log(`    文本: "${btnText}"`);
  log(`    class: "${btnClass}"`);
  log(`    位置: left=${Math.round(btnRect.left)}, top=${Math.round(btnRect.top)}, right=${Math.round(btnRect.right)}, bottom=${Math.round(btnRect.bottom)}`);
  log(`    宽高: ${Math.round(btnRect.width)}x${Math.round(btnRect.height)}`);
  
  // 最后确认：文本必须是"提交"
  if (btnText !== '提交') {
    logError(`✗ 安全检查失败！按钮文本是"${btnText}"而不是"提交"，拒绝点击`);
    return false;
  }
  
  log('✓ 安全检查通过，文本确认是"提交"');
  
  // 点击按钮
  log('>>> 执行点击 <<<');
  submitBtn.click();
  log('>>> 点击完成 <<<');
  log('');
  
  // 设置弹窗监听
  setupConfirmDialogWatcher();
  
  return true;
}

// 监听并自动处理确认弹窗
function setupConfirmDialogWatcher() {
  log('设置弹窗监听（只处理"未提交"确认弹窗）...');
  
  // 定时检查弹窗
  const checkTimes = [300, 600, 1000];
  checkTimes.forEach(delay => {
    setTimeout(() => {
      const handled = handleConfirmDialog();
      if (handled) {
        log(`✓ 在 ${delay}ms 时处理了确认弹窗`);
      }
    }, delay);
  });
}

// 处理确认对话框（严格版 - 只处理"未提交"弹窗）
function handleConfirmDialog() {
  log('检查是否有"未提交"确认弹窗...');
  
  // 只检查Element UI MessageBox
  const msgBoxWrapper = document.querySelector('.el-message-box__wrapper');
  if (!msgBoxWrapper) {
    log('  - 没有找到.el-message-box__wrapper');
    return false;
  }
  
  const wrapperStyle = window.getComputedStyle(msgBoxWrapper);
  if (wrapperStyle.display === 'none' || wrapperStyle.visibility === 'hidden') {
    log('  - MessageBox wrapper不可见');
    return false;
  }
  
  const msgBox = msgBoxWrapper.querySelector('.el-message-box');
  if (!msgBox) {
    log('  - 没有找到.el-message-box');
    return false;
  }
  
  const msgText = msgBox.textContent || '';
  log('  - 检测到MessageBox, 内容:', msgText.substring(0, 100));
  
  // 严格检查：必须同时包含"未提交"和"继续"这两个关键词
  if (!msgText.includes('未提交')) {
    log('  - 弹窗内容不包含"未提交"，忽略');
    return false;
  }
  
  log('  - ✓ 确认是"未提交"弹窗');
  
  // 查找"继续"按钮
  const btnsContainer = msgBox.querySelector('.el-message-box__btns');
  if (!btnsContainer) {
    log('  - 没有找到按钮容器');
    return false;
  }
  
  const buttons = btnsContainer.querySelectorAll('button');
  log(`  - 弹窗中有 ${buttons.length} 个按钮`);
  
  for (const btn of buttons) {
    const btnText = btn.textContent.trim();
    log(`    - 按钮: "${btnText}"`);
    
    // 只点击"继续"按钮
    if (btnText === '继续') {
      log('  >>> 点击"继续"按钮 <<<');
      btn.click();
      log('  >>> 点击完成 <<<');
      return true;
    }
  }
  
  log('  - 没有找到"继续"按钮');
  return false;
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
      // 填分并提交（简化版，确保只点击一次提交按钮）
      try {
        log('========== 开始填分提交流程 ==========');
        log('分数:', msg.score, '平台:', msg.platform);
        
        // 步骤1: 填入分数
        const filled = fillScore(msg.score, msg.platform);
        if (!filled) {
          sendResponse({ success: false, error: '未找到分数输入框' });
          return false;
        }
        
        // 步骤2: 等待Vue响应式系统更新后点击提交
        setTimeout(() => {
          log('步骤2: 点击提交按钮');
          const submitted = clickSubmit(msg.platform);
          
          if (!submitted) {
            log('提交失败：未找到提交按钮');
            sendResponse({ success: false, error: '未找到提交按钮' });
            return;
          }
          
          // 步骤3: 等待弹窗处理
          setTimeout(() => {
            log('步骤3: 检查弹窗');
            handleConfirmDialog();
            
            // 步骤4: 返回成功
            setTimeout(() => {
              log('========== 填分提交流程完成 ==========');
              sendResponse({ success: true });
            }, 500);
          }, 800);
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
