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
    nextButtonText: ['下一份', '下一个', '下一题'],
    isAspNet: false
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
    nextButtonText: ['下一份', '下一个'],
    isAspNet: false
  },
  // AMEQP全通教学质量监测平台（ASP.NET WebForms）
  ameqp: {
    scoreInput: [
      'input.mark_tbx',
      'input[id^="txt_que_"]',
      'input[name^="txt_que_"]',
      'input[maxsco]'
    ],
    submitButton: [
      'input#btn_submit',
      'input.mark_btn[value*="提交"]',
      'input[type="button"][value*="提交"]'
    ],
    nextButton: [],
    nextButtonText: [],
    isAspNet: true,
    autoNextAfterSubmit: true  // OnSubmit(1) 提交后自动AJAX加载下一份，不需要手动点"下一份"
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
  
  // AMEQP平台特殊查找逻辑：在分数区域附近查找text输入框
  if (!input && platform === 'ameqp') {
    input = findAmeqpScoreInput();
  }
  
  // 如果通过配置找不到，尝试更通用的方式
  if (!input) {
    const allInputs = document.querySelectorAll('input');
    for (const inp of allInputs) {
      if (inp.placeholder && (inp.placeholder.includes('得分') || inp.placeholder.includes('分'))) {
        input = inp;
        log('通过placeholder找到输入框');
        break;
      }
    }
  }
  
  // 再尝试查找el-input组件内的input（Vue/Element UI平台）
  if (!input && !config.isAspNet) {
    const elInputs = document.querySelectorAll('.el-input .el-input__inner');
    for (const inp of elInputs) {
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
    
    const allInputs = document.querySelectorAll('input');
    log('页面上的所有输入框:', allInputs.length);
    allInputs.forEach((inp, i) => {
      log(`输入框${i}: id="${inp.id}", name="${inp.name}", placeholder="${inp.placeholder}", class="${inp.className}", type="${inp.type}", value="${inp.value}"`);
    });
    
    return false;
  }
  
  log('找到分数输入框:', `id="${input.id}"`, `name="${input.name}"`, input.placeholder, input.className, '当前值:', input.value);
  
  const scoreStr = score.toString();
  
  if (config.isAspNet) {
    return fillScoreAspNet(input, scoreStr);
  }
  
  return fillScoreVue(input, scoreStr);
}

// AMEQP平台专用：查找分数输入框
function findAmeqpScoreInput() {
  const allInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
  
  for (const inp of allInputs) {
    if (inp.offsetParent === null && !inp.closest('[style*="display"]')) continue;
    const rect = inp.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    
    const parent = inp.parentElement;
    if (parent) {
      const parentText = parent.textContent || '';
      if (parentText.includes('分') || parentText.includes('题') || parentText.includes('Score') || parentText.includes('得分')) {
        log('AMEQP: 通过父元素文本找到分数输入框:', parentText.substring(0, 50));
        return inp;
      }
    }
    
    const prevSibling = inp.previousElementSibling;
    const nextSibling = inp.nextElementSibling;
    const siblingText = (prevSibling?.textContent || '') + (nextSibling?.textContent || '');
    if (siblingText.includes('分') || siblingText.includes('题')) {
      log('AMEQP: 通过兄弟元素文本找到分数输入框');
      return inp;
    }
  }
  
  const rightInputs = allInputs.filter(inp => {
    const rect = inp.getBoundingClientRect();
    return rect.width > 0 && rect.width < 120 && rect.left > window.innerWidth * 0.6;
  });
  
  if (rightInputs.length > 0) {
    log('AMEQP: 通过位置推断找到分数输入框（右侧小输入框）');
    return rightInputs[0];
  }
  
  return null;
}

// ASP.NET/AMEQP平台填分
function fillScoreAspNet(input, scoreStr) {
  log('╔══════════════════════════════════════╗');
  log('║      AMEQP平台填分模式              ║');
  log('╚══════════════════════════════════════╝');
  log(`输入框信息: id="${input.id}" name="${input.name}" class="${input.className}" 当前值="${input.value}" maxsco="${input.getAttribute('maxsco')}"`);
  log(`目标分数: "${scoreStr}"`);
  
  const inputId = input.id || '';
  const queMatch = inputId.match(/txt_que_(\d+)/);
  
  if (queMatch) {
    const queNum = queMatch[1];
    const scoreVal = parseFloat(scoreStr);
    log(`✓ 匹配到题号: queNum=${queNum}, scoreVal=${scoreVal}`);
    
    // 方法1: 点击匹配的分数列表项
    const scoListContainer = document.getElementById(`Mark_scoList_${queNum}`);
    if (scoListContainer) {
      const scoItems = Array.from(scoListContainer.querySelectorAll('span.sco_list'));
      log(`✓ 找到分数列表容器 Mark_scoList_${queNum}, 共 ${scoItems.length} 项:`);
      
      // 列出所有分数项
      scoItems.forEach((item, i) => {
        const val = item.getAttribute('value');
        const text = item.textContent.trim();
        const cls = item.className;
        log(`  [${i}] value="${val}" text="${text}" class="${cls}"`);
      });
      
      let bestMatch = null;
      let bestDiff = Infinity;
      
      for (const item of scoItems) {
        const itemVal = parseFloat(item.getAttribute('value'));
        const diff = Math.abs(itemVal - scoreVal);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestMatch = item;
        }
        if (diff === 0) break;
      }
      
      if (bestMatch) {
        const matchVal = bestMatch.getAttribute('value');
        log(`>>> 选中分数项: value=${matchVal}, diff=${bestDiff}, text="${bestMatch.textContent.trim()}"`);
        log('>>> 执行 bestMatch.click()');
        bestMatch.click();
        log('>>> click() 完成');
        
        // 验证分数是否设入
        setTimeout(() => {
          log(`--- 填分后验证(100ms) ---`);
          log(`  txt_que_${queNum}.value = "${input.value}" (期望: "${scoreStr}")`);
          const hiddenSco = document.getElementById(`MarQueSubSco_${queNum}`);
          if (hiddenSco) {
            log(`  MarQueSubSco_${queNum}.value = "${hiddenSco.value}"`);
          } else {
            log(`  MarQueSubSco_${queNum}: 不存在`);
          }
          const queValInput = document.getElementById('queVal');
          if (queValInput) {
            log(`  queVal.value = "${queValInput.value}"`);
          }
          log(`--- 验证结束 ---`);
        }, 100);
        
        return true;
      } else {
        log('✗ 分数列表中未找到匹配项!');
      }
    } else {
      log(`✗ 未找到分数列表容器 Mark_scoList_${queNum}`);
    }
    
    // 方法2: 直接设值
    log('>>> 使用回退方案: 直接设值 + 手动同步');
    
    input.focus();
    const oldValue = input.value;
    input.value = scoreStr;
    log(`  input.value: "${oldValue}" -> "${input.value}"`);
    
    const hiddenSco = document.getElementById(`MarQueSubSco_${queNum}`);
    if (hiddenSco) {
      const oldHidden = hiddenSco.value;
      hiddenSco.value = scoreStr;
      log(`  MarQueSubSco_${queNum}: "${oldHidden}" -> "${hiddenSco.value}"`);
    } else {
      log(`  MarQueSubSco_${queNum}: 不存在,无法同步`);
    }
    
    const queValInput = document.getElementById('queVal');
    if (queValInput) {
      queValInput.value = scoreStr;
      log(`  queVal: "${queValInput.value}"`);
    }
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13 }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    
    log(`✓ 回退填分完成, input.value="${input.value}"`);
    return true;
  }
  
  // 非标准输入框
  log(`✗ 输入框 id="${inputId}" 不匹配 txt_que_{N} 格式，使用通用填分`);
  input.focus();
  input.select();
  input.value = scoreStr;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  
  log(`通用填分完成, input.value="${input.value}", 期望="${scoreStr}", 匹配=${input.value === scoreStr}`);
  return input.value === scoreStr;
}

// Vue/Element UI平台填分（模拟用户输入+触发响应式系统）
function fillScoreVue(input, scoreStr) {
  log('Vue/Element UI平台填分模式');
  
  input.focus();
  input.select();
  
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  
  for (const char of scoreStr) {
    const keydownEvent = new KeyboardEvent('keydown', {
      key: char,
      code: `Digit${char}`,
      keyCode: char.charCodeAt(0),
      which: char.charCodeAt(0),
      bubbles: true
    });
    input.dispatchEvent(keydownEvent);
    
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
  
  if (input.value !== scoreStr) {
    log('execCommand方式未生效，使用原生setter');
    
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, scoreStr);
    
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }
  
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  
  input.dispatchEvent(new CompositionEvent('compositionend', { 
    bubbles: true, 
    data: scoreStr 
  }));
  
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  
  log('分数填入完成, input.value:', input.value, '期望值:', scoreStr);
  
  if (input.value !== scoreStr) {
    logError('警告：输入框值与期望不符！尝试强制设置...');
    input.value = scoreStr;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  return true;
}

// 点击提交按钮（精确版，支持多平台）
function clickSubmit(platform) {
  log('');
  log('╔══════════════════════════════════════╗');
  log('║      开始查找并点击提交按钮          ║');
  log('╚══════════════════════════════════════╝');
  
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.dnjy;
  let submitBtn = null;
  
  // 1. 先尝试通过平台配置的选择器查找
  submitBtn = findElement(config.submitButton);
  if (submitBtn) {
    log('通过平台配置选择器找到提交按钮');
  }
  
  // 2. 搜索 <button> 元素（文本匹配"提交"）
  if (!submitBtn) {
    const allButtons = Array.from(document.querySelectorAll('button'));
    log('页面button总数:', allButtons.length);
    
    log('--- 页面所有button列表 ---');
    allButtons.forEach((b, i) => {
      const text = b.textContent.trim().replace(/\s+/g, ' ');
      const rect = b.getBoundingClientRect();
      log(`  [${i}] text="${text}" | class="${b.className}" | pos=(${Math.round(rect.left)},${Math.round(rect.top)})`);
    });
    log('--- button列表结束 ---');
    
    for (const btn of allButtons) {
      const text = btn.textContent.trim().replace(/\s+/g, '');
      if (text === '提交') {
        log(`找到候选button: text="${text}", class="${btn.className}"`);
        if (btn.classList.contains('el-button--primary')) {
          submitBtn = btn;
          log('✓ 确认是primary提交按钮');
          break;
        } else if (!submitBtn) {
          submitBtn = btn;
          log('⚠ 非primary按钮，作为备选');
        }
      }
    }
  }
  
  // 3. 搜索 <input> 元素（ASP.NET平台常见：input type=button/submit value=提交）
  if (!submitBtn) {
    const inputBtns = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"]'));
    log('页面input按钮总数:', inputBtns.length);
    
    log('--- 页面所有input按钮列表 ---');
    inputBtns.forEach((b, i) => {
      const rect = b.getBoundingClientRect();
      log(`  [${i}] value="${b.value}" | id="${b.id}" | name="${b.name}" | pos=(${Math.round(rect.left)},${Math.round(rect.top)})`);
    });
    log('--- input按钮列表结束 ---');
    
    for (const btn of inputBtns) {
      const val = (btn.value || '').trim();
      if (val.includes('提交')) {
        submitBtn = btn;
        log(`找到input提交按钮: value="${val}", id="${btn.id}"`);
        break;
      }
    }
  }
  
  // 4. 搜索 <a> 链接按钮（ASP.NET LinkButton）
  if (!submitBtn) {
    const allLinks = Array.from(document.querySelectorAll('a'));
    for (const link of allLinks) {
      const text = link.textContent.trim().replace(/\s+/g, '');
      if (text === '提交' || text.includes('提交')) {
        // 排除导航链接，只匹配功能性按钮
        if (link.href && (link.href.includes('javascript:') || link.href.includes('__doPostBack') || link.getAttribute('onclick'))) {
          submitBtn = link;
          log(`找到链接提交按钮: text="${text}", href="${link.href?.substring(0, 60)}"`);
          break;
        }
      }
    }
  }
  
  if (!submitBtn) {
    logError('✗ 未找到提交按钮！');
    return false;
  }
  
  // 获取按钮显示文本（兼容button和input）
  const btnText = (submitBtn.tagName === 'INPUT' ? submitBtn.value : submitBtn.textContent).trim().replace(/\s+/g, '');
  const btnRect = submitBtn.getBoundingClientRect();
  
  log('');
  log('>>> 将要点击的提交按钮 <<<');
  log(`    标签: ${submitBtn.tagName}`);
  log(`    文本/值: "${btnText}"`);
  log(`    id: "${submitBtn.id}"`);
  log(`    class: "${submitBtn.className}"`);
  log(`    type: "${submitBtn.type || submitBtn.getAttribute('type')}"`);
  log(`    onclick: "${submitBtn.getAttribute('onclick') || '无'}"`);
  log(`    href: "${submitBtn.href || '无'}"`);
  log(`    disabled: ${submitBtn.disabled}`);
  log(`    visible: ${submitBtn.offsetParent !== null}`);
  log(`    位置: left=${Math.round(btnRect.left)}, top=${Math.round(btnRect.top)}, right=${Math.round(btnRect.right)}, bottom=${Math.round(btnRect.bottom)}`);
  log(`    宽高: ${Math.round(btnRect.width)}x${Math.round(btnRect.height)}`);
  
  if (!btnText.includes('提交')) {
    logError(`✗ 安全检查失败！按钮文本是"${btnText}"而不包含"提交"，拒绝点击`);
    return false;
  }
  
  log('✓ 安全检查通过，文本确认包含"提交"');
  
  // 点击前记录弹窗状态
  const dialogsBefore = document.querySelectorAll('.messager-window, .panel.window');
  const visibleBefore = Array.from(dialogsBefore).filter(el => window.getComputedStyle(el).display !== 'none').length;
  log(`点击前: 页面弹窗总数=${dialogsBefore.length}, 可见弹窗数=${visibleBefore}`);
  
  log('>>> 执行 submitBtn.click() <<<');
  submitBtn.click();
  log('>>> click() 执行完成 <<<');
  
  // 点击后立即检查弹窗变化
  const dialogsAfter = document.querySelectorAll('.messager-window, .panel.window');
  const visibleAfter = Array.from(dialogsAfter).filter(el => window.getComputedStyle(el).display !== 'none').length;
  log(`点击后(立即): 页面弹窗总数=${dialogsAfter.length}, 可见弹窗数=${visibleAfter}`);
  if (visibleAfter > visibleBefore) {
    log('⚠ 点击后立即出现了新弹窗!');
  }
  log('');
  
  // 设置弹窗监听（AMEQP 的弹窗由 fill_score_and_submit 的 pollForAmeqpDialog 处理）
  if (!config.autoNextAfterSubmit) {
    setupConfirmDialogWatcher();
  }
  
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
    if (element) {
      log('通过平台配置选择器找到下一份按钮');
    }
  }
  
  // 2. 搜索 <button> 元素
  if (!element) {
    const allButtons = Array.from(document.querySelectorAll('button'));
    for (const text of nextTexts) {
      element = allButtons.find(b => b.textContent.includes(text));
      if (element) {
        log('通过button文本找到:', text);
        break;
      }
    }
  }
  
  // 3. 搜索 <input type="button"> 元素（ASP.NET常见）
  if (!element) {
    const inputBtns = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"]'));
    for (const text of nextTexts) {
      element = inputBtns.find(b => (b.value || '').includes(text));
      if (element) {
        log('通过input按钮value找到:', text);
        break;
      }
    }
  }
  
  // 4. 搜索 <a> 链接
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
  
  // 5. 搜索任意可点击元素
  if (!element) {
    const allElements = Array.from(document.querySelectorAll('*'));
    for (const text of nextTexts) {
      element = allElements.find(el => {
        const elText = (el.tagName === 'INPUT' ? (el.value || '') : el.textContent).trim();
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
    
    const allClickables = document.querySelectorAll('a, button, input[type="button"], input[type="submit"], [role="button"]');
    log('页面上的可点击元素:', allClickables.length);
    allClickables.forEach((el, i) => {
      const text = (el.tagName === 'INPUT' ? (el.value || '') : el.textContent).trim().substring(0, 30);
      if (text.includes('一份') || text.includes('一个') || text.includes('>>') || text.includes('»') || text.includes('下一')) {
        log(`可点击元素${i}: tag="${el.tagName}", text="${text}", id="${el.id}"`);
      }
    });
    
    return false;
  }
  
  const elementText = (element.tagName === 'INPUT' ? (element.value || '') : element.textContent).trim();
  log('找到下一份元素:', element.tagName, elementText);
  
  if (element.disabled) {
    element.disabled = false;
    element.removeAttribute('disabled');
  }
  
  element.click();
  
  log('下一份已点击');
  return true;
}

// AMEQP 页面状态快照（调试用）
function dumpAmeqpPageState() {
  log('--- AMEQP 页面状态快照 ---');
  
  // 分数输入框
  const scoreInputs = document.querySelectorAll('input.mark_tbx, input[id^="txt_que_"]');
  log(`分数输入框数量: ${scoreInputs.length}`);
  scoreInputs.forEach((inp, i) => {
    log(`  [分数框${i}] id="${inp.id}" value="${inp.value}" maxsco="${inp.getAttribute('maxsco')}" visible=${inp.offsetParent !== null}`);
  });
  
  // 提交按钮
  const submitBtn = document.querySelector('input#btn_submit');
  if (submitBtn) {
    const rect = submitBtn.getBoundingClientRect();
    log(`提交按钮: id="${submitBtn.id}" value="${submitBtn.value}" onclick="${submitBtn.getAttribute('onclick')}" visible=${submitBtn.offsetParent !== null} pos=(${Math.round(rect.left)},${Math.round(rect.top)}) size=${Math.round(rect.width)}x${Math.round(rect.height)}`);
  } else {
    log('提交按钮: 未找到 input#btn_submit');
    const allInputBtns = document.querySelectorAll('input[type="button"]');
    log(`页面所有 input[type=button]: ${allInputBtns.length}`);
    allInputBtns.forEach((b, i) => {
      log(`  [${i}] id="${b.id}" value="${b.value}" onclick="${b.getAttribute('onclick')}"`);
    });
  }
  
  // 分数列表（sco_list）
  const scoLists = document.querySelectorAll('[id^="Mark_scoList_"]');
  log(`分数列表容器数量: ${scoLists.length}`);
  scoLists.forEach((container) => {
    const items = container.querySelectorAll('span.sco_list');
    const values = Array.from(items).map(s => s.getAttribute('value')).join(', ');
    log(`  ${container.id}: ${items.length}项 -> [${values}]`);
  });
  
  // 隐藏字段
  const hiddenFields = document.querySelectorAll('input[id^="MarQueSubSco_"], input#queVal');
  log(`隐藏字段数量: ${hiddenFields.length}`);
  hiddenFields.forEach((f) => {
    log(`  ${f.id}="${f.value}"`);
  });
  
  // 当前弹窗状态
  const visiblePanels = Array.from(document.querySelectorAll('.panel.window, .messager-window')).filter(el => {
    return window.getComputedStyle(el).display !== 'none';
  });
  log(`当前可见弹窗数量: ${visiblePanels.length}`);
  visiblePanels.forEach((p, i) => {
    const title = p.querySelector('.panel-title');
    const body = p.querySelector('.messager-body, .panel-body');
    log(`  [弹窗${i}] title="${title?.textContent?.trim()}" body="${body?.textContent?.trim()?.substring(0, 80)}" class="${p.className}"`);
  });
  
  // window-mask 状态
  const masks = document.querySelectorAll('.window-mask');
  masks.forEach((m, i) => {
    const style = window.getComputedStyle(m);
    log(`  window-mask[${i}]: display=${style.display} zIndex=${style.zIndex}`);
  });
  
  log('--- 页面状态快照结束 ---');
}

// 检测并处理 EasyUI messager 弹窗（AMEQP 使用 $.messager.alert）
// 返回弹窗文本内容，如果没有弹窗返回 null
function dismissEasyUIDialog() {
  log('╔══════════════════════════════════════╗');
  log('║    dismissEasyUIDialog 开始扫描      ║');
  log('╚══════════════════════════════════════╝');
  
  // 扫描所有候选 DOM 元素
  const messagerWindows = document.querySelectorAll('.messager-window');
  const panelWindows = document.querySelectorAll('.panel.window');
  log(`DOM 扫描: .messager-window=${messagerWindows.length}个, .panel.window=${panelWindows.length}个`);
  
  // 合并去重
  const allCandidates = new Set([...messagerWindows, ...panelWindows]);
  log(`去重后候选弹窗元素: ${allCandidates.size}个`);
  
  let candidateIndex = 0;
  for (const win of allCandidates) {
    candidateIndex++;
    const style = window.getComputedStyle(win);
    const isMessager = win.classList.contains('messager-window');
    const title = win.querySelector('.panel-title');
    
    log(`  [候选${candidateIndex}] class="${win.className}" display=${style.display} isMessager=${isMessager} title="${title?.textContent?.trim() || '无'}"`);
    
    if (style.display === 'none') {
      log(`    → 跳过 (display:none)`);
      continue;
    }
    
    // 检查 .messager-body
    const body = win.querySelector('.messager-body');
    if (!body) {
      const panelBody = win.querySelector('.panel-body');
      const bodyText = panelBody?.textContent?.trim()?.substring(0, 100) || '无';
      log(`    → 无 .messager-body (panel-body text="${bodyText}")`);
      continue;
    }
    
    const dialogText = body.textContent.trim();
    log(`    ★ 发现 EasyUI 弹窗!`);
    log(`    ★ 弹窗文本: "${dialogText}"`);
    log(`    ★ 弹窗 innerHTML: "${body.innerHTML.substring(0, 200)}"`);
    
    // 查找按钮
    const btnContainer = win.querySelector('.messager-button');
    log(`    ★ .messager-button 容器: ${btnContainer ? '存在' : '不存在'}`);
    
    if (btnContainer) {
      const allBtns = btnContainer.querySelectorAll('a, button, span, input');
      log(`    ★ 按钮容器内元素: ${allBtns.length}个`);
      allBtns.forEach((btn, i) => {
        log(`      [按钮${i}] tag=${btn.tagName} text="${btn.textContent.trim()}" class="${btn.className}" href="${btn.href || '无'}"`);
      });
      
      for (const btn of allBtns) {
        const btnText = btn.textContent.trim();
        if (btnText === '确定' || btnText === 'OK' || btnText === '确认') {
          log(`    >>> 点击弹窗按钮: "${btnText}"`);
          btn.click();
          log(`    >>> 点击完成, 返回弹窗文本: "${dialogText}"`);
          return dialogText;
        }
      }
      
      log('    ⚠ 未找到"确定"按钮，尝试点击第一个按钮');
      const firstBtn = btnContainer.querySelector('a, button');
      if (firstBtn) {
        log(`    >>> 点击第一个按钮: text="${firstBtn.textContent.trim()}"`);
        firstBtn.click();
        return dialogText;
      }
    }
    
    // 没有按钮容器，全局搜索
    log('    ⚠ 无 .messager-button 容器，在整个弹窗中搜索按钮');
    const allBtnsInWin = win.querySelectorAll('a, button');
    allBtnsInWin.forEach((btn, i) => {
      log(`      [全局按钮${i}] tag=${btn.tagName} text="${btn.textContent.trim()}"`);
    });
    
    for (const btn of allBtnsInWin) {
      const btnText = btn.textContent.trim();
      if (btnText === '确定' || btnText === 'OK') {
        log(`    >>> 在 win 中找到"${btnText}"并点击`);
        btn.click();
        return dialogText;
      }
    }
    
    log('    ⚠ 弹窗有文本但无法找到可点击的按钮');
    return dialogText;
  }
  
  // 额外检查: 有没有其他类型的弹窗（非 EasyUI）
  const alertDivs = document.querySelectorAll('[role="alertdialog"], [role="dialog"], .modal, .dialog');
  if (alertDivs.length > 0) {
    log(`额外检查: 发现 ${alertDivs.length} 个非 EasyUI 弹窗元素`);
    alertDivs.forEach((d, i) => {
      const st = window.getComputedStyle(d);
      log(`  [非EasyUI${i}] role="${d.getAttribute('role')}" class="${d.className}" display=${st.display} text="${d.textContent.trim().substring(0, 80)}"`);
    });
  }
  
  log('dismissEasyUIDialog: 未发现任何活跃弹窗');
  return null;
}

// 检测是否出现"最后一份试卷"提示（通过轮询）
function pollForAmeqpDialog(maxWaitMs) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const interval = 500;
    
    function check() {
      const dialogText = dismissEasyUIDialog();
      
      if (dialogText) {
        const isLast = dialogText.includes('最后一份') || dialogText.includes('没有试卷') || dialogText.includes('已全部');
        resolve({ hasDialog: true, isLastPaper: isLast, text: dialogText });
        return;
      }
      
      if (Date.now() - startTime < maxWaitMs) {
        setTimeout(check, interval);
      } else {
        resolve({ hasDialog: false, isLastPaper: false });
      }
    }
    
    check();
  });
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
        log('╔══════════════════════════════════════════════╗');
        log('║         开始填分提交流程                     ║');
        log('╚══════════════════════════════════════════════╝');
        log('分数:', msg.score, '平台:', msg.platform);
        
        const platformConfig = PLATFORM_CONFIG[msg.platform] || PLATFORM_CONFIG.dnjy;
        log('平台配置:', JSON.stringify({
          isAspNet: platformConfig.isAspNet,
          autoNextAfterSubmit: platformConfig.autoNextAfterSubmit,
          scoreInputSelectors: platformConfig.scoreInput,
          submitButtonSelectors: platformConfig.submitButton
        }));
        
        // 页面状态快照
        if (msg.platform === 'ameqp') {
          dumpAmeqpPageState();
        }
        
        // 步骤1: 填入分数
        const filled = fillScore(msg.score, msg.platform);
        if (!filled) {
          sendResponse({ success: false, error: '未找到分数输入框' });
          return false;
        }
        
        if (platformConfig.autoNextAfterSubmit) {
          // === AMEQP 流程：填分 → 提交 → 立即返回（弹窗检测由 background.js 在等待后执行） ===
          setTimeout(() => {
            log('步骤2(AMEQP): 点击提交按钮');
            const submitted = clickSubmit(msg.platform);
            
            if (!submitted) {
              sendResponse({ success: false, error: '未找到提交按钮' });
              return;
            }
            
            // OnSubmit(1) 是 AJAX 请求，服务器响应时间不定（1~10秒）
            // 弹窗检测交给 background.js 在等待足够时间后通过 dismiss_dialog 消息执行
            log('========== 填分提交完成(AMEQP)，等待 background 检测弹窗 ==========');
            sendResponse({
              success: true,
              autoNextAfterSubmit: true
            });
          }, 300);
        } else {
          // === Vue/Element UI 平台流程 ===
          setTimeout(() => {
            log('步骤2: 点击提交按钮');
            const submitted = clickSubmit(msg.platform);
            
            if (!submitted) {
              sendResponse({ success: false, error: '未找到提交按钮' });
              return;
            }
            
            setTimeout(() => {
              log('步骤3: 检查弹窗');
              handleConfirmDialog();
              
              setTimeout(() => {
                log('========== 填分提交流程完成 ==========');
                sendResponse({ success: true });
              }, 500);
            }, 800);
          }, 500);
        }
        
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
    
    case 'dismiss_dialog':
      // 检测并关闭弹窗（AMEQP EasyUI + Element UI）
      try {
        log('========== 弹窗检测开始 ==========');
        const easyuiResult = dismissEasyUIDialog();
        if (easyuiResult) {
          log('EasyUI 弹窗已检测并处理:', easyuiResult);
        } else {
          log('未检测到 EasyUI 弹窗');
        }
        const elResult = handleConfirmDialog();
        if (elResult) {
          log('Element UI 弹窗已处理');
        }
        log('========== 弹窗检测完成 ==========');
        sendResponse({
          success: true,
          dismissed: !!(easyuiResult || elResult),
          dialogText: easyuiResult || null
        });
      } catch (error) {
        logError('弹窗检测出错:', error);
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
