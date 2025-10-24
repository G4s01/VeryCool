// js/utils.js
// Utility functions used across the app. Exposed as window.AppUtils.

(function(){
  const AppUtils = {
    escapeHtml(str){
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    },
    nowTime(){
      const d = new Date(), p = n => String(n).padStart(2,'0');
      return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    },
    async copyText(text){
      try { if (navigator.clipboard?.writeText){ await navigator.clipboard.writeText(text); return true; } } catch {}
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        return true;
      } catch { return false; }
    },
    // Extract http(s) URLs from nested objects/strings
    urlifyFromObject(obj){
      const out = new Set(), rx = /https?:\/\/[^\s"']+/g;
      (function walk(o){
        if (o == null) return;
        if (typeof o === 'string'){ const m = o.match(rx); if (m) m.forEach(u => out.add(u)); }
        else if (Array.isArray(o)) o.forEach(walk);
        else if (typeof o === 'object'){ for (const k in o){ const v = o[k]; if (typeof v === 'string' && (k.toLowerCase().endsWith('url') || k.toLowerCase().includes('link'))){ const m = v.match(rx); if (m) m.forEach(u => out.add(u)); } walk(v); } }
      })(obj);
      return [...out];
    }
  };

  window.AppUtils = AppUtils;
})();