// js/ui.js
// UI rendering and helpers (addCard, marquee, badge, toast).
// Exposed as window.AppUI and uses window.AppUtils.

(function(){
  const U = window.AppUtils || {};
  // Query elements lazily
  function $id(id){ return document.getElementById(id); }

  function updateCountFactory(itemsRef){
    const resCount = $id('resCount');
    const clearAllBtn = $id('clearAllBtn');
    return function updateCount(){
      if (!resCount) return;
      resCount.textContent = String(itemsRef.length);
      if (clearAllBtn) clearAllBtn.disabled = itemsRef.length === 0;
      resCount.classList.remove('bump'); void resCount.offsetWidth; resCount.classList.add('bump');
    };
  }

  function setupOfferIdMarquee(tagEl){
    if(!tagEl) return;
    // If we've already initialized, skip re-init
    if (tagEl.dataset._marqueeInit === '1') return;
    tagEl.dataset._marqueeInit = '1';

    const oldViewport = tagEl.querySelector('.mview');
    let viewport = oldViewport;
    if(!viewport){
      viewport = document.createElement('span');
      viewport.className = 'mview';
      const texts = Array.from(tagEl.childNodes).filter(n => !(n.nodeType===1 && n.classList && n.classList.contains('dot')));
      texts.forEach(n => viewport.appendChild(n));
      tagEl.appendChild(viewport);
    }
    // Save original inner text to data attribute for reliable reset later
    const originalInner = viewport.querySelector('.inner');
    const rawText = originalInner ? originalInner.textContent : viewport.textContent.trim();
    tagEl.dataset.marqueeText = rawText;

    viewport.innerHTML = '';

    const track = document.createElement('span');
    track.className = 'track';
    const c1 = document.createElement('span'); c1.className='copy'; c1.textContent = rawText;
    const c2 = document.createElement('span'); c2.className='copy'; c2.textContent = rawText;
    track.append(c1, c2);
    viewport.append(track);

    requestAnimationFrame(()=>{
      const wContainer = tagEl.clientWidth;
      const wCopy = c1.scrollWidth;
      if (wCopy <= wContainer){
        // ensure clean non-animated state
        tagEl.classList.remove('marquee');
        viewport.innerHTML = '';
        const base = document.createElement('span'); base.className='inner'; base.textContent = rawText;
        viewport.appendChild(base);
        // cleanup any leftover inline properties
        viewport.style.removeProperty('--tag-distance');
        viewport.style.removeProperty('--tag-duration');
        return;
      }
      const gap = 32;
      const distance = wCopy + gap;
      const duration = Math.max(6, distance / 90);
      viewport.style.setProperty('--tag-distance', distance + 'px');
      viewport.style.setProperty('--tag-duration', duration + 's');
      tagEl.classList.add('marquee');
    });
  }

  // Stop and reset marquee on a specific element
  function stopOfferIdMarquee(tagEl){
    if (!tagEl) return;
    // remove the marquee class and rebuild the inner static view from saved text
    tagEl.classList.remove('marquee');
    const viewport = tagEl.querySelector('.mview') || (function(){
      const v = document.createElement('span'); v.className='mview'; tagEl.appendChild(v); return v;
    })();
    // Prefer stored original text, fallback to computed text
    const rawText = tagEl.dataset.marqueeText || (viewport.textContent || '').trim() || '';
    // Clear track and set single inner
    viewport.innerHTML = '';
    const base = document.createElement('span'); base.className='inner'; base.textContent = rawText;
    viewport.appendChild(base);
    // remove inline css vars
    viewport.style.removeProperty('--tag-distance');
    viewport.style.removeProperty('--tag-duration');
    // keep init flag for subsequent reuse
  }

  // Stop and reset marquees on all .tag.long elements
  function stopAllOfferIdMarquees(){
    const els = document.querySelectorAll('.tag.long');
    els.forEach(el => {
      try { stopOfferIdMarquee(el); } catch (e) { /* ignore */ }
    });
  }

  // addCard: shows extracted links and JSON preview. copy button left for manual copy.
  function createAddCard(itemsRef, updateCountFn){
    const linksContainer = document.getElementById('linksContainer');
    const SIM_LABELS = { 'standard':'SIM', 'e-sim':'eSIM', 'idle-sim':'idleSIM' };

    return function addCard({ offerId, sim, urlList, request, response, error }){
      if (!linksContainer) return;
      const card = document.createElement('div'); card.className = 'card latest';
      const ts = U.nowTime();
      const simLabel = SIM_LABELS && SIM_LABELS[sim] ? SIM_LABELS[sim] : sim;
      card.innerHTML = `
        <div class="meta">
          <span class="tag" title="Timestamp"><span class="dot"></span>${ts}</span>
          <span class="tag long" title="OfferID">
            <span class="dot"></span>
            <span class="mview"><span class="inner">${U.escapeHtml(offerId)}</span></span>
          </span>
          <span class="tag" title="SIM"><span class="dot"></span>${U.escapeHtml(simLabel)}</span>
        </div>
        <div class="links-list">
          ${urlList.map(u=>`<a href="${u}" target="_blank" rel="noopener">${u}</a>`).join('')}
        </div>
        <div class="actions">
          ${urlList[0]?`<button class="btn-small primary open-first" type="button">APRI</button>`:''}
          ${urlList[0]?`<button class="btn-small copy-first" type="button">COPIA</button>`:''}
          <button class="btn-small" type="button" data-toggle="json">JSON?</button>
        </div>
        <pre class="json" style="display:none">${U.escapeHtml(JSON.stringify({request,response,error},null,2))}</pre>
      `;
      const prev = linksContainer.querySelector('.card.latest'); if (prev) prev.classList.remove('latest');
      linksContainer.prepend(card);

      const openBtn = card.querySelector('.open-first'); if (openBtn) openBtn.addEventListener('click', ()=> window.open(urlList[0], '_blank', 'noopener'));
      const copyBtn = card.querySelector('.copy-first'); if (copyBtn) copyBtn.addEventListener('click', async ()=>{
        const ok = await U.copyText(urlList[0]);
        copyBtn.textContent = ok ? 'COPIATO!' : 'ERRORE';
        setTimeout(()=> copyBtn.textContent = 'COPIA', 1200);
      });
      const toggleBtn = card.querySelector('[data-toggle="json"]'); const pre = card.querySelector('.json');
      if (toggleBtn) toggleBtn.addEventListener('click', ()=> { pre.style.display = pre.style.display === 'none' ? 'block' : 'none'; });

      // initialize marquee for the newly added card
      const tagLong = card.querySelector('.tag.long');
      if (tagLong) setupOfferIdMarquee(tagLong);

      itemsRef.unshift({ ts, offerId, sim, urlList, request, response, error });
      updateCountFn();
    };
  }

  function toast(msg, type='ok'){
    if (type === 'ok') return;
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', zIndex: '9999', left: '50%', bottom: '84px', transform: 'translateX(-50%)',
      padding: '10px 14px', borderRadius: '10px', fontWeight: '900', letterSpacing: '.4px',
      boxShadow: '0 10px 28px rgba(0,0,0,.28)', color: type === 'error' ? '#2b0008' : (type === 'warn' ? '#402a00' : '#00120e'),
      background: type === 'error' ? 'linear-gradient(90deg,#ff6d8a,#ff5577)' :
                 (type === 'warn' ? 'linear-gradient(90deg,#ffcc66,#ffd280)' : 'linear-gradient(90deg,var(--neon),var(--neon-2))'),
      opacity: '0', transition: 'opacity .25s ease'
    });
    document.body.appendChild(t); requestAnimationFrame(()=> t.style.opacity = '1'); setTimeout(()=>{ t.style.opacity = '0'; setTimeout(()=> t.remove(), 250); }, 1400);
  }

  // pulseInvalid: highlight an invalid control with a pulsing red glow, but store state
  // on the element so it can be cleared reliably by other handlers.
  function pulseInvalid(el){
    if(!el) return;
    try {
      // if a previous pulse timeout exists, clear it first to avoid restoring an old value later
      const prevTimer = el.dataset && el.dataset._pulseTimeout ? parseInt(el.dataset._pulseTimeout, 10) : 0;
      if (prevTimer) {
        try { clearTimeout(prevTimer); } catch(e) {}
      }
      // store original boxShadow (even if empty) so we can restore it later
      const orig = el.style.boxShadow || '';
      el.dataset._origBoxShadow = orig;
      // apply pulse style
      el.style.boxShadow = '0 0 0 4px rgba(255,85,119,.25)';
      // schedule restore and keep id in dataset
      const id = setTimeout(()=> {
        try {
          // restore original (if element still present)
          el.style.boxShadow = el.dataset._origBoxShadow || '';
          delete el.dataset._origBoxShadow;
          delete el.dataset._pulseTimeout;
        } catch(e){}
      }, 700);
      el.dataset._pulseTimeout = String(id);
    } catch (e) {
      // best-effort: ignore failures
    }
  }

  // Clear any pending pulse on an element and remove the inline style
  function clearPulse(el){
    if (!el) return;
    try {
      const t = el.dataset && el.dataset._pulseTimeout ? parseInt(el.dataset._pulseTimeout, 10) : 0;
      if (t) {
        try { clearTimeout(t); } catch(e) {}
      }
      // remove stored dataset entries
      if (el.dataset) {
        delete el.dataset._pulseTimeout;
        delete el.dataset._origBoxShadow;
      }
      // remove inline style to get back to CSS native style
      el.style.boxShadow = '';
    } catch(e){}
  }

  function pulseInvalidAndFocus(el){
    pulseInvalid(el);
    try { el.focus(); } catch(e){}
  }

  function pulseInvalidAuto(el){
    pulseInvalid(el);
    setTimeout(()=> clearPulse(el), 1200);
  }

  function pulseInvalidAutoFocus(el){
    pulseInvalidAndFocus(el);
    setTimeout(()=> clearPulse(el), 1200);
  }

  function pulseInvalidWarn(el){
    // keep) same as pulseInvalid for now
    pulseInvalid(el);
  }

  function pulseInvalidWarnAuto(el){
    pulseInvalidWarn(el);
    setTimeout(()=> clearPulse(el), 1200);
  }

  function pulseInvalidWarnAutoFocus(el){
    pulseInvalidWarn(el);
    try { el.focus(); } catch (e) {}
    setTimeout(()=> clearPulse(el), 1200);
  }

  function pulseInvalidSimple(el){
    pulseInvalid(el);
    setTimeout(()=> clearPulse(el), 1000);
  }

  function pulseInvalidSilent(el){
    pulseInvalid(el);
    setTimeout(()=> clearPulse(el), 600);
  }

  function pulseInvalidNoRestore(el){
    // apply and do not auto-restore (rarely used)
    if(!el) return;
    try {
      el.style.boxShadow = '0 0 0 4px rgba(255,85,119,.25)';
    } catch(e){}
  }

  function pulseInvalidRestoreNow(el){
    clearPulse(el);
  }

  function pulseInvalidLegacy(el){
    pulseInvalid(el);
  }

  function pulseInvalidResetAll(){
    document.querySelectorAll('input, select, textarea, button').forEach(e => clearPulse(e));
  }

  // Exported API
  window.AppUI = {
    createAddCard,
    updateCountFactory,
    setupOfferIdMarquee,
    toast,
    pulseInvalid,
    pulseInvalidAndFocus,
    pulseInvalidAuto,
    pulseInvalidAutoFocus,
    pulseInvalidWarn,
    pulseInvalidWarnAuto,
    pulseInvalidWarnAutoFocus,
    pulseInvalidSimple,
    pulseInvalidSilent,
    pulseInvalidNoRestore,
    pulseInvalidRestoreNow,
    pulseInvalidLegacy,
    pulseInvalidResetAll,
    // marquee controls
    stopOfferIdMarquee,
    stopAllOfferIdMarquees,
    // clear pulse API
    clearPulse
  };
})();