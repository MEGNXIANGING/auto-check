// background.js - 负责全局状态管理、截图和阅卷循环控制

// ============ 全局状态 ============
let reviewState = {
  isActive: false,           // 是否正在阅卷
  selectedArea: null,        // 选定的阅卷区域
  prompt: '',                // 评分提示词
  platform: 'zxw',           // 当前平台: zxw(智学网) / dnjy(懂你教育)
  currentTabId: null,        // 当前操作的标签页ID
  lastCaptureTime: 0,        // 上次截图时间
  retryCount: 0,             // 重试次数
  maxRetries: 3              // 最大重试次数
};

// 阅卷记录
let reviewRecords = [];
let sessionStartTime = null;

const MIN_CAPTURE_INTERVAL = 2000; // 截图最小间隔（毫秒）
const SUBMIT_DELAY = 3000;         // 提交后等待时间（包含弹窗处理）
const NEXT_PAGE_DELAY = 2000;      // 切换下一份的等待时间

// ============ 工具函数 ============

// 日志函数
function log(...args) {
  console.log('[香猫阅卷-BG]', ...args);
}

function logError(...args) {
  console.error('[香猫阅卷-BG]', ...args);
}

// 检查是否可以截图（节流控制）
function canCapture() {
  const now = Date.now();
  if (now - reviewState.lastCaptureTime < MIN_CAPTURE_INTERVAL) {
    log('截图过于频繁，等待中...');
    return false;
  }
  reviewState.lastCaptureTime = now;
  return true;
}

// 延迟执行
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ 截图功能 ============

// 截取指定标签页
async function captureVisibleTab(tabId) {
  return new Promise((resolve, reject) => {
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
  });
}

// 裁剪图片（在offscreen或通过content script执行）
async function cropImage(tabId, dataUrl, area) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, {
      action: 'crop_image',
      dataUrl: dataUrl,
      area: area
    }, (response) => {
      if (chrome.runtime.lastError) {
        logError('裁剪图片通信失败:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response && response.croppedUrl) {
        log('图片裁剪成功');
        resolve(response.croppedUrl);
      } else {
        logError('裁剪图片失败:', response?.error);
        reject(new Error(response?.error || '裁剪图片失败'));
      }
    });
  });
}

// ============ AI API 调用 ============

async function callDoubaoAPI(prompt, imageUrl) {
  log('调用豆包API进行评分...');
  
  try {
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fe53fa2f-888e-46ca-b316-0f26a9d6c217'
      },
      body: JSON.stringify({
        model: 'doubao-seed-1-6-250615',
        messages: [
          {
            content: [
              { text: prompt, type: 'text' },
              { image_url: { url: imageUrl }, type: 'image_url' }
            ],
            role: 'user'
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }
    
    const result = await response.json();
    log('API返回结果:', result);
    return result;
  } catch (error) {
    logError('调用豆包API失败:', error);
    throw error;
  }
}

// 从AI响应中提取分数
function extractScore(text) {
  // 尝试多种匹配模式
  const patterns = [
    /得分[：:]\s*([0-9]+(?:\.[0-9]+)?)/,
    /分数[：:]\s*([0-9]+(?:\.[0-9]+)?)/,
    /([0-9]+(?:\.[0-9]+)?)\s*分/,
    /\b([0-9]+(?:\.[0-9]+)?)\b/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const score = match[1];
      log('提取到分数:', score);
      return score;
    }
  }
  
  logError('无法从响应中提取分数:', text);
  return null;
}

// ============ 阅卷流程控制 ============

// 执行单次阅卷
async function executeReviewCycle() {
  if (!reviewState.isActive) {
    log('阅卷已停止，退出循环');
    return;
  }
  
  log('执行阅卷周期...');
  
  try {
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
      await delay(MIN_CAPTURE_INTERVAL);
      if (!reviewState.isActive) return;
    }
    
    // 4. 截图（指定目标标签页）
    const fullScreenshot = await captureVisibleTab(reviewState.currentTabId);
    if (!reviewState.isActive) return;
    
    // 5. 裁剪图片
    broadcastStatus('正在裁剪图片...');
    const croppedImage = await cropImage(
      reviewState.currentTabId, 
      fullScreenshot, 
      reviewState.selectedArea
    );
    if (!reviewState.isActive) return;
    
    // 6. 调用AI评分
    broadcastStatus('正在AI评分...');
    const apiResult = await callDoubaoAPI(reviewState.prompt, croppedImage);
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
    
    // 广播AI结果给popup显示
    broadcastAIResult(responseText, score);
    broadcastStatus(`识别分数: ${score}分`);
    
    // 9. 填分并提交
    broadcastStatus(`填入分数: ${score}，提交中...`);
    await fillScoreAndSubmit(reviewState.currentTabId, score);
    if (!reviewState.isActive) return;
    
    // 10. 重置重试计数
    reviewState.retryCount = 0;
    
    // 11. 等待后点击下一份
    broadcastStatus('提交成功，准备下一份...');
    await delay(SUBMIT_DELAY);
    if (!reviewState.isActive) return;
    
    await clickNextButton(reviewState.currentTabId);
    if (!reviewState.isActive) return;
    
    // 12. 等待页面加载后继续下一轮
    await delay(NEXT_PAGE_DELAY);
    if (!reviewState.isActive) return;
    
    // 继续下一轮
    executeReviewCycle();
    
  } catch (error) {
    logError('阅卷出错:', error);
    broadcastStatus('错误: ' + error.message);
    
    // 重试逻辑
    if (reviewState.isActive && reviewState.retryCount < reviewState.maxRetries) {
      reviewState.retryCount++;
      log(`重试第 ${reviewState.retryCount} 次...`);
      broadcastStatus(`重试第 ${reviewState.retryCount} 次...`);
      await delay(MIN_CAPTURE_INTERVAL);
      if (reviewState.isActive) {
        executeReviewCycle();
      }
    } else if (reviewState.isActive) {
      broadcastStatus('多次重试失败，阅卷已停止');
      stopReview();
    }
  }
}

// 填分并提交
async function fillScoreAndSubmit(tabId, score) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, {
      action: 'fill_score_and_submit',
      score: score,
      platform: reviewState.platform
    }, (response) => {
      if (chrome.runtime.lastError) {
        logError('填分通信失败:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response && response.success) {
        log('填分提交成功');
        resolve();
      } else {
        logError('填分提交失败:', response?.error);
        reject(new Error(response?.error || '填分提交失败'));
      }
    });
  });
}

// 点击下一份按钮
async function clickNextButton(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, {
      action: 'click_next',
      platform: reviewState.platform
    }, (response) => {
      if (chrome.runtime.lastError) {
        logError('点击下一份通信失败:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response && response.success) {
        log('点击下一份成功');
        resolve();
      } else {
        logError('点击下一份失败:', response?.error);
        reject(new Error(response?.error || '点击下一份失败'));
      }
    });
  });
}

// 开始阅卷
async function startReview(config) {
  log('开始阅卷，配置:', config);
  
  // 更新状态
  reviewState.isActive = true;
  reviewState.selectedArea = config.area;
  reviewState.prompt = config.prompt;
  reviewState.platform = config.platform || 'zxw';
  reviewState.currentTabId = config.tabId;
  reviewState.retryCount = 0;
  reviewState.lastCaptureTime = 0;
  
  // 清空阅卷记录，开始新的阅卷会话
  reviewRecords = [];
  sessionStartTime = new Date();
  
  // 保存配置到storage
  chrome.storage.local.set({
    selectedArea: config.area,
    lastPrompt: config.prompt,
    currentPlatform: config.platform
  });
  
  // 开始阅卷循环
  executeReviewCycle();
  
  return { success: true };
}

// 停止阅卷
function stopReview() {
  log('停止阅卷');
  reviewState.isActive = false;
  broadcastStatus('阅卷已停止');
  return { success: true };
}

// 获取当前状态
function getStatus() {
  return {
    isActive: reviewState.isActive,
    selectedArea: reviewState.selectedArea,
    prompt: reviewState.prompt,
    platform: reviewState.platform
  };
}

// 广播状态给popup
function broadcastStatus(message) {
  log('广播状态:', message);
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
  
  // 保存记录到storage
  chrome.storage.local.set({
    reviewRecords: reviewRecords,
    sessionStartTime: sessionStartTime?.toISOString()
  });
  
  chrome.runtime.sendMessage({
    action: 'ai_result',
    result: result,
    score: score,
    totalCount: reviewRecords.length
  }).catch(() => {
    // popup可能已关闭，忽略错误
  });
  
  // 同时保存到storage，以便popup重新打开时能读取
  chrome.storage.local.set({
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
      sendResponse(stopReview());
      return false;
    
    case 'get_status':
      // 获取状态
      sendResponse(getStatus());
      return false;
    
    case 'get_records':
      // 获取阅卷记录
      sendResponse({
        records: reviewRecords,
        sessionStartTime: sessionStartTime?.toISOString(),
        count: reviewRecords.length
      });
      return false;
    
    case 'clear_records':
      // 清空阅卷记录
      reviewRecords = [];
      sessionStartTime = null;
      chrome.storage.local.remove(['reviewRecords', 'sessionStartTime']);
      sendResponse({ success: true });
      return false;
    
    case 'update_config':
      // 更新配置
      if (msg.area) reviewState.selectedArea = msg.area;
      if (msg.prompt) reviewState.prompt = msg.prompt;
      if (msg.platform) reviewState.platform = msg.platform;
      sendResponse({ success: true });
      return false;
    
    case 'single_review':
      // 单次阅卷（手动触发）
      if (reviewState.isActive) {
        sendResponse({ success: false, error: '阅卷正在进行中' });
        return false;
      }
      
      // 临时启动单次阅卷
      reviewState.isActive = true;
      reviewState.selectedArea = msg.config.area;
      reviewState.prompt = msg.config.prompt;
      reviewState.platform = msg.config.platform || 'zxw';
      reviewState.currentTabId = msg.config.tabId;
      
      // 执行单次阅卷后停止
      (async () => {
        try {
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
          const apiResult = await callDoubaoAPI(reviewState.prompt, croppedImage);
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

// 监听标签页关闭，停止相关阅卷
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === reviewState.currentTabId) {
    log('目标标签页已关闭，停止阅卷');
    stopReview();
  }
});

log('香猫阅卷 Background Service Worker 已启动');
