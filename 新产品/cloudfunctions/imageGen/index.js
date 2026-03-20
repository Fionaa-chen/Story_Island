// 云函数入口文件 - AI 文生图（硅基流动 SiliconFlow Kolors 插画风模型）
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ====== 硅基流动 SiliconFlow API 配置（Kwai-Kolors 插画风文生图）======
// Kwai-Kolors/Kolors: 快手可图大模型，中文 prompt 友好，插画/国风/动漫效果出色
// 注意：请在 https://cloud.siliconflow.cn 注册并获取 API Key
const SILICONFLOW_API_KEY = 'sk-nuyvqwhnsmigkrpvbxbhpnsqezgzwpytrjzziffppzkkuwfy';
const SILICONFLOW_API_HOST = 'api.siliconflow.cn';
const SILICONFLOW_API_PATH = '/v1/images/generations';

// Kolors 模型 - 适合插画/漫画/国风，支持中文 prompt、negative_prompt、guidance_scale
const KOLORS_MODEL = 'Kwai-Kolors/Kolors';

// 通用 negative prompt，排除低质量和写实风格，保持插画感
const DEFAULT_NEGATIVE_PROMPT = 'ugly, blurry, low quality, deformed hands, extra fingers, realistic photo, 3D render, photorealistic, oversaturated, watermark, text, logo';

/**
 * 调用硅基流动 Kolors 文生图 API
 * @param {string} prompt - 图片描述（中文/英文均可，中文效果更好）
 * @param {object} options - 可选配置
 * @param {string} options.size - 图片尺寸，默认 1024x1024
 * @param {number} options.guidance_scale - prompt 引导强度，越高越贴合描述，建议 5-7，默认 6
 * @param {number} options.steps - 推理步数，Kolors 建议 25，默认 25
 * @param {string} options.negative_prompt - 反向提示词，排除不想要的元素
 * @param {number} options.batch_size - 一次生成几张，1-4，默认 1
 * @param {number} options.seed - 随机种子，不传则由服务端随机（需 >= 0）
 * @returns {Promise<string>} - 图片 URL
 */
function callKolorsAPI(prompt, options = {}) {
  const imageSize = options.size || '1024x1024';
  const guidanceScale = options.guidance_scale || 6;
  const steps = options.steps || 25;
  const negativePrompt = options.negative_prompt || DEFAULT_NEGATIVE_PROMPT;
  const batchSize = options.batch_size || 1;
  const seed = (options.seed !== undefined && options.seed >= 0) ? options.seed : undefined;

  return new Promise((resolve, reject) => {
    const postBody = {
      model: KOLORS_MODEL,
      prompt: prompt,
      negative_prompt: negativePrompt,
      image_size: imageSize,
      num_inference_steps: steps,
      guidance_scale: guidanceScale,
      batch_size: batchSize,
    };
    // 只有明确指定了合法 seed 时才传入（SiliconFlow 要求 seed >= 0）
    if (seed !== undefined) {
      postBody.seed = seed;
    }
    const postData = JSON.stringify(postBody);

    const reqOptions = {
      hostname: SILICONFLOW_API_HOST,
      port: 443,
      path: SILICONFLOW_API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 90000, // 90秒超时（Kolors 推理时间较长）
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // SiliconFlow 返回格式: { images: [{ url: "..." }], timings: {...}, seed: ... }
          if (parsed.images && parsed.images[0] && parsed.images[0].url) {
            resolve(parsed.images[0].url);
          } else if (parsed.error || parsed.message) {
            reject(new Error(`Kolors API 错误: ${parsed.error || parsed.message || JSON.stringify(parsed)}`));
          } else {
            reject(new Error('Kolors API 返回格式异常: ' + data.substring(0, 200)));
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`请求失败: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时(90s)'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 使用 DeepSeek 生成图片描述 Prompt
 */
function callDeepSeekForPrompts(messages) {
  return new Promise((resolve, reject) => {
    const DEEPSEEK_API_KEY = 'sk-23a92b2e65554e3abc0073d48793770f';

    const postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const options = {
      hostname: 'api.deepseek.com',
      port: 443,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            resolve(parsed.choices[0].message.content);
          } else {
            reject(new Error('DeepSeek API 返回异常'));
          }
        } catch (e) {
          reject(new Error(`解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`请求失败: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('超时')); });
    req.write(postData);
    req.end();
  });
}

/**
 * 云函数入口
 * 
 * 模式1: generatePrompts - 根据剧情生成4个场景描述（由前端调用）
 * 模式2: generateImage - 根据单个描述生成一张图片
 * 模式3: generateRoundImage - 每轮对话实时生成一张图片（新方案）
 */
exports.main = async (event, context) => {
  const { action, storySummary, bookTitle, sceneName, roleName, endingTitle, prompt, style, roundIndex } = event;

  // ====== 插画/漫画风格 Prompt 前缀 ======
  // Kolors 对中文 prompt 理解极佳，使用中文风格描述增强插画效果
  const ILLUSTRATION_STYLE = '精美插画风格，故事绘本画风，色彩丰富明亮，手绘感，柔和温暖的光线，梦幻氛围，';

  // ====== 模式3：每轮对话实时生成单张场景图（带重试） ======
  if (action === 'generateRoundImage') {
    if (!prompt) {
      return { success: false, error: '缺少 prompt 参数' };
    }

    const maxRetry = 2; // 最多尝试2次（1次原始 + 1次重试）
    const bookContext = bookTitle ? `来自《${bookTitle}》的场景，` : '';
    const roleContext = roleName ? `角色${roleName}，` : '';
    const enhancedPrompt = `${ILLUSTRATION_STYLE}${bookContext}${roleContext}${prompt}`;

    for (let attempt = 0; attempt < maxRetry; attempt++) {
      try {
        console.log(`[ImageGen] 第${roundIndex || '?'}轮实时生图(Kolors), 第${attempt + 1}次尝试, prompt: ${prompt.substring(0, 60)}...`);
        
        const imageUrl = await callKolorsAPI(enhancedPrompt, {
          size: '1024x1024',
          guidance_scale: 6,
          steps: 25,
        });
        console.log(`[ImageGen] 第${roundIndex || '?'}轮图片生成成功(Kolors)`);
        
        return {
          success: true,
          imageUrl: imageUrl,
          roundIndex: roundIndex,
        };
      } catch (err) {
        console.error(`[ImageGen] 第${roundIndex || '?'}轮 第${attempt + 1}次尝试失败:`, err.message);
        if (attempt < maxRetry - 1) {
          // 重试前等待2秒
          await new Promise(r => setTimeout(r, 2000));
          console.log(`[ImageGen] 第${roundIndex || '?'}轮 2秒后重试...`);
        } else {
          return {
            success: false,
            error: err.message,
            roundIndex: roundIndex,
          };
        }
      }
    }
  }

  // ====== 模式1：生成4个场景的图片描述 ======
  if (action === 'generatePrompts') {
    try {
      console.log('[ImageGen] 开始生成场景描述...');
      const systemMsg = {
        role: 'system',
        content: `你是一个专业的AI绘画提示词工程师。用户会给你一段互动故事的剧情摘要，你需要提取其中4个最关键、最有画面感的场景，为每个场景生成一段英文绘画描述（prompt）。

要求：
1. 输出严格的JSON数组格式，包含4个对象
2. 每个对象有 title（中文场景标题，4-8字）和 prompt（英文绘画描述，80词以内）
3. prompt 要包含：场景、人物外观、动作、氛围、光线、艺术风格
4. 风格统一为：digital illustration, storybook style, warm lighting, cinematic composition
5. 4个场景按时间顺序排列，覆盖起承转合
6. 不要输出任何多余文字，只输出JSON数组

示例输出格式：
[
  {"title":"蟠桃园偷桃","prompt":"A mischievous monkey king sneaking through a magical peach garden..."},
  {"title":"天兵围剿","prompt":"An army of heavenly soldiers..."},
  {"title":"大闹天宫","prompt":"A fierce battle in the celestial palace..."},
  {"title":"齐天大圣","prompt":"A victorious monkey king standing atop clouds..."}
]`
      };

      const userMsg = {
        role: 'user',
        content: `书名：${bookTitle}
场景：${sceneName}
角色：${roleName}
结局：${endingTitle}

剧情摘要：
${storySummary}`
      };

      const reply = await callDeepSeekForPrompts([systemMsg, userMsg]);
      
      // 解析 JSON
      let prompts;
      try {
        // 尝试直接解析
        prompts = JSON.parse(reply);
      } catch (e) {
        // 尝试提取 JSON 部分
        const jsonMatch = reply.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          prompts = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('无法解析场景描述JSON');
        }
      }

      console.log(`[ImageGen] 成功生成 ${prompts.length} 个场景描述`);
      return {
        success: true,
        prompts: prompts,
      };
    } catch (err) {
      console.error('[ImageGen] 生成场景描述失败:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  // ====== 模式2：根据描述生成单张图片 ======
  if (action === 'generateImage') {
    if (!prompt) {
      return { success: false, error: '缺少 prompt 参数' };
    }

    try {
      console.log(`[ImageGen] 开始生成图片(Kolors HQ), prompt长度: ${prompt.length}`);
      // 单张图片用高质量配置（更高的 guidance_scale + 更多推理步数）
      const enhancedPrompt = `${ILLUSTRATION_STYLE}${prompt}`;
      const imageUrl = await callKolorsAPI(enhancedPrompt, {
        size: '1024x1024',
        guidance_scale: 7,   // 高质量模式：更强的 prompt 匹配度
        steps: 30,           // 高质量模式：更多推理步数
      });
      console.log('[ImageGen] 图片生成成功(Kolors HQ):', imageUrl.substring(0, 50) + '...');
      
      return {
        success: true,
        imageUrl: imageUrl,
      };
    } catch (err) {
      console.error('[ImageGen] 图片生成失败:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  return {
    success: false,
    error: `未知的 action: ${action}`,
  };
};
