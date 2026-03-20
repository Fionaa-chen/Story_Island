// pages/story/story.js
const { booksData } = require('../../data/books');

/**
 * 将 hex 颜色转为 RGB 对象
 */
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/**
 * 基于 book.color 计算结局画卷的深色衍生色组
 * 返回值会 setData 到 endingDarkColors，供 WXML 内联样式使用
 */
function computeEndingDarkColors(bookColor) {
  const rgb = hexToRgb(bookColor);

  // 深化背景色：保留色相但大幅降低亮度（0.15~0.10 倍）
  const darkFactor = 0.15;
  const darkerFactor = 0.10;
  const darkBgTop = `rgb(${Math.round(rgb.r * darkFactor)}, ${Math.round(rgb.g * darkFactor)}, ${Math.round(rgb.b * darkFactor)})`;
  const darkBgBottom = `rgb(${Math.round(rgb.r * darkerFactor)}, ${Math.round(rgb.g * darkerFactor)}, ${Math.round(rgb.b * darkerFactor)})`;

  // 亮色文字：在主色基础上提亮，加暖白
  const titleR = Math.min(255, Math.round(rgb.r * 0.55 + 130));
  const titleG = Math.min(255, Math.round(rgb.g * 0.55 + 115));
  const titleB = Math.min(255, Math.round(rgb.b * 0.45 + 100));

  // 纹理文字：主色调提亮 + 低透明度
  const texR = Math.min(255, Math.round(rgb.r * 0.45 + 120));
  const texG = Math.min(255, Math.round(rgb.g * 0.45 + 110));
  const texB = Math.min(255, Math.round(rgb.b * 0.35 + 100));

  // 点评文字
  const cmtR = Math.min(255, Math.round(rgb.r * 0.40 + 140));
  const cmtG = Math.min(255, Math.round(rgb.g * 0.40 + 130));
  const cmtB = Math.min(255, Math.round(rgb.b * 0.35 + 120));

  return {
    // 背景渐变
    bgTop: darkBgTop,
    bgBottom: darkBgBottom,
    // 经典原文纹理色
    textureColor: `rgba(${texR}, ${texG}, ${texB}, 0.12)`,
    // 结局标题色
    titleColor: `rgba(${titleR}, ${titleG}, ${titleB}, 0.65)`,
    // 结局点评色
    commentColor: `rgba(${cmtR}, ${cmtG}, ${cmtB}, 0.55)`,
    // 关闭按钮
    closeBg: 'rgba(255, 255, 255, 0.12)',
    closeIcon: 'rgba(255, 255, 255, 0.6)',
    // 画框边框
    frameBorder: 'rgba(255, 255, 255, 0.15)',
    frameShadow: 'rgba(0, 0, 0, 0.25)',
    // 操作按钮
    btnBg: 'rgba(255, 255, 255, 0.12)',
    btnBorder: 'rgba(255, 255, 255, 0.20)',
    btnText: `rgba(${Math.min(255, titleR + 20)}, ${Math.min(255, titleG + 20)}, ${Math.min(255, titleB + 15)}, 0.85)`,
    // 加载/错误文字
    loadingText: 'rgba(255, 255, 255, 0.70)',
    // 占位背景
    placeholderBg: 'rgba(255, 255, 255, 0.08)',
    placeholderBorder: 'rgba(255, 255, 255, 0.10)',
    // spinner dot
    spinnerDot: `rgba(${titleR}, ${titleG}, ${titleB}, 0.5)`,
    // 用于 Canvas 绘制的原始 RGB
    _rgb: rgb,
    _titleRgb: { r: titleR, g: titleG, b: titleB },
    _cmtRgb: { r: cmtR, g: cmtG, b: cmtB },
    _texRgb: { r: texR, g: texG, b: texB },
  };
}

Page({
  data: {
    book: null,
    role: null,
    scene: null,
    endingDarkColors: null, // 结局画卷深色衍生色组
    messages: [],       // 剧情消息列表
    inputText: '',
    isTyping: false,
    scrollToView: '',
    inputFocus: false,
    keyboardHeight: 0,
    showChoices: true,   // 是否显示选项面板
    currentChoices: [],  // 当前可选的选项
    showCustomInput: false, // 是否显示自由输入
    storyStarted: false, // 剧情是否已开始
    storyEnded: false,   // 剧情是否已结局
    endingInfo: null,    // 结局信息 { title, comment }
    // ====== 结局宫格图相关（每轮实时生成） ======
    endingGrid: {
      status: 'idle',    // idle | generating_images | done | error
      prompts: [],       // 5个场景描述 [{title, prompt}]
      images: ['', '', '', '', ''], // 5张图片URL（对应5轮对话）
      loadedCount: 0,    // 已生成图片数
      totalRounds: 5,    // 总轮次
      errorMsg: '',      // 错误信息
    },
    roundImageHint: '',    // 图片生成进度提示（如"🎨 正在为第1幕绘图..."）
    showGridPreview: false, // 是否显示宫格图大图预览
    showEndingFullscreen: false, // 是否显示全屏结局画卷页
    endingTabs: [],        // 结局底部 Tab 按钮配置
  },

  onLoad(options) {
    const { bookId, roleId, sceneId } = options;
    const book = booksData.find(b => b.id === bookId);
    if (!book) return;
    
    const role = book.roles.find(r => r.id === roleId);
    const scene = book.scenes.find(s => s.id === sceneId);
    if (!role || !scene) return;

    // 计算结局画卷的深色衍生色组
    const endingDarkColors = computeEndingDarkColors(book.color);
    this.setData({ book, role, scene, endingDarkColors });

    wx.setNavigationBarTitle({
      title: scene.title,
    });
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: book.color,
      animation: { duration: 300, timingFunc: 'easeIn' }
    });

    // 构建系统提示词（支持角色专属剧情线和场景描述）
    const roleStoryline = scene.roleStorylines ? (scene.roleStorylines[role.id] || '') : '';
    const sceneContext = scene.sceneContexts ? (scene.sceneContexts[role.id] || '') : '';
    let systemPrompt = scene.systemPrompt
      .replace(/\{roleName\}/g, role.name)
      .replace(/\{roleTitle\}/g, role.title)
      .replace(/\{rolePersonality\}/g, role.personality)
      .replace(/\{roleStoryline\}/g, roleStoryline)
      .replace(/\{sceneContext\}/g, sceneContext);

    // 动态追加角色分工约束：明确告知 AI 用户角色 vs NPC 角色
    const npcNames = (scene.npcs || []).map(n => n.name).join('、');
    systemPrompt += `\n\n【角色分工约束·极重要】当前用户扮演「${role.name}」，旁白中用"你"指代「${role.name}」。NPC对话（【角色名】："..."格式）只允许以下非玩家角色发言：${npcNames || '场景中的其他角色'}。绝不允许出现【${role.name}】的NPC对话行——「${role.name}」的一切台词、动作、心理只能写在【旁白】中用"你"描述，或通过选项让用户自己表达。`;

    // 初始化对话历史
    this.chatHistory = [
      { role: 'system', content: systemPrompt }
    ];

    // 初始化轮次计数器
    this.roundCount = 0;
    this.maxRounds = 5; // 每章5轮对话，对应5宫格图

    // 初始化每轮图片异步生成跟踪
    this.roundImagePromises = []; // 保存每轮图片生成的 Promise
    this.roundScenePrompts = []; // 保存每轮提取的场景描述
    this._imageGenQueue = Promise.resolve(); // 串行队列：保证图片请求依次执行，避免 API 速率限制
    this._lastImageGenTime = 0; // 上一次图片生成请求发出的时间戳

    // 展示开场旁白（支持角色专属开场）
    const roleOpening = scene.openings ? (scene.openings[role.id] || Object.values(scene.openings)[0]) : scene.opening;
    // 获取角色专属初始选项
    const roleChoices = scene.initialChoices ? 
      (Array.isArray(scene.initialChoices) ? scene.initialChoices : (scene.initialChoices[role.id] || Object.values(scene.initialChoices)[0])) 
      : [];
    setTimeout(() => {
      this.addMessage('narrator', roleOpening);
      this.setData({
        currentChoices: roleChoices,
        showChoices: true,
        storyStarted: true,
      });

      // 【修复】将开场旁白和初始选项记录到 chatHistory，避免 AI 第一轮回复时重复开场内容
      const choiceSymbols = ['①', '②', '③', '④', '⑤'];
      const choiceTexts = roleChoices.map((c, i) => `${choiceSymbols[i] || (i + 1 + '.')} ${c.text}`).join('\n');
      const formattedOpening = `【旁白】${roleOpening}\n\n---\n${choiceTexts}`;
      this.chatHistory.push({ role: 'assistant', content: formattedOpening });
    }, 600);
  },

  onUnload() {
    this.chatHistory = null;
  },

  // 分享给好友
  onShareAppMessage() {
    const { book, scene, role, endingInfo, endingGrid } = this.data;
    const title = endingInfo && endingInfo.title 
      ? `我在「${book.title}」中扮演${role.name}，达成了「${endingInfo.title}」结局！`
      : `我在「${book.title}」中扮演${role.name}的冒险故事`;
    
    return {
      title: title,
      path: `/pages/story/story?bookId=${book.id}&roleId=${role.id}&sceneId=${scene.id}`,
      imageUrl: endingGrid.images[0] || '', // 用第一张图作为分享封面
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const { book, scene, role, endingInfo } = this.data;
    return {
      title: endingInfo && endingInfo.title 
        ? `「绘本岛」${book.title} · ${endingInfo.title}`
        : `「绘本岛」${book.title} · ${scene.title}`,
      query: `bookId=${book.id}&roleId=${role.id}&sceneId=${scene.id}`,
    };
  },

  // 添加消息到列表
  addMessage(type, content, speakerName) {
    const messages = this.data.messages;
    const msgId = `msg-${Date.now()}-${messages.length}`;
    
    // 如果是 NPC 消息，根据 speakerName 查找对应的 emoji
    let npcEmoji = '';
    if (type === 'npc' && speakerName && this.data.scene && this.data.scene.npcs) {
      const npc = this.data.scene.npcs.find(n => n.name === speakerName);
      npcEmoji = npc && npc.emoji ? npc.emoji : '🎭';
    }

    const msgData = {
      id: msgId,
      type,        // narrator(旁白), npc(NPC对话), player(玩家行动), system(系统提示), ending(结局卡片)
      content,
      speakerName: speakerName || '',
      npcEmoji: npcEmoji,  // NPC 专属 emoji
      time: this.formatTime(new Date()),
    };

    // ending 类型：解析 JSON 为 endingData 供模板渲染
    if (type === 'ending') {
      try {
        msgData.endingData = JSON.parse(content);
      } catch (e) {
        msgData.endingData = { narration: content, title: '', comment: '' };
      }
    }
    
    messages.push(msgData);
    
    this.setData({
      messages,
      scrollToView: msgId,
    });
  },

  formatTime(date) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  },

  // 点击预设选项
  onChoiceTap(e) {
    const { index } = e.currentTarget.dataset;
    const choice = this.data.currentChoices[index];
    if (!choice || this.data.isTyping) return;

    // 防重复点击锁：避免快速双击导致重复对话
    if (this._choiceLock) return;
    this._choiceLock = true;

    // ====== 结局选项处理 ======
    if (this.data.storyEnded) {
      const { book, role, scene } = this.data;
      if (choice.id === 'replay') {
        // 重新体验当前章节
        wx.redirectTo({
          url: `/pages/story/story?bookId=${book.id}&roleId=${role.id}&sceneId=${scene.id}`
        });
        return;
      }
      if (choice.id === 'next_chapter' && choice.nextSceneId) {
        // 进入下一章
        wx.redirectTo({
          url: `/pages/story/story?bookId=${book.id}&roleId=${role.id}&sceneId=${choice.nextSceneId}`
        });
        return;
      }
      if (choice.id === 'back_shelf') {
        // 返回书架（首页）
        wx.navigateBack({ delta: 10 });
        return;
      }
    }

    // ====== 正常剧情选项处理 ======
    // 添加玩家行动消息
    this.addMessage('player', choice.text);
    this.setData({ showChoices: false, currentChoices: [] });

    // 将选择发给AI
    this.chatHistory.push({ 
      role: 'user', 
      content: `我选择：${choice.text}` 
    });
    this.getAIResponse();
  },

  // 自由输入
  onInputChange(e) {
    this.setData({ inputText: e.detail.value });
  },

  onInputFocus(e) {
    this.setData({
      inputFocus: true,
      keyboardHeight: e.detail.height || 0,
    });
    if (this.data.messages.length > 0) {
      const lastMsg = this.data.messages[this.data.messages.length - 1];
      this.setData({ scrollToView: lastMsg.id });
    }
  },

  onInputBlur() {
    this.setData({
      inputFocus: false,
      keyboardHeight: 0,
    });
  },

  // 发送自由输入
  onSend() {
    const text = this.data.inputText.trim();
    if (!text || this.data.isTyping || this.data.storyEnded) return;

    // 防重复点击锁
    if (this._choiceLock) return;
    this._choiceLock = true;

    this.addMessage('player', text);
    this.setData({ 
      inputText: '', 
      showCustomInput: false,
      showChoices: false,
      currentChoices: [],
    });

    this.chatHistory.push({ role: 'user', content: text });
    this.getAIResponse();
  },

  // 取消自由输入，返回选项
  onCancelCustomInput() {
    this.setData({ 
      showCustomInput: false, 
      showChoices: true,
    });
  },

  // 调用AI获取剧情发展
  async getAIResponse() {
    // 如果故事已结局，不再调用AI
    if (this.data.storyEnded) return;

    this.roundCount++;
    this.setData({ isTyping: true });

    // 修改结局轮次的收束（第4轮开始收束，第5轮触发结局）
    const { role } = this.data;
    if (this.roundCount === this.maxRounds - 1) {
      this.chatHistory.push({
        role: 'user',
        content: `（系统提示：剧情即将进入高潮，请在下一次回复中自然地将故事引向结局。注意：用户扮演的是${role.name}（${role.title}），请始终保持该角色的第一视角，不要切换到其他角色。提醒：[SCENE_EN]描述务必精确反映本轮的具体画面，包含角色动作、情感、场景细节和关键NPC。）`
      });
    } else if (this.roundCount >= this.maxRounds) {
      this.chatHistory.push({
        role: 'user',
        content: `（系统提示：请立即给出最终结局，用【终章】开头写结局旁白，末尾加上 ===THE_END=== 标记，然后给出结局评价。不要再给出选项。仍然需要在末尾附带[SCENE_EN: ...]标记描述结局画面——这是最后一幅画，请写得尤其详细（50-80词），要体现结局的史诗感或情感高潮，包含${role.name}的最终姿态、情感表情、标志性场景和关键NPC。【极重要】结局必须以${role.name}（${role.title}）的视角书写，所有动作、心理、能力描写都必须属于${role.name}，绝不可切换到其他角色视角。）`
      });
    }

    try {
      // 传递给 AI 的消息精简为 system + 最近10条，不影响本地完整历史
      const aiMessages = this.chatHistory.length > 12
        ? [this.chatHistory[0], ...this.chatHistory.slice(-10)]
        : [...this.chatHistory];
      const response = await this.callAI(aiMessages);
      
      // ====== 提取 [SCENE_EN: ...] 标记用于异步生图 ======
      const currentRound = this.roundCount; // 记录当前轮次
      const sceneMatch = response.match(/\[SCENE_EN:\s*(.*?)\]/i);
      const scenePrompt = sceneMatch ? sceneMatch[1].trim() : '';
      
      // 从回复中移除 [SCENE_EN: ...] 标记再展示
      const cleanResponse = response.replace(/\[SCENE_EN:\s*.*?\]/gi, '').trim();
      
      // 解析AI回复，分离旁白、NPC对话和选项
      this.parseAndDisplayResponse(cleanResponse);
      
      // 更新历史（使用原始回复，保留SCENE_EN供后续参考）
      this.chatHistory.push({ role: 'assistant', content: response });

      // ====== 异步触发图片生成（不阻塞对话） ======
      if (scenePrompt && currentRound <= 5) {
        this.triggerRoundImageGeneration(currentRound, scenePrompt);
      } else if (!scenePrompt && currentRound <= 5) {
        // 如果AI没输出SCENE_EN标记，用回复内容生成fallback prompt
        let fallbackPrompt = this.generateFallbackScenePrompt(cleanResponse);
        // 如果 fallback 也提取不到内容，使用通用兜底 prompt
        if (!fallbackPrompt) {
          const { book, role, scene } = this.data;
          fallbackPrompt = `colorful storybook illustration, anime-inspired, soft warm lighting. ${role.name} (${role.title}) in ${scene.title}, from "${book.title}". Round ${currentRound} of the story, expressive character, detailed background.`;
          console.log(`[RoundImage] 第${currentRound}轮 使用通用兜底 prompt`);
        }
        this.triggerRoundImageGeneration(currentRound, fallbackPrompt);
      }

      // 保持历史长度合理
      if (this.chatHistory.length > 31) {
        this.chatHistory = [
          this.chatHistory[0],
          ...this.chatHistory.slice(-30)
        ];
      }
    } catch (err) {
      console.error('AI 回复失败:', err);
      this.addMessage('system', '（剧情推进失败，请重试）');
      // 回退轮次计数
      this.roundCount--;
      // 恢复上一次的选项
      this.setData({
        showChoices: true,
        currentChoices: [
          { id: 'retry', text: '🔄 重新尝试', hint: '再试一次' },
        ],
      });
    } finally {
      this.setData({ isTyping: false });
      this._choiceLock = false; // 释放防重复点击锁
    }
  },

  /**
   * 异步触发某一轮的图片生成（串行队列 + 限速，避免 API 速率限制）
   * 所有图片请求排队依次执行，每次请求间隔至少 MIN_INTERVAL_MS 毫秒
   */
  triggerRoundImageGeneration(roundIndex, scenePrompt) {
    const { book, role, scene } = this.data;
    const idx = roundIndex - 1; // 转为数组下标 (0-4)
    const MIN_INTERVAL_MS = 6000; // 请求最小间隔6秒，避免 IPM 速率限制
    
    console.log(`[RoundImage] 第${roundIndex}轮 加入生图队列: ${scenePrompt.substring(0, 50)}...`);
    
    // 保存场景描述
    this.roundScenePrompts[idx] = scenePrompt;
    
    // 更新进度提示
    this.setData({
      roundImageHint: `🎨 正在为第${roundIndex}幕绘图...`,
    });

    // 更新 endingGrid.prompts
    const prompts = this.data.endingGrid.prompts.slice();
    prompts[idx] = {
      title: `第${roundIndex}幕`,
      prompt: scenePrompt,
    };
    this.setData({ 'endingGrid.prompts': prompts });

    // 更新图片到 endingGrid 的辅助方法
    const that = this;
    const updateImage = (imageUrl) => {
      const images = that.data.endingGrid.images.slice();
      images[idx] = imageUrl;
      const loadedCount = images.filter(Boolean).length;
      
      that.setData({
        'endingGrid.images': images,
        'endingGrid.loadedCount': loadedCount,
        roundImageHint: loadedCount >= 5 ? '✅ 所有剧情图就绪' : '',
      });
      
      if (loadedCount >= 5) {
        that.setData({ 'endingGrid.status': 'done' });
      }
      
      console.log(`[RoundImage] 第${roundIndex}轮 图片生成成功 (${loadedCount}/5)`);
      return imageUrl;
    };

    // 带速率限制的云函数调用（执行前等待足够间隔）
    const doGenerateWithRateLimit = async () => {
      // 确保距离上一次请求至少间隔 MIN_INTERVAL_MS
      const now = Date.now();
      const elapsed = now - that._lastImageGenTime;
      if (elapsed < MIN_INTERVAL_MS) {
        const waitTime = MIN_INTERVAL_MS - elapsed;
        console.log(`[RoundImage] 第${roundIndex}轮 限速等待 ${waitTime}ms`);
        await new Promise(r => setTimeout(r, waitTime));
      }
      that._lastImageGenTime = Date.now();

      return that.callCloudFunctionWithTimeout('imageGen', {
        action: 'generateRoundImage',
        prompt: scenePrompt,
        bookTitle: book.title,
        sceneName: scene.title,
        roleName: role.name,
        roundIndex: roundIndex,
      }, 120000); // 增加超时到120秒（含可能的服务端重试）
    };

    // 将本次请求串入队列，保证顺序执行
    const imagePromise = new Promise((resolve) => {
      that._imageGenQueue = that._imageGenQueue.then(async () => {
        const MAX_CLIENT_RETRIES = 2; // 客户端最多重试2次

        for (let attempt = 0; attempt <= MAX_CLIENT_RETRIES; attempt++) {
          try {
            const res = await doGenerateWithRateLimit();
            if (res.success && res.imageUrl) {
              resolve(updateImage(res.imageUrl));
              return;
            }
            // 服务端返回失败
            const errMsg = res.error || '未知错误';
            const isRateLimit = errMsg.includes('rate limit') || errMsg.includes('IPM limit') || errMsg.includes('429');
            console.warn(`[RoundImage] 第${roundIndex}轮 第${attempt + 1}次失败${isRateLimit ? '(速率限制)' : ''}:`, errMsg);
            
            if (attempt < MAX_CLIENT_RETRIES) {
              // 速率限制: 指数退避 10s, 20s；其他错误: 5s, 10s
              const baseDelay = isRateLimit ? 10000 : 5000;
              const delay = baseDelay * Math.pow(2, attempt);
              console.log(`[RoundImage] 第${roundIndex}轮 ${delay / 1000}秒后重试...`);
              await new Promise(r => setTimeout(r, delay));
            }
          } catch (err) {
            const errMsg = (err.message || err.errMsg || '');
            const isRateLimit = errMsg.includes('rate limit') || errMsg.includes('IPM limit') || errMsg.includes('429');
            console.warn(`[RoundImage] 第${roundIndex}轮 第${attempt + 1}次异常${isRateLimit ? '(速率限制)' : ''}:`, errMsg);
            
            if (attempt < MAX_CLIENT_RETRIES) {
              const baseDelay = isRateLimit ? 10000 : 5000;
              const delay = baseDelay * Math.pow(2, attempt);
              console.log(`[RoundImage] 第${roundIndex}轮 ${delay / 1000}秒后重试...`);
              await new Promise(r => setTimeout(r, delay));
            }
          }
        }

        // 所有重试都失败
        console.warn(`[RoundImage] 第${roundIndex}轮 所有重试已耗尽`);
        that.setData({ roundImageHint: '' });
        resolve(null);
      });
    });

    // 保存 Promise 以便结局时检查
    this.roundImagePromises[idx] = imagePromise;
  },

  /**
   * 当 AI 没有输出 [SCENE_EN:...] 时，用回复内容生成一个简单的英文 prompt
   */
  generateFallbackScenePrompt(response) {
    const { book, role } = this.data;
    
    // 1. 提取旁白（场景描述）
    const narratorMatch = response.match(/【旁白】([\s\S]*?)(?=【|---|\n\n|$)/);
    const narration = narratorMatch ? narratorMatch[1].trim().substring(0, 150) : '';
    
    // 2. 提取NPC对话（关键互动）
    const npcMatches = response.match(/【(.+?)】[:：]\s*[""「]?([\s\S]*?)[""」]?(?=\n【|\n---|$)/g);
    let npcInfo = '';
    if (npcMatches && npcMatches.length > 0) {
      // 取第一个NPC的名字和对话摘要
      const firstNpc = npcMatches[0].match(/【(.+?)】[:：]\s*([\s\S]*)/);
      if (firstNpc) {
        npcInfo = `${firstNpc[1]} speaking: "${firstNpc[2].substring(0, 50)}"`;
      }
    }
    
    // 3. 提取玩家最近的选择（从对话历史中获取）
    let playerAction = '';
    if (this.chatHistory) {
      for (let i = this.chatHistory.length - 1; i >= 0; i--) {
        if (this.chatHistory[i].role === 'user' && !this.chatHistory[i].content.startsWith('（系统提示')) {
          playerAction = this.chatHistory[i].content.replace('我选择：', '').substring(0, 50);
          break;
        }
      }
    }
    
    // 4. 综合构建 fallback prompt
    if (!narration && !npcInfo) return '';
    
    const parts = [
      'colorful storybook illustration, anime-inspired, soft warm lighting.',
      role ? `${role.name} (${role.title})` : '',
      playerAction ? `doing: ${playerAction}.` : '',
      narration ? `Scene: ${narration}.` : '',
      npcInfo ? `${npcInfo}.` : '',
      book ? `From "${book.title}".` : '',
    ].filter(Boolean);
    
    return parts.join(' ');
  },

  // 解析AI回复，展示为不同消息类型
  parseAndDisplayResponse(response) {
    // ====== 检测结局标记（兼容多种格式变体） ======
    const endingPattern = /={2,}\s*THE[_\s]*END\s*={2,}/i;
    const isEnding = endingPattern.test(response) || 
                     (response.includes('【终章】') && (response.includes('🏆') || response.includes('结局达成')));
    
    if (isEnding) {
      // 去掉结局标记和SCENE_EN标记
      const cleanResponse = response.replace(/={2,}\s*THE[_\s]*END\s*={2,}/gi, '').replace(/\[SCENE_EN:\s*.*?\]/gi, '').trim();
      this.displayEnding(cleanResponse);
      return;
    }

    // ====== 正常剧情解析 ======
    // 分离主体内容和选项
    const parts = response.split('---');
    const mainContent = parts[0].trim();
    const choicesText = parts.length > 1 ? parts.slice(1).join('---').trim() : '';

    // 解析主体内容中的旁白和NPC对话
    const lines = mainContent.split('\n').filter(l => l.trim());
    let currentBlock = '';
    let currentType = 'narrator';
    let currentSpeaker = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 检查是否是旁白
      if (trimmed.startsWith('【旁白】')) {
        // 先输出之前积累的块
        if (currentBlock) {
          this.addMessage(currentType, currentBlock.trim(), currentSpeaker);
        }
        currentType = 'narrator';
        currentSpeaker = '';
        currentBlock = trimmed.replace('【旁白】', '').trim();
      }
      // 检查是否是NPC对话 (格式：【角色名】：xxx 或 【角色名】:xxx)
      else if (/^【.+?】[:：]/.test(trimmed)) {
        if (currentBlock) {
          this.addMessage(currentType, currentBlock.trim(), currentSpeaker);
        }
        const match = trimmed.match(/^【(.+?)】[:：]\s*(.*)$/);
        if (match) {
          currentType = 'npc';
          currentSpeaker = match[1];
          currentBlock = match[2] || '';
        }
      }
      // 普通文本，追加到当前块
      else {
        if (currentBlock) {
          currentBlock += '\n' + trimmed;
        } else {
          currentBlock = trimmed;
        }
      }
    }

    // 输出最后一个块
    if (currentBlock) {
      this.addMessage(currentType, currentBlock.trim(), currentSpeaker);
    }

    // 解析选项
    if (choicesText) {
      const choices = this.parseChoices(choicesText);
      if (choices.length > 0) {
        this.setData({
          currentChoices: choices,
          showChoices: true,
        });
      }
    } else {
      // 如果没有选项，提供默认选项
      this.setData({
        currentChoices: [
          { id: 'continue', text: '➡️ 继续...', hint: '看看接下来会发生什么' },
          { id: 'free', text: '✍️ 自由行动...', hint: '输入你想做的事' }
        ],
        showChoices: true,
      });
    }
  },

  // 展示结局
  displayEnding(content) {
    const lines = content.split('\n').filter(l => l.trim());
    
    let endingTitle = '';
    let endingComment = '';
    let endingNarration = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 解析终章旁白
      if (trimmed.startsWith('【终章】')) {
        endingNarration.push(trimmed.replace('【终章】', '').trim());
      }
      // 解析结局达成
      else if (trimmed.startsWith('🏆')) {
        const match = trimmed.match(/🏆\s*结局达成[：:]\s*(.*)/);
        endingTitle = match ? match[1].trim() : trimmed.replace('🏆', '').trim();
      }
      // 解析点评
      else if (trimmed.startsWith('📖')) {
        endingComment = trimmed.replace('📖', '').trim();
      }
      // 其他内容作为旁白的一部分
      else if (endingNarration.length > 0 && !trimmed.startsWith('🏆') && !trimmed.startsWith('📖')) {
        endingNarration.push(trimmed);
      } else if (endingNarration.length === 0 && trimmed) {
        // 如果大模型没有严格用【终章】格式，也当作旁白处理
        endingNarration.push(trimmed);
      }
    }

    // ====== 用独立的 ending 类型消息展示结局卡片 ======
    const endingContent = JSON.stringify({
      narration: endingNarration.join('\n'),
      title: endingTitle,
      comment: endingComment,
    });
    this.addMessage('ending', endingContent);

    // ====== 设置结局状态 + 底部 Tab 栏 ======
    const { book, scene, role } = this.data;
    // 获取该角色可进入的场景列表
    const availableScenes = book.scenes.filter(s => {
      if (!s.roleAvailability) return true;
      return s.roleAvailability.includes(role.id);
    });
    const availableSceneIds = availableScenes.map(s => s.id);
    const currentIdx = availableSceneIds.indexOf(scene.id);
    const hasNextScene = currentIdx >= 0 && currentIdx < availableScenes.length - 1;
    const nextScene = hasNextScene ? availableScenes[currentIdx + 1] : null;

    // 构建底部 Tab 配置
    const endingTabs = [
      { id: 'generate_grid', icon: '🎨', label: '查看剧情画卷' },
    ];
    if (hasNextScene) {
      endingTabs.push({
        id: 'next_chapter',
        icon: '📖',
        label: nextScene.title,
        nextSceneId: nextScene.id,
      });
    } else {
      endingTabs.push({
        id: 'replay',
        icon: '🔄',
        label: '重新体验',
      });
    }
    endingTabs.push({ id: 'back_shelf', icon: '🏠', label: '返回书架' });

    this.setData({
      storyEnded: true,
      endingInfo: { title: endingTitle, comment: endingComment },
      endingTabs: endingTabs,
      showChoices: false,
      currentChoices: [],
    });

    // ====== 不再自动触发图片生成，等用户手动点击 Tab ======
  },

  // ====== 底部 Tab 点击处理 ======
  onEndingTabTap(e) {
    const { id, nextSceneId } = e.currentTarget.dataset;
    const { book, role, scene } = this.data;

    switch (id) {
      case 'generate_grid':
        // 手动触发生成剧情图
        const { endingInfo } = this.data;
        this.generateEndingGrid(
          endingInfo ? endingInfo.title : '',
          endingInfo ? endingInfo.comment : ''
        );
        break;
      case 'next_chapter':
        if (nextSceneId) {
          wx.redirectTo({
            url: `/pages/story/story?bookId=${book.id}&roleId=${role.id}&sceneId=${nextSceneId}`
          });
        }
        break;
      case 'replay':
        wx.redirectTo({
          url: `/pages/story/story?bookId=${book.id}&roleId=${role.id}&sceneId=${scene.id}`
        });
        break;
      case 'back_shelf':
        wx.navigateBack({ delta: 10 });
        break;
    }
  },

  // ====== 结局宫格图生成 ======
  
  /**
   * 封装云函数调用（带超时控制）
   * 微信云函数 callFunction 的 timeout 参数在部分基础库版本无效，
   * 这里用 Promise.race 做客户端超时兜底。
   */
  callCloudFunctionWithTimeout(name, data, timeoutMs = 120000) {
    const cloudCall = new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name,
        data,
        success: (res) => resolve(res.result),
        fail: (err) => reject(err),
      });
    });

    const timer = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`云函数 ${name} 客户端超时(${timeoutMs / 1000}s)`)), timeoutMs);
    });

    return Promise.race([cloudCall, timer]);
  },

  /**
   * 展示结局宫格图
   * 新方案：检查已有的实时生成图片，等待未完成的
   */
  async generateEndingGrid(endingTitle, endingComment) {
    const { book, role, scene } = this.data;

    // 防止重复触发
    if (this.data.endingGrid.status === 'generating_images') {
      console.log('[EndingGrid] 已在等待中，直接展示');
      this.setData({ showEndingFullscreen: true });
      return;
    }

    // 如果已经全部生成完毕，直接展示
    if (this.data.endingGrid.status === 'done' && this.data.endingGrid.loadedCount > 0) {
      this.setData({ showEndingFullscreen: true });
      return;
    }

    // 打开全屏展示
    this.setData({
      'endingGrid.status': 'generating_images',
      'endingGrid.errorMsg': '',
      showEndingFullscreen: true,
    });

    try {
      // ====== 等待所有已触发的图片生成完成 ======
      const totalPromises = this.roundImagePromises.length;
      console.log(`[EndingGrid] 等待 ${totalPromises} 张已触发的图片生成完成...`);

      if (totalPromises > 0) {
        // 使用 Promise.allSettled 等待所有图片（不因单张失败而中断）
        await Promise.allSettled(this.roundImagePromises);
      }

      // ====== 补生缺失的图片 ======
      const images = this.data.endingGrid.images;
      const missingIndices = [];
      for (let i = 0; i < 5; i++) {
        if (!images[i]) {
          missingIndices.push(i);
        }
      }

      if (missingIndices.length > 0) {
        console.log(`[EndingGrid] 发现 ${missingIndices.length} 张缺失图片，尝试串行补生: 位置 ${missingIndices.map(i => i + 1).join(', ')}`);
        
        // 串行补生缺失图片（逐张进行，避免并发触发速率限制）
        for (const idx of missingIndices) {
          // 优先使用已保存的场景 prompt
          let prompt = this.roundScenePrompts[idx];
          if (!prompt) {
            const { book, role, scene } = this.data;
            prompt = `colorful storybook illustration, anime-inspired, soft warm lighting. ${role.name} (${role.title}) in ${scene.title}, from "${book.title}". Act ${idx + 1}, expressive character, detailed background.`;
            console.log(`[EndingGrid] 位置 ${idx + 1} 无场景描述，使用通用 prompt`);
          }
          
          const enhancedPrompt = `精美插画风格，故事绘本画风，色彩丰富明亮，手绘感，柔和温暖的光线，${prompt}`;
          
          try {
            const result = await this.generateSingleImage(enhancedPrompt, idx);
            if (result) {
              console.log(`[EndingGrid] 位置 ${idx + 1} 补生成功`);
            } else {
              console.warn(`[EndingGrid] 位置 ${idx + 1} 补生失败`);
            }
          } catch (err) {
            console.warn(`[EndingGrid] 位置 ${idx + 1} 补生异常:`, err.message);
          }
        }
      }

      // 检查最终结果
      const finalImages = this.data.endingGrid.images;
      const successCount = finalImages.filter(Boolean).length;

      this.setData({
        'endingGrid.status': successCount > 0 ? 'done' : 'error',
        'endingGrid.loadedCount': successCount,
        'endingGrid.errorMsg': successCount === 0 ? '图片生成失败，请点击重试' : '',
      });

      console.log(`[EndingGrid] 完成！成功 ${successCount}/5 张`);
    } catch (err) {
      console.error('[EndingGrid] 等待图片生成失败:', err);
      this.setData({
        'endingGrid.status': 'error',
        'endingGrid.errorMsg': this.getReadableError(err),
      });
    }
  },

  /**
   * 将云函数错误转为用户可读的提示
   */
  getReadableError(err) {
    const msg = (err && (err.errMsg || err.message || '')) + '';
    if (msg.includes('rate limit') || msg.includes('IPM limit') || msg.includes('429')) {
      return 'API 请求过于频繁，请等待30秒后重试';
    }
    if (msg.includes('TIME_LIMIT_EXCEEDED') || msg.includes('timed out') || msg.includes('超时')) {
      return '生成超时，请稍后重试（建议检查云函数是否已部署最新版本）';
    }
    if (msg.includes('RESOURCE') || msg.includes('-501')) {
      return '云资源不足，请稍后重试';
    }
    if (msg.includes('network') || msg.includes('NETWORK')) {
      return '网络异常，请检查网络后重试';
    }
    return '图片生成失败，请点击重试';
  },

  /**
   * 生成单张图片（带重试，超时 120 秒/次）
   */
  async generateSingleImage(prompt, index) {
    const maxRetry = 3;
    for (let attempt = 0; attempt < maxRetry; attempt++) {
      try {
        // 确保距离上一次请求至少间隔6秒
        const now = Date.now();
        const elapsed = now - (this._lastImageGenTime || 0);
        if (elapsed < 6000) {
          await new Promise(r => setTimeout(r, 6000 - elapsed));
        }
        this._lastImageGenTime = Date.now();

        const res = await this.callCloudFunctionWithTimeout('imageGen', {
          action: 'generateImage',
          prompt: prompt,
        }, 120000);

        if (res.success && res.imageUrl) {
          // 实时更新单张图片
          const images = this.data.endingGrid.images.slice();
          images[index] = res.imageUrl;
          this.setData({
            'endingGrid.images': images,
            'endingGrid.loadedCount': images.filter(Boolean).length,
          });
          console.log(`[EndingGrid] 图片 ${index + 1} 生成成功`);
          return res.imageUrl;
        }
        throw new Error(res.error || '图片生成失败');
      } catch (err) {
        const errMsg = (err.message || err.errMsg || '');
        const isRateLimit = errMsg.includes('rate limit') || errMsg.includes('IPM limit') || errMsg.includes('429');
        console.warn(`[EndingGrid] 图片 ${index + 1} 第 ${attempt + 1} 次失败${isRateLimit ? '(速率限制)' : ''}:`, errMsg);
        if (attempt < maxRetry - 1) {
          // 速率限制: 10s, 20s; 其他: 4s, 8s
          const baseDelay = isRateLimit ? 10000 : 4000;
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    return null;
  },

  /**
   * 从对话历史构建剧情摘要（备用，新方案中不再常用）
   */
  buildStorySummary() {
    if (!this.chatHistory) return '';
    
    const summary = [];
    for (const msg of this.chatHistory) {
      if (msg.role === 'system') continue;
      if (msg.role === 'user') {
        // 过滤掉系统提示
        if (msg.content.startsWith('（系统提示')) continue;
        summary.push(`[玩家行动] ${msg.content}`);
      }
      if (msg.role === 'assistant') {
        // 只取前200字
        const brief = msg.content.substring(0, 200);
        summary.push(`[剧情] ${brief}`);
      }
    }
    // 限制总长度在 1500 字以内
    return summary.join('\n').substring(0, 1500);
  },

  /**
   * 降级处理：本地生成占位描述（5格）
   */
  handleGridFallback(endingTitle) {
    const fallbackPrompts = [
      { title: '第1幕', prompt: '' },
      { title: '第2幕', prompt: '' },
      { title: '第3幕', prompt: '' },
      { title: '第4幕', prompt: '' },
      { title: endingTitle || '终章', prompt: '' },
    ];

    this.setData({
      'endingGrid.status': 'error',
      'endingGrid.prompts': fallbackPrompts,
      'endingGrid.errorMsg': '图片生成服务暂不可用',
    });
  },

  /**
   * 重试生成宫格图（只重试失败的）
   */
  async onRetryGrid() {
    const { endingGrid } = this.data;
    
    // 找出需要重试的位置
    const retryIndices = [];
    for (let i = 0; i < 5; i++) {
      if (!endingGrid.images[i] && this.roundScenePrompts[i]) {
        retryIndices.push(i);
      }
    }

    if (retryIndices.length === 0) {
      // 如果没有需要重试的，但也没有任何图片，完全重置
      this.setData({
        'endingGrid.status': 'idle',
        'endingGrid.images': ['', '', '', '', ''],
        'endingGrid.loadedCount': 0,
        'endingGrid.errorMsg': '',
      });
      const { endingInfo } = this.data;
      this.generateEndingGrid(
        endingInfo ? endingInfo.title : '',
        endingInfo ? endingInfo.comment : ''
      );
      return;
    }

    this.setData({
      'endingGrid.status': 'generating_images',
      'endingGrid.errorMsg': '',
    });

    // 重新触发失败的图片生成
    for (const idx of retryIndices) {
      this.triggerRoundImageGeneration(idx + 1, this.roundScenePrompts[idx]);
    }

    // 等待重试完成
    const { endingInfo } = this.data;
    this.generateEndingGrid(
      endingInfo ? endingInfo.title : '',
      endingInfo ? endingInfo.comment : ''
    );
  },

  /**
   * 预览宫格图大图
   */
  onPreviewGrid() {
    this.setData({ showGridPreview: true });
  },

  /**
   * 关闭预览
   */
  onCloseGridPreview() {
    this.setData({ showGridPreview: false });
  },

  /**
   * 关闭全屏结局画卷页
   */
  onCloseEndingFullscreen() {
    this.setData({ showEndingFullscreen: false });
  },

  /**
   * 打开全屏结局画卷页
   */
  onOpenEndingFullscreen() {
    this.setData({ showEndingFullscreen: true });
  },

  /**
   * 保存宫格图到相册（方案C：基于 book.color 的深色主题）
   * Canvas 2D 绘制：深色背景 + 亮色经典原文纹理 + 白色悬浮画框 + 2行3列网格
   */
  async onSaveGrid() {
    const { endingGrid, book, scene, role, endingInfo, endingDarkColors } = this.data;
    if (endingGrid.status !== 'done') return;

    wx.showLoading({ title: '正在生成画卷...' });

    try {
      // 获取 Canvas 上下文
      const canvas = await this.getCanvasNode('#gridCanvas');
      if (!canvas) {
        wx.hideLoading();
        wx.showToast({ title: '生成失败', icon: 'none' });
        return;
      }

      const dpr = wx.getWindowInfo().pixelRatio;
      const canvasWidth = 750;
      const canvasHeight = 1334;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      // 获取深色衍生色的 RGB 值
      const rgb = endingDarkColors._rgb;
      const darkFactor = 0.15;
      const darkerFactor = 0.10;

      // ====== 1. 绘制深色渐变背景（基于 book.color 深化） ======
      const bgGradient = ctx.createLinearGradient(0, 0, canvasWidth * 0.3, canvasHeight);
      bgGradient.addColorStop(0, `rgb(${Math.round(rgb.r * darkFactor)}, ${Math.round(rgb.g * darkFactor)}, ${Math.round(rgb.b * darkFactor)})`);
      bgGradient.addColorStop(0.5, `rgb(${Math.round(rgb.r * 0.12)}, ${Math.round(rgb.g * 0.12)}, ${Math.round(rgb.b * 0.12)})`);
      bgGradient.addColorStop(1, `rgb(${Math.round(rgb.r * darkerFactor)}, ${Math.round(rgb.g * darkerFactor)}, ${Math.round(rgb.b * darkerFactor)})`);
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // ====== 2. 经典原文纹理层已移除，只保留纯色背景 ======

      // ====== 3. 绘制结局名称（画框上方，亮色） ======
      if (endingInfo && endingInfo.title) {
        const titleRgb = endingDarkColors._titleRgb;
        ctx.fillStyle = `rgba(${titleRgb.r}, ${titleRgb.g}, ${titleRgb.b}, 0.60)`;
        ctx.font = '600 28px "PingFang SC", serif';
        ctx.textAlign = 'center';
        ctx.fillText(endingInfo.title, canvasWidth / 2, 135);
      }

      // ====== 4. 绘制白色悬浮画框 ======
      const framePadding = 40;
      const frameX = framePadding;
      const frameY = 160;
      const frameW = canvasWidth - framePadding * 2;
      const gridGap = 8;
      const cellSize = (frameW - 20 * 2 - gridGap * 2) / 3; // 每格尺寸
      const frameInnerPad = 20;
      const frameH = frameInnerPad * 2 + cellSize * 2 + gridGap;
      const frameRadius = 18;

      // 画框阴影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
      this.roundRect(ctx, frameX + 3, frameY + 5, frameW, frameH, frameRadius);
      ctx.fill();

      // 画框白底
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, frameX, frameY, frameW, frameH, frameRadius);
      ctx.fill();

      // 画框边框
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      this.roundRect(ctx, frameX, frameY, frameW, frameH, frameRadius);
      ctx.stroke();

      // ====== 5. 在画框内绘制 2行3列 网格图片 ======
      const gridStartX = frameX + frameInnerPad;
      const gridStartY = frameY + frameInnerPad;
      const imgRadius = 12;

      const imagePositions = [];
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          imagePositions.push({
            x: gridStartX + col * (cellSize + gridGap),
            y: gridStartY + row * (cellSize + gridGap),
            w: cellSize,
            h: cellSize,
          });
        }
      }

      for (let i = 0; i < 6; i++) {
        const pos = imagePositions[i];
        const imgUrl = i < 5 ? endingGrid.images[i] : null;

        if (imgUrl) {
          try {
            const img = canvas.createImage();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = imgUrl;
            });

            ctx.save();
            this.roundRect(ctx, pos.x, pos.y, pos.w, pos.h, imgRadius);
            ctx.clip();
            ctx.drawImage(img, pos.x, pos.y, pos.w, pos.h);
            ctx.restore();
          } catch (e) {
            // 绘制占位
            ctx.save();
            this.roundRect(ctx, pos.x, pos.y, pos.w, pos.h, imgRadius);
            ctx.clip();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(pos.x, pos.y, pos.w, pos.h);
            ctx.restore();
          }
        } else {
          // 第6格留空或图片为空
          ctx.save();
          this.roundRect(ctx, pos.x, pos.y, pos.w, pos.h, imgRadius);
          ctx.clip();
          ctx.fillStyle = i < 5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)';
          ctx.fillRect(pos.x, pos.y, pos.w, pos.h);
          if (i === 5) {
            // 虚线边框效果
            ctx.restore();
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 4]);
            this.roundRect(ctx, pos.x, pos.y, pos.w, pos.h, imgRadius);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
        }
      }

      // ====== 6. 绘制结局点评（画框下方，亮色） ======
      const commentStartY = frameY + frameH + 40;
      if (endingInfo && endingInfo.comment) {
        const cmtRgb = endingDarkColors._cmtRgb;
        ctx.fillStyle = `rgba(${cmtRgb.r}, ${cmtRgb.g}, ${cmtRgb.b}, 0.50)`;
        ctx.font = 'italic 16px "PingFang SC", serif';
        ctx.textAlign = 'center';
        
        const maxCommentWidth = canvasWidth - 120;
        const commentLines = this.wrapText(ctx, endingInfo.comment, maxCommentWidth);
        const lineHeight = 26;
        commentLines.forEach((line, idx) => {
          ctx.fillText(line, canvasWidth / 2, commentStartY + idx * lineHeight);
        });
      }

      // ====== 7. 底部品牌标识 ======
      const brandY = canvasHeight - 50;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('「绘本岛」互动阅读 · AI生成', canvasWidth / 2, brandY);

      // ====== 8. 导出图片 ======
      const tempPath = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: canvas,
          fileType: 'png',
          quality: 1,
          success: (res) => resolve(res.tempFilePath),
          fail: reject,
        });
      });

      // 保存到相册
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: tempPath,
          success: resolve,
          fail: (err) => {
            if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
              wx.showModal({
                title: '提示',
                content: '需要相册权限才能保存图片，请在设置中开启',
                confirmText: '去设置',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting();
                  }
                }
              });
            }
            reject(err);
          },
        });
      });

      wx.hideLoading();
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('[SaveGrid] 保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  /**
   * 获取 Canvas 节点
   */
  getCanvasNode(selector) {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery().in(this);
      query.select(selector)
        .fields({ node: true, size: true })
        .exec((res) => {
          resolve(res[0] ? res[0].node : null);
        });
    });
  },

  /**
   * 绘制圆角矩形路径
   */
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  /**
   * Canvas 文本自动换行（返回行数组）
   */
  wrapText(ctx, text, maxWidth) {
    const lines = [];
    let currentLine = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  },

  /**
   * 分享宫格图
   */
  onShareGrid() {
    // 小程序分享
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  /**
   * 点击单张图片预览大图
   */
  onPreviewSingleImage(e) {
    const { index } = e.currentTarget.dataset;
    const images = this.data.endingGrid.images.filter(Boolean);
    if (images.length === 0) return;
    
    const current = this.data.endingGrid.images[index];
    if (current) {
      wx.previewImage({
        current: current,
        urls: images,
      });
    }
  },

  // 解析选项文本
  parseChoices(text) {
    const choices = [];
    // 匹配 ① ② ③ ④ 或 1. 2. 3. 4. 格式
    const patterns = [
      /[①②③④⑤]\s*([^\n①②③④⑤]+)/g,
      /\d+[.、]\s*([^\n\d]+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const choiceText = match[1].trim();
        if (choiceText) {
          choices.push({
            id: `c${choices.length + 1}`,
            text: choiceText,
            hint: '',
          });
        }
      }
      if (choices.length > 0) break;
    }

    return choices;
  },

  // 调用AI —— 优先调用 DeepSeek 云函数，失败时重试一次，仍失败则降级本地模拟
  callAI(messages) {
    const MAX_RETRIES = 1;
    const that = this;

    const doCall = (msgs, retryCount) => {
      return new Promise((resolve, reject) => {
        wx.cloud.callFunction({
          name: 'deepseek',
          data: {
            messages: msgs,
          },
          timeout: 60000,
          success: (res) => {
            if (res.result && res.result.success && res.result.reply) {
              console.log('[AI] DeepSeek 云函数调用成功');
              resolve(res.result.reply);
            } else {
              console.warn('[AI] DeepSeek 返回异常，降级本地模拟:', res.result);
              resolve(that.getLocalResponse());
            }
          },
          fail: (err) => {
            console.warn(`[AI] 云函数调用失败 (第${retryCount + 1}次):`, err);
            if (retryCount < MAX_RETRIES) {
              console.log('[AI] 自动重试中...精简消息后重试');
              // 重试前精简消息
              const trimmedMsgs = that._trimMessages(msgs);
              doCall(trimmedMsgs, retryCount + 1).then(resolve).catch(reject);
            } else {
              console.warn('[AI] 重试已耗尽，使用本地模拟');
              resolve(that.getLocalResponse());
            }
          }
        });
      });
    };

    return doCall(messages, 0);
  },

  // 精简消息，用于重试时减少请求体积
  _trimMessages(messages) {
    if (messages.length <= 6) return messages;
    const systemMsg = messages[0];
    const recentMsgs = messages.slice(-4); // 只保留最近4条
    return [systemMsg, ...recentMsgs];
  },

  // 本地模拟剧情回复（按角色区分）
  getLocalResponse() {
    const { role, scene, book } = this.data;

    // 如果轮次达到上限，返回结局格式的回复
    if (this.roundCount >= this.maxRounds) {
      return this.getLocalEndingResponse();
    }
    
    // 根据不同书籍、场景、角色提供模拟剧情
    const storyResponses = {
      'xiyouji': {
        'pantaoyuan': {
          sunwukong: [
            `【旁白】你悄悄溜进蟠桃园深处，只见满园仙桃散发着迷人的金光。火眼金睛一扫，园中布防一览无余。远处隐约传来脚步声。\n\n【七仙女】：「哎呀！齐天大圣？你怎么在这里？蟠桃还没熟透，不许偷吃！」\n\n【旁白】七仙女手提花篮，惊讶地望着你。她们身后的蟠桃树上，最大的蟠桃已经熟透。\n\n---\n① 🍑 变成蜜蜂偷吃最大的蟠桃\n② 💬 和七仙女套话打听盛会内幕\n③ 🏃 使个障眼法溜进瑶池\n\n[SCENE_EN: Monkey King sneaking through magical peach garden with golden glowing peaches, fairy maidens in background]`,
            `【旁白】蟠桃园深处，仙雾缭绕。你的火眼金睛捕捉到太上老君正独自一人在最古老的蟠桃树下采集丹材。\n\n【太上老君】：「猴头！你怎么又来了？看管蟠桃园不好好干活，四处乱窜！」\n\n【旁白】老君手中的紫金葫芦微微发光，里面似乎装着什么珍贵的东西。你的猴儿心痒了。\n\n---\n① 🧓 假装听话套近乎打听盛会邀请名单\n② 👀 用火眼金睛偷看紫金葫芦里是啥\n③ 😤 质问老君为什么盛会没请你\n\n[SCENE_EN: Monkey King confronting Taishang Laojun under ancient peach tree, golden gourd glowing]`,
          ],
          zhubajie: [
            `【旁白】你蹑手蹑脚钻进蟠桃园，肚子咕咕叫。满园仙桃的香气让你两眼放光——先吃两个垫垫肚子再说逃命的事！\n\n【七仙女】：「呀！这不是天蓬元帅吗？你不是被……天兵们到处在找你呢！」\n\n【旁白】七仙女们面露尴尬，显然已经听说了你调戏嫦娥的事。远处隐约有天兵巡逻的脚步声传来。\n\n---\n① 🍑 管不了那么多，先抱几个蟠桃往嘴里塞\n② 😰 赶紧求七仙女帮忙藏起来\n③ 🙏 假装若无其事说自己是来巡视的\n\n[SCENE_EN: A panicked pig-faced marshal hiding in peach garden, fairy maidens looking surprised]`,
            `【旁白】你躲在一棵大蟠桃树后面，屏住呼吸。太上老君恰好路过，差点踩到你的钉耙。\n\n【太上老君】：「什么东西——天蓬？你怎么在这鬼鬼祟祟的？外面天兵找你找疯了！」\n\n【旁白】老君叹了口气，看你可怜巴巴的样子，似乎有些犹豫要不要告发你。\n\n---\n① 🙏 扑通跪下求老君帮忙说情\n② 🤥 撒谎说自己是被冤枉的\n③ 🍑 趁老君犹豫偷偷往袖子里塞蟠桃\n\n[SCENE_EN: Pig marshal kneeling before Taishang Laojun begging for help, heavenly soldiers in distance]`,
          ],
          tangseng: [
            `【旁白】你的话在大殿中回荡，众罗汉纷纷睁眼。佛祖缓缓放下经卷，目光如深渊般望向你。空气凝滞了。\n\n【观音菩萨】：「金蝉子，你这疑问……在座修行千劫的菩萨尚且不敢问。你可想清楚了？」\n\n【旁白】观音语气中竟有几分赞许。佛祖不怒反笑，那微笑让你心头一震——像是在等你很久了。\n\n---\n① 🧘 直视佛祖继续追问轮回之苦\n② 📿 请求佛祖允许自己入世体验\n③ 🤔 犹豫片刻向佛祖行礼退下\n\n[SCENE_EN: Golden Cicada standing before Buddha in grand temple, all monks watching in shock, golden light]`,
            `【旁白】佛祖一段经文讲毕，殿中寂静。你咬住嘴唇忍了又忍，但疑问终究按捺不住——你微微抬起头来。\n\n【阿难】：「金蝉子师兄，你面色不对。今日佛祖所讲'苦集灭道'，你可有疑义？」\n\n【旁白】阿难的声音不大，但在寂静的大殿中格外清晰。几位罗汉投来目光。\n\n---\n① 🧘 坦然承认自己确有疑问\n② 🤫 摇头否认，散会后再单独请教\n③ 💡 反问阿难对轮回之苦的理解\n\n[SCENE_EN: Golden Cicada debating with monk disciples in serene Buddhist hall, golden light streaming in]`,
          ],
        },
        'sancijingubang': {
          sunwukong: [
            `【旁白】你举起金箍棒，一棒挥下！那"女子"尖叫倒地，化作一缕白烟散去——地上只留下一堆泥土假人。师父却惊得从白龙马上摔下来。\n\n【唐僧】：「悟空！你怎可打死无辜路人！阿弥陀佛……罪过罪过！」\n\n【旁白】师父的眼眶泛红，双手合十念经超度。八戒在旁边嘀咕："猴哥，你是不是看错了？"你低头看——地上确实只有一个"死去的少女"，白骨已经隐去了真形。\n\n---\n① 🗣️ 向师父解释你看到的妖气\n② 😤 懒得解释——火眼金睛绝不会错\n③ 🔍 翻开泥土让师父看清妖怪残留\n\n[SCENE_EN: Monkey King standing over shattered clay figure, Tang Monk horrified on ground, Pig marshal confused]`,
          ],
          zhubajie: [
            `【旁白】你一把接过斋饭，狼吞虎咽刚塞了一口——"呸！"嘴里全是沙土味！这哪是饭菜，分明是泥巴捏的！你的鼻子终于嗅出那股异味——是腐骨的气息！\n\n【白骨精（伪装）】：「呵呵……猪长老不满意？那我再给您做一份。」\n\n【旁白】她的笑容忽然扭曲了一瞬。师父还在旁边温和地道谢。远处有金光一闪——大师兄回来了！\n\n---\n① 🤮 赶紧把饭吐出来大喊"有问题！"\n② 🙈 假装好吃，偷偷拉住师父后退\n③ 🗣️ 冲着大师兄的方向大喊"猴哥快来！"\n\n[SCENE_EN: Pig marshal spitting out sandy food in shock, disguised woman's smile turning sinister, mountain path]`,
          ],
          tangseng: [
            `【旁白】你温和地开口询问，女子抽泣着答道："小女子家在岭那头，丈夫早亡，独自度日……"她的故事令人心酸。你伸手接过竹篮——就在这时，一道金影从天而降！\n\n【孙悟空】：「师父小心！那是妖怪！！」\n\n【旁白】悟空一棒打来，女子尖叫倒地！你的袈裟被溅上泥点。地上……是一个死去的年轻女子。悟空说她是妖怪，但你分明看见一条鲜活的生命消逝。紧箍咒在你舌尖打转。\n\n---\n① 😡 念紧箍咒惩罚悟空滥杀无辜\n② 😢 颤抖着查看女子的"尸体"\n③ 🤔 强忍怒火问悟空你看到了什么\n\n[SCENE_EN: Tang Monk in anguish, Monkey King with raised staff, fallen woman on ground, mountain path, tense]`,
          ],
        },
        'nverguo': {
          sunwukong: [
            `【旁白】你变成一只蚊子，嗡嗡飞过回廊。妖气越来越浓——国师的寝宫！你从门缝钻入，只见国师卸下官帽，露出额头上一道长长的疤痕……不，那不是疤痕，是一条蝎尾的纹路！\n\n【国师】：「哼哼……女王被那和尚迷了心窍，正好利用。等她把唐僧留下，我就……」\n\n【旁白】她忽然抬头——似乎感觉到了什么！你赶紧贴在房梁上一动不动。\n\n---\n① 🔍 继续偷听她的完整计划\n② ⚔️ 直接现出原形和她对峙\n③ 🏃 赶快回去告诉师父真相\n\n[SCENE_EN: Tiny mosquito Monkey King spying on sinister minister revealing scorpion tail mark, dark palace room]`,
          ],
          zhubajie: [
            `【旁白】你和姑娘们聊得正嗨，忽然一个侍卫模样的女子匆匆跑来——"国师有令，请天蓬元帅去宴席赴宴！"宴席上全是你最爱吃的：人参果、蟠桃酥、仙醪玉液……可总觉得哪里不对。\n\n【姑娘甲】：「天蓬大人，国师说了，只要您劝唐长老留下，这些天天都有您吃的！」\n\n【旁白】这分明是收买你！你嘴里塞满了蟠桃酥，脑子却转了起来——国师为什么这么急着让师父留下？\n\n---\n① 😋 先吃饱再说，含糊其辞答应着\n② 🤔 放下筷子追问国师到底想干啥\n③ 🏃 叼着食物跑去找大师兄汇报\n\n[SCENE_EN: Pig marshal at lavish banquet surrounded by women, suspicious feast, tempting food everywhere]`,
          ],
          tangseng: [
            `【旁白】你的声音在大殿中回荡。女王听到"佛道"二字，眼中的光芒黯淡了一瞬——但只有一瞬。她竟然笑了，笑得温柔而坦然。你发现自己不敢直视她的笑容。\n\n【女儿国国王】：「御弟哥哥，你心中有佛道，本王心中也有。本王的佛道，就是你。」\n\n【旁白】你的手指不由自主地握紧了佛珠。经文在脑海中一片空白。国师在旁冷笑——她似乎巴不得你留下。远处悟空的火眼金睛正焦急地望着这边。\n\n---\n① 📿 闭眼念心经，试图镇定心神\n② 💬 温和但坚定地请求通关文牒\n③ 😢 坦白说"贫僧……确实有一瞬心动"\n\n[SCENE_EN: Tang Monk looking away from smiling queen, clutching prayer beads tightly, inner conflict, palace scene]`,
          ],
        },
      },
      'harry_potter': {
        'sorting_ceremony': {
          harry: [
            `【旁白】你走上台阶，坐在高脚凳上。分院帽刚碰到你的头发，一个声音在脑海中响起——\n\n【分院帽】：「哈利·波特……我看到了勇气，不少聪明才智。但这是什么？与伏地魔的联系……斯莱特林能帮你走向伟大。」\n\n【旁白】大礼堂鸦雀无声。你的额头隐隐作痛，闪电伤疤似乎感应到了什么。\n\n---\n① 🦁 在心里拼命喊"不要斯莱特林！"\n② 🤔 问分院帽"什么联系？"\n③ 🤫 闭上眼，让分院帽自己决定\n\n[SCENE_EN: Harry Potter sitting on stool with sorting hat, great hall candles floating, everyone watching]`,
          ],
          hermione: [
            `【旁白】你走上台阶，努力不让双手发抖。分院帽落在你的卷发上，一个声音在脑海响起——\n\n【分院帽】：「啊，一个不知疲倦的头脑！霍格沃茨一段校史你都背下来了？拉文克劳很适合你……但等等，我看到更深的东西——关键时刻站出来的勇气。」\n\n【旁白】你的心砰砰直跳。你注意到马尔福在斯莱特林桌上投来轻蔑的目光。\n\n---\n① 📚 在心里想"拉文克劳也很好"\n② 💪 在心里想"我要证明麻瓜出身也行"\n③ 🤫 让分院帽看到你真正的自己\n\n[SCENE_EN: Hermione nervous on stool with sorting hat, great hall candles, Malfoy sneering in background]`,
          ],
          dumbledore: [
            `【旁白】你坐在校长高背椅上，柠檬雪宝的酸味在舌尖化开。分院帽唱完了歌，新生们紧张地等待。你的目光越过人群——哈利·波特的闪电伤疤在烛光下若隐若现。\n\n【分院帽（心灵对话）】：「又是一年，老朋友。今年的新生中有个特别的……你知道我说的是谁。」\n\n【旁白】教职员席上，斯内普看到哈利的瞬间，手中酒杯微微一颤。奇洛尔的紫色头巾似乎在微微蠕动。\n\n---\n① 👀 仔细观察哈利被分院时分院帽的犹豫\n② 🧙 留意斯内普看哈利时的复杂表情\n③ 🎩 与分院帽老友心灵对话了解内情\n\n[SCENE_EN: Dumbledore watching from high chair with twinkling eyes, sorting ceremony below, Snape uneasy]`,
          ],
        },
        'forbidden_forest': {
          harry: [
            `【旁白】你沿着银色血迹深入林中。树木越来越密，月光几乎照不进来。牙牙突然停下脚步，发出一声恐惧的呜咽。前方空地上——一头白色独角兽倒在地上，银色的血从伤口流出。它还在微弱地喘息。\n\n【海格】：「天哪……又一头！到底是什么东西在伤害它们？」\n\n【旁白】忽然，树丛深处有一个黑影缓缓靠近独角兽——它弯下腰，开始饮用银色的血液！你的闪电伤疤猛然一阵剧痛！\n\n---\n① 🕯️ 忍痛举起魔杖照亮黑影\n② 🏃 拉住海格后退躲起来观察\n③ 🗣️ 大声喝止"住手！"\n\n[SCENE_EN: Harry Potter in dark forest clearing, wounded unicorn on ground, dark hooded figure drinking silver blood, scar glowing with pain]`,
          ],
          hermione: [
            `【旁白】你披着隐形衣站在禁林边缘，深吸一口气。你的小包里有禁林地图、急救魔药和一瓶蓝色火焰。逻辑告诉你：独角兽失踪、斯内普鬼祟、半人马预言——这一切有联系。\n\n【旁白】忽然一道咒语感应从远处传来——有人在禁林深处施展黑魔法！你的侦测咒闪了一下红光。\n\n---\n① 📖 对照禁林地图定位黑魔法源头\n② 🔮 加强侦测咒确定是什么类型的魔法\n③ 🏠 先去海格小屋找个靠谱的大人\n\n[SCENE_EN: Hermione in invisibility cloak at forest edge, holding map and glowing wand, dark trees ahead]`,
          ],
          dumbledore: [
            `【旁白】你从高空俯瞰禁林，凤凰之影悄无声息地滑过树冠。视线穿透层层枝叶——海格正带着哈利沿银色血迹前进。他们越来越接近那片空地……奇洛尔的黑影已经蹲在独角兽尸体旁。\n\n【旁白】你感应到了——头巾下那个寄生者贪婪地饮下独角兽之血，生命力正在缓缓恢复。但还不是揭穿他的时候。你需要让哈利亲眼见到某些事。\n\n---\n① 🦅 暗中引导费伦泽前去保护哈利\n② 🧙 在空地周围布下不可见的保护结界\n③ 🔮 继续观察，看奇洛尔下一步如何行动\n\n[SCENE_EN: Phoenix shadow soaring above dark forest canopy, watching Hagrid and Harry approach danger below, moonlit]`,
          ],
        },
        'quidditch_match': {
          harry: [
            `【旁白】哨声响起！你骑着光轮2000冲上高空，风在耳边呼啸。马尔福骑着更快的光轮2001紧随其后。看台上红金旗帜翻飞。\n\n【马尔福】：「波特！你那破扫帚追不上我的！」\n\n【旁白】忽然你的扫帚猛然一抖——像是有什么看不见的力量在拽你。这种感觉……上次也发生过！\n\n---\n① 🏎️ 死死抓住扫帚全速冲刺甩开干扰\n② 👀 升到最高处俯瞰全场找金色飞贼\n③ 😎 假装看到飞贼骗马尔福扑空\n\n[SCENE_EN: Harry Potter on broomstick chasing golden snitch, Malfoy behind, quidditch stadium roaring]`,
          ],
          hermione: [
            `【旁白】望远镜中你看清了——奇洛尔嘴唇不停蠕动，目光死死锁定空中的哈利。忽然哈利的扫帚剧烈抖动了一下！不好——和上次一模一样！\n\n【罗恩】：「格兰芬多进球了！！赫敏你看到了吗——等等，哈利怎么了？！」\n\n【旁白】罗恩也注意到了。但你比他更早发现问题——斯内普的嘴唇也在动！他到底是在施咒还是在反咒？两个人同时念咒，你只能打断一个。你的蓝色火焰已经在指尖成形。\n\n---\n① 🔥 立刻对奇洛尔释放蓝色火焰\n② 🤔 再观察三秒钟判断谁是真正的施咒者\n③ 🔥 同时准备两团火焰打断两个人\n\n[SCENE_EN: Hermione aiming wand with blue flame at fingertip, Harry's broom shaking in background, tense moment]`,
          ],
          dumbledore: [
            `【旁白】你不动声色地释放了一道无形保护咒，如轻纱般罩住球场上空。哈利的扫帚刚才抖了一下——奇洛尔开始动手了。但你也注意到斯内普在小声念反咒。好，暂时让西弗勒斯处理。\n\n【旁白】麦格在旁边焦急地握住座椅扶手："校长，哈利的扫帚——"你拍拍她的手背微笑："精彩的比赛，不是吗？"同时你的目光扫到看台上的赫敏·格兰杰正拿着望远镜观察教职员席。聪明的孩子。\n\n---\n① 👀 继续让斯内普和赫敏各自行动不干预\n② 🧙 暗中加强保护咒确保万无一失\n③ 😄 故意站起来走动"恰好"挡住奇洛尔的视线\n\n[SCENE_EN: Dumbledore calmly sitting in VIP box with knowing smile, invisible protection charm above quidditch field]`,
          ],
        },
      },
      'little_prince': {
        'leave_b612': {
          little_prince: [
            `【旁白】玫瑰花听说你要走了。她咳嗽了两声——其实她一点也没有生病。她只是想让你多待一会儿。\n\n【玫瑰花】：「你要走就走吧，我才不在乎呢。我有四根刺，什么都不怕。」\n\n【旁白】她说这话的时候，晨露从她的花瓣上滑落，像是泪珠一样。三座小火山静静地看着这一切。\n\n---\n① 🌹 轻轻为玫瑰罩上玻璃罩\n② 💧 替她浇最后一次水\n③ 💬 告诉她"我一定会回来"\n\n[SCENE_EN: Little prince standing before his rose on tiny planet B612, morning dew on petals like tears]`,
          ],
          rose: [
            `【旁白】小王子提着水壶走来了。他的脚步比平时慢，好像在故意拖延。你赶紧整理了一下花瓣——要让他最后看到最美的你。\n\n【小王子】：「我……我要走了。你一个人会不会害怕？」\n\n【旁白】他的声音轻轻的，像是怕吵醒谁。你的根在星球里紧紧攥着，你多想说"别走"。但你是一朵骄傲的花。\n\n---\n① 🌹 "怕？我才不怕。走吧走吧。"（花瓣在颤抖）\n② 💧 假装打了个哈欠"你挡住我晒太阳了"\n③ 😤 "记得给我留好玻璃罩，晚上冷"\n\n[SCENE_EN: Rose flower on tiny planet trying to look brave, little prince with watering can looking sad]`,
          ],
        },
        'planet_tour': {
          little_prince: [
            `【旁白】国王调整了一下他巨大的紫貂皮斗篷，威严地看着你。整颗星球就只有他一个人，但他依然像统治着千万臣民一样认真。\n\n【国王】：「我命令你打个哈欠！不，等等——我命令你向我提一个问题。」\n\n【旁白】你注意到国王的命令总是"合理"的——他只命令别人做本来就会做的事。这让你觉得既可笑又有些悲伤。\n\n---\n① 🌅 请求国王命令太阳落山\n② ❓ 问国王统治一切有什么意义\n③ 👋 告辞前往下一颗星球\n\n[SCENE_EN: Little prince talking to tiny king on miniature planet with oversized throne, stars in background]`,
          ],
        },
        'tame_the_fox': {
          little_prince: [
            `【旁白】狐狸从草丛中探出头来，橙红色的皮毛在阳光下闪闪发光。他的眼睛温柔而明亮。\n\n【狐狸】：「驯养，就是建立联系。对我来说，你现在和其他千万个小男孩没有什么不同。但如果你驯养了我，我们就会彼此需要。」\n\n【旁白】远处的麦田在风中泛着金色的波浪。狐狸望着麦田，又望着你。\n\n---\n① 🦊 问他怎样才能驯养他\n② 🌾 问他为什么要望着麦田\n③ 🌹 告诉他你也有一个独一无二的朋友\n\n[SCENE_EN: Little prince sitting in golden wheat field with fox, warm sunset light, gentle breeze]`,
          ],
          fox: [
            `【旁白】你鼓起勇气从草丛里走了出来。小男孩歪着头看你，没有像猎人那样拿着枪。他的眼睛清澈得像星空。\n\n【小王子】：「你好，你真漂亮。你是谁？你愿意和我一起玩吗？」\n\n【旁白】他的声音温柔得让你想哭。但你知道——不能这么快。驯养需要耐心，需要仪式感，需要每天在同一个时间来。你深吸一口气。\n\n---\n① 🦊 告诉他"你不能和我玩，我还没被驯养"\n② 💛 教他驯养的规矩"你要每天同一时间来"\n③ 🌾 让他先坐远一点"明天再近一步"\n\n[SCENE_EN: Fox stepping out from wheat stalks facing little prince, golden afternoon light, hopeful shy expression]`,
          ],
        },
      },
    };

    const bookStories = storyResponses[book.id] || {};
    const sceneStories = bookStories[scene.id] || {};
    const roleStories = sceneStories[role.id] || [];
    
    if (roleStories.length > 0) {
      return roleStories[Math.floor(Math.random() * roleStories.length)];
    }

    // 通用兜底回复（包含角色名）
    return `【旁白】${role.name}环顾四周，故事仍在继续。前方道路充满未知，但你的心中已有了方向。\n\n---\n① ➡️ 继续探索\n② 💬 与附近的人交谈\n③ 🔍 仔细观察周围环境\n\n[SCENE_EN: ${role.name} looking around contemplatively in a story scene, warm illustration style]`;
  },

  // 本地模拟结局回复（按角色区分）
  getLocalEndingResponse() {
    const { book, scene, role } = this.data;
    
    const endingResponses = {
      'xiyouji': {
        'pantaoyuan': {
          sunwukong: `【终章】天兵天将从四面八方涌来，蟠桃园内仙气翻涌。你——齐天大圣孙悟空，环顾四周，满园狼藉的蟠桃树和打翻的玉液琼浆见证了今日的疯狂。玉帝的怒火震动九天，但你毫不畏惧——齐天大圣之名，今日响彻三界！你纵身一跃，踏上筋斗云，消失在天际的尽头。\n\n===THE_END===\n\n🏆 结局达成：大闹天宫\n📖 好一个齐天大圣！天庭也敢闹，蟠桃也敢吃，这份气魄无人能及！\n\n[SCENE_EN: Monkey King standing triumphantly on golden cloud above celestial palace, defiant pose, epic scene]`,
          zhubajie: `【终章】天兵围剿蟠桃园时，你——天蓬元帅，被一脚踹下了南天门。风在耳边呼啸，云层一层层从身旁掠过。你回头望了一眼天庭——那个再也回不去的地方。调戏嫦娥的酒劲早醒了，但后悔已经来不及。坠入凡间的最后一刻，你想起了广寒宫的月光……然后，一切归于黑暗。再睁眼时，你已是猪胎之身。\n\n===THE_END===\n\n🏆 结局达成：贬落凡间\n📖 天蓬元帅一杯浊酒误终身，从此天庭再无天蓬，凡间多了一个猪八戒。\n\n[SCENE_EN: Pig marshal falling from heaven through clouds, looking back at celestial gate with regret, dramatic]`,
          tangseng: `【终章】雷音寺大殿之上，你——金蝉子，终于开口向佛祖提出了那个所有人都不敢问的问题。佛祖沉默良久，最终缓缓开口："金蝉子，你有此疑，说明你需要亲身经历众生之苦。"一道金光将你笼罩，你的修为一层层被剥离。观音在旁默默垂泪。你的意识渐渐模糊——下一世，你将是大唐的一名僧人，要走最远的路，渡最苦的难。\n\n===THE_END===\n\n🏆 结局达成：金蝉转世\n📖 敢于质疑方见真知，金蝉子甘愿入凡尘体悟真谛，十世修行自此开始。\n\n[SCENE_EN: Golden Cicada monk being enveloped in golden light before Buddha, transformation scene, serene and solemn]`,
        },
        'sancijingubang': {
          sunwukong: `【终章】白骨精的真身终于暴露，一具白骨散落在山路上。你——孙悟空，收起金箍棒，火眼金睛缓缓黯淡。师父沉默了许久，终于理解了你的苦心。山风拂过吹散了妖气，取经路上的信任经此一劫反而更加坚固。你望着西方的天际——还有漫长的路要走。\n\n===THE_END===\n\n🏆 结局达成：除妖卫道\n📖 火眼金睛看穿伪善，金箍棒打碎虚妄，师徒之情在考验中愈发深厚！\n\n[SCENE_EN: Monkey King standing over skeleton remains with golden staff, master behind him, mountain sunset]`,
          zhubajie: `【终章】白骨精被大师兄打回原形，你——猪八戒，看着地上那堆白骨，后背一阵发凉。你差点就吃了妖怪的斋饭！更让你愧疚的是，你之前还在师父耳边说大师兄的坏话……你默默走到大师兄身边，干咳一声："猴哥，这个……俺老猪以前说的话，你别往心里去啊。"\n\n===THE_END===\n\n🏆 结局达成：醒悟之路\n📖 天蓬虽然嘴碎贪吃，但在真相面前也懂得认错，取经路上的老猪正在慢慢成长。\n\n[SCENE_EN: Pig marshal looking guilty beside Monkey King, skeleton on ground, mountain path, evening light]`,
          tangseng: `【终章】你——唐三藏，亲眼看着白骨从地上散落。原来……悟空每一次出手都是在救你。紧箍咒念了三次，每一次都是你错了。你双手合十，向悟空深深一拜："悟空，为师错怪你了。"这一刻，你明白了：慈悲不是对妖怪仁慈，而是信任那些真正保护你的人。\n\n===THE_END===\n\n🏆 结局达成：信任重建\n📖 肉眼凡胎看不穿幻象，但一颗真心终能分辨忠奸。师父的成长，也是取经路上的修行。\n\n[SCENE_EN: Tang Monk bowing to Monkey King in gratitude, skeleton scattered, emotional mountain scene]`,
        },
        'nverguo': {
          sunwukong: `【终章】城门大开，你——孙悟空，护着师父走出女儿国。蝎子精已被你打回原形，女王安然无恙。你回头看了一眼——女王站在城墙上，目送师父离去。她没有哭。你挠挠头："师父这一关，比打妖怪还难。"转身踏上筋斗云，前方的路还长。\n\n===THE_END===\n\n🏆 结局达成：护道除妖\n📖 齐天大圣护师周全，蝎子精伏法，女儿国平安。最难降的妖不在外面，在心里。\n\n[SCENE_EN: Monkey King flying on cloud leading group away from women's kingdom, queen watching from wall]`,
          zhubajie: `【终章】离开女儿国时，你——猪八戒，回头望了好几次。满城姑娘在城门口挥手，你眼眶湿润。但你最终还是跟上了队伍——不是因为不想留下，而是你知道，取经路上的兄弟们不能少你一个。虽然嘴上说着"走吧走吧不稀罕"，心里却把今天的姑娘们的笑脸记了个清清楚楚。\n\n===THE_END===\n\n🏆 结局达成：割舍之路\n📖 老猪终于明白：不是所有留恋都该留下，有些路必须一起走才有意义。成长就是学会告别。\n\n[SCENE_EN: Pig marshal walking away from women's kingdom, looking back with teary eyes, beautiful sunset]`,
          tangseng: `【终章】城门缓缓打开，你——唐三藏，迈出了最难的一步。女王站在城墙上，凤袍在风中飘扬，目送你远去。她没有哭泣，只是微微笑着。你的手中多了一串她送的珠子——不，你不能收。你将它轻轻放在城门石上。有些相遇注定短暂，却足以铭记一生。你默念心经，踏上西行之路。\n\n===THE_END===\n\n🏆 结局达成：道义离别\n📖 世间最难是相遇，最美是放手。唐三藏在情与道之间做出了最有担当的选择。\n\n[SCENE_EN: Tang Monk walking away from kingdom gate, queen watching from above, wind blowing, emotional scene]`,
        },
      },
      'harry_potter': {
        'sorting_ceremony': {
          harry: `【终章】分院帽沉吟片刻，终于大声宣布——"格兰芬多！"你——哈利·波特，松了一口气。整个大礼堂爆发出雷鸣般的掌声。韦斯莱兄弟高喊"我们有波特了！"你走向红金色的长桌，迎面是热情的笑脸。闪电伤疤微微发痒，但此刻你不在乎——你终于有了属于自己的家。\n\n===THE_END===\n\n🏆 结局达成：勇者归处\n📖 分院帽看穿了一切，但最终决定的是你自己的心。勇气选择了你，你也选择了勇气。\n\n[SCENE_EN: Harry Potter walking to Gryffindor table after sorting, everyone cheering, candles floating, warm]`,
          hermione: `【终章】"格兰芬多！"分院帽大声宣布。你——赫敏·格兰杰，愣了一瞬。不是拉文克劳？但你很快明白了——分院帽看到了比智慧更深的东西：关键时刻站出来的勇气。你从高脚凳上站起来，昂首走向红金长桌。马尔福轻蔑的目光？管他呢。一个麻瓜出身的女巫，将会成为霍格沃茨最优秀的学生。\n\n===THE_END===\n\n🏆 结局达成：勇气与智慧\n📖 聪明不止在书本里，真正的勇气是明知被偏见包围，依然选择发光。赫敏，好样的。\n\n[SCENE_EN: Hermione walking proudly to Gryffindor table after sorting, head held high, magical candle light]`,
          dumbledore: `【终章】分院仪式结束，你——邓布利多，站起身来。大礼堂安静下来。"在这新学年开始之前，我有几句话要说——"你看向哈利·波特，那个命运沉重的男孩正和韦斯莱家的小儿子聊得开心。还好，他现在还只是一个普通的快乐男孩。你微微一笑："蠢瓜！眼泪！残渣！拧！谢谢大家。"全场鼓掌。你坐下，啜了口柠檬雪宝。一切都在按计划进行。\n\n===THE_END===\n\n🏆 结局达成：伟大棋局\n📖 最伟大的巫师从不在前台表演，他只是安静地守护着每一个命运的转折点。\n\n[SCENE_EN: Dumbledore standing at podium giving quirky speech, twinkling eyes, great hall festive atmosphere]`,
        },
        'forbidden_forest': {
          harry: `【终章】月光穿透云层，你——哈利·波特，跌跌撞撞跑出了禁林。身后那个喝独角兽血的黑影还在你脑海中挥之不去，闪电伤疤的剧痛渐渐消退。费伦泽的预言回荡在耳边："火星异常明亮……"海格在林边接住了你，牙牙舔你的手。远处霍格沃茨城堡的灯火温暖而明亮，但你知道，今晚看到的一切将改变很多事情。\n\n===THE_END===\n\n🏆 结局达成：禁林秘闻\n📖 勇气不是不害怕，而是害怕了依然前行。闪电伤疤第一次灼痛——命运的齿轮已经转动。\n\n[SCENE_EN: Harry Potter emerging from dark forest, scar glowing, Hogwarts castle lights in distance, moonlit]`,
          hermione: `【终章】你——赫敏，在禁林中发现了关键线索：不是斯内普，是奇洛尔！地上有他独特靴印的痕迹，直通向独角兽血迹的终点。你用魔杖记录了一切，紧紧抱着证据跑出禁林。隐形衣下的你在颤抖——不是因为害怕，而是因为兴奋。书本教不了的东西，今夜你都学到了。\n\n===THE_END===\n\n🏆 结局达成：真相猎人\n📖 最聪明的女巫不仅读书，更会在黑暗中寻找光。书本之外的冒险，才是真正的成长。\n\n[SCENE_EN: Hermione running from forest with evidence notes, invisibility cloak billowing, determined expression]`,
          dumbledore: `【终章】凤凰之影悄然收回，你——邓布利多，回到了校长办公室。窗外的禁林重归平静。哈利安全了——费伦泽及时出现救了他，正如你安排的那样。你在冥想盆中搅动银色记忆：伏地魔……残魂……魂器。还不是揭穿一切的时候，但今夜确认了一件事——他回来了，只是还不够强大。你看了一眼凤凰福克斯。"我们还有时间。"\n\n===THE_END===\n\n🏆 结局达成：暗中守护\n📖 最伟大的守护者从不被看见。邓布利多的棋局上，每一个人都被安排在最安全的位置。\n\n[SCENE_EN: Dumbledore in office looking at pensieve memories, Fawkes the phoenix beside him, moonlight through window]`,
        },
        'quidditch_match': {
          harry: `【终章】金色飞贼在手中扑腾着翅膀！你——哈利·波特，高高举起它。看台上的欢呼声震耳欲聋！队友们蜂拥而上将你抛向空中。李·乔丹的解说声激动到破音，马尔福只能黯然降落。光轮2000在阳光下闪闪发光——它没有让你失望，你也没有让格兰芬多失望。学院杯属于你们！\n\n===THE_END===\n\n🏆 结局达成：荣耀时刻\n📖 一场精彩绝伦的比赛！哈利用勇气和飞行天赋赢得了属于自己的荣耀！\n\n[SCENE_EN: Harry Potter catching golden snitch triumphantly, teammates celebrating, stadium roaring, golden light]`,
          hermione: `【终章】蓝色火焰从你的魔杖尖射出，精准打中了奇洛尔的长袍！他惊慌地拍打火焰，对哈利扫帚的诅咒瞬间中断。你——赫敏，看到哈利的扫帚恢复了正常，长出一口气。几秒后，哈利抓住了金色飞贼！全场欢呼。没有人知道真正扭转局势的人坐在看台上。你悄悄收起魔杖，鼓着掌，笑得比谁都开心。\n\n===THE_END===\n\n🏆 结局达成：幕后英雄\n📖 最关键的胜利不在球场上。赫敏用智慧和魔法拯救了比赛，却从不需要掌声。\n\n[SCENE_EN: Hermione secretly casting blue flame spell in stands, Harry catching snitch in background, clever smile]`,
          dumbledore: `【终章】比赛结束了。你——邓布利多，放下黄油啤酒，轻轻鼓掌。你的保护咒在关键时刻稳住了哈利的扫帚——当然，斯内普的反咒也起了作用。赫敏的蓝色火焰打断了奇洛尔——聪明的孩子。一切看似巧合，但棋局上的每一步你都了如指掌。你对麦格微微一笑："精彩的比赛，是吧？"\n\n===THE_END===\n\n🏆 结局达成：运筹帷幄\n📖 当所有人以为赢在球场时，真正的胜负手早已布好。最伟大的巫师，永远不在聚光灯下。\n\n[SCENE_EN: Dumbledore clapping calmly in VIP box, knowing everything, Gryffindor celebrating below]`,
        },
      },
      'little_prince': {
        'leave_b612': {
          little_prince: `【终章】你——小王子，最后看了一眼B612星球——那三座小火山，那几株需要提防的猴面包树苗，还有那朵骄傲的玫瑰花。她在玻璃罩下安静地绽放着，晨露在花瓣上闪烁。"再见了，"你轻轻地说。候鸟展翅飞翔，带着你飞向了浩瀚的星空。旅途开始了，但心中那朵花，永远不会被忘记。\n\n===THE_END===\n\n🏆 结局达成：星际启程\n📖 离开，是为了更好地理解。因为你在她身上花费了时间，她才变得如此重要。\n\n[SCENE_EN: Little prince leaving tiny planet B612 with migrating birds, rose under glass dome below, starry sky]`,
          rose: `【终章】他走了。你——B612星球上唯一的玫瑰花，看着候鸟带走了你的小王子。你没有哭——至少你告诉自己没有。"我有四根刺呢，"你对着空荡荡的星球说。风吹过，没有人回答。但你知道他会回来的。因为他给你浇过水，给你挡过风，给你罩上了玻璃罩。你是他驯养过的花。你闭上花瓣，在玻璃罩下安静地等待。\n\n===THE_END===\n\n🏆 结局达成：等待的花\n📖 最勇敢的不是出发的人，而是留下来等待的那朵花。四根刺挡不住思念，但撑得住整个星球的孤独。\n\n[SCENE_EN: Single rose under glass dome on tiny planet, watching stars alone, beautiful and melancholic, soft light]`,
        },
        'planet_tour': {
          little_prince: `【终章】你——小王子，告别了最后一颗星球上的点灯人——他是所有大人中唯一让你觉得不荒唐的人，因为他至少在为别人做事。星星在你身旁闪烁，每一颗都像一盏等待被点亮的灯。你望向远方那颗蓝色的星球——地球。也许在那里，你能找到真正重要的东西。\n\n===THE_END===\n\n🏆 结局达成：星际感悟\n📖 大人们总是需要数字才能理解事物，但真正重要的东西，是用眼睛看不见的。\n\n[SCENE_EN: Little prince floating between stars heading toward Earth, small planets behind him, dreamy atmosphere]`,
        },
        'tame_the_fox': {
          little_prince: `【终章】狐狸最后对你说出了他的秘密："只有用心才能看清事物的本质，真正重要的东西用眼睛是看不见的。"你——小王子，终于明白了。金色的麦田在风中起伏，像是在向你们告别。你知道从今以后，每次看到金色的麦田，你都会想起这只被你驯养的狐狸——而他看到麦田，也会想起你金色的头发。\n\n===THE_END===\n\n🏆 结局达成：驯养之约\n📖 你已经明白了：你要对你驯养的东西负责。这是狐狸教给你的，也是整个旅途中最珍贵的礼物。\n\n[SCENE_EN: Little prince hugging fox in golden wheat field, warm sunset, tears and smiles, beautiful farewell]`,
          fox: `【终章】他要走了。你——狐狸，早就知道这一刻会来。"我会哭的，"你说。小王子紧张地问："那驯养你又有什么好处呢？"你望向金色的麦田："你看到那边的麦田了吗？我不吃面包。麦子对我来说一点意义也没有。但你有一头金色的头发。从今以后，金色的麦子会让我想起你。"风吹过麦浪。你把那个秘密告诉了他——只有用心才能看清事物的本质。然后你看着他离开。麦田从此有了意义。\n\n===THE_END===\n\n🏆 结局达成：金色的羁绊\n📖 驯养的代价是眼泪，收获的是整片金色的麦田。从此世间万物，都因联系而有了意义。\n\n[SCENE_EN: Fox watching little prince walk away through golden wheat field, bittersweet farewell, golden sunset]`,
        },
      },
    };

    const bookEndings = endingResponses[book.id] || {};
    const sceneEndings = bookEndings[scene.id] || {};
    const roleEnding = sceneEndings[role.id];
    
    if (roleEnding) {
      return roleEnding;
    }

    // 通用兜底结局（使用角色名）
    return `【终章】故事在这里落下了帷幕。${role.name}回望这段旅程中的每一个选择，每一次冒险，都构成了独属于你的精彩篇章。或许结局并不完美，但正是这些经历让你成长。抬头望去，前方还有更多的故事在等待...\n\n===THE_END===\n\n🏆 结局达成：旅途归来\n📖 每一个选择都通向独一无二的故事，${role.name}的故事比任何人都精彩。\n\n[SCENE_EN: ${role.name} looking at horizon after journey, warm golden light, reflective peaceful moment]`;
  },

  // 键盘高度变化
  onKeyboardHeightChange(e) {
    this.setData({
      keyboardHeight: e.detail.height || 0,
    });
  },
});
