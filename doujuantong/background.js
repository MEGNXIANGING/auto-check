// background.js - 负责全局状态管理、截图和阅卷循环控制

// ============ 全局状态 ============
let reviewState = {
  isActive: false,           // 是否正在阅卷
  selectedArea: null,        // 选定的阅卷区域
  prompt: '',                // 评分提示词
  platform: 'zxw',           // 当前平台: zxw(智学网) / dnjy(懂你教育) / zhenxue(诊学网) / ameqp(AMEQP) / weiboshi(微博士)
  currentTabId: null,        // 当前操作的标签页ID
  lastCaptureTime: 0,        // 上次截图时间
  retryCount: 0,             // 重试次数
  maxRetries: 8,             // 最大重试次数（含页面刷新恢复）
  limit: 0,                  // 阅卷次数限制（0=不限制）
  currentStatus: '等待开始',  // 最近一次状态，用于 popup 重新打开后同步
  currentStatusAt: null,      // 最近一次状态更新时间
  lastError: null,            // 最近一次错误
  activeStartedAt: null       // 当前阅卷会话开始时间
};

// 提交后页面自己加载下一份，不需要手动点"下一份"
const AUTO_NEXT_PLATFORMS = ['ameqp', 'zhenxue', 'weiboshi'];

// 阅卷记录
let reviewRecords = [];
let sessionStartTime = null;
let reviewCycleRunning = false;
let reviewWakeTimer = null;
let stateHydrated = false;
let hydratePromise = null;
let statePersistTimer = null;
let statePersistChain = Promise.resolve();
let pendingStatePersistReason = '';

const MIN_CAPTURE_INTERVAL = 2000; // 截图最小间隔（毫秒）
const SUBMIT_DELAY = 3000;         // 提交后等待时间（包含弹窗处理）
const NEXT_PAGE_DELAY = 2000;      // 切换下一份的等待时间
const PAGE_ADVANCE_TIMEOUT = 2200; // 下一份切换后的页面前进检测窗口
const API_TIMEOUT = 120000;        // AI 接口硬超时，覆盖响应头和响应体读取
const CAPTURE_TIMEOUT = 12000;     // 截图硬超时
const CROP_TIMEOUT = 20000;        // 裁剪硬超时
const SCRIPT_MESSAGE_TIMEOUT = 20000; // content script 消息硬超时
const SHORT_MESSAGE_TIMEOUT = 8000;   // 心跳/弹窗/下一份等短消息超时
const AMEQP_PAGE_LOAD_DELAY = 5000;  // AMEQP 提交后等待 AJAX 完成（含服务器响应时间）
const AMEQP_AFTER_CONFIRM_DELAY = 5000; // AMEQP 点击确认弹窗"确定"后等待实际AJAX完成
const REVIEW_STATE_STORAGE_KEY = 'reviewRuntimeState';
const REVIEW_ALARM_NAME = 'xiangmao_review_watchdog';
const REVIEW_ALARM_PERIOD_MINUTES = 0.5;
const MAX_BUSINESS_RETRIES = 8;
const MAX_COMM_RETRIES = 30;
const RECOVER_STALE_ACTIVE_MS = 30 * 60 * 1000;
const DOUBAO_API_KEY_STORAGE_KEY = 'doubaoApiKey';
const DEFAULT_DOUBAO_API_KEY = 'fe53fa2f-888e-46ca-b316-0f26a9d6c217';

// ============ 工具函数 ============

// 日志函数
function log(...args) {
  console.log('[香猫阅卷-BG]', ...args);
}

function logError(...args) {
  console.error('[香猫阅卷-BG]', ...args);
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (data) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(data || {});
    });
  });
}

function storageSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getPersistableReviewState() {
  return {
    isActive: reviewState.isActive,
    selectedArea: reviewState.selectedArea,
    prompt: reviewState.prompt,
    platform: reviewState.platform,
    currentTabId: reviewState.currentTabId,
    lastCaptureTime: reviewState.lastCaptureTime,
    retryCount: reviewState.retryCount || 0,
    commRetryCount: reviewState.commRetryCount || 0,
    maxRetries: reviewState.maxRetries,
    limit: reviewState.limit || 0,
    currentStatus: reviewState.currentStatus,
    currentStatusAt: reviewState.currentStatusAt,
    lastError: reviewState.lastError,
    activeStartedAt: reviewState.activeStartedAt,
    updatedAt: Date.now()
  };
}

async function writeReviewRuntimeState(reason = 'state') {
  try {
    await storageSet({
      [REVIEW_STATE_STORAGE_KEY]: getPersistableReviewState(),
      selectedArea: reviewState.selectedArea,
      lastPrompt: reviewState.prompt,
      currentPlatform: reviewState.platform,
      reviewLimit: reviewState.limit || 0
    });
    log(`状态已持久化: ${reason}`);
  } catch (error) {
    logError('持久化状态失败:', error);
  }
}

function persistReviewRuntimeState(reason = 'state', options = {}) {
  const immediate = options.immediate === true;

  if (immediate) {
    if (statePersistTimer) {
      clearTimeout(statePersistTimer);
      statePersistTimer = null;
    }
    statePersistChain = statePersistChain.then(() => writeReviewRuntimeState(reason));
    return statePersistChain;
  }

  pendingStatePersistReason = reason;
  if (!statePersistTimer) {
    statePersistTimer = setTimeout(() => {
      const queuedReason = pendingStatePersistReason || 'debounced';
      pendingStatePersistReason = '';
      statePersistTimer = null;
      statePersistChain = statePersistChain.then(() => writeReviewRuntimeState(queuedReason));
    }, 500);
  }

  return Promise.resolve();
}

async function persistReviewRecords(reason = 'records') {
  try {
    await storageSet({
      reviewRecords: reviewRecords,
      sessionStartTime: sessionStartTime?.toISOString()
    });
    log(`记录已持久化: ${reason}`);
  } catch (error) {
    logError('持久化记录失败:', error);
  }
}

async function hydrateReviewRuntimeState() {
  if (stateHydrated) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const data = await storageGet([
        REVIEW_STATE_STORAGE_KEY,
        'reviewRecords',
        'sessionStartTime',
        'selectedArea',
        'lastPrompt',
        'currentPlatform',
        'reviewLimit'
      ]);

      const persistedState = data[REVIEW_STATE_STORAGE_KEY];
      if (persistedState) {
        const staleActive = persistedState.isActive &&
          persistedState.updatedAt &&
          Date.now() - persistedState.updatedAt > RECOVER_STALE_ACTIVE_MS;

        Object.assign(reviewState, {
          ...persistedState,
          isActive: staleActive ? false : !!persistedState.isActive,
          currentStatus: staleActive ? '后台长时间未响应，已自动停止' : (persistedState.currentStatus || reviewState.currentStatus),
          lastError: staleActive ? '后台长时间未响应' : (persistedState.lastError || null)
        });
      } else {
        reviewState.selectedArea = data.selectedArea || reviewState.selectedArea;
        reviewState.prompt = data.lastPrompt || reviewState.prompt;
        reviewState.platform = data.currentPlatform || reviewState.platform;
        reviewState.limit = data.reviewLimit || reviewState.limit;
      }

      if (Array.isArray(data.reviewRecords)) {
        reviewRecords = data.reviewRecords;
      }
      if (data.sessionStartTime) {
        const parsed = new Date(data.sessionStartTime);
        if (!Number.isNaN(parsed.getTime())) {
          sessionStartTime = parsed;
        }
      }

      if (reviewState.isActive) {
        ensureReviewWatchdog();
      } else {
        clearReviewWatchdog();
      }

      stateHydrated = true;
      if (persistedState && reviewState.isActive === false && persistedState.isActive === true) {
        persistReviewRuntimeState('stale_recovery', { immediate: true });
      }
      log('后台状态恢复完成:', JSON.stringify(getPersistableReviewState()));
    } catch (error) {
      logError('恢复后台状态失败:', error);
      stateHydrated = true;
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
}

function ensureReviewWatchdog() {
  if (chrome.alarms) {
    chrome.alarms.create(REVIEW_ALARM_NAME, { periodInMinutes: REVIEW_ALARM_PERIOD_MINUTES });
  }
}

function clearReviewWatchdog() {
  if (reviewWakeTimer) {
    clearTimeout(reviewWakeTimer);
    reviewWakeTimer = null;
  }
  if (chrome.alarms) {
    chrome.alarms.clear(REVIEW_ALARM_NAME);
  }
}

function scheduleReviewCycle(delayMs = 0, reason = 'schedule') {
  if (!reviewState.isActive) return;

  ensureReviewWatchdog();
  if (reviewWakeTimer) {
    clearTimeout(reviewWakeTimer);
  }

  const safeDelay = Math.max(0, delayMs);
  log(`调度下一轮阅卷: ${safeDelay}ms, reason=${reason}`);
  reviewWakeTimer = setTimeout(() => {
    reviewWakeTimer = null;
    executeReviewCycle(reason);
  }, safeDelay);
  persistReviewRuntimeState(`schedule:${reason}`);
}

function getRetryDelayMs(retryCount) {
  const count = Math.max(1, retryCount || 1);
  return Math.min(30000, MIN_CAPTURE_INTERVAL * Math.pow(2, count - 1));
}

function getCaptureWaitMs() {
  return Math.max(0, MIN_CAPTURE_INTERVAL - (Date.now() - reviewState.lastCaptureTime));
}

// 检查是否可以截图（节流控制）
function canCapture() {
  const waitMs = getCaptureWaitMs();
  if (waitMs > 0) {
    log(`截图过于频繁，等待中... (${waitMs}ms)`);
    return false;
  }
  return true;
}

// 延迟执行
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId = null;
  return new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label}超时（${Math.round(timeoutMs / 1000)}秒）`));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

function sendTabMessageWithTimeout(tabId, message, label, timeoutMs = SCRIPT_MESSAGE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      reject(new Error(`${label}无响应（${Math.round(timeoutMs / 1000)}秒）`));
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const responseText = await response.text();
    if (!response.ok) {
      const detail = responseText ? `：${responseText.slice(0, 300)}` : '';
      throw new Error(`API请求失败: ${response.status} ${response.statusText || ''}${detail}`.trim());
    }

    if (!responseText.trim()) {
      throw new Error('API返回空响应');
    }

    try {
      return JSON.parse(responseText);
    } catch (error) {
      throw new Error(`API返回不是有效JSON：${responseText.slice(0, 300)}`);
    }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`AI接口请求超时（${Math.round(timeoutMs / 1000)}秒）`);
    }
    if (error instanceof TypeError && /fetch|network|load failed|failed to fetch/i.test(error.message || '')) {
      throw new Error(`AI接口网络请求失败：${error.message}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getDoubaoApiKey() {
  try {
    const data = await storageGet([DOUBAO_API_KEY_STORAGE_KEY]);
    return data[DOUBAO_API_KEY_STORAGE_KEY] || DEFAULT_DOUBAO_API_KEY;
  } catch (error) {
    logError('读取豆包API Key失败，使用默认配置:', error);
    return DEFAULT_DOUBAO_API_KEY;
  }
}

// ============ 截图功能 ============

// 截取指定标签页
async function captureVisibleTab(tabId) {
  return withTimeout(new Promise((resolve, reject) => {
    // 首先获取标签页信息，确定其所在的窗口
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        logError('获取标签页信息失败:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (!tab || !tab.windowId) {
        logError('标签页信息无效');
        reject(new Error('标签页信息无效'));
        return;
      }
      
      // 检查URL是否可以截图
      if (tab.url && (tab.url.startsWith('devtools://') || tab.url.startsWith('chrome://'))) {
        logError('无法截取系统页面:', tab.url);
        reject(new Error('无法截取系统页面'));
        return;
      }
      
      // 先激活目标标签页和窗口
      chrome.windows.update(tab.windowId, { focused: true }, () => {
        chrome.tabs.update(tabId, { active: true }, () => {
          // 短暂延迟确保标签页已激活
          setTimeout(() => {
            // 使用指定窗口ID进行截图
            chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
              if (chrome.runtime.lastError) {
                logError('截图失败:', chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              if (!dataUrl) {
                logError('截图返回空数据');
                reject(new Error('截图返回空数据'));
                return;
              }
              log('截图成功');
              resolve(dataUrl);
            });
          }, 200);
        });
      });
    });
  }), CAPTURE_TIMEOUT, '截图');
}

// 裁剪图片（在offscreen或通过content script执行）
async function cropImage(tabId, dataUrl, area) {
  const response = await sendTabMessageWithTimeout(
    tabId,
    {
      action: 'crop_image',
      dataUrl: dataUrl,
      area: area
    },
    '裁剪图片',
    CROP_TIMEOUT
  );

  if (response && response.croppedUrl) {
    const meta = response.imageMeta || null;
    if (meta) {
      log('图片裁剪成功:',
        `${meta.width}x${meta.height}`,
        `quality=${meta.quality}`,
        `size=${Math.round((meta.bytes || 0) / 1024)}KB`);
    } else {
      log('图片裁剪成功');
    }
    return { url: response.croppedUrl, meta };
  }

  logError('裁剪图片失败:', response?.error);
  throw new Error(response?.error || '裁剪图片失败');
}

// ============ AI API 调用 ============

async function callDoubaoAPI(prompt, imageUrl) {
  log('调用豆包API进行评分...');
  const startedAt = Date.now();
  let progressTimer = null;
  
  try {
    const apiKey = await getDoubaoApiKey();
    const scoringPrompt = [
      '请把最终得分放在第一行，格式必须为“得分：数字”。',
      '得分只能是本题实际得分，不要把题号、满分、平均分、时间（如20分钟）、排名或答案示例里的数字当作得分。',
      '评分理由从第二行开始，控制在120字以内，只说明扣分/给分依据。',
      '',
      prompt
    ].join('\n');

    progressTimer = setInterval(() => {
      if (!reviewState.isActive) return;
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      broadcastStatus(`正在AI评分...（已等待${elapsed}秒，最长${Math.round(API_TIMEOUT / 1000)}秒）`);
    }, 10000);

    log(`AI请求图片大小约 ${Math.round((imageUrl.length * 0.75) / 1024)}KB`);

    const result = await fetchJsonWithTimeout('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'doubao-seed-1-6-250615',
        temperature: 0,
        max_tokens: 300,
        thinking: { type: 'disabled' },
        messages: [
          {
            content: [
              { text: scoringPrompt, type: 'text' },
              { image_url: { url: imageUrl }, type: 'image_url' }
            ],
            role: 'user'
          }
        ]
      })
    }, API_TIMEOUT);

    log('API返回结果:', result);
    return result;
  } catch (error) {
    logError('调用豆包API失败:', error);
    throw error;
  } finally {
    if (progressTimer) {
      clearInterval(progressTimer);
    }
  }
}

// 从AI响应中提取分数
function extractScore(text) {
  const trimmed = String(text || '').trim();

  // 优先匹配带明确语义的分数字段，避免把"满分10分"误识别成得分。
  const explicitPatterns = [
    /^\s*([0-9]+(?:\.[0-9]+)?)\s*分(?!\s*钟)/,
    /(?:最终得分|最终分数|实际得分|实得分|实得|得分|分数|评分|给分|判分|应得|可得|应给|建议给|评为|判为)[：:\s]*([0-9]+(?:\.[0-9]+)?)(?![0-9.])(?!\s*分\s*钟)(?:\s*分)?/,
    /(?:得|给)\s*([0-9]+(?:\.[0-9]+)?)\s*分(?!\s*钟)/
  ];
  
  for (const pattern of explicitPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const score = match[1];
      log('提取到分数:', score);
      return score;
    }
  }

  const scoreMentions = Array.from(trimmed.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*分(?!\s*钟)/g))
    .filter(match => {
      const prefix = trimmed.slice(Math.max(0, match.index - 16), match.index);
      const suffix = trimmed.slice(match.index + match[0].length, match.index + match[0].length + 8);
      if (/[（(]\s*$/.test(prefix) && /^\s*[)）]/.test(suffix)) return false;
      return !/(满分|总分|共|每题|本题满|平均分|自批平均分|分钟|预留|花费|记录|题号|用\s*)/.test(prefix);
    });

  if (scoreMentions.length > 0) {
    const score = scoreMentions[scoreMentions.length - 1][1];
    log('从分数描述中提取到分数:', score);
    return score;
  }

  const onlyNumberMatch = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)$/);
  if (onlyNumberMatch) {
    const score = onlyNumberMatch[1];
    log('从纯数字响应中提取到分数:', score);
    return score;
  }

  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() || '';
  const firstLineMatch = firstLine.match(/^([0-9]+(?:\.[0-9]+)?)(?:\s*分(?!\s*钟))?[。.,，!！]?$/);
  if (firstLineMatch) {
    const score = firstLineMatch[1];
    log('从首行响应中提取到分数:', score);
    return score;
  }
  
  logError('无法从响应中提取分数:', trimmed);
  return null;
}

// ============ 阅卷流程控制 ============

// 执行单次阅卷
async function executeReviewCycle(trigger = 'direct') {
  await hydrateReviewRuntimeState();

  if (!reviewState.isActive) {
    log('阅卷已停止，退出循环');
    return;
  }

  if (reviewCycleRunning) {
    log(`已有阅卷周期运行中，忽略本次触发: ${trigger}`);
    return;
  }

  reviewCycleRunning = true;
  ensureReviewWatchdog();
  let nextDelayMs = null;
  const cycleStartedAt = Date.now();
  const phaseTimings = {
    throttleWaitMs: 0,
    captureMs: 0,
    cropMs: 0,
    aiMs: 0,
    submitMs: 0,
    transitionMs: 0
  };

  async function timePhase(key, fn) {
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      phaseTimings[key] = Date.now() - startedAt;
    }
  }

  try {
    // 检查是否达到阅卷次数限制
    if (reviewState.limit > 0 && reviewRecords.length >= reviewState.limit) {
      log(`已达到阅卷次数限制（${reviewState.limit}份），自动停止`);
      broadcastStatus(`已完成 ${reviewRecords.length} 份阅卷（达到限制），自动停止`);
      stopReview('达到阅卷次数限制');
      return;
    }

    log('═══════════════════════════════════════════════');
    log(`执行阅卷周期 (${reviewRecords.length + 1}/${reviewState.limit || '∞'}) platform="${reviewState.platform}" tabId=${reviewState.currentTabId} trigger="${trigger}"`);
    log('═══════════════════════════════════════════════');

    // 1. 检查配置
    if (!reviewState.selectedArea) {
      throw new Error('未选择阅卷区域');
    }
    if (!reviewState.prompt) {
      throw new Error('未设置评分提示词');
    }
    if (!reviewState.currentTabId) {
      throw new Error('未找到目标标签页');
    }

    // 2. 通知popup更新状态
    broadcastStatus('正在截图...');

    // 3. 检查截图节流
    if (!canCapture()) {
      const captureWaitMs = getCaptureWaitMs();
      phaseTimings.throttleWaitMs = captureWaitMs;
      await delay(captureWaitMs);
      if (!reviewState.isActive) return;
    }
    reviewState.lastCaptureTime = Date.now();

    // 4. 截图（指定目标标签页）
    const fullScreenshot = await timePhase('captureMs', () => captureVisibleTab(reviewState.currentTabId));
    if (!reviewState.isActive) return;

    // 5. 裁剪图片
    broadcastStatus('正在裁剪图片...');
    const croppedImage = await timePhase('cropMs', () => cropImage(
      reviewState.currentTabId,
      fullScreenshot,
      reviewState.selectedArea
    ));
    if (croppedImage.meta) {
      broadcastStatus(`图片已压缩: ${croppedImage.meta.width}x${croppedImage.meta.height} / ${Math.round((croppedImage.meta.bytes || 0) / 1024)}KB`);
    }
    if (!reviewState.isActive) return;

    // 6. 调用AI评分
    broadcastStatus('正在AI评分...');
    const apiResult = await timePhase('aiMs', () => callDoubaoAPI(reviewState.prompt, croppedImage.url));
    if (!reviewState.isActive) return;

    // 7. 解析评分结果
    if (!apiResult || !apiResult.choices || !apiResult.choices[0]) {
      throw new Error('API返回无效结果');
    }

    const msg = apiResult.choices[0].message;
    let responseText = '';

    if (Array.isArray(msg.content)) {
      responseText = msg.content.map(item => item.text || '').join('\n');
    } else if (typeof msg.content === 'string') {
      responseText = msg.content;
    } else {
      responseText = JSON.stringify(msg.content);
    }

    log('AI响应:', responseText);

    // 8. 提取分数
    const score = extractScore(responseText);
    if (!score) {
      throw new Error('无法识别分数');
    }

    broadcastStatus(`识别分数: ${score}分`);

    // 9. 填分并提交
    broadcastStatus(`填入分数: ${score}，提交中...`);
    const submitResult = await timePhase('submitMs', () => fillScoreAndSubmit(reviewState.currentTabId, score));
    if (!reviewState.isActive) return;
    const recordedScore = submitResult?.actualScore || score;
    if (String(recordedScore) !== String(score)) {
      log(`提交返回实际分数 ${recordedScore}，AI识别分数 ${score}`);
    }

    // 10. 根据平台决定是否需要手动点"下一份"
    const isAutoNext = AUTO_NEXT_PLATFORMS.includes(reviewState.platform);

    if (reviewState.platform === 'ameqp') {
      // AMEQP 弹窗处理循环:
      //   提交 → 轮询等待页面响应/弹窗 → 如果是确认弹窗(如"分值偏低") → 点确定 → 再等待 → 再检测
      //   直到: 无弹窗(正常继续) 或 "最后一份"(停止)
      const MAX_DIALOG_ROUNDS = 3;
      let ameqpProbeState = submitResult?.postSubmitState || null;
      phaseTimings.transitionMs = Date.now();

      try {
        for (let round = 1; round <= MAX_DIALOG_ROUNDS; round++) {
          const waitMs = round === 1 ? AMEQP_PAGE_LOAD_DELAY : AMEQP_AFTER_CONFIRM_DELAY;
          log(`AMEQP: 第${round}轮等待页面响应，最长 ${waitMs}ms`);
          broadcastStatus(round === 1 ? '提交成功，等待页面响应...' : '确认弹窗已处理，等待实际提交...');

          const progressResult = await waitForPostSubmitProgress(
            reviewState.currentTabId,
            reviewState.platform,
            ameqpProbeState,
            waitMs
          );
          if (!reviewState.isActive) return;

          log(`AMEQP: 第${round}轮进度结果:`, JSON.stringify(progressResult));

          if (progressResult && progressResult.isLastPaper) {
            log('★★★ 已经是最后一份试卷，自动停止 ★★★');
            broadcastAIResult(responseText, recordedScore);
            reviewState.retryCount = 0;
            reviewState.commRetryCount = 0;
            reviewState.lastError = null;
            broadcastStatus(`已完成 ${reviewRecords.length} 份阅卷（已是最后一份试卷），自动停止`);
            stopReview('最后一份试卷');
            return;
          }

          if (progressResult?.dismissed) {
            log(`AMEQP: 第${round}轮处理了弹窗: "${progressResult.dialogText}"，继续检测实际提交结果`);
            ameqpProbeState = progressResult.currentState || ameqpProbeState;
            continue;
          }

          log(`AMEQP: 第${round}轮页面已就绪，继续下一份`);
          break;
        }
      } catch (error) {
        logError('AMEQP 自适应等待失败，回退旧弹窗检测:', error.message || error);
        for (let round = 1; round <= MAX_DIALOG_ROUNDS; round++) {
          const waitMs = round === 1 ? AMEQP_PAGE_LOAD_DELAY : AMEQP_AFTER_CONFIRM_DELAY;
          await delay(waitMs);
          if (!reviewState.isActive) return;

          const dialogResult = await checkAmeqpDialog(reviewState.currentTabId);
          if (dialogResult && dialogResult.isLastPaper) {
            log('★★★ 已经是最后一份试卷，自动停止 ★★★');
            broadcastAIResult(responseText, recordedScore);
            reviewState.retryCount = 0;
            reviewState.commRetryCount = 0;
            reviewState.lastError = null;
            broadcastStatus(`已完成 ${reviewRecords.length} 份阅卷（已是最后一份试卷），自动停止`);
            stopReview('最后一份试卷');
            return;
          }
          if (dialogResult && dialogResult.dismissed) {
            continue;
          }
          break;
        }
      } finally {
        phaseTimings.transitionMs = Date.now() - phaseTimings.transitionMs;
      }
    } else if (isAutoNext) {
      if (reviewState.platform === 'zhenxue' || reviewState.platform === 'weiboshi') {
        broadcastStatus('提交成功，页面已进入下一份');
        phaseTimings.transitionMs = 0;
      } else {
        broadcastStatus('提交成功，等待下一份加载...');
        phaseTimings.transitionMs = Date.now();
        await delay(NEXT_PAGE_DELAY);
        phaseTimings.transitionMs = Date.now() - phaseTimings.transitionMs;
        if (!reviewState.isActive) return;
      }
    } else {
      // 其他平台: 需要手动点击"下一份"按钮
      broadcastStatus('提交成功，准备下一份...');
      phaseTimings.transitionMs = Date.now();
      const nextResult = await advanceToNextPaper(reviewState.currentTabId);
      if (!reviewState.isActive) return;

      if (nextResult?.success && nextResult.advanced) {
        broadcastStatus('已切换到下一份');
      } else if (nextResult?.success) {
        broadcastStatus('下一份切换完成，等待页面稳定...');
        if (!nextResult.legacyFallback) {
          await delay(NEXT_PAGE_DELAY);
          if (!reviewState.isActive) return;
        }
      }
      phaseTimings.transitionMs = Date.now() - phaseTimings.transitionMs;
    }

    if (!reviewState.isActive) return;

    // 11. 确认提交和翻页流程都完成后再计数，避免失败重试时重复记录。
    broadcastAIResult(responseText, recordedScore);
    reviewState.retryCount = 0;
    reviewState.commRetryCount = 0;
    reviewState.lastError = null;
    nextDelayMs = 0;
    log(
      '本题耗时统计:',
      `total=${Date.now() - cycleStartedAt}ms`,
      `throttle=${phaseTimings.throttleWaitMs}ms`,
      `capture=${phaseTimings.captureMs}ms`,
      `crop=${phaseTimings.cropMs}ms`,
      `ai=${phaseTimings.aiMs}ms`,
      `submit=${phaseTimings.submitMs}ms`,
      `transition=${phaseTimings.transitionMs}ms`
    );

  } catch (error) {
    logError('阅卷出错:', error, 'timings=', JSON.stringify({
      ...phaseTimings,
      totalMs: Date.now() - cycleStartedAt
    }));
    if (!reviewState.isActive) return;

    const errMsg = error.message || '';
    reviewState.lastError = errMsg;
    const isCommError = (
      errMsg.includes('Receiving end does not exist') ||
      errMsg.includes('通信失败') ||
      errMsg.includes('Could not establish connection') ||
      errMsg.includes('message port closed') ||
      errMsg.includes('Extension context invalidated')
    );

    if (isCommError) {
      // 通信错误通常是页面刷新/AJAX导致，给更长恢复窗口，避免正常翻页时误停。
      reviewState.commRetryCount = (reviewState.commRetryCount || 0) + 1;
      log(`通信断开 (第${reviewState.commRetryCount}次)，页面可能刷新/AJAX中，等待恢复...`);
      broadcastStatus(`页面加载中，等待恢复连接(${reviewState.commRetryCount})...`);

      const ready = await waitForContentScript(reviewState.currentTabId, 20000);
      if (!reviewState.isActive) return;

      if (ready) {
        log('Content script 已恢复，重置通信计数，继续阅卷');
        broadcastStatus('连接已恢复，继续阅卷...');
        reviewState.retryCount = 0;
        reviewState.commRetryCount = 0;
      } else if (reviewState.commRetryCount >= MAX_COMM_RETRIES) {
        log(`连续通信失败${MAX_COMM_RETRIES}次，标签页可能已关闭或页面不再可访问，停止阅卷`);
        broadcastStatus('无法连接页面，阅卷已停止');
        stopReview(`连续通信失败${MAX_COMM_RETRIES}次`);
        return;
      } else {
        log('Content script 暂未恢复，继续等待下一轮...');
        broadcastStatus('等待页面加载...');
      }
      nextDelayMs = 0;
    } else {
      // 业务错误：API失败、分数识别失败、按钮识别失败等，指数退避重试。
      reviewState.retryCount++;
      const maxRetries = reviewState.maxRetries || MAX_BUSINESS_RETRIES;
      const retryDelay = getRetryDelayMs(reviewState.retryCount);
      log(`业务错误: "${errMsg}", 重试 ${reviewState.retryCount}/${maxRetries}, ${retryDelay}ms 后继续`);

      if (reviewState.retryCount > maxRetries) {
        broadcastStatus(`连续${maxRetries}次业务错误，阅卷已停止: ${errMsg}`);
        stopReview(`业务错误${maxRetries}次: ${errMsg}`);
        return;
      }

      broadcastStatus(`错误: ${errMsg}，${Math.round(retryDelay / 1000)}秒后重试(${reviewState.retryCount})...`);
      nextDelayMs = retryDelay;
    }
  } finally {
    reviewCycleRunning = false;
    await persistReviewRuntimeState(`cycle:${trigger}`, { immediate: true });

    if (reviewState.isActive && nextDelayMs !== null) {
      scheduleReviewCycle(nextDelayMs, 'continue');
    }
  }
}

// 等待 content script 就绪（页面刷新后重新连接）
async function waitForContentScript(tabId, maxWaitMs) {
  const startTime = Date.now();
  const pingInterval = 2000;
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await sendTabMessageWithTimeout(tabId, { action: 'ping' }, '页面心跳', 3000)
        .catch(() => null);
      const ok = response && response.success;
      if (ok) {
        log(`waitForContentScript: 已就绪 (${Date.now() - startTime}ms)`);
        return true;
      }
    } catch (e) {
      // ignore
    }
    log(`waitForContentScript: 未就绪，${pingInterval}ms 后重试...`);
    await delay(pingInterval);
    if (!reviewState.isActive) return false;
  }
  
  log(`waitForContentScript: 超时 (${maxWaitMs}ms)`);
  return false;
}

// 填分并提交
async function fillScoreAndSubmit(tabId, score) {
  log(`fillScoreAndSubmit: score=${score}, platform="${reviewState.platform}", tabId=${tabId}`);
  const response = await sendTabMessageWithTimeout(
    tabId,
    {
      action: 'fill_score_and_submit',
      score: score,
      platform: reviewState.platform
    },
    '填分提交',
    SCRIPT_MESSAGE_TIMEOUT
  );

  log('fillScoreAndSubmit: 收到响应:', JSON.stringify(response));
  if (response && response.success) {
    log('fillScoreAndSubmit: 成功, autoNextAfterSubmit=', response.autoNextAfterSubmit);
    return response;
  }

  logError('fillScoreAndSubmit: 失败:', response?.error);
  throw new Error(response?.error || '填分提交失败');
}

// AMEQP: 检测页面弹窗（在 AJAX 完成后调用）
async function checkAmeqpDialog(tabId) {
  log('checkAmeqpDialog: 发送 dismiss_dialog 到 tab', tabId);
  try {
    const response = await sendTabMessageWithTimeout(
      tabId,
      {
        action: 'dismiss_dialog',
        platform: reviewState.platform
      },
      '弹窗检测',
      SHORT_MESSAGE_TIMEOUT
    );

    log('checkAmeqpDialog: 收到 content.js 响应:', JSON.stringify(response));
    if (response && response.success) {
      const dialogText = response.dialogText || '';
      const isLast = dialogText.includes('最后一份') || dialogText.includes('没有试卷') || dialogText.includes('已全部');
      log(`checkAmeqpDialog: dismissed=${response.dismissed}, dialogText="${dialogText}", isLastPaper=${isLast}`);
      return {
        dismissed: response.dismissed,
        dialogText: dialogText,
        isLastPaper: isLast
      };
    }

    log('checkAmeqpDialog: 响应无效或失败, response:', response);
    return null;
  } catch (error) {
    logError('checkAmeqpDialog: 通信失败:', error.message);
    return null;
  }
}

// 点击下一份按钮
async function clickNextButton(tabId) {
  const response = await sendTabMessageWithTimeout(
    tabId,
    {
      action: 'click_next',
      platform: reviewState.platform
    },
    '点击下一份',
    SHORT_MESSAGE_TIMEOUT
  );

  if (response && response.success) {
    log('点击下一份成功');
    return;
  }

  logError('点击下一份失败:', response?.error);
  throw new Error(response?.error || '点击下一份失败');
}

async function waitForPostSubmitProgress(tabId, platform, beforeState, timeoutMs) {
  const response = await sendTabMessageWithTimeout(
    tabId,
    {
      action: 'wait_for_post_submit_progress',
      platform,
      beforeState,
      timeoutMs
    },
    '提交后状态确认',
    Math.max(SHORT_MESSAGE_TIMEOUT, timeoutMs + 3000)
  );

  if (response && response.success) {
    return response;
  }

  throw new Error(response?.error || '提交后状态确认失败');
}

async function advanceToNextPaper(tabId) {
  try {
    const response = await sendTabMessageWithTimeout(
      tabId,
      {
        action: 'advance_to_next',
        platform: reviewState.platform,
        clickWindowMs: SUBMIT_DELAY,
        advanceWaitMs: PAGE_ADVANCE_TIMEOUT
      },
      '切换下一份',
      Math.max(SHORT_MESSAGE_TIMEOUT, SUBMIT_DELAY + PAGE_ADVANCE_TIMEOUT + 3000)
    );

    if (response && response.success) {
      log('自适应切换下一份完成:', JSON.stringify(response));
      return response;
    }

    throw new Error(response?.error || '自适应切换下一份失败');
  } catch (error) {
    logError('自适应切换下一份失败，回退旧流程:', error.message || error);
    await delay(SUBMIT_DELAY);
    if (!reviewState.isActive) {
      return { success: false, advanced: false, legacyFallback: true };
    }

    await clickNextButton(tabId);
    if (!reviewState.isActive) {
      return { success: false, advanced: false, legacyFallback: true };
    }

    await delay(NEXT_PAGE_DELAY);
    return {
      success: true,
      advanced: false,
      legacyFallback: true
    };
  }
}

// 开始阅卷
async function startReview(config) {
  await hydrateReviewRuntimeState();
  log('开始阅卷，配置:', config);
  
  // 更新状态
  reviewState.isActive = true;
  reviewState.selectedArea = config.area;
  reviewState.prompt = config.prompt;
  reviewState.platform = config.platform || 'zxw';
  reviewState.currentTabId = config.tabId;
  reviewState.retryCount = 0;
  reviewState.commRetryCount = 0;
  reviewState.maxRetries = MAX_BUSINESS_RETRIES;
  reviewState.lastCaptureTime = 0;
  reviewState.limit = config.limit || 0;  // 阅卷次数限制
  reviewState.currentStatus = '正在启动...';
  reviewState.currentStatusAt = Date.now();
  reviewState.lastError = null;
  reviewState.activeStartedAt = Date.now();
  
  // 清空阅卷记录，开始新的阅卷会话
  reviewRecords = [];
  sessionStartTime = new Date();
  
  log('阅卷次数限制:', reviewState.limit > 0 ? `${reviewState.limit}份` : '不限制');
  
  await persistReviewRuntimeState('start', { immediate: true });
  await persistReviewRecords('start');
  scheduleReviewCycle(0, 'start');
  
  return { success: true };
}

// 停止阅卷
function stopReview(reason) {
  log(`停止阅卷, 原因: ${reason || '用户手动停止'}, 已完成: ${reviewRecords.length}份`);
  reviewState.isActive = false;
  reviewState.commRetryCount = 0;
  reviewState.activeStartedAt = null;
  broadcastStatus(reason ? `阅卷已停止：${reason}` : '阅卷已停止');
  clearReviewWatchdog();
  persistReviewRuntimeState(`stop:${reason || 'manual'}`, { immediate: true });
  return { success: true };
}

// 获取当前状态
function getStatus() {
  return {
    isActive: reviewState.isActive,
    selectedArea: reviewState.selectedArea,
    prompt: reviewState.prompt,
    platform: reviewState.platform,
    currentStatus: reviewState.currentStatus,
    currentStatusAt: reviewState.currentStatusAt,
    lastError: reviewState.lastError,
    activeStartedAt: reviewState.activeStartedAt,
    count: reviewRecords.length,
    limit: reviewState.limit
  };
}

// 广播状态给popup
function broadcastStatus(message) {
  log('广播状态:', message);
  reviewState.currentStatus = message;
  reviewState.currentStatusAt = Date.now();
  persistReviewRuntimeState(`status:${message}`);
  chrome.runtime.sendMessage({
    action: 'status_update',
    message: message
  }).catch(() => {
    // popup可能已关闭，忽略错误
  });
}

// 广播AI评分结果给popup
function broadcastAIResult(result, score) {
  log('广播AI结果:', score);
  
  // 添加到阅卷记录
  const record = {
    index: reviewRecords.length + 1,
    score: score,
    reason: result,
    time: new Date().toLocaleTimeString()
  };
  reviewRecords.push(record);
  
  persistReviewRecords('ai_result');
  
  chrome.runtime.sendMessage({
    action: 'ai_result',
    result: result,
    score: score,
    totalCount: reviewRecords.length
  }).catch(() => {
    // popup可能已关闭，忽略错误
  });
  
  // 同时保存到storage，以便popup重新打开时能读取
  storageSet({
    lastAIResult: { result, score }
  });
}

// ============ 消息处理 ============

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  log('收到消息:', msg.action);
  
  switch (msg.action) {
    case 'capture_visible_tab':
      // 截图请求（需要传入tabId）
      if (!msg.tabId) {
        // 如果没有传入tabId，获取当前活动标签页
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs.length > 0) {
            captureVisibleTab(tabs[0].id)
              .then(dataUrl => sendResponse({ dataUrl }))
              .catch(error => sendResponse({ error: error.message }));
          } else {
            sendResponse({ error: '未找到活动标签页' });
          }
        });
      } else {
        captureVisibleTab(msg.tabId)
          .then(dataUrl => sendResponse({ dataUrl }))
          .catch(error => sendResponse({ error: error.message }));
      }
      return true;
    
    case 'start_review':
      // 开始阅卷
      startReview(msg.config)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'stop_review':
      // 停止阅卷
      hydrateReviewRuntimeState()
        .then(() => sendResponse(stopReview()))
        .catch(() => sendResponse(stopReview()));
      return true;
    
    case 'get_status':
      // 获取状态
      hydrateReviewRuntimeState()
        .then(() => sendResponse(getStatus()))
        .catch(error => sendResponse({ ...getStatus(), lastError: error.message }));
      return true;
    
    case 'get_records':
      // 获取阅卷记录
      hydrateReviewRuntimeState()
        .then(() => sendResponse({
          records: reviewRecords,
          sessionStartTime: sessionStartTime?.toISOString(),
          count: reviewRecords.length
        }))
        .catch(() => sendResponse({
          records: reviewRecords,
          sessionStartTime: sessionStartTime?.toISOString(),
          count: reviewRecords.length
        }));
      return true;
    
    case 'clear_records':
      // 清空阅卷记录
      reviewRecords = [];
      sessionStartTime = null;
      Promise.all([
        storageRemove(['reviewRecords', 'sessionStartTime']),
        persistReviewRuntimeState('clear_records', { immediate: true })
      ])
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'update_config':
      // 更新配置
      hydrateReviewRuntimeState()
        .then(() => {
          if (msg.area) reviewState.selectedArea = msg.area;
          if (msg.prompt) reviewState.prompt = msg.prompt;
          if (msg.platform) reviewState.platform = msg.platform;
          persistReviewRuntimeState('update_config', { immediate: true })
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'single_review':
      // 单次阅卷（手动触发）
      (async () => {
        try {
          await hydrateReviewRuntimeState();
          if (reviewState.isActive) {
            sendResponse({ success: false, error: '阅卷正在进行中' });
            return;
          }

          // 临时启动单次阅卷
          reviewState.isActive = true;
          reviewState.selectedArea = msg.config.area;
          reviewState.prompt = msg.config.prompt;
          reviewState.platform = msg.config.platform || 'zxw';
          reviewState.currentTabId = msg.config.tabId;

          // 截图（指定目标标签页）
          const fullScreenshot = await captureVisibleTab(reviewState.currentTabId);
          if (!reviewState.isActive) return;
          
          // 裁剪
          const croppedImage = await cropImage(
            reviewState.currentTabId,
            fullScreenshot,
            reviewState.selectedArea
          );
          if (!reviewState.isActive) return;
          
          // AI评分
          const apiResult = await callDoubaoAPI(reviewState.prompt, croppedImage.url);
          if (!reviewState.isActive) return;
          
          // 解析结果
          const msgContent = apiResult?.choices?.[0]?.message;
          let responseText = '';
          
          if (Array.isArray(msgContent?.content)) {
            responseText = msgContent.content.map(item => item.text || '').join('\n');
          } else if (typeof msgContent?.content === 'string') {
            responseText = msgContent.content;
          } else {
            responseText = JSON.stringify(msgContent?.content || '');
          }
          
          const score = extractScore(responseText);
          if (!score) {
            throw new Error('无法识别分数');
          }
          
          sendResponse({
            success: true,
            result: responseText,
            score: score
          });
          
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        } finally {
          reviewState.isActive = false;
        }
      })();
      
      return true;
      
    default:
      log('未知消息类型:', msg.action);
      return false;
  }
});

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== REVIEW_ALARM_NAME) return;
    hydrateReviewRuntimeState().then(() => {
      if (reviewState.isActive && !reviewCycleRunning && !reviewWakeTimer) {
        log('看门狗触发：恢复阅卷循环');
        scheduleReviewCycle(0, 'watchdog');
      }
    });
  });
}

// 监听标签页关闭，停止相关阅卷
chrome.tabs.onRemoved.addListener((tabId) => {
  hydrateReviewRuntimeState().then(() => {
    if (tabId === reviewState.currentTabId) {
      log('目标标签页已关闭，停止阅卷');
      stopReview('标签页已关闭');
    }
  });
});

hydrateReviewRuntimeState().then(() => {
  if (reviewState.isActive) {
    log('Service Worker 启动后检测到未完成阅卷，准备恢复');
    scheduleReviewCycle(0, 'worker_start');
  }
});

log('香猫阅卷 Background Service Worker 已启动');
