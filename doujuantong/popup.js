// 智能改卷插件 - 全面重构版本
// 功能：自动识别学生答题内容并评分，支持批量改卷

// 全局变量
let selectBtn, startBtn, stopBtn, promptInput, resultDiv, areaStatus, platformZxwBtn, platformDnjyBtn;
let selectedArea = null;
let currentPlatform = 'zxw'; // 默认智学网

// 自动阅卷控制
let autoReviewActive = false;

// 定时器管理
const timers = new Set();

// 截图节流控制
let lastCaptureTime = 0;
const MIN_CAPTURE_INTERVAL = 2000; // 截图最小间隔（毫秒）

// 题目配置
const questionConfigs = [
  {
    id: 1,
    type: 'fill',
    answer: '人生观',
    prompt: '对图片中的学生答题内容进行识别与评分，核心评分规则：正确答案为 "人生观"，答案完全匹配则得 1 分，不匹配（含错别字、多字、少字、其他答案）均得 0 分。'
  },
  {
    id: 2,
    type: 'fill',
    answer: '价值观',
    prompt: '对图片中的学生答题内容进行识别与评分，核心评分规则：正确答案为 "价值观"，答案完全匹配则得 1 分，不匹配（含错别字、多字、少字、其他答案）均得 0 分。'
  },
  {
    id: 3,
    type: 'fill',
    answer: '世界观',
    prompt: '对图片中的学生答题内容进行识别与评分，核心评分规则：正确答案为 "世界观"，答案完全匹配则得 1 分，不匹配（含错别字、多字、少字、其他答案）均得 0 分。'
  },
  {
    id: 4,
    type: 'choice',
    answer: 'B',
    prompt: '对图片中的学生答题内容进行识别与评分，核心评分规则：正确选项为 "B"，选择 B 得 2 分，否则得 0 分。'
  },
  {
    id: 5,
    type: 'choice',
    answer: 'C',
    prompt: '对图片中的学生答题内容进行识别与评分，核心评分规则：正确选项为 "C"，选择 C 得 2 分，否则得 0 分。'
  }
];

let currentQuestionIndex = 0;

// 初始化
window.addEventListener('DOMContentLoaded', () => {
  console.log('智能改卷插件初始化...');
  
  // 获取DOM元素
  selectBtn = document.getElementById('select-area');
  startBtn = document.getElementById('start-review');
  stopBtn = document.getElementById('stop-review');
  promptInput = document.getElementById('prompt');
  resultDiv = document.getElementById('result');
  areaStatus = document.getElementById('area-status');
  platformZxwBtn = document.getElementById('platform-zxw');
  platformDnjyBtn = document.getElementById('platform-dnjy');
  
  // 绑定事件
  bindEvents();
  
  // 加载配置
  loadConfig();
});

// 绑定事件
function bindEvents() {
  console.log('绑定事件...');
  
  // 平台选择按钮
  if (platformZxwBtn) {
    platformZxwBtn.addEventListener('click', () => {
      currentPlatform = 'zxw';
      chrome.storage.local.set({ currentPlatform });
      updatePlatformButtons();
      console.log('切换到智学网平台');
    });
  }
  
  if (platformDnjyBtn) {
    platformDnjyBtn.addEventListener('click', () => {
      currentPlatform = 'dnjy';
      chrome.storage.local.set({ currentPlatform });
      updatePlatformButtons();
      console.log('切换到懂你教育平台');
    });
  }
  
  // 选择区域按钮
  if (selectBtn) {
    selectBtn.addEventListener('click', selectArea);
  }
  
  // 开始阅卷按钮
  if (startBtn) {
    startBtn.addEventListener('click', startReview);
  }
  
  // 停止阅卷按钮
  if (stopBtn) {
    stopBtn.addEventListener('click', stopReview);
  }
  
  // 提示词输入框
  if (promptInput) {
    promptInput.addEventListener('input', (e) => {
      chrome.storage.local.set({lastPrompt: e.target.value});
      console.log('提示词已更新');
    });
  }
}

// 加载配置
function loadConfig() {
  console.log('加载配置...');
  
  chrome.storage.local.get(['selectedArea', 'lastPrompt', 'currentPlatform'], (data) => {
    // 加载选择区域
    if (data.selectedArea) {
      selectedArea = data.selectedArea;
      if (areaStatus) {
        areaStatus.textContent = '✔ 区域已选择';
        areaStatus.style.color = '#28a745';
      }
      if (selectBtn) {
        selectBtn.textContent = '重新选择区域';
      }
      console.log('加载选择区域:', data.selectedArea);
    } else {
      selectedArea = null;
      if (areaStatus) {
        areaStatus.textContent = '';
      }
      if (selectBtn) {
        selectBtn.textContent = '1. 选择阅卷区域';
      }
      console.log('未找到选择区域');
    }
    
    // 加载提示词
    if (data.lastPrompt && promptInput) {
      promptInput.value = data.lastPrompt;
      console.log('加载上次提示词:', data.lastPrompt);
    } else if (promptInput) {
      // 设置默认提示词
      const defaultPrompt = '对图片中的学生答题内容进行识别与评分，核心评分规则：正确答案为 "人生观"，答案完全匹配则得 1 分，不匹配（含错别字、多字、少字、其他答案）均得 0 分。';
      promptInput.value = defaultPrompt;
      console.log('使用默认提示词');
    }
    
    // 加载平台选择
    if (data.currentPlatform) {
      currentPlatform = data.currentPlatform;
      updatePlatformButtons();
      console.log('加载平台选择:', currentPlatform);
    }
  });
}

// 更新平台按钮状态
function updatePlatformButtons() {
  if (platformZxwBtn) {
    platformZxwBtn.classList.toggle('active', currentPlatform === 'zxw');
  }
  if (platformDnjyBtn) {
    platformDnjyBtn.classList.toggle('active', currentPlatform === 'dnjy');
  }
}

// 选择区域
function selectArea() {
  console.log('选择阅卷区域...');
  
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'select_area'}, () => {
        setTimeout(() => {
          console.log('区域选择完成，刷新状态...');
          loadConfig();
        }, 400);
      });
    } else {
      console.error('没有找到活动标签页');
      if (resultDiv) {
        resultDiv.textContent = '没有找到活动标签页';
      }
    }
  });
}

// 添加定时器
function addTimer(callback, delay) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    callback();
  }, delay);
  timers.add(timer);
  return timer;
}

// 清除所有定时器
function clearAllTimers() {
  console.log('清除所有定时器...');
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
}

// 检查是否可以截图
function canCapture() {
  const now = Date.now();
  if (now - lastCaptureTime < MIN_CAPTURE_INTERVAL) {
    console.log('截图过于频繁，等待最小间隔...');
    return false;
  }
  lastCaptureTime = now;
  return true;
}

// 停止阅卷
function stopReview() {
  console.log('停止阅卷...');
  
  // 清除所有定时器
  clearAllTimers();
  
  // 停止自动阅卷
  autoReviewActive = false;
  
  // 显示停止信息
  if (resultDiv) {
    resultDiv.textContent = '阅卷已停止';
  }
  
  // 重置截图节流状态
  lastCaptureTime = 0;
  
  console.log('阅卷已成功停止');
}

// 裁剪图片
function cropImage(dataUrl, area) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
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
          
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          console.error('裁剪图片失败:', error);
          reject(error);
        }
      };
      
      img.onerror = function() {
        console.error('加载图片失败');
        reject(new Error('加载图片失败'));
      };
      
      img.src = dataUrl;
    } catch (error) {
      console.error('裁剪图片初始化失败:', error);
      reject(error);
    }
  });
}

// 调用豆包API进行评分
async function callDoubaoAPI(prompt, imageUrl) {
  try {
    console.log('调用豆包API进行评分...');
    
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
    
    const result = await response.json();
    console.log('豆包API返回结果:', result);
    return result;
  } catch (error) {
    console.error('调用豆包API失败:', error);
    return null;
  }
}

// 从AI响应中提取分数
function extractScore(text) {
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*分?/);
  if (match) {
    const score = match[1];
    console.log('提取到分数:', score);
    return score;
  }
  console.error('无法从响应中提取分数:', text);
  return null;
}

// 执行填分和提交操作
function executeFillScoreAndSubmit(score, tabId) {
  console.log('执行填分和提交操作，分数:', score);
  
  // 检查自动阅卷状态
  if (!autoReviewActive) {
    console.log('自动阅卷已停止，跳过提交操作');
    return;
  }
  
  try {
    // 定义要在页面中执行的函数
    function fillScoreAndSubmitOnPage(score) {
      console.log('在页面中执行填分和提交操作，分数:', score);
      
      // 1. 找到分数输入框
      const input = document.querySelector('input.el-input__inner[placeholder="得分"]');
      if (input) {
        input.value = score;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('填充分数输入框:', score);
      } else {
        console.error('未找到分数输入框');
      }
      
      // 2. 找到提交按钮并点击
      console.log('寻找提交按钮...');
      
      // 尝试多种选择器
      let btn = null;
      
      // 选择器1: 精确选择器
      btn = document.querySelector('button.el-button.el-button--primary.el-button--small');
      if (!btn) {
        // 选择器2: 宽松选择器
        btn = document.querySelector('button.el-button.el-button--primary');
      }
      if (!btn) {
        // 选择器3: 基于文本内容
        const allButtons = Array.from(document.querySelectorAll('button'));
        btn = allButtons.find(button => 
          button.textContent.includes('提交') || 
          button.textContent.includes('确定') || 
          button.textContent.includes('保存')
        );
      }
      
      if (btn) {
        console.log('找到提交按钮:', btn.textContent);
        
        // 检查按钮状态
        const isVisible = btn.offsetWidth > 0 && btn.offsetHeight > 0;
        console.log('按钮是否可见:', isVisible);
        
        const isDisabled = btn.disabled || btn.hasAttribute('disabled');
        console.log('按钮是否禁用:', isDisabled);
        
        // 启用禁用的按钮
        if (isDisabled) {
          btn.disabled = false;
          btn.removeAttribute('disabled');
          console.log('已启用禁用的按钮');
        }
        
        // 模拟点击事件
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        btn.dispatchEvent(clickEvent);
        
        // 直接调用click方法
        btn.click();
        
        console.log('点击提交按钮');
      } else {
        console.error('未找到提交按钮');
        // 列出所有按钮供调试
        const allButtons = document.querySelectorAll('button');
        console.log('页面上的所有按钮:', allButtons.length);
        allButtons.forEach((button, index) => {
          console.log(`按钮 ${index}:`, button.textContent, button.className);
        });
      }
    }
    
    // 执行脚本
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      function: fillScoreAndSubmitOnPage,
      args: [score]
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('执行脚本失败:', chrome.runtime.lastError);
        return;
      }
      
      console.log('脚本执行成功');
      
      // 提交后等待2秒，然后点击下一份
      if (autoReviewActive) {
        addTimer(() => {
          if (!autoReviewActive) return;
          
          console.log('点击下一份按钮...');
          
          try {
            chrome.scripting.executeScript({
              target: {tabId: tabId},
              function: () => {
                // 找到下一份按钮
                const nextButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
                  btn.textContent.includes('下一份') || btn.textContent.includes('下一个')
                );
                if (nextButtons.length > 0) {
                  const nextBtn = nextButtons[0];
                  console.log('找到下一份按钮:', nextBtn);
                  nextBtn.click();
                  console.log('点击下一份按钮');
                } else {
                  console.error('未找到下一份按钮');
                }
              }
            }, () => {
              if (chrome.runtime.lastError) {
                console.error('点击下一份按钮失败:', chrome.runtime.lastError);
                return;
              }
              
              console.log('下一份按钮点击成功');
              
              // 等待1秒后开始下一题
              if (autoReviewActive) {
                addTimer(() => {
                  if (!autoReviewActive) return;
                  
                  // 切换到下一题
                  currentQuestionIndex = (currentQuestionIndex + 1) % questionConfigs.length;
                  console.log('切换到下一题:', currentQuestionIndex + 1);
                  
                  // 再次开始阅卷
                  startReview();
                }, 1000);
              }
            });
          } catch (error) {
            console.error('点击下一份按钮时出错:', error);
            
            // 出错时直接切换到下一题
            if (autoReviewActive) {
              currentQuestionIndex = (currentQuestionIndex + 1) % questionConfigs.length;
              console.log('出错，直接切换到下一题:', currentQuestionIndex + 1);
              startReview();
            }
          }
        }, 2000);
      }
    });
  } catch (error) {
    console.error('执行填分和提交操作时出错:', error);
  }
}

// 开始阅卷
function startReview() {
  console.log('开始阅卷...');
  
  // 检查自动阅卷状态
  if (!autoReviewActive) {
    console.log('自动阅卷已停止，退出...');
    return;
  }
  
  // 检查是否选择了区域
  if (!selectedArea) {
    console.error('未选择阅卷区域');
    if (resultDiv) {
      resultDiv.textContent = '请先选择阅卷区域';
    }
    return;
  }
  
  // 获取当前题目配置
  const currentConfig = questionConfigs[currentQuestionIndex];
  if (!currentConfig) {
    console.error('所有题目已完成');
    if (resultDiv) {
      resultDiv.textContent = '所有题目已完成';
    }
    return;
  }
  
  // 获取提示词
  const prompt = promptInput ? promptInput.value.trim() : '';
  if (!prompt) {
    console.error('未输入评分提示词');
    if (resultDiv) {
      resultDiv.textContent = '请输入评分提示词';
    }
    return;
  }
  
  console.log('当前题目:', currentConfig.id, '提示词:', prompt);
  
  // 显示处理信息
  if (resultDiv) {
    resultDiv.textContent = `正在处理第${currentConfig.id}题...`;
  }
  
  // 获取活动标签页
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || tabs.length === 0) {
      console.error('未找到活动标签页');
      if (resultDiv) {
        resultDiv.textContent = '未找到活动标签页';
      }
      return;
    }
    
    const tabId = tabs[0].id;
    console.log('找到活动标签页:', tabId);
    
    // 检查是否可以截图
    if (!canCapture()) {
      console.log('截图过于频繁，等待后重试...');
      if (autoReviewActive) {
        addTimer(startReview, MIN_CAPTURE_INTERVAL);
      }
      return;
    }
    
    // 再次检查自动阅卷状态
    if (!autoReviewActive) {
      console.log('自动阅卷已停止，退出...');
      if (resultDiv) {
        resultDiv.textContent = '阅卷已停止';
      }
      return;
    }
    
    // 截图
    console.log('开始截图...');
    chrome.tabs.captureVisibleTab(null, {format: 'png'}, (dataUrl) => {
      // 检查自动阅卷状态
      if (!autoReviewActive) {
        console.log('自动阅卷已停止，退出...');
        return;
      }
      
      if (chrome.runtime.lastError) {
        console.error('截图失败:', chrome.runtime.lastError);
        if (resultDiv) {
          resultDiv.textContent = '截图失败，请重试';
        }
        
        // 重试截图
        if (autoReviewActive) {
          addTimer(startReview, MIN_CAPTURE_INTERVAL);
        }
        return;
      }
      
      if (!dataUrl) {
        console.error('截图返回空数据');
        if (resultDiv) {
          resultDiv.textContent = '截图失败，请重试';
        }
        
        // 重试截图
        if (autoReviewActive) {
          addTimer(startReview, MIN_CAPTURE_INTERVAL);
        }
        return;
      }
      
      console.log('截图成功，开始裁剪...');
      
      // 裁剪图片
      cropImage(dataUrl, selectedArea).then(croppedUrl => {
        // 检查自动阅卷状态
        if (!autoReviewActive) {
          console.log('自动阅卷已停止，退出...');
          return;
        }
        
        console.log('图片裁剪成功，开始智能评分...');
        
        if (resultDiv) {
          resultDiv.textContent = '正在智能评分...';
        }
        
        // 调用豆包API进行评分
        callDoubaoAPI(prompt, croppedUrl).then(apiResult => {
          // 检查自动阅卷状态
          if (!autoReviewActive) {
            console.log('自动阅卷已停止，退出...');
            return;
          }
          
          if (!apiResult || !apiResult.choices || !apiResult.choices[0]) {
            console.error('API返回无效结果:', apiResult);
            if (resultDiv) {
              resultDiv.textContent = '评分失败，请重试';
            }
            return;
          }
          
          // 处理API返回结果
          const msg = apiResult.choices[0].message;
          let text = '';
          
          if (Array.isArray(msg.content)) {
            text = msg.content.map(item => item.text || '').join('\n');
          } else if (typeof msg.content === 'string') {
            text = msg.content;
          } else {
            text = JSON.stringify(msg.content);
          }
          
          console.log('AI评分结果:', text);
          
          if (resultDiv) {
            resultDiv.textContent = text || '评分完成';
          }
          
          // 提取分数
          const score = extractScore(text);
          if (!score) {
            console.error('无法提取分数，跳过提交操作');
            if (resultDiv) {
              resultDiv.textContent = '未识别到分数，请重试';
            }
            return;
          }
          
          console.log('提取到分数:', score);
          
          // 如果分数为0，重新分析
          if (parseFloat(score) === 0) {
            console.log('分数为0，重新分析...');
            
            const reAnalyzePrompt = `请仔细检查图片中的学生答题内容，${prompt.replace('对图片中的学生答题内容进行识别与评分，核心评分规则：', '')}请重新分析并给出准确的分数。`;
            
            callDoubaoAPI(reAnalyzePrompt, croppedUrl).then(reApiResult => {
              // 检查自动阅卷状态
              if (!autoReviewActive) {
                console.log('自动阅卷已停止，退出...');
                return;
              }
              
              if (!reApiResult || !reApiResult.choices || !reApiResult.choices[0]) {
                console.error('重新分析API返回无效结果:', reApiResult);
                if (resultDiv) {
                  resultDiv.textContent = '重新分析失败，请重试';
                }
                return;
              }
              
              // 处理重新分析结果
              const reMsg = reApiResult.choices[0].message;
              let reText = '';
              
              if (Array.isArray(reMsg.content)) {
                reText = reMsg.content.map(item => item.text || '').join('\n');
              } else if (typeof reMsg.content === 'string') {
                reText = reMsg.content;
              } else {
                reText = JSON.stringify(reMsg.content);
              }
              
              console.log('重新分析结果:', reText);
              
              // 提取重新分析的分数
              const reScore = extractScore(reText);
              if (!reScore) {
                console.error('无法从重新分析中提取分数，使用原分数:', score);
                executeFillScoreAndSubmit(score, tabId);
                return;
              }
              
              console.log('重新分析后提取的分数:', reScore);
              
              // 执行填分和提交操作
              executeFillScoreAndSubmit(reScore, tabId);
            }).catch(error => {
              console.error('重新分析失败:', error);
              if (resultDiv) {
                resultDiv.textContent = '重新分析失败，请重试';
              }
            });
          } else {
            // 分数不为0，直接提交
            executeFillScoreAndSubmit(score, tabId);
          }
        }).catch(error => {
          console.error('调用API评分失败:', error);
          if (resultDiv) {
            resultDiv.textContent = '评分失败，请重试';
          }
        });
      }).catch(error => {
        console.error('裁剪图片失败:', error);
        if (resultDiv) {
          resultDiv.textContent = '截图失败，请重试';
        }
        
        // 重试
        if (autoReviewActive) {
          addTimer(startReview, MIN_CAPTURE_INTERVAL);
        }
      });
    });
  });
}

// 监听自动开始阅卷消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'auto_start_review') {
    console.log('收到自动开始阅卷消息');
    
    // 启动自动阅卷
    if (!autoReviewActive) {
      autoReviewActive = true;
      console.log('启动自动阅卷');
    }
    
    // 点击开始按钮
    if (startBtn) {
      startBtn.click();
    }
  }
});

// 初始化自动阅卷状态
function initAutoReview() {
  console.log('初始化自动阅卷状态...');
  autoReviewActive = false;
  clearAllTimers();
  lastCaptureTime = 0;
}

// 页面加载完成后初始化
window.addEventListener('load', initAutoReview);