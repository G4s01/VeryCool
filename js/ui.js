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
    const oldViewport = tagEl.querySelector('.mview');
    let viewport = oldViewport;
    if(!viewport){
      viewport = document.createElement('span');
      viewport.className = 'mview';
      const texts = Array.from(tagEl.childNodes).filter(n => !(n.nodeType===1 && n.classList && n.classList.contains('dot')));
      texts.forEach(n => viewport.appendChild(n));
      tagEl.appendChild(viewport);
    }
    const originalInner = viewport.querySelector('.inner');
    const rawText = originalInner ? originalInner.textContent : viewport.textContent.trim();
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
        tagEl.classList.remove('marquee');
        viewport.innerHTML = '';
        const base = document.createElement('span'); base.className='inner'; base.textContent = rawText;
        viewport.appendChild(base);
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

      setupOfferIdMarquee(card.querySelector('.tag.long'));

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

  function pulseInvalid(el){
    if(!el) return;
    const o = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 4px rgba(255,85,119,.25)';
    setTimeout(()=>{ el.style.boxShadow = o; }, 700);
  }

  // Exported API
  window.AppUI = {
    createAddCard,
    updateCountFactory,
    setupOfferIdMarquee,
    toast,
    pulseInvalid
  };
})();