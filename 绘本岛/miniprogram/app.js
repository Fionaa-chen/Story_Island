// app.js
App({
  onLaunch: function () {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'education-story-3gojrky979f5bf8f',
        traceUser: true,
      });
    }

    // 统一使用系统字体，不再远程加载 CrayonFont
    // 字体回退链：PingFang SC (iOS) → sans-serif
    console.log('[Font] 使用系统字体 PingFang SC / sans-serif');
  },
  globalData: {
    // AI 大模型配置
    aiConfig: {
      // 使用 DeepSeek 云函数调用 AI
      provider: 'deepseek-cloud-function',
      model: 'deepseek-chat',
    }
  }
});
