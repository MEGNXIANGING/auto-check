// utils.js - 工具函数库（预留扩展）

/**
 * 上传图片到图床，返回公网URL
 * 如果豆包API需要公网URL而非base64，可以实现此功能
 * 
 * @param {string} base64Data - base64编码的图片数据
 * @returns {Promise<string>} 图片公网URL
 */
async function uploadImage(base64Data) {
  // TODO: 如果需要，实现上传逻辑
  // 支持的图床服务：
  // - sm.ms
  // - 阿里云OSS
  // - 腾讯云COS
  // - 七牛云
  
  throw new Error('图片上传功能未实现');
}

/**
 * 延迟执行
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数
 * @param {Function} fn - 要执行的异步函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delayMs - 重试间隔
 * @returns {Promise<any>}
 */
async function retry(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await delay(delayMs);
      }
    }
  }
  throw lastError;
}

/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} wait - 等待时间
 * @returns {Function}
 */
function debounce(fn, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * 节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} limit - 时间限制
 * @returns {Function}
 */
function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// 导出（如果在模块环境中使用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    uploadImage,
    delay,
    retry,
    debounce,
    throttle
  };
}
