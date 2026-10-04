/**
 * miniapp-bridge.js — safe Telegram WebApp enhance (browser-compatible)
 */
(function () {
  try {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return; // normal browser — leave site alone
    tg.ready();
    tg.expand();
    document.documentElement.classList.add('tg-miniapp');
    if (tg.themeParams) {
      var p = tg.themeParams;
      var root = document.documentElement;
      if (p.bg_color) root.style.setProperty('--rq-bg', p.bg_color);
      if (p.text_color) root.style.setProperty('--rq-text', p.text_color);
      if (p.button_color) root.style.setProperty('--rq-accent', p.button_color);
    }
    // Expose user for dashboards
    window.RQ_TG = {
      user: tg.initDataUnsafe && tg.initDataUnsafe.user,
      initData: tg.initData,
      close: function () {
        tg.close();
      },
      mainButton: tg.MainButton,
    };
  } catch (e) {
    console.warn('miniapp-bridge', e);
  }
})();
