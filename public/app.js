(() => {
  'use strict';

  const { compute, amountInWords, fmtMoney, fmtRate, fmtQty, fmtPercent, fmtDate } = window.Calc;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s).trim().replace(/[^A-Za-z0-9_-]+/g, '_');
  const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
  const DRAFT_KEY = 'invoiceDraft.v1';

  const SELLER_DEFAULT = {
    name: 'Smart Packaging',
    address: '124/7, Bungalow Thoppu Main Road,\nMadananthapuram, Chennai 600 125',
    email: 'smartpackaging001@gmail.com',
    phone: '+91 81444 06353',
    gstin: '33BINPS5304R2ZK',
    logo: '/logo.png',
  };
  const DECLARATION =
    'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct';

  /* ---------- state ---------- */
  let state;
  let saved = [];
  let loadedId = null;
  let dirty = false;
  const customers = new Map();
  let products = [];

  const blankItem = () => ({ desc: '', hsn: '', qty: '', rate: '' });
  const blankParty = () => ({ name: '', address: '', gstin: '' });
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function blankInvoice() {
    return {
      meta: { no: '', date: today(), copy: 'ORIGINAL FOR BUYER', ref: '', through: '', dest: '' },
      seller: { ...SELLER_DEFAULT },
      buyer: blankParty(),
      sameAsBuyer: true,
      consignee: blankParty(),
      items: [blankItem()],
      tax: { type: 'intra', rate: 18, roundTax: true },
      declaration: DECLARATION,
    };
  }

  function nextNumber() {
    const nums = saved.map((i) => parseInt(i.meta && i.meta.no, 10)).filter((n) => Number.isFinite(n));
    return String(nums.length ? Math.max(...nums) + 1 : 1);
  }

  function newInvoice(seller) {
    const inv = blankInvoice();
    if (seller) inv.seller = { ...seller };
    inv.meta.no = nextNumber();
    return inv;
  }

  function merge(base, over) {
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
    return out;
  }

  function normalize(inv) {
    const { id, savedAt, ...rest } = inv;
    const s = merge(blankInvoice(), rest);
    if (!Array.isArray(s.items) || !s.items.length) s.items = [blankItem()];
    return s;
  }

  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => {
    const ks = p.split('.');
    const last = ks.pop();
    ks.reduce((a, k) => a[k], o)[last] = v;
  };

  /* ---------- invoice markup ---------- */
  function pageInner(s, c) {
    const sl = s.seller;
    const cons = s.sameAsBuyer ? s.buyer : s.consignee;
    const inter = s.tax.type === 'inter';
    const visible = c.items.filter((i) => i.desc.trim() || String(i.hsn).trim() || i.qty !== '' || i.rate !== '');
    const has = c.taxable > 0;

    const meta = (label, val) =>
      `<div class="m"><span class="l">${label}</span><span class="v">${esc(val)}</span></div>`;

    const party = (title, p) => {
      const lines = [p.name, p.address].filter((x) => x && x.trim()).map(esc).join('\n');
      return `<div class="party"><h4>${title}</h4><div class="pname">${lines}</div>${
        p.gstin ? `<div class="pgstin">GSTIN : ${esc(p.gstin)}</div>` : ''
      }</div>`;
    };

    const rows = visible
      .map((it, i) => {
        const priced = it.qty !== '' && it.rate !== '';
        return `
        <div class="ic ctr">${i + 1}</div>
        <div class="ic desc">${esc(it.desc)}</div>
        <div class="ic ctr">${esc(it.hsn)}</div>
        <div class="ic ctr">${it.qty !== '' ? fmtQty(it.qtyNum) : ''}</div>
        <div class="ic ctr">${it.rate !== '' ? fmtRate(it.rateNum) : ''}</div>
        <div class="ic num">${priced ? fmtMoney(it.amount) : ''}</div>`;
      })
      .join('');
    const filler = '<div class="ic"></div>'.repeat(6);

    const pct = fmtPercent(c.halfRate);
    const igstPct = fmtPercent(c.rate);
    const cell = (cls, text) => `<div class="${cls}">${text}</div>`;

    const addr = [sl.address, sl.email, sl.phone ? 'Ph: ' + sl.phone : ''].filter((x) => x && x.trim()).map(esc).join('\n');

    return `
      <div class="top"><div class="title">INVOICE</div><div class="copy">${esc(s.meta.copy)}</div></div>
      <div class="box">
        <div class="head">
          <div class="seller">
            ${sl.logo ? `<img class="logo" src="${esc(sl.logo)}" alt="">` : `<div class="sname">${esc(sl.name)}</div>`}
            <div class="saddr">${addr}</div>
            ${sl.gstin ? `<div class="sgstin">GSTIN: ${esc(sl.gstin)}</div>` : ''}
          </div>
          <div class="meta">
            ${meta('Invoice No:', s.meta.no)}
            ${meta('Dated', fmtDate(s.meta.date))}
            ${meta("Supplier's Ref:", s.meta.ref)}
            ${meta('Despatched through', s.meta.through)}
            ${meta('Destination', s.meta.dest)}
          </div>
        </div>

        <div class="parties">
          ${party('Details of the Receiver (Billed to)', s.buyer)}
          ${party('Details of the Consignee (Shipped to)', cons)}
        </div>

        <div class="ih">
          <div>Sl. No.</div><div>Description of Goods</div><div>HSN/SAC</div>
          <div>Quantity</div><div>Rate</div><div>Taxable Value in Rs</div>
        </div>
        <div class="items" style="grid-template-rows:${visible.length ? `repeat(${visible.length}, auto) ` : ''}1fr">
          ${rows}${filler}
        </div>

        <div class="two tot">
          <div class="lab">Total Taxable Value</div>
          <div class="val">${has ? fmtMoney(c.taxable) : ''}</div>
        </div>
        <div class="wl"><small>Total Taxable Value (in words)</small><div class="w">${has ? amountInWords(c.taxable) : ''}</div></div>

        <div class="taxg" style="border-top:1px solid #000">
          <div class="r2 hd">Taxable<br>Value in Rs</div>
          <div class="s2">CGST</div><div class="s2">SGST</div><div class="s2">IGST</div>
          <div class="r2 big nr">Total Tax Amount in Rs</div>
          <div class="hd">Rate</div><div class="hd">Amount</div>
          <div class="hd">Rate</div><div class="hd">Amount</div>
          <div class="hd">Rate</div><div class="hd">Amount</div>
          ${cell('d', has ? fmtMoney(c.taxable).replace(/\.00$/, '') : '')}
          ${cell('d', has && !inter ? pct : '')}${cell('d dr', has && !inter ? fmtMoney(c.cgst).replace(/\.00$/, '') : '')}
          ${cell('d', has && !inter ? pct : '')}${cell('d dr', has && !inter ? fmtMoney(c.sgst).replace(/\.00$/, '') : '')}
          ${cell('d', has && inter ? igstPct : '')}${cell('d dr', has && inter ? fmtMoney(c.igst).replace(/\.00$/, '') : '')}
          ${cell('d dr nr', has ? fmtMoney(c.tax) : '')}
        </div>

        <div class="two">
          <div class="wl"><small>Total Tax Amount (in words)</small><div class="w">${has ? amountInWords(c.tax) : ''}</div></div>
          <div class="vl lab">Total Invoice Value in Rs</div>
        </div>
        <div class="two">
          <div class="wl"><small>Total Invoice Value Amount Chargeable (in words)</small><div class="w">${has ? amountInWords(c.total) : ''}</div></div>
          <div class="vl valcell">${has ? fmtMoney(c.total) : ''}</div>
        </div>

        <div class="gap"></div>
        <div class="foot">
          <div class="decl"><b>Declaration</b><p>${esc(s.declaration)}</p></div>
          <div class="sign">
            <div class="for">For <b>${esc(sl.name.toUpperCase())}</b></div>
            <div class="as">Authorised Signatory</div>
          </div>
        </div>
      </div>`;
  }

  /* ---------- rendering ---------- */
  function refresh() {
    const c = compute(state);
    $('#invoice').innerHTML = pageInner(state, c);
    updateAmounts(c);
    updateSummary(c);
    fit();
  }

  function fit() {
    const page = $('#invoice');
    const scale = Math.min(1, ($('#stage').clientWidth - 32) / 794);
    page.style.transform = `scale(${scale})`;
    $('#frame').style.width = 794 * scale + 'px';
    $('#frame').style.height = page.offsetHeight * scale + 'px';
  }

  function updateAmounts(c = compute(state)) {
    $$('#itemsEditor .item').forEach((el, i) => {
      const it = c.items[i];
      $('output', el).textContent = it && it.qty !== '' && it.rate !== '' ? 'Rs ' + fmtMoney(it.amount) : '';
    });
  }

  function updateSummary(c) {
    const rows = [['Taxable value', c.taxable]];
    if (state.tax.type === 'inter') rows.push([`IGST ${fmtPercent(c.rate)}`, c.igst]);
    else rows.push([`CGST ${fmtPercent(c.halfRate)}`, c.cgst], [`SGST ${fmtPercent(c.halfRate)}`, c.sgst]);
    rows.push(['Invoice total', c.total]);
    $('#summary').innerHTML = rows
      .map(([k, v], i) => `<div class="${i === rows.length - 1 ? 'total' : ''}"><span>${k}</span><b>Rs ${fmtMoney(v)}</b></div>`)
      .join('');
  }

  function renderItemsEditor() {
    $('#itemsEditor').innerHTML = state.items
      .map(
        (it, i) => `
      <div class="item" data-i="${i}">
        <div class="item-top"><span>Item ${i + 1}</span><button type="button" class="icon" data-act="del" title="Remove item">&times;</button></div>
        <textarea rows="2" data-f="desc" placeholder="Description of goods">${esc(it.desc)}</textarea>
        <div class="item-grid">
          <label>HSN/SAC<input data-f="hsn" value="${esc(it.hsn)}"></label>
          <label>Quantity<input data-f="qty" type="number" step="any" min="0" value="${esc(it.qty)}"></label>
          <label>Rate (Rs)<input data-f="rate" type="number" step="any" min="0" value="${esc(it.rate)}"></label>
          <label>Taxable value<output></output></label>
        </div>
      </div>`
      )
      .join('');
    updateAmounts();
  }

  function fillForm() {
    $$('[data-path]').forEach((el) => {
      const v = getPath(state, el.dataset.path);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v ?? '';
      if (el.hasAttribute('data-gstin')) checkGstin(el);
    });
    $('#consigneeFields').hidden = state.sameAsBuyer;
    renderItemsEditor();
  }

  function checkGstin(el) {
    const v = el.value.trim();
    const bad = v !== '' && !GSTIN_RE.test(v);
    el.classList.toggle('warn', bad);
    el.title = bad ? 'This does not look like a valid 15 character GSTIN' : '';
  }

  /* ---------- memory from saved invoices ---------- */
  function rebuildMemory() {
    customers.clear();
    const seen = new Set();
    products = [];
    for (const inv of saved) {
      const parties = [inv.buyer, inv.sameAsBuyer ? null : inv.consignee];
      for (const p of parties) {
        if (p && p.name && p.name.trim() && !customers.has(p.name.trim().toLowerCase())) {
          customers.set(p.name.trim().toLowerCase(), p);
        }
      }
      for (const it of inv.items || []) {
        const key = (it.desc || '').trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          products.push(it);
        }
      }
    }
    $('#customers').innerHTML = [...customers.values()].map((p) => `<option value="${esc(p.name)}"></option>`).join('');
    $('#productPicker').innerHTML =
      '<option value="">Add a previous item...</option>' +
      products.map((p, i) => `<option value="${i}">${esc(p.desc.trim().replace(/\s*\n\s*/g, ' / '))}</option>`).join('');
  }

  function renderSaved() {
    $('#savedList').innerHTML = saved.length
      ? saved
          .map((i) => {
            const total = compute(normalize(i)).total;
            return `<div class="saved-row" data-id="${esc(i.id)}">
              <button type="button" class="open"><b>#${esc(i.meta.no)}</b> ${esc(i.buyer.name || 'No buyer name')}
                <small>${fmtDate(i.meta.date)} &middot; Rs ${fmtMoney(total)}</small></button>
              <button type="button" class="icon" data-act="rm" title="Delete">&times;</button></div>`;
          })
          .join('')
      : '<p class="muted">Nothing saved yet.</p>';
  }

  /* ---------- server ---------- */
  async function request(url, opts) {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  }

  async function reloadSaved() {
    saved = await request('/api/invoices');
    rebuildMemory();
    renderSaved();
  }

  async function save() {
    const no = state.meta.no.trim();
    if (!no) return toast('Enter an invoice number first', true);
    const id = slug(no);
    if (saved.some((i) => i.id === id) && id !== loadedId && !confirm(`Invoice ${no} already exists. Overwrite it?`)) return;
    try {
      const r = await request('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      loadedId = r.id;
      dirty = false;
      await reloadSaved();
      toast(`Saved invoice ${no}`);
    } catch (e) {
      toast('Save failed: ' + e.message, true);
    }
  }

  function openSaved(id) {
    const inv = saved.find((i) => i.id === id);
    if (!inv || (dirty && !confirm('Discard unsaved changes?'))) return;
    state = normalize(structuredClone(inv));
    loadedId = id;
    dirty = false;
    fillForm();
    refresh();
    writeDraft();
  }

  async function removeSaved(id) {
    const inv = saved.find((i) => i.id === id);
    if (!inv || !confirm(`Delete invoice ${inv.meta.no}? This cannot be undone.`)) return;
    try {
      await request('/api/invoices/' + encodeURIComponent(id), { method: 'DELETE' });
      if (loadedId === id) loadedId = null;
      await reloadSaved();
    } catch (e) {
      toast('Delete failed: ' + e.message, true);
    }
  }

  function startNew() {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    state = newInvoice(state.seller);
    loadedId = null;
    dirty = false;
    fillForm();
    refresh();
    writeDraft();
  }

  /* ---------- draft autosave ---------- */
  let draftTimer;
  function writeDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ state, loadedId, dirty }));
    } catch {
      /* storage full or unavailable */
    }
  }
  function readDraft() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY));
    } catch {
      return null;
    }
  }
  function changed() {
    dirty = true;
    refresh();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeDraft, 300);
  }

  /* ---------- export ---------- */
  async function capture() {
    const host = document.createElement('div');
    host.className = 'page export-host';
    host.innerHTML = pageInner(state, compute(state));
    document.body.appendChild(host);
    try {
      await Promise.all(
        $$('img', host).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))
      );
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      return await html2canvas(host, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false });
    } finally {
      host.remove();
    }
  }

  const fileBase = () => `Invoice-${slug(state.meta.no) || 'draft'}` + (state.buyer.name.trim() ? '-' + slug(state.buyer.name) : '');

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function exportAs(kind) {
    const buttons = [$('#btnPdf'), $('#btnJpeg')];
    buttons.forEach((b) => (b.disabled = true));
    try {
      const canvas = await capture();
      if (kind === 'jpeg') {
        canvas.toBlob((blob) => download(blob, fileBase() + '.jpg'), 'image/jpeg', 0.95);
      } else {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        const w = 210;
        const h = (canvas.height * w) / canvas.width;
        const img = canvas.toDataURL('image/jpeg', 0.95);
        const pages = Math.max(1, Math.ceil(h / 297 - 0.01));
        for (let p = 0; p < pages; p++) {
          if (p) pdf.addPage();
          pdf.addImage(img, 'JPEG', 0, -p * 297, w, h);
        }
        pdf.save(fileBase() + '.pdf');
      }
    } catch (e) {
      console.error(e);
      toast('Export failed: ' + e.message, true);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  /* ---------- logo ---------- */
  function readLogo(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const k = Math.min(1, 700 / img.width);
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k);
          cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/png'));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3000);
  }

  /* ---------- events ---------- */
  function bind() {
    $$('[data-path]').forEach((el) => {
      el.addEventListener('input', () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.hasAttribute('data-upper')) {
          v = v.toUpperCase();
          if (el.value !== v) el.value = v;
        }
        setPath(state, el.dataset.path, v);
        if (el.hasAttribute('data-gstin')) checkGstin(el);
        if (el.dataset.path === 'sameAsBuyer') $('#consigneeFields').hidden = v;
        changed();
      });
    });

    $$('[data-customer]').forEach((el) =>
      el.addEventListener('change', () => {
        const hit = customers.get(el.value.trim().toLowerCase());
        if (!hit) return;
        Object.assign(state[el.dataset.customer], { name: hit.name, address: hit.address, gstin: hit.gstin });
        fillForm();
        changed();
      })
    );

    const editor = $('#itemsEditor');
    editor.addEventListener('input', (e) => {
      const f = e.target.dataset.f;
      const row = e.target.closest('.item');
      if (!f || !row) return;
      state.items[+row.dataset.i][f] = e.target.value;
      changed();
    });
    editor.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act="del"]');
      if (!btn) return;
      const i = +btn.closest('.item').dataset.i;
      if (state.items.length === 1) state.items[0] = blankItem();
      else state.items.splice(i, 1);
      renderItemsEditor();
      changed();
    });

    $('#btnAddItem').addEventListener('click', () => {
      state.items.push(blankItem());
      renderItemsEditor();
      changed();
      const rows = $$('#itemsEditor .item');
      $('textarea', rows[rows.length - 1]).focus();
    });

    $('#productPicker').addEventListener('change', (e) => {
      const p = products[+e.target.value];
      e.target.value = '';
      if (!p) return;
      const last = state.items[state.items.length - 1];
      const target = !last.desc && !last.hsn && last.qty === '' && last.rate === '' ? last : state.items[state.items.push(blankItem()) - 1];
      Object.assign(target, { desc: p.desc, hsn: p.hsn, rate: p.rate });
      renderItemsEditor();
      changed();
    });

    $('#logoFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        state.seller.logo = await readLogo(file);
        changed();
      } catch {
        toast('Could not read that image', true);
      }
      e.target.value = '';
    });
    $('#logoClear').addEventListener('click', () => {
      state.seller.logo = '';
      changed();
    });

    $('#savedList').addEventListener('click', (e) => {
      const row = e.target.closest('.saved-row');
      if (!row) return;
      if (e.target.closest('[data-act="rm"]')) removeSaved(row.dataset.id);
      else if (e.target.closest('.open')) openSaved(row.dataset.id);
    });

    $('#btnNew').addEventListener('click', startNew);
    $('#btnSave').addEventListener('click', save);
    $('#btnPdf').addEventListener('click', () => exportAs('pdf'));
    $('#btnJpeg').addEventListener('click', () => exportAs('jpeg'));
    window.addEventListener('resize', fit);
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ---------- start ---------- */
  async function init() {
    try {
      await reloadSaved();
    } catch {
      toast('Could not reach the server, saved invoices are unavailable', true);
    }
    const draft = readDraft();
    if (draft && draft.state) {
      state = normalize(draft.state);
      loadedId = draft.loadedId || null;
      dirty = !!draft.dirty;
    } else {
      state = newInvoice(saved[0] && normalize(saved[0]).seller);
    }
    bind();
    fillForm();
    refresh();
  }

  init();
})();
