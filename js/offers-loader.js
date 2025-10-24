// js/offers-loader.js
// Loader semplice e deterministico: assegna le offerte all'optgroup ESATTAMENTE
// come sono raggruppate in data/offers.json (formato "grouped" raccomandato).
//
// Supported formats (in this order):
// 1) Grouped object (recommended): { "GROUP NAME": { "ID": { label, desc[...] }, ... }, ... }
//    -> each top-level key is used as optgroup label and used verbatim.
// 2) Flat object map (compat): { "ID": { label, desc[...] }, ... }
//    -> placed directly into the <select> (after placeholder) if no optgroup info exists.
// 3) Legacy array (compat): [ "{\"id\":\"...\",\"label\":\"...\",\"desc\":\"...\"}", ... ] or array of objects
//    -> fallback behaviour: appended directly into the <select> (not into MNP).
//
// IMPORTANT: questo loader NON applica euristiche per spostare offerte fra gruppi.
// Se vuoi controllo sul gruppo, usa il formato "grouped" nel JSON.
// Se il loader non riesce a determinare un gruppo (flat/legacy), l'option sarà inserita direttamente nello <select>.
//
// This version also linkifies URLs found in the description lines so that links are clickable
// in the offer description display (<a href="...">...</a> with target="_blank" rel="noopener noreferrer").
(function () {
  async function loadOffers() {
    try {
      const res = await fetch('./data/offers.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('offers.json fetch failed: ' + res.status);
      const data = await res.json();

      const select = document.getElementById('offerSelect');
      if (!select) {
        console.warn('offers-loader: #offerSelect not found');
        return;
      }

      // Build map of existing optgroups (label -> element) and clear them
      const optgroupMap = {};
      Array.from(select.querySelectorAll('optgroup')).forEach(g => {
        optgroupMap[g.label] = g;
        g.innerHTML = ''; // clear dynamic contents
      });

      // Placeholder (first empty option) to insert after if needed
      const placeholder = select.querySelector('option[value=""]');

      // Ensure global store
      window.OFFERS = window.OFFERS || {};

      // Helper: create an optgroup if it doesn't exist, append it at the end
      function ensureOptgroup(label) {
        if (optgroupMap[label]) return optgroupMap[label];
        const g = document.createElement('optgroup');
        g.label = label;
        select.appendChild(g);
        optgroupMap[label] = g;
        return g;
      }

      // Helper: normalize desc (array -> HTML string with <br>, string -> as-is)
      function normalizeDesc(desc) {
        if (desc == null) return '';
        if (Array.isArray(desc)) return desc.map(String).join('<br>');
        return String(desc);
      }

      // Linkify URLs inside a HTML/text string (skip if it already contains an <a> tag)
      function linkifyDesc(html) {
        if (!html) return '';
        // if there is already an anchor tag, assume author handled linking
        if (/<a\s+href/i.test(html)) return html;
        // URL regex: http/https URLs (stops at whitespace or < to avoid clobbering tags)
        const urlRx = /https?:\/\/[^\s<>"']+/g;
        return html.replace(urlRx, function (u) {
          // escape double quotes just in case (u shouldn't contain quotes due to regex)
          const safe = u.replace(/"/g, '&quot;');
          return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${u}</a>`;
        });
      }

      // Detect format: grouped object vs flat map vs array
      if (Array.isArray(data)) {
        // Legacy array: convert to flat map behaviour, but DO NOT place into MNP by default.
        data.forEach(entry => {
          try {
            let obj = entry;
            if (typeof entry === 'string') obj = JSON.parse(entry);
            if (!obj || !obj.id || !obj.label) return;
            const id = String(obj.id);
            const label = String(obj.label);
            const descHtml = linkifyDesc(normalizeDesc(obj.desc));

            window.OFFERS[id] = { label, desc: descHtml };

            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = label;

            // Append directly into the select (after placeholder) when no explicit group info exists
            if (placeholder && placeholder.nextSibling) select.insertBefore(opt, placeholder.nextSibling);
            else select.appendChild(opt);
          } catch (err) {
            console.warn('offers-loader: invalid legacy entry', err, entry);
          }
        });

        if (typeof window.renderOfferDesc === 'function') window.renderOfferDesc(select.value);
        return;
      }

      if (data && typeof data === 'object') {
        // Decide if grouped: top-level values are objects whose values are offers
        const topKeys = Object.keys(data);
        const firstVal = topKeys.length ? data[topKeys[0]] : null;
        const isGrouped = firstVal && typeof firstVal === 'object' &&
          Object.values(firstVal).some(v => v && (v.label !== undefined || v.desc !== undefined));

        if (isGrouped) {
          // Iterate groups in the JSON order and append options to matching optgroups.
          for (const groupName of topKeys) {
            const groupObj = data[groupName];
            if (!groupObj || typeof groupObj !== 'object') continue;
            // Ensure the optgroup exists (create if missing)
            const targetGroup = ensureOptgroup(groupName);
            // Append each offer in this group
            for (const id of Object.keys(groupObj)) {
              const item = groupObj[id];
              const label = (item && item.label) ? String(item.label) : id;
              const descHtml = linkifyDesc(normalizeDesc(item && item.desc));
              window.OFFERS[id] = { label, desc: descHtml };

              const opt = document.createElement('option');
              opt.value = id;
              opt.textContent = label;
              targetGroup.appendChild(opt);
            }
          }

          if (typeof window.renderOfferDesc === 'function') window.renderOfferDesc(select.value);
          return;
        }

        // Otherwise treat as flat object map (id -> {label,desc})
        for (const id of Object.keys(data)) {
          const item = data[id];
          const label = (item && item.label) ? String(item.label) : id;
          const descHtml = linkifyDesc(normalizeDesc(item && item.desc));
          window.OFFERS[id] = { label, desc: descHtml };

          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = label;

          // NOTE: do NOT default to 'MNP' or any optgroup.
          // If you want grouping, use the grouped format in data/offers.json.
          if (placeholder && placeholder.nextSibling) select.insertBefore(opt, placeholder.nextSibling);
          else select.appendChild(opt);
        }

        if (typeof window.renderOfferDesc === 'function') window.renderOfferDesc(select.value);
        return;
      }

      throw new Error('offers.json: unsupported format');
    } catch (err) {
      console.error('offers-loader error', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadOffers);
  } else {
    loadOffers();
  }

})();
