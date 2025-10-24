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

  // safe DOM refs
  const offerSelect = document.getElementById('offerSelect');
  const customOffer = document.getElementById('customOffer');
  const simType = document.getElementById('simType');
  const generateBtn = document.getElementById('generateBtn');
  const offerDescription = document.getElementById('offerDescription');
  const corsHint = document.getElementById('corsHint');
  const selectionError = document.getElementById('selectionError');
  const linksContainer = document.getElementById('linksContainer');
  const clearAllBtn = document.getElementById('clearAllBtn');

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

  // selection handlers
  if (offerSelect) {
    offerSelect.addEventListener('change', ()=>{
      if (offerSelect.value && customOffer) customOffer.value = '';
      window.renderOfferDesc(offerSelect.value);
      if (offerSelect.value || (customOffer && customOffer.value.trim())) {
        if (selectionError) selectionError.style.display = 'none';
      }
    });
  }
  if (customOffer) {
    customOffer.addEventListener('input', ()=>{
      const v = customOffer.value.trim();
      if (v && offerSelect) offerSelect.value = '';
      window.renderOfferDesc(offerSelect.value);
      if (v || (offerSelect && offerSelect.value)) if (selectionError) selectionError.style.display = 'none';
    });
  }
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', ()=>{
      if (linksContainer) linksContainer.innerHTML = '';
      items.length = 0;
      updateCount();
    });
  }

  // generate action (no auto-copy)
  async function handleGenerateAction(){
    if (selectionError) selectionError.style.display = 'none';
    if (corsHint) corsHint.style.display = 'none';
    const custom = customOffer ? customOffer.value.trim() : '';
    const selected = offerSelect ? offerSelect.value.trim() : '';
    const offerId = custom || selected;
    const sim = simType ? simType.value.trim() : 'standard';

    if (!offerId){
      if (selectionError) {
        selectionError.textContent = '⚠️SELEZIONA O INSERISCI OFFERTA!';
        selectionError.style.display = 'block';
      }
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

      if (!links.length) {
        const preview = typeof response === 'object' ? JSON.stringify(response, null, 2) : String(response);
        if (offerDescription) {
          offerDescription.innerHTML = `<strong>Risposta</strong><pre style="max-height:220px;overflow:auto">${U.escapeHtml(preview)}</pre>`;
          offerDescription.style.display = 'block';
        }
      }
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
  UI.setupOfferIdMarquee(document.querySelector('.tag.long'));
  updateCount();
})();