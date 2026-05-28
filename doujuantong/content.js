// content.js - 负责页面DOM操作（区域选择、填分、提交）

// ============ 日志函数 ============
const VERBOSE_LOG = false;

function log(...args) {
  console.log('[香猫阅卷-Content]', ...args);
}

function logError(...args) {
  console.error('[香猫阅卷-Content]', ...args);
}

function logVerbose(...args) {
  if (VERBOSE_LOG) {
    log(...args);
  }
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
  // 诊学网阅卷平台
  zhenxue: {
    scoreInput: [
      'input[placeholder*="得分"]',
      'input[placeholder*="分"]',
      'input[id*="score" i]',
      'input[name*="score" i]',
      'input[class*="score" i]',
      'input[type="number"]'
    ],
    submitButton: [
      'button:contains("提交")',
      'input[type="button"][value*="提交"]',
      'input[type="submit"][value*="提交"]',
      'a:contains("提交")',
      '[role="button"]:contains("提交")',
      'button[class*="submit" i]'
    ],
    nextButton: [
      '[title*="下一"]',
      '[aria-label*="下一"]',
      'button:contains("下一")',
      'a:contains("下一")',
      '[role="button"]:contains("下一")'
    ],
    nextButtonText: ['下一份', '下一个', '下一题', '下一张'],
    isAspNet: false,
    submitReadyWait: true,
    autoNextAfterSubmit: true
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
  },
  // 微博士校园管理中心：点击分数按钮即提交并自动进入下一人/下一题
  weiboshi: {
    scoreInput: [
      'input[placeholder*="分"]',
      'input[type="number"]',
      'input[type="text"]'
    ],
    submitButton: [],
    nextButton: [],
    nextButtonText: [],
    isAspNet: false,
    autoNextAfterSubmit: true,
    scoreButtonSubmit: true
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
const CROP_IMAGE_MAX_SIDE = 1600;
const CROP_IMAGE_JPEG_QUALITY = 0.82;
const CROP_IMAGE_MAX_DATA_URL_LENGTH = 1.8 * 1024 * 1024;

function formatImageSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  }
  return `${Math.round(bytes / 1024)}KB`;
}

function cropImage(dataUrl, area) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = function() {
        try {
          const scale = window.devicePixelRatio || 1;
          const sourceW = Math.max(1, Math.round(area.w * scale));
          const sourceH = Math.max(1, Math.round(area.h * scale));
          const resizeRatio = Math.min(1, CROP_IMAGE_MAX_SIDE / Math.max(sourceW, sourceH));
          const targetW = Math.max(1, Math.round(sourceW * resizeRatio));
          const targetH = Math.max(1, Math.round(sourceH * resizeRatio));
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(
            img,
            area.x * scale,
            area.y * scale,
            sourceW,
            sourceH,
            0, 0,
            targetW,
            targetH
          );
          
          let quality = CROP_IMAGE_JPEG_QUALITY;
          let croppedUrl = canvas.toDataURL('image/jpeg', quality);
          while (croppedUrl.length > CROP_IMAGE_MAX_DATA_URL_LENGTH && quality > 0.58) {
            quality = Math.max(0.58, quality - 0.08);
            croppedUrl = canvas.toDataURL('image/jpeg', quality);
          }

          const estimatedBytes = Math.round(croppedUrl.length * 0.75);
          const meta = {
            sourceWidth: sourceW,
            sourceHeight: sourceH,
            width: targetW,
            height: targetH,
            quality: Number(quality.toFixed(2)),
            bytes: estimatedBytes
          };
          log('图片裁剪完成',
            `source=${sourceW}x${sourceH}`,
            `output=${targetW}x${targetH}`,
            `quality=${meta.quality}`,
            `size=${formatImageSize(estimatedBytes)}`);
          resolve({ url: croppedUrl, meta });
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

function getElementText(el) {
  if (!el) return '';
  const rawText = el.tagName === 'INPUT'
    ? (el.value || el.getAttribute('value') || '')
    : (el.textContent || '');
  return rawText.trim().replace(/\s+/g, ' ');
}

function getCompactElementText(el) {
  return getElementText(el).replace(/\s+/g, '');
}

function isVisibleElement(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function isElementDisabled(el) {
  if (!el) return true;
  const className = String(el.className || '');
  return !!el.disabled ||
    el.getAttribute('disabled') !== null ||
    el.getAttribute('aria-disabled') === 'true' ||
    /\bdisabled\b/.test(className);
}

function findVisibleClickableByText(text, options = {}) {
  const targetText = text.replace(/\s+/g, '');
  const clickables = Array.from(document.querySelectorAll(
    'button, input[type="button"], input[type="submit"], a, [role="button"]'
  ));

  const candidates = clickables.filter(el => {
    if (!isVisibleElement(el)) return false;
    const elText = getCompactElementText(el);
    if (options.exact === false) {
      return elText.includes(targetText);
    }
    return elText === targetText;
  });

  if (options.rightSide) {
    const minLeft = window.innerWidth * 0.55;
    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const aRight = ar.left > minLeft ? 1 : 0;
      const bRight = br.left > minLeft ? 1 : 0;
      return bRight - aRight || br.left - ar.left || ar.top - br.top;
    });
  }

  return candidates[0] || null;
}

function normalizeSnapshotText(text, maxLen = 180) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function getElementSnapshotToken(el) {
  if (!el) return '';

  const tagName = (el.tagName || '').toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    return normalizeSnapshotText([
      tagName,
      el.id,
      el.name,
      el.placeholder,
      el.value
    ].filter(Boolean).join('|'));
  }

  if (tagName === 'IMG') {
    const src = el.currentSrc || el.src || '';
    return normalizeSnapshotText([
      'IMG',
      src ? src.slice(-80) : '',
      el.alt || '',
      `${el.naturalWidth || 0}x${el.naturalHeight || 0}`
    ].filter(Boolean).join('|'));
  }

  if (tagName === 'CANVAS') {
    return `CANVAS|${el.width || 0}x${el.height || 0}`;
  }

  const textToken = normalizeSnapshotText(el.textContent || '');
  if (textToken) {
    return textToken;
  }

  return normalizeSnapshotText([
    tagName,
    el.id,
    typeof el.className === 'string' ? el.className : ''
  ].filter(Boolean).join('|'));
}

function getViewportSignature() {
  const sampleRatios = [
    [0.5, 0.35],
    [0.5, 0.5],
    [0.5, 0.65],
    [0.3, 0.5],
    [0.7, 0.5]
  ];
  const tokens = [];

  for (const [ratioX, ratioY] of sampleRatios) {
    const x = Math.max(1, Math.min(window.innerWidth - 1, Math.round(window.innerWidth * ratioX)));
    const y = Math.max(1, Math.min(window.innerHeight - 1, Math.round(window.innerHeight * ratioY)));
    const elements = document.elementsFromPoint
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)].filter(Boolean);

    for (const el of elements) {
      if (!isVisibleElement(el)) continue;
      const token = getElementSnapshotToken(el);
      if (token && token.length >= 4) {
        tokens.push(token);
        break;
      }
    }
  }

  return Array.from(new Set(tokens)).join(' || ').slice(0, 320);
}

function getVisibleInputSignature(limit = 6) {
  const inputs = Array.from(document.querySelectorAll('input, textarea'))
    .filter(el => {
      const type = (el.type || '').toLowerCase();
      return type !== 'hidden' && isVisibleElement(el);
    })
    .sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.top - br.top || ar.left - br.left;
    })
    .slice(0, limit);

  return inputs.map(el => normalizeSnapshotText([
    el.tagName,
    el.id,
    el.name,
    el.placeholder,
    el.value
  ].filter(Boolean).join('|'), 120)).join(' || ');
}

function getVisibleDialogText() {
  const candidates = Array.from(document.querySelectorAll(
    '.messager-window .messager-body, .panel.window .messager-body, .el-message-box__message, [role="alertdialog"], [role="dialog"]'
  )).filter(isVisibleElement);

  return normalizeSnapshotText(
    candidates
      .map(el => el.textContent || '')
      .filter(Boolean)
      .join(' | '),
    240
  );
}

function getAmeqpReviewState() {
  const scoreInputs = Array.from(document.querySelectorAll('input.mark_tbx, input[id^="txt_que_"]'))
    .filter(isVisibleElement)
    .slice(0, 8)
    .map(inp => normalizeSnapshotText([
      inp.id,
      inp.name,
      inp.getAttribute('maxsco'),
      inp.value
    ].filter(Boolean).join('|'), 80))
    .join(' || ');

  const hiddenSignature = Array.from(document.querySelectorAll('input[id^="MarQueSubSco_"], input#queVal'))
    .slice(0, 8)
    .map(inp => normalizeSnapshotText(`${inp.id}:${inp.value}`, 60))
    .join(' || ');

  return {
    href: location.href,
    title: document.title,
    viewportSignature: getViewportSignature(),
    scoreSignature: scoreInputs || getVisibleInputSignature(6),
    hiddenSignature,
    dialogText: getVisibleDialogText()
  };
}

function getGenericReviewState() {
  return {
    href: location.href,
    title: document.title,
    viewportSignature: getViewportSignature(),
    scoreSignature: getVisibleInputSignature(6)
  };
}

function getReviewPageState(platform) {
  switch (platform) {
    case 'weiboshi':
      return {
        ...getWeiboshiSubmissionState(),
        href: location.href,
        viewportSignature: getViewportSignature()
      };
    case 'zhenxue':
      return {
        ...getZhenxueSubmissionState(),
        href: location.href,
        viewportSignature: getViewportSignature()
      };
    case 'ameqp':
      return getAmeqpReviewState();
    default:
      return getGenericReviewState();
  }
}

function hasSnapshotValueChanged(before, after, key) {
  return !!before?.[key] && !!after?.[key] && before[key] !== after[key];
}

function hasMeaningfulViewportChange(before, after) {
  if (!hasSnapshotValueChanged(before, after, 'viewportSignature')) {
    return false;
  }
  return (before.viewportSignature || '').length >= 12 || (after.viewportSignature || '').length >= 12;
}

function hasReviewPageAdvanced(platform, before, after) {
  if (!before || !after) return false;
  if (hasSnapshotValueChanged(before, after, 'href')) return true;
  if (hasSnapshotValueChanged(before, after, 'title')) return true;

  if (platform === 'weiboshi' && hasWeiboshiSubmissionAdvanced(before, after)) {
    return true;
  }

  if (platform === 'zhenxue' && hasZhenxueSubmissionAdvanced(before, after)) {
    return true;
  }

  if (platform === 'ameqp') {
    if (after.dialogText) return true;
    if (hasSnapshotValueChanged(before, after, 'hiddenSignature')) return true;
  }

  if (hasSnapshotValueChanged(before, after, 'scoreSignature')) return true;
  if (hasMeaningfulViewportChange(before, after)) return true;
  return false;
}

function waitForReviewPageAdvance(platform, beforeState, maxWaitMs = 2000, intervalMs = 250) {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    function check() {
      const afterState = getReviewPageState(platform);
      if (hasReviewPageAdvanced(platform, beforeState, afterState)) {
        log(`${platform}: 检测到页面已前进`, JSON.stringify({ beforeState, afterState }));
        resolve({ advanced: true, currentState: afterState });
        return;
      }

      if (Date.now() - startedAt >= maxWaitMs) {
        resolve({ advanced: false, currentState: afterState });
        return;
      }

      setTimeout(check, intervalMs);
    }

    check();
  });
}

async function waitForPostSubmitProgress(platform, beforeState, maxWaitMs = 5000) {
  const startedAt = Date.now();
  const intervalMs = 300;

  while (Date.now() - startedAt < maxWaitMs) {
    if (platform === 'ameqp') {
      const dialogText = dismissEasyUIDialog();
      if (dialogText) {
        return {
          advanced: true,
          dismissed: true,
          dialogText,
          isLastPaper: dialogText.includes('最后一份') || dialogText.includes('没有试卷') || dialogText.includes('已全部'),
          currentState: getReviewPageState(platform)
        };
      }
    }

    const currentState = getReviewPageState(platform);
    if (hasReviewPageAdvanced(platform, beforeState, currentState)) {
      return {
        advanced: true,
        dismissed: false,
        dialogText: currentState.dialogText || '',
        isLastPaper: false,
        currentState
      };
    }

    await waitMs(intervalMs);
  }

  return {
    advanced: false,
    dismissed: false,
    dialogText: '',
    isLastPaper: false,
    currentState: getReviewPageState(platform)
  };
}

async function advanceToNext(platform, clickWindowMs = 3000, advanceWaitMs = 2200) {
  const beforeState = getReviewPageState(platform);
  const startedAt = Date.now();
  let clicked = false;

  while (Date.now() - startedAt < clickWindowMs) {
    clicked = clickNext(platform, { silent: true });
    if (clicked) {
      break;
    }
    await waitMs(250);
  }

  if (!clicked) {
    return {
      success: false,
      error: '未找到下一份按钮'
    };
  }

  const advanceResult = await waitForReviewPageAdvance(platform, beforeState, advanceWaitMs, 250);
  return {
    success: true,
    advanced: advanceResult.advanced,
    currentState: advanceResult.currentState
  };
}

// 填入分数（增强版，确保Vue能检测到变化）
function fillScore(score, platform) {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.dnjy;

  if (platform === 'weiboshi') {
    return fillWeiboshiScore(score);
  }

  if (platform === 'zhenxue') {
    const quickFilled = fillZhenxueQuickScore(score);
    if (quickFilled) {
      return true;
    }
  }

  let input = findElement(config.scoreInput);
  
  // AMEQP平台特殊查找逻辑：在分数区域附近查找text输入框
  if (!input && platform === 'ameqp') {
    input = findAmeqpScoreInput();
  }

  // 诊学网分数框没有稳定 placeholder，需要按右侧评分面板位置推断
  if (!input && platform === 'zhenxue') {
    input = findZhenxueScoreInput();
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
    logVerbose('页面上的所有输入框:', allInputs.length);
    allInputs.forEach((inp, i) => {
      logVerbose(`输入框${i}: id="${inp.id}", name="${inp.name}", placeholder="${inp.placeholder}", class="${inp.className}", type="${inp.type}", value="${inp.value}"`);
    });
    
    return false;
  }
  
  log('找到分数输入框:', `id="${input.id}"`, `name="${input.name}"`, input.placeholder, input.className, '当前值:', input.value);
  
  const scoreStr = score.toString();
  
  if (config.isAspNet) {
    return fillScoreAspNet(input, scoreStr);
  }
  
  if (platform === 'zhenxue') {
    return fillScoreZhenxue(input, scoreStr);
  }

  return fillScoreVue(input, scoreStr);
}

function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeScoreText(score) {
  const scoreNum = parseFloat(String(score).replace('分', '').trim());
  if (!Number.isFinite(scoreNum)) {
    return null;
  }

  const rounded = Math.round(scoreNum * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.0001) {
    return String(Math.round(rounded));
  }
  return String(rounded).replace(/\.0$/, '');
}

function getWeiboshiElementText(el) {
  if (!el) return '';
  const raw = el.tagName === 'INPUT'
    ? (el.value || el.getAttribute('value') || '')
    : (el.textContent || '');
  return raw.trim().replace(/\s+/g, '');
}

function getWeiboshiNearbyText(el) {
  const texts = [];
  let node = el;
  for (let depth = 0; node && depth < 5; depth++) {
    const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
    if (text) {
      texts.push(text.substring(0, 220));
    }
    node = node.parentElement;
  }
  return texts.join(' ');
}

function clickWeiboshiElement(el) {
  if (!el) return false;
  el.click();
  return true;
}

function getWeiboshiMaxScore() {
  const text = document.body?.innerText || '';
  const match = text.match(/本题满分为\s*([0-9]+(?:\.[0-9]+)?)\s*分/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function validateWeiboshiScore(score) {
  const scoreNum = parseFloat(String(score).replace('分', '').trim());
  const scoreStr = normalizeScoreText(score);

  if (!scoreStr || !Number.isFinite(scoreNum)) {
    return { ok: false, error: `微博士分数格式无效：${score}` };
  }

  const maxScore = getWeiboshiMaxScore();
  if (scoreNum < 0) {
    return { ok: false, error: `微博士分数不能小于0：${scoreStr}` };
  }

  if (maxScore !== null && scoreNum - maxScore > 0.0001) {
    return {
      ok: false,
      error: `微博士识别分数${scoreStr}超过本题满分${normalizeScoreText(maxScore)}，已拒绝提交`
    };
  }

  return { ok: true, scoreNum, scoreStr, maxScore };
}

function shouldUseWeiboshiHalfPoint(scoreNum) {
  if (!Number.isFinite(scoreNum)) return false;
  return Math.abs(scoreNum - Math.round(scoreNum)) > 0.0001;
}

function ensureWeiboshiHalfPointMode(scoreNum) {
  if (!shouldUseWeiboshiHalfPoint(scoreNum)) {
    return false;
  }

  const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));
  const target = checkboxes.find(el => getWeiboshiNearbyText(el).includes('精确到0.5分'));
  if (!target) {
    log('微博士: 未找到"精确到0.5分"开关');
    return false;
  }

  const checked = !!target.checked || target.getAttribute('aria-checked') === 'true';
  if (checked) {
    log('微博士: 0.5分模式已开启');
    return true;
  }

  let label = target.closest('label');
  if (!label && target.id && window.CSS && CSS.escape) {
    label = document.querySelector(`label[for="${CSS.escape(target.id)}"]`);
  }
  const clickTarget = label || target;
  log('微博士: 开启0.5分模式');
  clickWeiboshiElement(clickTarget);
  return true;
}

function getWeiboshiScoreButtonLabels(scoreStr, scoreNum) {
  const labels = [`${scoreStr}分`];
  const maxScore = getWeiboshiMaxScore();

  if (Math.abs(scoreNum) < 0.0001) {
    labels.push(`全错${scoreStr}分`);
  }

  if (maxScore !== null && Math.abs(scoreNum - maxScore) < 0.0001) {
    labels.push(`全对${scoreStr}分`);
  }

  return labels;
}

function findWeiboshiScoreButton(scoreStr, scoreNum) {
  const labels = getWeiboshiScoreButtonLabels(scoreStr, scoreNum);
  const plainLabel = `${scoreStr}分`;
  const clickables = Array.from(document.querySelectorAll(
    'button, input[type="button"], input[type="submit"], [role="button"]'
  )).filter(isVisibleElement);

  const candidates = clickables.map(el => {
    const text = getWeiboshiElementText(el);
    const rect = el.getBoundingClientRect();
    const contextText = getWeiboshiNearbyText(el);
    let score = 0;

    if (text === plainLabel) score += 120;
    if (labels.includes(text)) score += 90;
    if (/^(全对|全错)?[0-9]+(?:\.[0-9]+)?分$/.test(text)) score += 20;
    if (rect.left > window.innerWidth * 0.6) score += 45;
    if (rect.top > 120 && rect.top < window.innerHeight - 40) score += 15;
    if (/本题满分|精确到0\.5分|操作提示|点击分数按钮/.test(contextText)) score += 35;
    if (/批改进度|查看已批|全屏批改|返回旧版|收起|保存图片|打勾|半对|打叉|画笔|复原/.test(text)) score -= 120;

    return { el, text, rect, score, contextText };
  }).filter(item => item.score >= 100);

  candidates.sort((a, b) => {
    const aPlain = a.text === plainLabel ? 1 : 0;
    const bPlain = b.text === plainLabel ? 1 : 0;
    return bPlain - aPlain ||
      b.score - a.score ||
      b.rect.left - a.rect.left ||
      a.rect.top - b.rect.top;
  });

  const best = candidates[0];
  if (best) {
    log('微博士: 找到分数按钮',
      `text="${best.text}"`,
      `score=${best.score}`,
      `pos=(${Math.round(best.rect.left)},${Math.round(best.rect.top)})`);
    return best.el;
  }

  log('微博士: 未找到匹配分数按钮', `score=${scoreStr}`, `labels=${labels.join(',')}`);
  return null;
}

function findWeiboshiInputModeButton() {
  const buttons = Array.from(document.querySelectorAll('button, input[type="button"], [role="button"]'))
    .filter(isVisibleElement);
  return buttons.find(btn => getWeiboshiElementText(btn).includes('切换到输入打分')) || null;
}

function findWeiboshiScoreInput() {
  const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(inp => {
    const type = (inp.type || '').toLowerCase();
    return type !== 'hidden' &&
      type !== 'button' &&
      type !== 'submit' &&
      type !== 'checkbox' &&
      type !== 'radio' &&
      !inp.readOnly &&
      !inp.disabled &&
      isVisibleElement(inp);
  });

  const candidates = inputs.map(inp => {
    const rect = inp.getBoundingClientRect();
    const contextText = getWeiboshiNearbyText(inp);
    let score = 0;

    if (rect.left > window.innerWidth * 0.55) score += 50;
    if (rect.width >= 35 && rect.width <= 220) score += 20;
    if (/输入打分|本题满分|操作提示|分/.test(contextText)) score += 40;
    if (inp.placeholder && /分|得分|score/i.test(inp.placeholder)) score += 30;

    return { inp, rect, contextText, score };
  }).filter(item => item.score > 0);

  candidates.sort((a, b) => b.score - a.score || b.rect.left - a.rect.left);

  const best = candidates[0];
  if (best) {
    log('微博士: 找到输入打分框',
      `score=${best.score}`,
      `pos=(${Math.round(best.rect.left)},${Math.round(best.rect.top)})`);
    return best.inp;
  }

  return null;
}

function pressEnterToSubmit(input) {
  const eventOptions = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  };

  input.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
  input.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
  input.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
}

function getWeiboshiSubmissionState() {
  const text = document.body?.innerText || '';
  const answerOwnerMatch = text.match(/学生\s*[0-9]+\s*答案[：:]/);
  const progressMatch = text.match(/已批改题量[:：]\s*[^\n]+/);

  return {
    answerOwner: answerOwnerMatch ? answerOwnerMatch[0].replace(/\s+/g, '') : '',
    progress: progressMatch ? progressMatch[0].replace(/\s+/g, '') : '',
    title: document.title
  };
}

function hasWeiboshiSubmissionAdvanced(before, after) {
  if (!before || !after) return false;
  if (before.answerOwner && after.answerOwner && before.answerOwner !== after.answerOwner) return true;
  if (before.progress && after.progress && before.progress !== after.progress) return true;
  return false;
}

function waitForWeiboshiSubmissionAdvanced(before, maxWaitMs = 6000) {
  return new Promise((resolve) => {
    const start = Date.now();

    function check() {
      const after = getWeiboshiSubmissionState();
      if (hasWeiboshiSubmissionAdvanced(before, after)) {
        log('微博士: 检测到提交后页面已前进', JSON.stringify({ before, after }));
        resolve({ advanced: true, after });
        return;
      }

      if (Date.now() - start >= maxWaitMs) {
        log('微博士: 提交后页面未检测到变化', JSON.stringify({ before, after }));
        resolve({ advanced: false, after });
        return;
      }

      setTimeout(check, 300);
    }

    check();
  });
}

async function clickWeiboshiScoreButton(score) {
  const validation = validateWeiboshiScore(score);
  if (!validation.ok) {
    logError('微博士:', validation.error);
    return false;
  }
  const { scoreNum, scoreStr } = validation;

  if (shouldUseWeiboshiHalfPoint(scoreNum)) {
    ensureWeiboshiHalfPointMode(scoreNum);
    await waitMs(250);
  }

  let scoreBtn = findWeiboshiScoreButton(scoreStr, scoreNum);
  if (!scoreBtn && shouldUseWeiboshiHalfPoint(scoreNum)) {
    await waitMs(500);
    scoreBtn = findWeiboshiScoreButton(scoreStr, scoreNum);
  }

  if (!scoreBtn) {
    return false;
  }

  log('微博士: 点击分数按钮提交', getWeiboshiElementText(scoreBtn));
  clickWeiboshiElement(scoreBtn);
  return true;
}

async function submitWeiboshiScoreByInput(score) {
  const validation = validateWeiboshiScore(score);
  if (!validation.ok) {
    logError('微博士:', validation.error);
    return false;
  }
  const { scoreStr } = validation;

  const switchBtn = findWeiboshiInputModeButton();
  if (switchBtn) {
    log('微博士: 切换到输入打分模式');
    clickWeiboshiElement(switchBtn);
    await waitMs(300);
  }

  const input = findWeiboshiScoreInput();
  if (!input) {
    log('微博士: 输入打分模式下也未找到分数框');
    return false;
  }

  fillScoreVue(input, scoreStr);
  log('微博士: 按 Enter 提交输入分数');
  pressEnterToSubmit(input);
  return true;
}

function fillWeiboshiScore(score) {
  const validation = validateWeiboshiScore(score);
  if (!validation.ok) {
    logError('微博士:', validation.error);
    return false;
  }
  const { scoreNum, scoreStr } = validation;

  const scoreBtn = findWeiboshiScoreButton(scoreStr, scoreNum);
  if (!scoreBtn) {
    return false;
  }

  clickWeiboshiElement(scoreBtn);
  return true;
}

async function submitWeiboshiScoreAndVerify(score) {
  log('微博士: 开始分数按钮提交流程，score=', score);
  const validation = validateWeiboshiScore(score);
  if (!validation.ok) {
    logError('微博士:', validation.error);
    return {
      success: false,
      error: validation.error
    };
  }

  const before = getWeiboshiSubmissionState();
  let submitted = await clickWeiboshiScoreButton(score);

  if (!submitted) {
    log('微博士: 未找到分数按钮，改用输入打分兜底');
    submitted = await submitWeiboshiScoreByInput(score);
  }

  if (!submitted) {
    return {
      success: false,
      error: '微博士未找到匹配分数按钮或输入打分框'
    };
  }

  const result = await waitForWeiboshiSubmissionAdvanced(before, 6000);
  if (!result.advanced) {
    return {
      success: false,
      error: '微博士提交后页面未进入下一人/下一题，请检查是否弹出提示或分数按钮未生效'
    };
  }

  return {
    success: true,
    autoNextAfterSubmit: true,
    actualScore: validation.scoreStr,
    maxScore: validation.maxScore
  };
}

// 诊学网平台专用：使用"零分/满分"快捷按钮，优先走页面自己的赋分逻辑
function fillZhenxueQuickScore(score) {
  const scoreNum = parseFloat(score);
  if (!Number.isFinite(scoreNum)) return false;

  if (Math.abs(scoreNum) < 0.0001) {
    return clickZhenxueQuickScore('零分');
  }

  const maxScore = getZhenxueMaxScore();
  if (maxScore !== null && Math.abs(scoreNum - maxScore) < 0.0001) {
    return clickZhenxueQuickScore('满分');
  }

  return false;
}

function clickZhenxueQuickScore(label) {
  const btn = findVisibleClickableByText(label, { rightSide: true });
  if (!btn) {
    log(`诊学网: 未找到"${label}"快捷按钮`);
    return false;
  }

  const rect = btn.getBoundingClientRect();
  log(`诊学网: 点击"${label}"快捷按钮`, `pos=(${Math.round(rect.left)},${Math.round(rect.top)})`);
  btn.click();
  return true;
}

function getZhenxueMaxScore() {
  const text = document.body?.innerText || '';
  const patterns = [
    /[（(]\s*([0-9]+(?:\.[0-9]+)?)\s*[)）]\s*分\s*[：:]/,
    /满分\s*([0-9]+(?:\.[0-9]+)?)\s*分/,
    /([0-9]+(?:\.[0-9]+)?)\s*分\s*[：:]\s*$/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      if (Number.isFinite(value)) {
        log('诊学网: 解析到满分值:', value);
        return value;
      }
    }
  }

  log('诊学网: 未解析到满分值，跳过满分快捷按钮');
  return null;
}

// 诊学网平台专用：查找右侧评分面板中的分数输入框
function findZhenxueScoreInput() {
  const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(inp => {
    const type = (inp.type || '').toLowerCase();
    return type !== 'hidden' &&
      type !== 'button' &&
      type !== 'submit' &&
      !inp.readOnly &&
      !inp.disabled &&
      isVisibleElement(inp);
  });

  const candidates = inputs.map(inp => {
    const rect = inp.getBoundingClientRect();
    const contextText = getZhenxueNearbyText(inp);
    let score = 0;

    if (rect.left > window.innerWidth * 0.55) score += 50;
    if (rect.width >= 35 && rect.width <= 180) score += 25;
    if (rect.height >= 20 && rect.height <= 70) score += 15;
    if (rect.top >= 100 && rect.top <= 460) score += 20;
    if (/得分|分|零分|满分|提交/.test(contextText)) score += 40;
    if (inp.placeholder && /得分|分/.test(inp.placeholder)) score += 40;
    if (/score|mark|point|grade/i.test(`${inp.id} ${inp.name} ${inp.className}`)) score += 30;

    return { inp, score, rect, contextText };
  }).filter(item => item.score > 0);

  candidates.sort((a, b) => b.score - a.score || b.rect.left - a.rect.left || a.rect.top - b.rect.top);

  const best = candidates[0];
  if (best) {
    log('诊学网: 通过右侧评分面板推断分数输入框',
      `score=${best.score}`,
      `pos=(${Math.round(best.rect.left)},${Math.round(best.rect.top)})`,
      `size=${Math.round(best.rect.width)}x${Math.round(best.rect.height)}`,
      `context="${best.contextText.substring(0, 80)}"`);
    return best.inp;
  }

  log('诊学网: 未找到分数输入框候选');
  return null;
}

function getZhenxueNearbyText(el) {
  const texts = [];
  let node = el;
  for (let depth = 0; node && depth < 5; depth++) {
    const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
    if (text) {
      texts.push(text.substring(0, 160));
    }
    node = node.parentElement;
  }

  const prev = el.previousElementSibling?.textContent || '';
  const next = el.nextElementSibling?.textContent || '';
  if (prev || next) {
    texts.push(`${prev} ${next}`.trim().replace(/\s+/g, ' '));
  }

  return texts.join(' ');
}

function fillScoreZhenxue(input, scoreStr) {
  log('诊学网平台填分模式');

  const ok = fillScoreVue(input, scoreStr);

  // 诊学网的提交按钮依赖前端状态，额外补齐常见输入事件。
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: scoreStr
  }));
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

  return ok;
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
      log(`✓ 找到分数列表容器 Mark_scoList_${queNum}, 共 ${scoItems.length} 项`);
      
      // 列出所有分数项
      scoItems.forEach((item, i) => {
        const val = item.getAttribute('value');
        const text = item.textContent.trim();
        const cls = item.className;
        logVerbose(`  [${i}] value="${val}" text="${text}" class="${cls}"`);
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
        if (VERBOSE_LOG) {
          setTimeout(() => {
            logVerbose(`--- 填分后验证(100ms) ---`);
            logVerbose(`  txt_que_${queNum}.value = "${input.value}" (期望: "${scoreStr}")`);
            const hiddenSco = document.getElementById(`MarQueSubSco_${queNum}`);
            if (hiddenSco) {
              logVerbose(`  MarQueSubSco_${queNum}.value = "${hiddenSco.value}"`);
            } else {
              logVerbose(`  MarQueSubSco_${queNum}: 不存在`);
            }
            const queValInput = document.getElementById('queVal');
            if (queValInput) {
              logVerbose(`  queVal.value = "${queValInput.value}"`);
            }
            logVerbose(`--- 验证结束 ---`);
          }, 100);
        }
        
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

function findZhenxueSubmitButton() {
  const btn = findVisibleClickableByText('提交', { rightSide: true, exact: false });
  if (btn) return btn;

  const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, [role="button"]'))
    .filter(isVisibleElement)
    .filter(el => getCompactElementText(el).includes('提交'));

  return candidates[0] || null;
}

function waitForZhenxueSubmitReady(maxWaitMs = 2500) {
  return new Promise((resolve) => {
    const start = Date.now();

    function check() {
      const submitBtn = findZhenxueSubmitButton();
      if (submitBtn && !isElementDisabled(submitBtn)) {
        log(`诊学网: 提交按钮已可用 (${Date.now() - start}ms)`);
        resolve(true);
        return;
      }

      const input = findZhenxueScoreInput();
      if (input) {
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      }

      if (Date.now() - start >= maxWaitMs) {
        log('诊学网: 等待提交按钮可用超时');
        resolve(false);
        return;
      }

      setTimeout(check, 200);
    }

    check();
  });
}

function getZhenxueSubmissionState() {
  const paperId = (document.querySelector('#paperID')?.textContent || '').trim();
  const myRead = (document.querySelector('#myRead')?.textContent || '').trim();
  const input = findZhenxueScoreInput();
  const submitBtn = findZhenxueSubmitButton();

  return {
    paperId,
    myRead,
    score: input ? input.value : '',
    submitDisabled: submitBtn ? isElementDisabled(submitBtn) : null
  };
}

function hasZhenxueSubmissionAdvanced(before, after) {
  if (!before || !after) return false;
  if (before.paperId && after.paperId && before.paperId !== after.paperId) return true;

  const beforeRead = parseInt(before.myRead, 10);
  const afterRead = parseInt(after.myRead, 10);
  if (Number.isFinite(beforeRead) && Number.isFinite(afterRead) && afterRead > beforeRead) {
    return true;
  }

  if (before.score && !after.score) return true;
  return false;
}

function waitForZhenxueSubmissionAdvanced(before, maxWaitMs = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();

    function check() {
      const after = getZhenxueSubmissionState();
      if (hasZhenxueSubmissionAdvanced(before, after)) {
        log('诊学网: 检测到提交后页面已前进', JSON.stringify({ before, after }));
        resolve({ advanced: true, after });
        return;
      }

      if (Date.now() - start >= maxWaitMs) {
        log('诊学网: 提交后页面未变化', JSON.stringify({ before, after }));
        resolve({ advanced: false, after });
        return;
      }

      setTimeout(check, 300);
    }

    check();
  });
}

function dispatchTrustedLikeClick(el) {
  if (!el) return false;

  const rect = el.getBoundingClientRect();
  const clientX = Math.round(rect.left + rect.width / 2);
  const clientY = Math.round(rect.top + rect.height / 2);
  const target = document.elementFromPoint(clientX, clientY) || el;
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX,
    clientY,
    button: 0,
    buttons: 1
  };

  if (window.PointerEvent) {
    target.dispatchEvent(new PointerEvent('pointerdown', { ...eventOptions, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  target.dispatchEvent(new MouseEvent('mousedown', eventOptions));
  target.dispatchEvent(new MouseEvent('mouseup', { ...eventOptions, buttons: 0 }));
  if (window.PointerEvent) {
    target.dispatchEvent(new PointerEvent('pointerup', { ...eventOptions, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  target.dispatchEvent(new MouseEvent('click', { ...eventOptions, buttons: 0 }));

  if (target !== el) {
    el.dispatchEvent(new MouseEvent('click', { ...eventOptions, buttons: 0 }));
  }
  el.click();

  return true;
}

function triggerZhenxueFormSubmit(submitBtn) {
  const form = document.querySelector('#form-scoring') || submitBtn?.closest('form');
  if (!form) {
    log('诊学网: 未找到 #form-scoring，无法直接触发表单提交');
    return false;
  }

  const input = findZhenxueScoreInput();
  if (input) {
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  if (submitBtn) {
    submitBtn.removeAttribute('disabled');
    submitBtn.disabled = false;
    submitBtn.classList.add('ScoreSelected');
  }

  if (window.jQuery) {
    window.jQuery(form).trigger('submit');
    return true;
  }

  if (form.requestSubmit) {
    form.requestSubmit(submitBtn || undefined);
    return true;
  }

  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return true;
}

async function submitZhenxueScoreAndVerify() {
  const ready = await waitForZhenxueSubmitReady(3000);
  const submitBtn = findZhenxueSubmitButton();
  if (!ready || !submitBtn || isElementDisabled(submitBtn)) {
    logError('诊学网: 提交按钮未就绪');
    return { success: false, error: '诊学网提交按钮未就绪' };
  }

  const before = getZhenxueSubmissionState();
  log('诊学网: 提交前状态:', JSON.stringify(before));

  dispatchTrustedLikeClick(submitBtn);
  let result = await waitForZhenxueSubmissionAdvanced(before, 4000);
  if (result.advanced) {
    return { success: true, autoNextAfterSubmit: true };
  }

  log('诊学网: 点击按钮后未提交，改用页面 #form-scoring submit 兜底');
  triggerZhenxueFormSubmit(submitBtn);
  result = await waitForZhenxueSubmissionAdvanced(before, 8000);
  if (result.advanced) {
    return { success: true, autoNextAfterSubmit: true };
  }

  return {
    success: false,
    error: '诊学网提交后页面未进入下一份，请检查页面是否弹出提示或分数校验失败'
  };
}

// 点击提交按钮（精确版，支持多平台）
function clickSubmit(platform) {
  log('');
  log('╔══════════════════════════════════════╗');
  log('║      开始查找并点击提交按钮          ║');
  log('╚══════════════════════════════════════╝');
  
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.dnjy;
  let submitBtn = null;
  
  if (platform === 'zhenxue') {
    submitBtn = findZhenxueSubmitButton();
    if (submitBtn) {
      log('诊学网: 通过右侧评分面板找到提交按钮');
    }
  }

  // 1. 先尝试通过平台配置的选择器查找
  if (!submitBtn) {
    submitBtn = findElement(config.submitButton);
    if (submitBtn) {
      log('通过平台配置选择器找到提交按钮');
    }
  }
  
  // 2. 搜索 <button> 元素（文本匹配"提交"）
  if (!submitBtn) {
    const allButtons = Array.from(document.querySelectorAll('button'));
    logVerbose('页面button总数:', allButtons.length);
    
    logVerbose('--- 页面所有button列表 ---');
    allButtons.forEach((b, i) => {
      const text = b.textContent.trim().replace(/\s+/g, ' ');
      const rect = b.getBoundingClientRect();
      logVerbose(`  [${i}] text="${text}" | class="${b.className}" | pos=(${Math.round(rect.left)},${Math.round(rect.top)})`);
    });
    logVerbose('--- button列表结束 ---');
    
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
    logVerbose('页面input按钮总数:', inputBtns.length);
    
    logVerbose('--- 页面所有input按钮列表 ---');
    inputBtns.forEach((b, i) => {
      const rect = b.getBoundingClientRect();
      logVerbose(`  [${i}] value="${b.value}" | id="${b.id}" | name="${b.name}" | pos=(${Math.round(rect.left)},${Math.round(rect.top)})`);
    });
    logVerbose('--- input按钮列表结束 ---');
    
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

  if (platform === 'zhenxue' && isElementDisabled(submitBtn)) {
    logError('✗ 诊学网提交按钮仍处于禁用状态，拒绝点击');
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

function findZhenxueNextButton() {
  const strongSelectors = [
    '[title*="下一"]',
    '[aria-label*="下一"]',
    'button:contains("下一")',
    'a:contains("下一")',
    '[role="button"]:contains("下一")'
  ];

  const byTextOrAttr = findElement(strongSelectors);
  if (byTextOrAttr && isVisibleElement(byTextOrAttr)) {
    return byTextOrAttr;
  }

  const clickables = Array.from(document.querySelectorAll(
    'a, button, [role="button"], [onclick], .iconfont, i, span'
  )).filter(isVisibleElement);

  const candidates = clickables.map(el => {
    const rect = el.getBoundingClientRect();
    const text = getCompactElementText(el);
    const attrs = [
      el.id,
      el.className,
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.getAttribute('href'),
      el.getAttribute('onclick')
    ].join(' ');

    let score = 0;
    if (/下一|下一个|next|arrow|right|forward|chevron/i.test(`${text} ${attrs}`)) score += 60;
    if (rect.left > window.innerWidth - 170) score += 35;
    if (rect.top > 145 && rect.top < 380) score += 35;
    if (rect.width >= 16 && rect.width <= 90 && rect.height >= 16 && rect.height <= 90) score += 20;
    if (text && !/^[>›»下一下一个下一份下一题]+$/.test(text)) score -= 80;
    if (/提交|收藏|问题卷|图片另存|回评|零分|满分|关闭|退出/.test(text)) score -= 120;

    return { el, rect, text, attrs, score };
  }).filter(item => item.score >= 70);

  candidates.sort((a, b) => b.score - a.score || b.rect.left - a.rect.left || a.rect.top - b.rect.top);

  const best = candidates[0];
  if (best) {
    log('诊学网: 通过右侧无文本箭头推断下一份按钮',
      `score=${best.score}`,
      `tag=${best.el.tagName}`,
      `text="${best.text}"`,
      `class="${best.el.className}"`,
      `pos=(${Math.round(best.rect.left)},${Math.round(best.rect.top)})`);
    return best.el;
  }

  log('诊学网: 未找到下一份右箭头候选');
  return null;
}

// 点击下一份按钮
function clickNext(platform, options = {}) {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.dnjy;
  const nextTexts = config.nextButtonText || ['下一份', '下一个', '下一题'];
  const silent = options.silent === true;
  
  let element = null;
  
  if (platform === 'zhenxue') {
    element = findZhenxueNextButton();
    if (element) {
      log('诊学网: 找到下一份按钮');
    }
  }

  // 1. 首先尝试通过配置的选择器查找
  if (!element && config.nextButton && config.nextButton.length > 0) {
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
    if (!silent) {
      logError('未找到下一份按钮/链接，平台:', platform);
    }
    
    const allClickables = document.querySelectorAll('a, button, input[type="button"], input[type="submit"], [role="button"]');
    logVerbose('页面上的可点击元素:', allClickables.length);
    allClickables.forEach((el, i) => {
      const text = (el.tagName === 'INPUT' ? (el.value || '') : el.textContent).trim().substring(0, 30);
      if (text.includes('一份') || text.includes('一个') || text.includes('>>') || text.includes('»') || text.includes('下一')) {
        logVerbose(`可点击元素${i}: tag="${el.tagName}", text="${text}", id="${el.id}"`);
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
        .then(result => {
          if (typeof result === 'string') {
            sendResponse({ croppedUrl: result });
            return;
          }
          sendResponse({ croppedUrl: result.url, imageMeta: result.meta });
        })
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
          scoreButtonSubmit: platformConfig.scoreButtonSubmit,
          scoreInputSelectors: platformConfig.scoreInput,
          submitButtonSelectors: platformConfig.submitButton
        }));
        
        if (msg.platform === 'weiboshi') {
          setTimeout(async () => {
            try {
              const result = await submitWeiboshiScoreAndVerify(msg.score);
              sendResponse(result);
            } catch (error) {
              logError('微博士提交出错:', error);
              sendResponse({ success: false, error: error.message });
            }
          }, 100);
          return true;
        }

        // 页面状态快照
        if (VERBOSE_LOG && msg.platform === 'ameqp') {
          dumpAmeqpPageState();
        }
        
        // 步骤1: 填入分数
        const filled = fillScore(msg.score, msg.platform);
        if (!filled) {
          sendResponse({ success: false, error: '未找到分数输入框' });
          return false;
        }
        
        if (platformConfig.autoNextAfterSubmit) {
          if (msg.platform === 'zhenxue') {
            // === 诊学网流程：填分 → 提交 → 页面自己拉取下一份 ===
            setTimeout(async () => {
              try {
                log('步骤2(诊学网): 提交并等待页面进入下一份');
                const result = await submitZhenxueScoreAndVerify();
                if (!result.success) {
                  sendResponse({ success: false, error: result.error || '诊学网提交失败' });
                  return;
                }

                log('========== 填分提交完成(诊学网)，页面已进入下一份 ==========');
                sendResponse({
                  success: true,
                  autoNextAfterSubmit: true
                });
              } catch (error) {
                logError('诊学网提交出错:', error);
                sendResponse({ success: false, error: error.message });
              }
            }, 500);
            return true;
          }

          // === AMEQP 流程：填分 → 提交 → 立即返回（弹窗检测由 background.js 在等待后执行） ===
          const postSubmitState = msg.platform === 'ameqp'
            ? getReviewPageState(msg.platform)
            : null;
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
              autoNextAfterSubmit: true,
              postSubmitState
            });
          }, 300);
        } else {
          // === Vue/Element UI 平台流程 ===
          const submitDelay = msg.platform === 'zhenxue' ? 800 : 500;
          setTimeout(async () => {
            try {
              if (msg.platform === 'zhenxue') {
                await waitForZhenxueSubmitReady(2500);
              }
            
              log('步骤2: 点击提交按钮');
              const submitted = clickSubmit(msg.platform);
            
              if (!submitted) {
                sendResponse({ success: false, error: '未找到或无法点击提交按钮' });
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
            } catch (error) {
              logError('点击提交阶段出错:', error);
              sendResponse({ success: false, error: error.message });
            }
          }, submitDelay);
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

    case 'advance_to_next':
      try {
        advanceToNext(msg.platform, msg.clickWindowMs, msg.advanceWaitMs)
          .then(sendResponse)
          .catch(error => sendResponse({ success: false, error: error.message }));
      } catch (error) {
        logError('自适应切换下一份出错:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    
    case 'fill_score':
      // 仅填分（不提交）
      try {
        const filled = fillScore(msg.score, msg.platform);
        sendResponse({ success: filled });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return false;

    case 'wait_for_post_submit_progress':
      waitForPostSubmitProgress(msg.platform, msg.beforeState, msg.timeoutMs)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
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
