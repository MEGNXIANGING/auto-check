// popup.js - 负责UI交互和配置管理

// ============ DOM元素 ============
let platformZxwBtn, platformDnjyBtn, platformAmeqpBtn, currentPlatformText;
let selectBtn, startBtn, stopBtn, singleBtn, exportBtn;
let promptInput, resultDiv, areaStatus, statusIndicator;
let aiResultDiv, lastScoreBadge, reviewCountSpan, currentStatusSpan;
let reviewLimitInput;

// ============ 状态 ============
let currentPlatform = 'dnjy'; // 默认懂你教育
let selectedArea = null;
let isReviewing = false;
let reviewCount = 0;

// ============ 日志函数 ============
function log(...args) {
  console.log('[香猫阅卷-Popup]', ...args);
}

function logError(...args) {
  console.error('[香猫阅卷-Popup]', ...args);
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
  log('Popup 初始化...');
  
  // 获取DOM元素
  platformZxwBtn = document.getElementById('platform-zxw');
  platformDnjyBtn = document.getElementById('platform-dnjy');
  platformAmeqpBtn = document.getElementById('platform-ameqp');
  currentPlatformText = document.getElementById('current-platform-text');
  selectBtn = document.getElementById('select-area');
  startBtn = document.getElementById('start-review');
  stopBtn = document.getElementById('stop-review');
  singleBtn = document.getElementById('single-review');
  promptInput = document.getElementById('prompt');
  resultDiv = document.getElementById('result');
  areaStatus = document.getElementById('area-status');
  statusIndicator = document.getElementById('status-indicator');
  aiResultDiv = document.getElementById('ai-result');
  lastScoreBadge = document.getElementById('last-score');
  reviewCountSpan = document.getElementById('review-count');
  currentStatusSpan = document.getElementById('current-status');
  exportBtn = document.getElementById('export-btn');
  reviewLimitInput = document.getElementById('review-limit');
  
  // 绑定事件
  bindEvents();
  
  // 初始化折叠面板
  initCollapsibles();
  
  // 加载配置
  loadConfig();
  
  // 获取当前阅卷状态
  getReviewStatus();
});

// ============ 折叠面板 ============
function initCollapsibles() {
  // 平台选择折叠
  const platformHeader = document.getElementById('platform-header');
  const platformContent = document.getElementById('platform-content');
  const platformSection = platformHeader?.parentElement;
  
  platformHeader?.addEventListener('click', () => {
    platformSection?.classList.toggle('expanded');
    platformContent?.classList.toggle('show');
  });
  
  // AI结果折叠
  const aiResultHeader = document.getElementById('ai-result-header');
  const aiResultContent = document.getElementById('ai-result-content');
  const aiResultSection = aiResultHeader?.parentElement;
  
  aiResultHeader?.addEventListener('click', () => {
    aiResultSection?.classList.toggle('expanded');
    aiResultContent?.classList.toggle('show');
  });
  
  // 日志折叠
  const logHeader = document.getElementById('log-header');
  const logContent = document.getElementById('log-content');
  const logSection = logHeader?.parentElement;
  
  logHeader?.addEventListener('click', () => {
    logSection?.classList.toggle('expanded');
    logContent?.classList.toggle('show');
  });
}

// ============ 事件绑定 ============
function bindEvents() {
  // 平台选择
  if (platformZxwBtn) {
    platformZxwBtn.addEventListener('click', () => selectPlatform('zxw'));
  }
  if (platformDnjyBtn) {
    platformDnjyBtn.addEventListener('click', () => selectPlatform('dnjy'));
  }
  if (platformAmeqpBtn) {
    platformAmeqpBtn.addEventListener('click', () => selectPlatform('ameqp'));
  }
  
  // 选择区域
  if (selectBtn) {
    selectBtn.addEventListener('click', onSelectArea);
  }
  
  // 开始阅卷
  if (startBtn) {
    startBtn.addEventListener('click', onStartReview);
  }
  
  // 停止阅卷
  if (stopBtn) {
    stopBtn.addEventListener('click', onStopReview);
  }
  
  // 单次阅卷
  if (singleBtn) {
    singleBtn.addEventListener('click', onSingleReview);
  }
  
  // 提示词变化
  if (promptInput) {
    promptInput.addEventListener('input', (e) => {
      chrome.storage.local.set({ lastPrompt: e.target.value });
    });
  }
  
  // 导出按钮
  if (exportBtn) {
    exportBtn.addEventListener('click', onExportRecords);
  }
  
  // 阅卷次数限制
  if (reviewLimitInput) {
    reviewLimitInput.addEventListener('change', (e) => {
      const limit = parseInt(e.target.value) || 0;
      chrome.storage.local.set({ reviewLimit: limit });
      updateReviewCount();  // 更新显示
      log('阅卷限制设置为:', limit);
    });
    reviewLimitInput.addEventListener('input', (e) => {
      updateReviewCount();  // 实时更新显示
    });
  }
  
  // 监听状态更新
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'status_update') {
      updateCurrentStatus(msg.message);
      appendLog(msg.message);
    }
    if (msg.action === 'ai_result') {
      updateAIResult(msg.result, msg.score);
      // 使用服务端的计数
      if (msg.totalCount !== undefined) {
        reviewCount = msg.totalCount;
      } else {
        reviewCount++;
      }
      updateReviewCount();
    }
  });
}

// ============ 配置加载 ============
function loadConfig() {
  chrome.storage.local.get(['selectedArea', 'lastPrompt', 'currentPlatform', 'reviewRecords', 'lastAIResult', 'reviewLimit'], (data) => {
    log('加载配置:', data);
    
    // 加载选择区域
    if (data.selectedArea) {
      selectedArea = data.selectedArea;
      updateAreaStatus(true);
    } else {
      selectedArea = null;
      updateAreaStatus(false);
    }
    
    // 加载提示词
    if (data.lastPrompt && promptInput) {
      promptInput.value = data.lastPrompt;
    } else if (promptInput) {
      // 默认提示词
      promptInput.value = '对图片中的学生答题内容进行识别与评分，核心评分规则：正确答案为 "人生观"，答案完全匹配则得 1 分，不匹配（含错别字、多字、少字、其他答案）均得 0 分。';
    }
    
    // 加载平台
    if (data.currentPlatform) {
      currentPlatform = data.currentPlatform;
    }
    updatePlatformButtons();
    
    // 加载阅卷次数限制
    if (reviewLimitInput) {
      reviewLimitInput.value = data.reviewLimit || 0;
    }
    
    // 从background获取当前记录数
    chrome.runtime.sendMessage({ action: 'get_records' }, (response) => {
      if (response && response.count !== undefined) {
        reviewCount = response.count;
        updateReviewCount();
      }
    });
    
    // 加载上次AI结果
    if (data.lastAIResult) {
      updateAIResult(data.lastAIResult.result, data.lastAIResult.score);
    }
  });
}

// ============ 平台选择 ============
function selectPlatform(platform) {
  currentPlatform = platform;
  chrome.storage.local.set({ currentPlatform });
  updatePlatformButtons();
  log('切换平台:', platform);
  
  // 通知background更新平台
  chrome.runtime.sendMessage({
    action: 'update_config',
    platform: platform
  });
  
  // 选择后自动折叠
  const platformSection = document.getElementById('platform-header')?.parentElement;
  const platformContent = document.getElementById('platform-content');
  platformSection?.classList.remove('expanded');
  platformContent?.classList.remove('show');
}

const PLATFORM_NAMES = {
  zxw: '智学网',
  dnjy: '懂你教育',
  ameqp: 'AMEQP'
};

function updatePlatformButtons() {
  if (platformZxwBtn) {
    platformZxwBtn.classList.toggle('active', currentPlatform === 'zxw');
  }
  if (platformDnjyBtn) {
    platformDnjyBtn.classList.toggle('active', currentPlatform === 'dnjy');
  }
  if (platformAmeqpBtn) {
    platformAmeqpBtn.classList.toggle('active', currentPlatform === 'ameqp');
  }
  
  if (currentPlatformText) {
    currentPlatformText.textContent = PLATFORM_NAMES[currentPlatform] || currentPlatform;
  }
}

// ============ 区域状态 ============
function updateAreaStatus(hasArea) {
  if (areaStatus) {
    if (hasArea) {
      areaStatus.textContent = '✓ 已选择';
      areaStatus.className = 'status success';
    } else {
      areaStatus.textContent = '未选择';
      areaStatus.className = 'status';
    }
  }
  if (selectBtn) {
    selectBtn.textContent = hasArea ? '重新选择区域' : '1. 选择阅卷区域';
  }
}

// ============ 选择区域 ============
async function onSelectArea() {
  log('开始选择区域...');
  updateCurrentStatus('请在页面上选择区域...');
  
  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      updateCurrentStatus('错误: 未找到活动标签页');
      return;
    }
    
    // 发送选择区域消息
    chrome.tabs.sendMessage(tab.id, { action: 'select_area' }, (response) => {
      if (chrome.runtime.lastError) {
        logError('发送消息失败:', chrome.runtime.lastError);
        updateCurrentStatus('请刷新页面后重试');
        return;
      }
      
      if (response && response.success) {
        selectedArea = response.area;
        updateAreaStatus(true);
        updateCurrentStatus('区域选择成功');
        log('区域选择完成:', response.area);
      } else {
        updateCurrentStatus(response?.error || '已取消');
      }
    });
    
  } catch (error) {
    logError('选择区域出错:', error);
    updateCurrentStatus('错误: ' + error.message);
  }
}

// ============ 开始阅卷 ============
async function onStartReview() {
  log('开始阅卷...');
  
  // 检查配置
  if (!selectedArea) {
    updateCurrentStatus('请先选择阅卷区域');
    return;
  }
  
  const prompt = promptInput?.value?.trim();
  if (!prompt) {
    updateCurrentStatus('请输入评分提示词');
    return;
  }
  
  // 获取阅卷次数限制
  const reviewLimit = parseInt(reviewLimitInput?.value) || 0;
  
  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      updateCurrentStatus('未找到活动标签页');
      return;
    }
    
    updateCurrentStatus('正在启动...');
    updateReviewStatus(true);
    
    // 发送开始阅卷消息给background
    chrome.runtime.sendMessage({
      action: 'start_review',
      config: {
        area: selectedArea,
        prompt: prompt,
        platform: currentPlatform,
        tabId: tab.id,
        limit: reviewLimit  // 传递阅卷次数限制
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        logError('启动阅卷失败:', chrome.runtime.lastError);
        updateCurrentStatus('启动失败');
        updateReviewStatus(false);
        return;
      }
      
      if (response && response.success) {
        const limitText = reviewLimit > 0 ? `（限制${reviewLimit}份）` : '';
        updateCurrentStatus(`自动阅卷中...${limitText}`);
        log('阅卷启动成功，限制:', reviewLimit);
      } else {
        updateCurrentStatus('启动失败: ' + (response?.error || '未知错误'));
        updateReviewStatus(false);
      }
    });
    
  } catch (error) {
    logError('开始阅卷出错:', error);
    updateCurrentStatus('错误: ' + error.message);
    updateReviewStatus(false);
  }
}

// ============ 停止阅卷 ============
function onStopReview() {
  log('停止阅卷...');
  
  chrome.runtime.sendMessage({ action: 'stop_review' }, (response) => {
    if (chrome.runtime.lastError) {
      logError('停止阅卷失败:', chrome.runtime.lastError);
      updateCurrentStatus('停止失败');
      return;
    }
    
    updateCurrentStatus('已停止');
    updateReviewStatus(false);
    log('阅卷停止成功');
  });
}

// ============ 单次阅卷 ============
async function onSingleReview() {
  log('执行单次阅卷...');
  
  // 检查配置
  if (!selectedArea) {
    updateCurrentStatus('请先选择阅卷区域');
    return;
  }
  
  const prompt = promptInput?.value?.trim();
  if (!prompt) {
    updateCurrentStatus('请输入评分提示词');
    return;
  }
  
  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      updateCurrentStatus('未找到活动标签页');
      return;
    }
    
    updateCurrentStatus('正在阅卷...');
    
    // 禁用按钮
    if (singleBtn) singleBtn.disabled = true;
    
    // 发送单次阅卷消息
    chrome.runtime.sendMessage({
      action: 'single_review',
      config: {
        area: selectedArea,
        prompt: prompt,
        platform: currentPlatform,
        tabId: tab.id
      }
    }, (response) => {
      // 重新启用按钮
      if (singleBtn) singleBtn.disabled = false;
      
      if (chrome.runtime.lastError) {
        logError('单次阅卷失败:', chrome.runtime.lastError);
        updateCurrentStatus('阅卷失败');
        return;
      }
      
      if (response && response.success) {
        updateAIResult(response.result, response.score);
        updateCurrentStatus('阅卷完成');
        reviewCount++;
        updateReviewCount();
        log('单次阅卷完成:', response);
      } else {
        updateCurrentStatus('失败: ' + (response?.error || '未知错误'));
      }
    });
    
  } catch (error) {
    logError('单次阅卷出错:', error);
    updateCurrentStatus('错误: ' + error.message);
    if (singleBtn) singleBtn.disabled = false;
  }
}

// ============ 状态管理 ============
function getReviewStatus() {
  chrome.runtime.sendMessage({ action: 'get_status' }, (response) => {
    if (chrome.runtime.lastError) {
      log('获取状态失败（可能是首次启动）');
      return;
    }
    
    if (response) {
      isReviewing = response.isActive;
      updateReviewStatus(response.isActive);
      
      if (response.selectedArea && !selectedArea) {
        selectedArea = response.selectedArea;
        updateAreaStatus(true);
      }
      
      if (response.platform) {
        currentPlatform = response.platform;
        updatePlatformButtons();
      }
    }
  });
}

function updateReviewStatus(active) {
  isReviewing = active;
  
  if (startBtn) {
    startBtn.disabled = active;
    startBtn.style.opacity = active ? '0.6' : '1';
  }
  
  if (stopBtn) {
    stopBtn.disabled = !active;
    stopBtn.style.opacity = active ? '1' : '0.6';
  }
  
  if (statusIndicator) {
    if (active) {
      statusIndicator.textContent = '● 阅卷中';
      statusIndicator.className = 'status-indicator active';
    } else {
      statusIndicator.textContent = '○ 已停止';
      statusIndicator.className = 'status-indicator';
    }
  }
}

// ============ UI更新函数 ============

// 更新当前状态
function updateCurrentStatus(text) {
  if (currentStatusSpan) {
    currentStatusSpan.textContent = text;
  }
  log('状态:', text);
}

// 更新阅卷计数
function updateReviewCount() {
  if (reviewCountSpan) {
    reviewCountSpan.textContent = reviewCount;
  }
  
  // 更新限制显示
  const limitDisplay = document.getElementById('review-limit-display');
  if (limitDisplay) {
    const limit = parseInt(reviewLimitInput?.value) || 0;
    if (limit > 0) {
      limitDisplay.textContent = ` / ${limit}`;
    } else {
      limitDisplay.textContent = '';
    }
  }
  
  chrome.storage.local.set({ reviewCount });
}

// 更新AI结果
function updateAIResult(result, score) {
  if (aiResultDiv) {
    aiResultDiv.textContent = result || '无结果';
    aiResultDiv.classList.add('has-result');
  }
  
  if (lastScoreBadge) {
    if (score !== undefined && score !== null) {
      lastScoreBadge.textContent = score + '分';
      lastScoreBadge.classList.add('has-score');
    } else {
      lastScoreBadge.textContent = '--';
      lastScoreBadge.classList.remove('has-score');
    }
  }
  
  // 保存到storage
  chrome.storage.local.set({
    lastAIResult: { result, score }
  });
}

// 追加日志
function appendLog(text) {
  if (resultDiv) {
    const time = new Date().toLocaleTimeString();
    resultDiv.textContent = `[${time}] ${text}\n` + resultDiv.textContent;
    // 限制日志长度
    if (resultDiv.textContent.length > 2000) {
      resultDiv.textContent = resultDiv.textContent.substring(0, 2000);
    }
  }
}

// 显示结果（兼容旧接口）
function showResult(text) {
  appendLog(text);
}

// ============ 导出功能 ============
async function onExportRecords() {
  log('导出阅卷记录...');
  
  // 从background获取记录
  chrome.runtime.sendMessage({ action: 'get_records' }, (response) => {
    if (chrome.runtime.lastError) {
      logError('获取记录失败:', chrome.runtime.lastError);
      updateCurrentStatus('获取记录失败');
      return;
    }
    
    const records = response?.records || [];
    const sessionStart = response?.sessionStartTime;
    
    if (records.length === 0) {
      updateCurrentStatus('暂无阅卷记录');
      alert('暂无阅卷记录可导出');
      return;
    }
    
    // 生成导出内容
    const exportContent = generateExportContent(records, sessionStart);
    
    // 创建下载
    downloadAsFile(exportContent, `阅卷记录_${formatDateForFilename(new Date())}.txt`);
    
    updateCurrentStatus(`已导出 ${records.length} 条记录`);
    log('导出完成，共', records.length, '条记录');
  });
}

// 生成导出内容
function generateExportContent(records, sessionStart) {
  const lines = [];
  
  // 标题
  lines.push('=' .repeat(50));
  lines.push('           香猫阅卷 - 阅卷记录导出');
  lines.push('='.repeat(50));
  lines.push('');
  
  // 统计信息
  const startTime = sessionStart ? new Date(sessionStart).toLocaleString() : '未知';
  const endTime = new Date().toLocaleString();
  lines.push(`开始时间: ${startTime}`);
  lines.push(`结束时间: ${endTime}`);
  lines.push(`总计阅卷: ${records.length} 份`);
  lines.push('');
  
  // 分数统计
  const scores = records.map(r => parseFloat(r.score) || 0);
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  
  lines.push(`平均分: ${avgScore}`);
  lines.push(`最高分: ${maxScore}`);
  lines.push(`最低分: ${minScore}`);
  lines.push('');
  lines.push('-'.repeat(50));
  lines.push('');
  
  // 详细记录
  lines.push('【详细阅卷记录】');
  lines.push('');
  
  records.forEach((record, index) => {
    lines.push(`第 ${record.index || index + 1} 份 [${record.time || ''}]`);
    lines.push(`  分数: ${record.score} 分`);
    lines.push(`  评分理由:`);
    // 将评分理由缩进显示
    const reasonLines = (record.reason || '无').split('\n');
    reasonLines.forEach(line => {
      lines.push(`    ${line}`);
    });
    lines.push('');
  });
  
  lines.push('-'.repeat(50));
  lines.push('导出时间: ' + new Date().toLocaleString());
  
  return lines.join('\n');
}

// 格式化日期用于文件名
function formatDateForFilename(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}`;
}

// 下载为文件
function downloadAsFile(content, filename) {
  // 添加BOM以支持中文
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  
  // 清理
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

log('Popup 脚本已加载');
