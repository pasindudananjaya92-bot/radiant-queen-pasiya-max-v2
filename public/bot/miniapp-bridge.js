/**
 * miniapp-bridge.js — Telegram WebApp + hide Google/Firebase login inside TG
 */
(function () {
  try {
    var tg = window.Telegram && window.Telegram.WebApp;
    var isTg = !!tg;
    if (isTg) {
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
      window.RQ_TG = {
        user: tg.initDataUnsafe && tg.initDataUnsafe.user,
        initData: tg.initData,
        close: function () { tg.close(); },
        mainButton: tg.MainButton,
      };
      // Hide Google / Firebase sign-in (sessionStorage blocked in WebView)
      var hideSel = [
        '[data-provider="google"]',
        '.firebase-google-btn',
        '#google-login',
        '#googleSignIn',
        'button[data-auth="google"]',
        '.btn-google',
        'a[href*="accounts.google.com"]',
      ];
      function hideGoogle() {
        hideSel.forEach(function (sel) {
          document.querySelectorAll(sel).forEach(function (el) {
            el.style.display = 'none';
          });
        });
        // Show Telegram auth panel if present
        document.querySelectorAll('[data-auth="telegram"], .tg-login-only').forEach(function (el) {
          el.style.display = '';
        });
      }
      hideGoogle();
      setTimeout(hideGoogle, 500);
      setTimeout(hideGoogle, 1500);
    } else {
      // Browser: hide Telegram-only blocks
      document.querySelectorAll('.tg-login-only').forEach(function (el) {
        el.style.display = 'none';
      });
    }
  } catch (e) {
    console.warn('miniapp-bridge', e);
  }
})();
