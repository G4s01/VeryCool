// js/theme-toggle.js
// Theme toggle: manages light/dark switching, persists choice and updates meta theme-color.
// Loads css/theme.light.css dynamically when switching to light so you don't need to
// include theme.light.css in index.html explicitly.

(function () {
  const THEME_KEY = 'vm-techneon-theme';
  const metaTheme = document.getElementById('metaThemeColor');
  const body = document.body;
  const toggleBtnId = 'themeToggle';

  // Path to optional light-theme CSS file (will be loaded/unloaded dynamically)
  const THEME_LIGHT_HREF = './css/theme.light.css';
  const LIGHT_LINK_ID = 'theme-light-css';

  function setMetaColor(isLight) {
    if (!metaTheme) return;
    try {
      metaTheme.setAttribute('content', isLight ? '#f3fffb' : '#0d1716');
    } catch (e) { /* ignore */ }
  }

  function ensureLightCss(shouldLoad) {
    try {
      const existing = document.getElementById(LIGHT_LINK_ID);
      if (shouldLoad) {
        if (!existing) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = THEME_LIGHT_HREF;
          link.id = LIGHT_LINK_ID;
          // append after other head children so variables are available
          document.head.appendChild(link);
        }
      } else {
        if (existing) existing.remove();
      }
    } catch (e) {
      // don't break if DOM manipulation fails
      console.warn('theme-toggle: ensureLightCss failed', e);
    }
  }

  function applyTheme(mode) {
    const light = mode === 'light';
    // toggle classes for compatibility
    if (light) {
      body.classList.add('light');
      body.classList.remove('dark');
    } else {
      body.classList.remove('light');
      body.classList.add('dark');
    }

    // load/unload optional light theme file
    ensureLightCss(light);

    // update meta color
    setMetaColor(light);

    // update button label if present
    const btn = document.getElementById(toggleBtnId);
    if (btn) btn.textContent = light ? '🌙' : '☀️';

    // persist
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* ignore */ }
  }

  function init() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') {
        applyTheme(saved);
      } else {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
      }
    } catch (e) {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }

    const btn = document.getElementById(toggleBtnId);
    if (btn) {
      btn.addEventListener('click', function () {
        const isLight = body.classList.contains('light');
        applyTheme(isLight ? 'dark' : 'light');
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();