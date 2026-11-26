// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail panel with the model's own
// inputs and the protocol's farm plan, and a separate Live token view. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  app.setAttribute('aria-busy', 'false');

  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The model in one function, radar-2: the page recomputes a row from the snapshot figures and
  // checks the number board.json carries, so the page's code and the board's data are visibly the
  // same arithmetic. Growth is clamped, the launch window rewards the prime age and fades the old.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days;
    var windowMult;
    if (age === null || age === undefined) {
      windowMult = model.unknown_age_multiplier;
    } else if (age < model.window_young_days) {
      windowMult = model.window_young_floor + (1 - model.window_young_floor) * (age / model.window_young_days);
    } else if (age <= model.window_prime_days) {
      windowMult = 1;
    } else {
      windowMult = Math.max(model.window_old_floor, 1 - (1 - model.window_old_floor) * ((age - model.window_prime_days) / model.window_old_decay_days));
    }
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * windowMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    return node;
  }

  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });

  function renderMeta() {
    var m = document.getElementById('meta');
    m.innerHTML =
      'Snapshot as of <b>' + esc(DATA.as_of) + '</b> · <b>' + DATA.rows.length + '</b> ranked rows · ' +
      '<b>' + DATA.watchlist_size + '</b> watchlist protocols · <b>' + DATA.early_size + '</b> found below the floor · ' +
      'floor <b>' + fmtUsd(DATA.floor_usd) + '</b> TVL';
  }

  function renderModel() {
    var m = DATA.model;
    var box = document.getElementById('model');
    box.innerHTML =
      '<h2>How the value is worked out — radar-2</h2>' +
      '<p class="formula">implied value = TVL × <code>' + m.base_multiple + '</code> × growth multiplier × launch-window multiplier</p>' +
      '<p>Growth multiplier = 1 + ' + m.growth_weight + ' × clamp(7-day TVL change, ' + m.growth_floor + '%, ' + m.growth_cap + '%). ' +
      'A week that doubles a protocol counts; the +4,448% outlier still clamps.</p>' +
      '<p>Launch window: under ' + m.window_young_days + ' days old a protocol ramps from ' + m.window_young_floor + ' to 1.0; ' +
      m.window_young_days + '–' + m.window_prime_days + ' days is the prime window at 1.0; older than that it fades toward ' +
      m.window_old_floor + '. A protocol tracked for three years with no token is probably never launching one. ' +
      'Unknown age counts ' + m.unknown_age_multiplier + '.</p>' +
      '<p>Every number here comes from the snapshot alone — TVL, seven-day growth, and how long the protocol has run with no ' +
      'token recorded. No name is ever special-cased. An implied value is this entry\u2019s own claim, not a prediction of ' +
      'whether or when a token launches, and “records no token” means the snapshot carries none for it.</p>';
  }

  function unique(values) {
    var seen = {};
    var out = [];
    values.forEach(function (v) {
      if (v !== null && v !== undefined && v !== '' && !seen[v]) { seen[v] = true; out.push(v); }
    });
    return out.sort();
  }

  function renderControls() {
    var c = document.getElementById('controls');
    c.innerHTML = '';
    var search = el('input', { type: 'search', placeholder: 'Search name, slug or category…', 'aria-label': 'Search protocols', value: state.q });
    search.addEventListener('input', function () { state.q = search.value; renderBoard(); });
    c.appendChild(search);

    var cats = unique(DATA.rows.map(function (r) { return r.category; }));
    var catSel = el('select', { 'aria-label': 'Filter by category' });
    catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
    cats.forEach(function (cat) { catSel.appendChild(el('option', { value: cat, text: cat })); });
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; renderBoard(); });
    c.appendChild(catSel);

    var chains = unique(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []));
    var chainSel = el('select', { 'aria-label': 'Filter by chain' });
    chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chains.forEach(function (ch) { chainSel.appendChild(el('option', { value: ch, text: ch })); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; renderBoard(); });
    c.appendChild(chainSel);

    var tabs = el('div', { 'class': 'tabs' });
    var preBtn = el('button', { type: 'button', text: 'Pre-token board', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false' });
    var liveBtn = el('button', { type: 'button', text: 'Live tokens', 'aria-pressed': state.tab === 'live' ? 'true' : 'false' });
    preBtn.addEventListener('click', function () { state.tab = 'pre-token'; renderAll(); });
    liveBtn.addEventListener('click', function () { state.tab = 'live'; renderAll(); });
    tabs.appendChild(preBtn);
    tabs.appendChild(liveBtn);
    c.appendChild(tabs);

    var count = el('span', { 'class': 'count', id: 'count' });
    c.appendChild(count);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var va = key === 'tvl' ? a.tvl_usd : key === 'growth' ? (a.change_7d === null ? -Infinity : a.change_7d) : key === 'rank' ? a.rank : a.implied_value_usd;
      var vb = key === 'tvl' ? b.tvl_usd : key === 'growth' ? (b.change_7d === null ? -Infinity : b.change_7d) : key === 'rank' ? b.rank : b.implied_value_usd;
      return (va - vb) * dir || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
  }

  function sortButton(label, key) {
    var b = el('button', { type: 'button', text: label + (state.sort === key ? (state.dir === -1 ? ' ▼' : ' ▲') : '') });
    b.addEventListener('click', function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
      renderBoard();
    });
    return b;
  }

  function renderBoard() {
    var holder = document.getElementById('board');
    var liveHolder = document.getElementById('live');
    liveHolder.innerHTML = '';
    holder.innerHTML = '';
    var count = document.getElementById('count');
    if (state.tab === 'live') {
      renderLive(liveHolder);
      if (count) count.textContent = DATA.live.length + ' live tokens';
      return;
    }
    var rows = filteredRows();
    if (count) count.textContent = rows.length + ' of ' + DATA.rows.length + ' rows';
    if (rows.length === 0) {
      holder.appendChild(el('div', { 'class': 'note empty', text: 'No protocol matches that filter.' }));
      return;
    }
    var table = el('table');
    var thead = el('thead');
    var hr = el('tr');
    [['Rank', 'rank'], ['Protocol', null], ['Category', null], ['Chains', null], ['TVL', 'tvl'], ['7d', 'growth'], ['Age', null], ['Implied value', 'implied']].forEach(function (col, i) {
      var th = el('th', { 'class': i >= 4 ? 'num' : '' });
      if (col[1]) th.appendChild(sortButton(col[0], col[1]));
      else th.textContent = col[0];
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      if (state.selected === r.slug) tr.className = 'sel';
      tr.addEventListener('click', function () { selectRow(r.slug); });
      tr.appendChild(el('td', { 'class': 'num', text: String(r.rank) }));
      var nameTd = el('td', { 'class': 'name' });
      nameTd.innerHTML = esc(r.name) + (r.watchlist ? '<span class="badge">watchlist</span>' : '') + '<span class="slug">' + esc(r.slug) + '</span>';
      tr.appendChild(nameTd);
      tr.appendChild(el('td', { text: r.category || '—' }));
      tr.appendChild(el('td', { text: r.chains.slice(0, 3).join(', ') || '—' }));
      tr.appendChild(el('td', { 'class': 'num', text: fmtUsd(r.tvl_usd) }));
      var g = el('td', { 'class': 'num ' + ((r.change_7d || 0) >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) });
      tr.appendChild(g);
      tr.appendChild(el('td', { 'class': 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { 'class': 'num', text: fmtUsd(r.implied_value_usd) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    holder.appendChild(table);
  }

  function renderLive(holder) {
    var note = el('div', { 'class': 'note' });
    note.innerHTML = '<b>Already trading — set apart.</b> These protocols record a token with a market cap, so the board shows the market\u2019s own value for them, never a model\u2019s. They are not ranked for a launch.';
    holder.appendChild(note);
    var table = el('table');
    var thead = el('thead');
    var hr = el('tr');
    ['Protocol', 'Category', 'Chains', 'TVL', '7d', 'Market cap'].forEach(function (label, i) {
      hr.appendChild(el('th', { 'class': i >= 3 ? 'num' : '', text: label }));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var tr = el('tr');
      tr.style.cursor = 'default';
      tr.appendChild(el('td', { 'class': 'name', html: esc(r.name) + '<span class="slug">' + esc(r.slug) + '</span>' }));
      tr.appendChild(el('td', { text: r.category || '—' }));
      tr.appendChild(el('td', { text: r.chains.slice(0, 3).join(', ') || '—' }));
      tr.appendChild(el('td', { 'class': 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { 'class': 'num ' + ((r.change_7d || 0) >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }));
      tr.appendChild(el('td', { 'class': 'num', text: fmtUsd(r.mcap_usd) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    holder.appendChild(table);
  }

  function selectRow(slug) {
    state.selected = slug;
    if (window.location.hash !== '#detail=' + slug) {
      try { window.history.replaceState(null, '', '#detail=' + slug); } catch (e) { /* hash only */ }
    }
    renderDetail();
    renderBoard();
    var d = document.getElementById('detail');
    if (d && !d.hidden) d.scrollIntoView({ block: 'nearest' });
  }

  function renderDetail() {
    var holder = document.getElementById('detail');
    var r = state.selected ? bySlug[state.selected] : null;
    if (!r) { holder.hidden = true; holder.innerHTML = ''; return; }
    var recomputed = impliedOf(r, DATA.model);
    var base = Math.round(r.tvl_usd * DATA.model.base_multiple);
    var growth = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, r.change_7d === null ? 0 : r.change_7d));
    var growthMult = 1 + (growth / 100) * DATA.model.growth_weight;
    var age = r.age_days;
    var windowMult = r.window_multiplier;
    holder.hidden = false;
    var html =
      '<button class="close" type="button" id="close-detail">Close ×</button>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="dsub">Rank ' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') +
      (r.watchlist ? ' · <span class="badge">watchlist</span>' : '') + '</p>' +
      '<div class="grid">' +
      '<div class="cell"><div class="k">Implied value</div><div class="v">' + fmtUsd(r.implied_value_usd) + '</div></div>' +
      '<div class="cell"><div class="k">TVL</div><div class="v">' + fmtUsd(r.tvl_usd) + '</div></div>' +
      '<div class="cell"><div class="k">7-day change</div><div class="v">' + fmtPct(r.change_7d) + '</div></div>' +
      '<div class="cell"><div class="k">Age tracked</div><div class="v">' + fmtAge(age) + '</div></div>' +
      '<div class="cell"><div class="k">Base (TVL × 0.25)</div><div class="v">' + fmtUsd(base) + '</div></div>' +
      '<div class="cell"><div class="k">Growth / window mult</div><div class="v">' + growthMult.toFixed(2) + ' × ' + windowMult.toFixed(2) + '</div></div>' +
      '</div>' +
      '<p class="dsub">The page recomputes the value from the same figures and gets ' + fmtUsd(recomputed) + ' — the same number board.json carries.</p>' +
      '<h3>How to farm it — six steps</h3><ol>';
    r.farm_steps.forEach(function (s) { html += '<li>' + esc(s) + '</li>'; });
    html += '</ol>';
    holder.innerHTML = html;
    var close = document.getElementById('close-detail');
    if (close) close.addEventListener('click', function () {
      state.selected = null;
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* hash only */ }
      renderDetail();
      renderBoard();
    });
  }

  function renderFoot() {
    var f = document.getElementById('foot');
    f.textContent = 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '. ' +
      'The board ranks protocols that record no token; the Live tab shows the ones that already trade, at market value. ' +
      'Implied values are this entry\u2019s own model, not financial advice and not a prediction of a launch.';
  }

  function readHash() {
    var h = window.location.hash || '';
    var m = h.match(/#detail=([A-Za-z0-9._-]+)/);
    if (m && bySlug[m[1]]) state.selected = m[1];
    var f = h.match(/#filter=([^&]+)/);
    if (f) {
      try {
        var cat = decodeURIComponent(f[1]);
        if (DATA.rows.some(function (r) { return r.category === cat; })) state.category = cat;
      } catch (e) { /* keep all */ }
    }
  }

  function renderAll() {
    renderControls();
    renderDetail();
    renderBoard();
  }

  // The board's rows carry the watchlist flag from main.ts: the snapshot's own list, not a guess.
  renderMeta();
  renderModel();
  readHash();
  renderAll();
  renderFoot();
})();
