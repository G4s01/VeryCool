// js/theme-toggle.js
// Theme toggle: manages light/dark switching, persists choice and updates meta theme-color.
// Loads css/theme.light.css dynamically when switching to light so you don't need to
// include theme.light.css in index.html explicitly.
//
// Changes made:
// - Apply theme class on <html> (document.documentElement) instead of only on <body>.
//   This ensures CSS variables defined for html.light/html.dark are applied to the root
//   and the html background updates correctly.
// - Keep body class for backward compatibility.
// - Compute meta theme-color from CSS variable (--bg-0) on the root so it always matches
//   the active theme (and update it after dynamically loading the light CSS).
// - Robust loading/unloading of the optional light CSS with onload callback to update meta.

(function () {
  const THEME_KEY = 'vm-techneon-theme';
  const metaTheme = document.getElementById('metaThemeColor');
  const HTML = document.documentElement;
  const BODY = document.body;
  const toggleBtnId = 'themeToggle';

  // Path to optional light-theme CSS file (will be loaded/unloaded dynamically)
  const THEME_LIGHT_HREF = './css/theme.light.css';
  const LIGHT_LINK_ID = 'theme-light-css';

  function setMetaColorFromCss() {
    if (!metaTheme) return;
    try {
      // Prefer --bg-0 from the root (html) so the gradient/meta color matches the visible background.
      const rootStyles = getComputedStyle(HTML);
      let bg = rootStyles.getPropertyValue('--bg-0') || rootStyles.backgroundColor || '';
      bg = String(bg).trim();
      if (!bg) {
        // fallback to a sensible default
        bg = (HTML.classList.contains('light') ? '#f3fffb' : '#0d1716');
      }
      metaTheme.setAttribute('content', bg);
    } catch (e) {
      // ignore
    }
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
          // When the light CSS is loaded, update meta color so it reads the new variables.
          link.onload = function () {
            // small timeout to allow styles to settle in some browsers
            setTimeout(setMetaColorFromCss, 20);
          };
          document.head.appendChild(link);
        } else {
          // already present — ensure meta color is correct
          setMetaColorFromCss();
        }
      } else {
        if (existing) existing.remove();
        // After removing the light CSS, update meta color immediately
        setTimeout(setMetaColorFromCss, 20);
      }
    } catch (e) {
      // don't break if DOM manipulation fails
      console.warn('theme-toggle: ensureLightCss failed', e);
    }
  }

  function setThemeClass(mode) {
    const light = mode === 'light';
    // Set class on html (root) for variables used by html backgrounds
    if (light) {
      HTML.classList.add('light');
      HTML.classList.remove('dark');
      // also keep body in sync for backward compatibility
      BODY.classList.add('light');
      BODY.classList.remove('dark');
    } else {
      HTML.classList.remove('light');
      HTML.classList.add('dark');
      BODY.classList.remove('light');
      BODY.classList.add('dark');
    }
  }

  function applyTheme(mode) {
    const light = mode === 'light';

    // set classes on root and body
    setThemeClass(mode);

    // load/unload optional light theme file
    ensureLightCss(light);

    // update meta color (ensureLightCss will also call it after load)
    setMetaColorFromCss();

    // update button label if present
    const btn = document.getElementById(toggleBtnId);
    if (btn) btn.textContent = light ? '🌙' : '☀️';

    // persist
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* ignore */ }
  }

  function init() {
    try {
      // Check explicit saved preference
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') {
        applyTheme(saved);
      } else {
        // If no saved preference, infer from existing html/body classes (useful if server rendered)
        if (HTML.classList.contains('light') || BODY.classList.contains('light')) {
          applyTheme('light');
        } else if (HTML.classList.contains('dark') || BODY.classList.contains('dark')) {
          applyTheme('dark');
        } else {
          // fallback to system preference
          const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
          applyTheme(prefersDark ? 'dark' : 'light');
        }
      }
    } catch (e) {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }

    const btn = document.getElementById(toggleBtnId);
    if (btn) {
      btn.addEventListener('click', function () {
        const isLight = HTML.classList.contains('light');
        applyTheme(isLight ? 'dark' : 'light');
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();