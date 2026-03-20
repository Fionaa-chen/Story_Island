// pages/bookshelf/bookshelf.js
const { booksData } = require('../../data/books');

Page({
  data: {
    books: [],
    currentBookIndex: 0,
    scrollLeft: 0,
    windowWidth: 375,
    animationReady: false,
  },

  onLoad() {
    const systemInfo = wx.getWindowInfo();
    this.setData({
      books: booksData,
      windowWidth: systemInfo.windowWidth,
    });
  },

  onReady() {
    setTimeout(() => {
      this.setData({ animationReady: true });
    }, 100);
  },

  // 点击书籍进入角色选择
  onBookTap(e) {
    const { bookId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/characters/characters?bookId=${bookId}`,
    });
  },

  // 滑动切换书籍
  onSwiperChange(e) {
    this.setData({
      currentBookIndex: e.detail.current,
    });
  },
});
