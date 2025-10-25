// js/ui.js
// UI rendering and helpers (addCard, marquee, badge, toast).
// Exposed as window.AppUI and uses window.AppUtils.

(function(){
  const U = window.AppUtils || {};
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

  /* ------------------ helpers ------------------ */
  function debounce(fn, wait=120){
    let t; return function(...args){ clearTimeout(t); t = setTimeout(()=> fn.apply(this,args), wait); };
  }

  /* ------------------ OfferID marquee (responsive) ------------------ */
  function computeOfferIdMarquee(tagEl){
    if (!tagEl) return;

    let viewport = tagEl.querySelector('.mview');
    if (!viewport){
      viewport = document.createElement('span');
      viewport.className = 'mview';
      const texts = Array.from(tagEl.childNodes).filter(n => !(n.nodeType===1 && n.classList && n.classList.contains('dot')));
      texts.forEach(n => viewport.appendChild(n));
      tagEl.appendChild(viewport);
    }

    const existingInner = viewport.querySelector('.inner');
    const rawText = tagEl.dataset.marqueeText || (existingInner ? existingInner.textContent : (viewport.textContent || '').trim());
    tagEl.dataset.marqueeText = rawText;

    viewport.innerHTML = '';
    const track = document.createElement('span');
    track.className = 'track';
    const c1 = document.createElement('span'); c1.className='copy'; c1.textContent = rawText;
    const c2 = document.createElement('span'); c2.className='copy'; c2.textContent = rawText;
    track.append(c1, c2);
    viewport.append(track);

    const wContainer = tagEl.clientWidth;
    const wCopy = c1.scrollWidth;
    if (wCopy <= wContainer){
      tagEl.classList.remove('marquee');
      viewport.innerHTML = '';
      const base = document.createElement('span'); base.className='inner'; base.textContent = rawText;
      viewport.appendChild(base);
      viewport.style.removeProperty('--tag-distance');
      viewport.style.removeProperty('--tag-duration');
      return;
    }
    const gap = 32;
    const distance = wCopy + gap;
    const duration = Math.max(6, distance / 90); // ~90 px/s
    viewport.style.setProperty('--tag-distance', distance + 'px');
    viewport.style.setProperty('--tag-duration', duration + 's');
    tagEl.classList.add('marquee');
  }

  function setupOfferIdMarquee(tagEl){
    if(!tagEl) return;
    computeOfferIdMarquee(tagEl);
    if (!tagEl._offerIdRO){
      try {
        const ro = new ResizeObserver(() => computeOfferIdMarquee(tagEl));
        ro.observe(tagEl);
        // osserva anche il contenitore più vicino che cambia larghezza
        const container = tagEl.closest('.meta-row') || tagEl.closest('.card-grid') || tagEl.parentElement;
        if (container && container !== tagEl) ro.observe(container);
        tagEl._offerIdRO = ro;
      } catch(e){}
    }
  }

  function stopOfferIdMarquee(tagEl){
    if (!tagEl) return;
    if (tagEl._offerIdRO) { try { tagEl._offerIdRO.disconnect(); } catch(e){} tagEl._offerIdRO = null; }
    tagEl.classList.remove('marquee');
    let viewport = tagEl.querySelector('.mview');
    if (!viewport){
      viewport = document.createElement('span'); viewport.className='mview'; tagEl.appendChild(viewport);
    }
    const rawText = tagEl.dataset.marqueeText || (viewport.textContent || '').trim() || '';
    viewport.innerHTML = '';
    const base = document.createElement('span'); base.className='inner'; base.textContent = rawText;
    viewport.appendChild(base);
    viewport.style.removeProperty('--tag-distance');
    viewport.style.removeProperty('--tag-duration');
  }

  function stopAllOfferIdMarquees(){
    const els = document.querySelectorAll('.tag.long');
    els.forEach(el => {
      try { stopOfferIdMarquee(el); } catch (e) { /* ignore */ }
    });
  }

  /* ------------------ Links marquee (responsive + hover pause) ------------------ */
  function ensureLinksMarquee(linksEl){
    if(!linksEl) return;

    if (linksEl._linksRO) {
      try { linksEl._linksRO.disconnect(); } catch(e){}
      linksEl._linksRO = null;
    }

    function turnOnMarquee() {
      if (linksEl.classList.contains('links-marquee')) return;
      const original = linksEl.innerHTML;
      linksEl.dataset._linksOriginal = original;

      linksEl.innerHTML =
        `<span class="lview"><span class="track"><span class="copy">${original}</span><span class="copy">${original}</span></span></span>`;

      const lview = linksEl.querySelector('.lview');
      const track = linksEl.querySelector('.track');
      if (lview) { lview.style.display = 'flex'; lview.style.alignItems = 'center'; }
      if (track) { track.style.display = 'inline-flex'; track.style.alignItems = 'center'; }

      requestAnimationFrame(() => {
        const firstCopy = linksEl.querySelector('.copy');
        const wCopy = firstCopy ? firstCopy.scrollWidth : 0;
        const gap = 24;
        const distance = wCopy + gap;
        const duration = Math.max(4.5, distance / 160); // ~160 px/s
        if (lview) {
          lview.style.setProperty('--link-distance', distance + 'px');
          lview.style.setProperty('--link-duration', duration + 's');
        }
        linksEl.classList.add('links-marquee');
      });

      // Hover pause
      if (!linksEl._hoverBind){
        linksEl.addEventListener('mouseenter', () => {
          const t = linksEl.querySelector('.lview .track');
          if (t) t.style.animationPlayState = 'paused';
        });
        linksEl.addEventListener('mouseleave', () => {
          const t = linksEl.querySelector('.lview .track');
          if (t) t.style.animationPlayState = 'running';
        });
        linksEl._hoverBind = true;
      }
    }

    function turnOffMarquee() {
      if (!linksEl.classList.contains('links-marquee')) return;
      linksEl.classList.remove('links-marquee');
      const original = linksEl.dataset._linksOriginal || '';
      if (original) linksEl.innerHTML = original;
      delete linksEl.dataset._linksOriginal;
    }

    function apply() {
      let contentWidth = 0;
      if (linksEl.classList.contains('links-marquee')) {
        const copy = linksEl.querySelector('.copy');
        contentWidth = copy ? copy.scrollWidth : linksEl.scrollWidth;
      } else {
        contentWidth = linksEl.scrollWidth;
      }
      const need = contentWidth > linksEl.clientWidth + 1;
      if (need) turnOnMarquee(); else turnOffMarquee();
    }

    apply();
    try {
      const ro = new ResizeObserver(() => apply());
      ro.observe(linksEl);
      const container = linksEl.closest('.card-grid') || linksEl.parentElement;
      if (container && container !== linksEl) ro.observe(container);
      linksEl._linksRO = ro;
    } catch(e){}
  }

  function setupLinksMarquee(linksEl){
    ensureLinksMarquee(linksEl);
  }

  function stopLinksMarquee(linksEl){
    if (!linksEl) return;
    if (linksEl._linksRO) {
      try { linksEl._linksRO.disconnect(); } catch(e){}
      linksEl._linksRO = null;
    }
    if (linksEl.classList.contains('links-marquee')) {
      linksEl.classList.remove('links-marquee');
      const original = linksEl.dataset._linksOriginal || '';
      if (original) linksEl.innerHTML = original;
      delete linksEl.dataset._linksOriginal;
    }
  }

  function stopAllLinksMarquees(){
    document.querySelectorAll('.links-scroll').forEach(el => {
      try { stopLinksMarquee(el); } catch(e) {}
    });
  }

  // Global refresh (fix: attiva marquee anche dopo resize della finestra)
  const refreshAllMarquees = debounce(function(){
    document.querySelectorAll('.tag.long').forEach(el => {
      try { computeOfferIdMarquee(el); } catch(e){}
    });
    document.querySelectorAll('.links-scroll').forEach(el => {
      try { ensureLinksMarquee(el); } catch(e){}
    });
  }, 120);

  if (typeof window !== 'undefined'){
    window.addEventListener('resize', refreshAllMarquees, { passive: true });
  }

  /* ------------------ createAddCard: 2x2 action grid, trash right ------------------ */
  function createAddCard(itemsRef, updateCountFn){
    const linksContainer = document.getElementById('linksContainer');
    const SIM_LABELS = { 'standard':'SIM', 'e-sim':'eSIM', 'idle-sim':'idleSIM' };

    return function addCard({ offerId, sim, urlList, request, response, error }){
      if (!linksContainer) return;
      const card = document.createElement('div');
      card.className = 'card latest';
      const ts = U.nowTime();
      card.dataset.ts = ts;

      const simLabel = SIM_LABELS && SIM_LABELS[sim] ? SIM_LABELS[sim] : sim;
      const firstUrl = (urlList && urlList.length) ? urlList[0] : '';
      const linksHtml = (urlList && urlList.length) ? urlList.map(u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).join('') : '';

      card.innerHTML = `
        <div class="card-grid">
          <div class="card-main">
            <div class="meta-row">
              <div class="meta-left">
                <span class="tag ts" title="Timestamp"><span class="dot"></span>${ts}</span>
                <span class="tag long offerid" title="OfferID"><span class="dot"></span><span class="mview"><span class="inner">${U.escapeHtml(offerId)}</span></span></span>
                <span class="tag" title="SIM"><span class="dot"></span>${U.escapeHtml(simLabel)}</span>
              </div>
            </div>

            <div class="link-row">
              <div class="links-scroll">${linksHtml}</div>
            </div>
          </div>

          <div class="card-actions" role="group" aria-label="card actions">
            ${firstUrl?`<button class="btn-small primary open-first" type="button" title="Apri primo link">APRI</button>`:''}
            <button class="btn-small trash-single" type="button" title="Elimina questa card">✕</button>
            ${firstUrl?`<button class="btn-small copy-first" type="button" title="Copia primo link">COPIA</button>`:''}
            <button class="btn-small json-toggle" type="button" title="Mostra/Nascondi JSON">JSON?</button>
          </div>

          <pre class="json" style="display:none">${U.escapeHtml(JSON.stringify({request,response,error},null,2))}</pre>
        </div>
      `;

      // place new card and unmark previous latest
      const prev = linksContainer.querySelector('.card.latest'); if (prev) prev.classList.remove('latest');
      linksContainer.prepend(card);

      // wire actions
      const openBtn = card.querySelector('.open-first');
      if (openBtn && firstUrl) openBtn.addEventListener('click', ()=> window.open(firstUrl, '_blank', 'noopener'));

      const copyBtn = card.querySelector('.copy-first');
      if (copyBtn && firstUrl) copyBtn.addEventListener('click', async () => {
        const ok = await U.copyText(firstUrl);
        copyBtn.textContent = ok ? 'COPIATO!' : 'ERRORE';
        setTimeout(()=> copyBtn.textContent = 'COPIA', 1200);
      });

      const pre = card.querySelector('.json');
      const toggleBtn = card.querySelector('.json-toggle');
      if (toggleBtn && pre) toggleBtn.addEventListener('click', ()=> {
        pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
        if (pre.style.display === 'block') { pre.scrollIntoView({ block: 'nearest' }); }
      });

      // initialize marquees (responsive)
      const linksScroll = card.querySelector('.links-scroll');
      if (linksScroll) ensureLinksMarquee(linksScroll);

      const tagLong = card.querySelector('.tag.long');
      if (tagLong) setupOfferIdMarquee(tagLong);

      // ensure marquee alignment after insertion
      refreshAllMarquees();

      const trashBtn = card.querySelector('.trash-single');
      if (trashBtn) trashBtn.addEventListener('click', ()=> {
        const wasLatest = card.classList.contains('latest');
        try {
          const t = card.dataset.ts;
          const idx = itemsRef.findIndex(it => it.ts === t);
          if (idx !== -1) itemsRef.splice(idx, 1);
        } catch (e) { /* ignore */ }

        try {
          if (linksScroll) stopLinksMarquee(linksScroll);
          stopOfferIdMarquee(tagLong);
        } catch(e){}

        card.remove();
        if (wasLatest) {
          const firstCard = linksContainer.querySelector('.card');
          if (firstCard) firstCard.classList.add('latest');
        } else if (!linksContainer.querySelector('.card.latest')) {
          const firstCard = linksContainer.querySelector('.card');
          if (firstCard) firstCard.classList.add('latest');
        }
        updateCountFn();
      });

      itemsRef.unshift({ ts, offerId, sim, urlList, request, response, error });
      updateCountFn();
    };
  }

  /* utilities: toast, pulseInvalid, clearPulse (unchanged behavior) */
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

  function pulseInvalid(el){
    if(!el) return;
    try {
      const prevTimer = el.dataset && el.dataset._pulseTimeout ? parseInt(el.dataset._pulseTimeout, 10) : 0;
      if (prevTimer) { try { clearTimeout(prevTimer); } catch(e) {} }
      const orig = el.style.boxShadow || '';
      el.dataset._origBoxShadow = orig;
      el.style.boxShadow = '0 0 0 4px rgba(255,85,119,.25)';
      const id = setTimeout(()=> {
        try {
          el.style.boxShadow = el.dataset._origBoxShadow || '';
          delete el.dataset._origBoxShadow;
          delete el.dataset._pulseTimeout;
        } catch(e){}
      }, 700);
      el.dataset._pulseTimeout = String(id);
    } catch (e) {}
  }

  function clearPulse(el){
    if (!el) return;
    try {
      const t = el.dataset && el.dataset._pulseTimeout ? parseInt(el.dataset._pulseTimeout, 10) : 0;
      if (t) { try { clearTimeout(t); } catch(e) {} }
      if (el.dataset) { delete el.dataset._pulseTimeout; delete el.dataset._origBoxShadow; }
      el.style.boxShadow = '';
    } catch(e){}
  }

  /* exports */
  window.AppUI = {
    createAddCard,
    updateCountFactory,
    setupOfferIdMarquee,
    setupLinksMarquee,
    stopOfferIdMarquee,
    stopLinksMarquee,
    stopAllOfferIdMarquees,
    stopAllLinksMarquees,
    toast,
    pulseInvalid,
    clearPulse
  };
})();