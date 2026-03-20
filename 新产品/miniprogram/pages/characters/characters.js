// pages/characters/characters.js
const { booksData } = require('../../data/books');

Page({
  data: {
    book: null,
    roles: [],
    scenes: [],
    bookId: '',
    selectedRoleIndex: -1,
    selectedSceneIndex: -1,
    step: 1, // 1=选角色, 2=选场景
  },

  onLoad(options) {
    const { bookId } = options;
    const book = booksData.find(b => b.id === bookId);
    if (book) {
      this.setData({
        book,
        roles: book.roles,
        scenes: book.scenes,
        bookId,
      });
      wx.setNavigationBarTitle({
        title: book.title,
      });
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: book.color,
        animation: { duration: 300, timingFunc: 'easeIn' }
      });
    }
  },

  // 选中角色
  onRoleTap(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ selectedRoleIndex: index });
  },

  // 确认角色，进入选场景步骤（根据roleAvailability过滤可用场景）
  onConfirmRole() {
    if (this.data.selectedRoleIndex < 0) return;
    const selectedRole = this.data.roles[this.data.selectedRoleIndex];
    const allScenes = this.data.book.scenes;
    // 过滤出该角色可以进入的场景
    const availableScenes = allScenes.filter(scene => {
      if (!scene.roleAvailability) return true; // 不设置=全部可用
      return scene.roleAvailability.includes(selectedRole.id);
    });
    this.setData({ step: 2, scenes: availableScenes, selectedSceneIndex: -1 });
  },

  // 返回选角色步骤（重置场景列表为全部）
  onBackToRole() {
    this.setData({ step: 1, selectedSceneIndex: -1, scenes: this.data.book.scenes });
  },

  // 选中场景
  onSceneTap(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ selectedSceneIndex: index });
  },

  // 开始剧情
  onStartStory() {
    const { selectedRoleIndex, selectedSceneIndex, bookId, roles, scenes } = this.data;
    if (selectedRoleIndex < 0 || selectedSceneIndex < 0) return;
    
    const roleId = roles[selectedRoleIndex].id;
    const sceneId = scenes[selectedSceneIndex].id;
    
    wx.navigateTo({
      url: `/pages/story/story?bookId=${bookId}&roleId=${roleId}&sceneId=${sceneId}`,
    });
  },
});
