// js/link-generator.js
// Orchestrator: wires UI, uses AppUtils, ApiClient and AppUI.
// Exposes window.renderOfferDesc (used by offers-loader.js).

(function(){
  const U = window.AppUtils;
  const Api = window.ApiClient;
  const UI = window.AppUI;

  if (!U || !Api || !UI) {
    console.error('link-generator: missing dependency (AppUtils/ApiClient/AppUI). Ensure scripts are loaded in order.');
    return;
  }

  // Local state
  const items = [];
  const updateCount = UI.updateCountFactory(items);
  const addCard = UI.createAddCard(items, updateCount);

  // safe DOM refs (may be re-queried when necessary)
  const offerSelect = document.getElementById('offerSelect');
  const customOffer = document.getElementById('customOffer');
  const simType = document.getElementById('simType');
  const generateBtn = document.getElementById('generateBtn');
  const offerDescription = document.getElementById('offerDescription');
  const corsHint = document.getElementById('corsHint');
  const linksContainer = document.getElementById('linksContainer');
  const clearAllBtn = document.getElementById('clearAllBtn');

  // --- Centralized missing-offer show/hide (robust fix) ---
  // Use a Set to track any scheduled timer ids so we can clear them all on hide.
  const _missingTimers = new Set();
  const MISSING_AUTO_HIDE_MS = 2500;

  // Debounce protection for multiple quick clicks on generate
  let _lastGenerateClick = 0;
  const GENERATE_DEBOUNCE_MS = 250; // ignore clicks faster than this

  function clearAllMissingTimers() {
    for (const id of _missingTimers) {
      try { clearTimeout(id); } catch (e) {}
    }
    _missingTimers.clear();
  }

  function showSelectionError(msg) {
    const selectionError = document.getElementById('selectionError');
    if (!selectionError) return;
    // Clear previous timers to avoid races
    clearAllMissingTimers();

    selectionError.textContent = msg || '⚠️SELEZIONA O INSERISCI OFFERTA!';
    selectionError.style.display = 'block';
    selectionError.setAttribute('aria-hidden', 'false');
    // ensure any inline pulse on controls is removed (prevent stuck box-shadow)
    try { UI.clearPulse(offerSelect); UI.clearPulse(customOffer); } catch(e){}
    // schedule auto-hide and keep id in Set
    const id = setTimeout(() => {
      // ensure we clear this id from the set if still present
      _missingTimers.delete(id);
      hideSelectionError();
    }, MISSING_AUTO_HIDE_MS);
    _missingTimers.add(id);
  }

  function hideSelectionError() {
    // Always clear any pending timers first
    clearAllMissingTimers();

    // Re-query element in case DOM was re-rendered/replaced
    const selectionError = document.getElementById('selectionError');
    if (!selectionError) return;
    selectionError.style.display = 'none';
    selectionError.textContent = '';
    selectionError.setAttribute('aria-hidden', 'true');
    // also defensively remove animation classes if any
    selectionError.classList.remove('visible','animate');
    // also clear any inline pulse styles on the controls
    try { UI.clearPulse(offerSelect); UI.clearPulse(customOffer); } catch(e){}
  }

  // Expose minimal API for external calls (optional)
  window.VC_MISSING_OFFER = {
    show: showSelectionError,
    hide: hideSelectionError
  };

  // expose renderOfferDesc for offers-loader.js compatibility
  window.renderOfferDesc = function renderOfferDesc(id){
    const offers = window.OFFERS || {};
    if (!id || !offers[id]) { if (offerDescription) { offerDescription.style.display = 'none'; offerDescription.innerHTML = ''; } return; }
    if (offerDescription) {
      offerDescription.innerHTML = `<strong>${offers[id].label}</strong><br>${offers[id].desc || ''}`;
      offerDescription.style.display = 'block';
    }
  };

  const DEFAULT_BACK_URL = 'https://verymobile.it/esim/very-unlimited';
  const DEFAULT_CHANNEL = 'ecommerce';
  function buildPayload(offerId, sim){ return { Offer:{ id: offerId, backUrl: DEFAULT_BACK_URL, channel: DEFAULT_CHANNEL, accessToken: null, simTypes: [sim] } }; }
  function buildHeaders(){ return { 'Accept':'application/json, text/plain, */*', 'Content-Type':'application/json' }; }

  // Helper to defensively stop marquees when user interacts
  function stopMarqueesDefensive(){
    try {
      if (UI && typeof UI.stopAllOfferIdMarquees === 'function') UI.stopAllOfferIdMarquees();
    } catch(e){}
  }

  // selection handlers
  if (offerSelect) {
    offerSelect.addEventListener('change', ()=>{
      // stop marquee immediately when user selects a different offer
      stopMarqueesDefensive();
      // clear inline invalid highlight if any
      try { UI.clearPulse(offerSelect); UI.clearPulse(customOffer); } catch(e){}
      if (offerSelect.value && customOffer) customOffer.value = '';
      window.renderOfferDesc(offerSelect.value);
      if (offerSelect.value || (customOffer && customOffer.value.trim())) {
        hideSelectionError();
      }
    });
  }
  if (customOffer) {
    customOffer.addEventListener('input', ()=>{
      // stop marquee as soon as user types and clear any inline invalid highlight
      stopMarqueesDefensive();
      try { UI.clearPulse(offerSelect); UI.clearPulse(customOffer); } catch(e){}
      const v = customOffer.value.trim();
      if (v && offerSelect) offerSelect.value = '';
      window.renderOfferDesc(offerSelect.value);
      if (v || (offerSelect && offerSelect.value)) hideSelectionError();
    });
    // also hide on focus to remove the message as soon as user interacts
    customOffer.addEventListener('focus', ()=>{
      stopMarqueesDefensive();
      try { UI.clearPulse(offerSelect); UI.clearPulse(customOffer); } catch(e){}
      hideSelectionError();
    });
  }
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', ()=>{
      if (linksContainer) linksContainer.innerHTML = '';
      items.length = 0;
      updateCount();
    });
  }

  // Also hide selection error on any input/select change across the document (defensive)
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t) return;
    // if the input/select is one of the relevant controls, stop marquees and hide
    if (t === offerSelect || t === customOffer || t === simType || (t.matches && (t.matches('#offerSelect') || t.matches('#customOffer')))) {
      if ((t.value || '').toString().trim()) {
        stopMarqueesDefensive();
        try { UI.clearPulse(offerSelect); UI.clearPulse(customOffer); } catch(e){}
        hideSelectionError();
      }
    }
  }, { passive: true });

  // generate action (no auto-copy)
  async function handleGenerateAction(){
    // debounce: ignore clicks too close to previous
    const now = Date.now();
    if (now - _lastGenerateClick < GENERATE_DEBOUNCE_MS) return;
    _lastGenerateClick = now;

    // ensure any previous missing-offer message is hidden before proceeding
    stopMarqueesDefensive();
    try { UI.clearPulse(offerSelect); UI.clearPulse(customOffer); } catch(e){}
    hideSelectionError();
    if (corsHint) corsHint.style.display = 'none';
    const custom = customOffer ? customOffer.value.trim() : '';
    const selected = offerSelect ? offerSelect.value.trim() : '';
    const offerId = custom || selected;
    const sim = simType ? simType.value.trim() : 'standard';

    if (!offerId){
      // Use centralized show function (it will auto-hide and clear previous timers)
      showSelectionError('⚠️SELEZIONA O INSERISCI OFFERTA!');
      UI.pulseInvalid(offerSelect);
      UI.pulseInvalid(customOffer);
      return;
    }

    // busy
    if (generateBtn) { generateBtn.disabled = true; generateBtn.textContent = 'GENERA...'; }

    const request = {
      url: (function(){
        const hostname = location.hostname;
        if (hostname === '127.0.0.1' || hostname === 'localhost') return 'http://127.0.0.1:667/api/very';
        return 'https://api.verymobile.it/frontend/crc/WindTre?output=json';
      })(),
      headers: buildHeaders(),
      body: buildPayload(offerId, sim)
    };

    try {
      // Api.tryFetchWithFallback now implements sticky/fallback and returns parsed response
      const response = await Api.tryFetchWithFallback(request);
      const links = U.urlifyFromObject(response || {});
      addCard({ offerId, sim, urlList: links, request, response, error: null });

      // hide any stale selection error once we successfully created a card
      hideSelectionError();

      if (!links.length) {
        const preview = typeof response === 'object' ? JSON.stringify(response, null, 2) : String(response);
        if (offerDescription) {
          offerDescription.innerHTML = `<strong>Risposta</strong><pre style="max-height:220px;overflow:auto">${U.escapeHtml(preview)}</pre>`;
          offerDescription.style.display = 'block';
        }
      }
      // show cors hint only when no links (older behavior retained)
    } catch (err) {
      UI.toast('Richiesta fallita (CORS o rete)', 'error');
      // keep console error for developer visibility
      console.error('generate error', err);
      // optionally show a hint about CORS/proxy selection
      if (corsHint) {
        corsHint.style.display = 'block';
        const sticky = (Api._diagnostics && Api._diagnostics.getSticky) ? Api._diagnostics.getSticky() : null;
        corsHint.textContent = sticky ? `Ultimo canale funzionante: ${sticky}` : 'Nessun canale proxy funzionante al momento.';
      }
    } finally {
      if (generateBtn) { generateBtn.disabled = false; generateBtn.textContent = 'GENERA'; }
    }
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      handleGenerateAction();
    });
  }

  // initial UI wiring
  // initialize any existing tag.long marquee(s)
  document.querySelectorAll('.tag.long').forEach(el => UI.setupOfferIdMarquee(el));
  updateCount();
})();