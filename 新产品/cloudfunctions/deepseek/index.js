// 云函数入口文件 - DeepSeek AI 调用
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// DeepSeek API 配置
const DEEPSEEK_API_KEY = 'sk-23a92b2e65554e3abc0073d48793770f';
const DEEPSEEK_API_HOST = 'api.deepseek.com';
const DEEPSEEK_API_PATH = '/chat/completions';

/**
 * 使用 Node.js 原生 https 模块调用 DeepSeek API
 */
function callDeepSeekAPI(messages) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      temperature: 0.8,
      max_tokens: 800,
    });

    const options = {
      hostname: DEEPSEEK_API_HOST,
      port: 443,
      path: DEEPSEEK_API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 30000, // 30秒超时
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            resolve(parsed.choices[0].message.content);
          } else if (parsed.error) {
            reject(new Error(`DeepSeek API 错误: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          } else {
            reject(new Error('DeepSeek API 返回格式异常'));
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}, 原始数据: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`请求失败: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时(30s)'));
    });

    req.write(postData);
    req.end();
  });
}

// 云函数入口
exports.main = async (event, context) => {
  const { messages } = event;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      success: false,
      error: '缺少有效的 messages 参数',
    };
  }

  try {
    console.log(`[DeepSeek] 调用开始, 消息条数: ${messages.length}`);
    const reply = await callDeepSeekAPI(messages);
    console.log(`[DeepSeek] 调用成功, 回复长度: ${reply.length}`);
    
    return {
      success: true,
      reply: reply,
    };
  } catch (err) {
    console.error('[DeepSeek] 调用失败:', err.message);
    return {
      success: false,
      error: err.message,
    };
  }
};
