/* =========================================================================
   AXIOM — Year Comparison (screen)
   Needs: js/year-compare-core.js (analysis), SheetJS (XLSX), supabase-client.js
   Added without touching the existing navigation: one "Year Comparison"
   button (principal/coordinator: toolbar, HOD: masthead) and one report page
   that plugs into the app's existing setActivePage().
   Principal/coordinator can add and delete years; HOD is read-only.
   ========================================================================= */
(function () {
  'use strict';
  var Core = window.AxiomYearCore;
  var Charts = window.AxiomYearCharts;
  var Cloud = window.AxiomYearStorage;
  if (!Core) { console.error('year-compare-core.js did not load'); return; }

  var SETTINGS_KEY = 'axiom.yearCompare.settings.v2';
  var state = {
    datasets: [], selected: [], settings: loadSettings(), tableMissing: false, loaded: false, loading: false,
    error: '', imp: null, busy: false, chartMetric: 'median', chartStream: '', open: { checks: false, typical: false, support: false, streams: false, subjects: false, achievement: false, notes: false, settings: false }
  };

  /* ------------------------------ small helpers ------------------------------ */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function role() { return window.axRole || ''; }
  function canManage() { return role() === 'principal' || role() === 'coordinator'; }
  function pct(x) { return Core.fmt.pct(x); }
  function pts(x) { return x == null || !isFinite(x) ? '—' : Core.fmt.pts(x); }
  function cnt(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function nOf(n, total) { return n + ' of ' + total; }
  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type || 'info'); }
  function sameText(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }

  function loadSettings() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { s = {}; }
    return Core.settingsFrom(s);
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) { /* storage unavailable: setting lasts for this visit */ } }

  function yearOrder(d) {
    var m = String(d.label || '').match(/(\d{4})/);
    return (m ? parseInt(m[1], 10) : 0) * 1e13 + (d.created_at ? Date.parse(d.created_at) % 1e13 : 0);
  }
  function sortDatasets() { state.datasets.sort(function (a, b) { return yearOrder(a) - yearOrder(b) || String(a.label).localeCompare(String(b.label)); }); }
  function selectedDatasets() {
    return state.datasets.filter(function (d) { return state.selected.indexOf(d.id) >= 0; });
  }

  /* --------------------------------- storage --------------------------------- */
  function isMissingTable(err) {
    return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache|could not find the table/i.test(err.message || ''));
  }
  function loadDatasets() {
    if (state.loading) return Promise.resolve();
    state.loading = true; state.error = '';
    render();
    var done = function () { state.loading = false; state.loaded = true; render(); };
    if (typeof supabaseClient === 'undefined') { state.tableMissing = true; done(); return Promise.resolve(); }
    return supabaseClient.from('year_datasets')
      .select('*')
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) {
          if (isMissingTable(res.error)) state.tableMissing = true; else state.error = 'Saved years could not be loaded: ' + res.error.message;
        } else {
          state.datasets = res.data || [];
          state.tableMissing = false;
          sortDatasets();
          if (!state.selected.length) state.selected = state.datasets.slice(-2).map(function (d) { return d.id; });
          state.selected = state.selected.filter(function (id) { return state.datasets.some(function (d) { return d.id === id; }); });
        }
        done();
      }, function (err) { state.error = 'Saved years could not be loaded: ' + (err && err.message || err); done(); });
  }

  function persist(ds, file, previous, cloudSource) {
    if (state.tableMissing || typeof supabaseClient === 'undefined' || !Cloud) return Promise.reject(new Error('Cloud storage is unavailable. Run migrations 013 and 014, then refresh.'));
    return cloudSource ? Cloud.create(supabaseClient).saveSnapshot(ds,cloudSource) : Cloud.create(supabaseClient).save(ds,file,previous);
  }
  function removeFromStore(d) {
    return Cloud.create(supabaseClient).remove(d);
  }

  /* ----------------------------------- CSS ----------------------------------- */
  function injectCss() {
    if ($('ycStyle')) return;
    var s = document.createElement('style');
    s.id = 'ycStyle';
    s.textContent = [
      '#yearComparePage .yc-note{font-size:.8rem;color:var(--muted);line-height:1.55;margin:-4px 0 14px;}',
      '.yc-card{background:var(--paper-raised,var(--surface-2));border:1px solid var(--line);border-radius:var(--card-radius,16px);padding:18px 20px;margin-bottom:16px;box-shadow:var(--shadow-md,none);}',
      '.yc-card h3{margin:0 0 4px;font-size:.98rem;color:var(--ink);}',
      '.yc-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;}',
      '.yc-head .yc-sp{flex:1;}',
      '.yc-sub{font-size:.78rem;color:var(--muted);line-height:1.5;}',
      '.yc-years{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;}',
      '.yc-year{display:flex;align-items:flex-start;gap:9px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--surface-1);min-width:210px;cursor:pointer;}',
      '.yc-year.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset;}',
      '.yc-year input{margin-top:3px;accent-color:var(--accent);}',
      '.yc-year b{display:block;color:var(--ink);font-size:.9rem;}',
      '.yc-year span{display:block;font-size:.72rem;color:var(--muted);margin-top:2px;line-height:1.45;}',
      '.yc-year .yc-del{margin-left:auto;padding:3px 8px;font-size:.7rem;}',
      '.yc-banner{border-radius:14px;padding:13px 16px;margin-bottom:16px;border:1px solid var(--line);font-size:.84rem;line-height:1.55;}',
      '.yc-banner.ready{background:rgba(34,160,107,.10);border-color:rgba(34,160,107,.35);}',
      '.yc-banner.review{background:rgba(217,143,0,.11);border-color:rgba(217,143,0,.4);}',
      '.yc-banner b{color:var(--ink);}',
      '.yc-banner ul{margin:6px 0 0;padding-left:18px;color:var(--ink-soft);}',
      '.yc-banner li{margin:2px 0;}',
      '.yc-table{width:100%;border-collapse:collapse;font-size:.84rem;}',
      '.yc-table th{text-align:left;color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.7px;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap;}',
      '.yc-table td{padding:9px 10px;border-bottom:1px solid var(--line);color:var(--ink-soft);vertical-align:top;}',
      '.yc-table td.n,.yc-table th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}',
      '.yc-table td b{color:var(--ink);}',
      '.yc-table .yc-small{display:block;font-size:.72rem;color:var(--muted);margin-top:2px;}',
      '.yc-wrap{overflow:auto;}',
      '.yc-chg{font-weight:700;}',
      '.yc-headline{font-size:.95rem;line-height:1.6;color:var(--ink);margin:0 0 14px;padding:12px 16px;border-left:3px solid var(--accent);background:var(--surface-1);border-radius:0 12px 12px 0;}',
      '.yc-findings{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-bottom:8px;}',
      '.yc-find{background:var(--paper-raised,var(--surface-2));border:1px solid var(--line);border-radius:var(--card-radius,16px);padding:16px 18px;}',
      '.yc-find h4{margin:0 0 6px;font-size:.7rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--accent-2);}',
      '.yc-find .obs{font-size:.92rem;line-height:1.55;color:var(--ink);font-weight:600;margin:0 0 10px;}',
      '.yc-find .lbl{font-size:.68rem;text-transform:uppercase;letter-spacing:.9px;color:var(--muted);margin:10px 0 3px;font-weight:700;}',
      '.yc-find ul{margin:0;padding-left:18px;font-size:.82rem;line-height:1.55;color:var(--ink-soft);}',
      '.yc-find li{margin:2px 0;}',
      '.yc-find .next{font-size:.84rem;line-height:1.5;color:var(--ink);margin:0;}',
      '.yc-also{font-size:.78rem;color:var(--muted);line-height:1.55;margin:0 0 16px;}',
      '.yc-legend{display:flex;flex-wrap:wrap;gap:14px;margin:6px 0 4px;font-size:.78rem;color:var(--ink-soft);}',
      '.yc-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px;}',
      '.yc-svg{width:100%;height:auto;max-height:300px;display:block;}',
      '.yc-svg text{fill:var(--muted);font-size:11px;font-family:inherit;}',
      '.yc-svg .yc-val{font-size:9px;fill:var(--ink-soft);}',
      '.yc-svg line{stroke:var(--line);}',
      'details.yc-det{border:1px solid var(--line);border-radius:14px;background:var(--paper-raised,var(--surface-2));margin-bottom:10px;}',
      'details.yc-det>summary{cursor:pointer;padding:13px 18px;font-weight:700;font-size:.9rem;color:var(--ink);list-style:none;display:flex;align-items:center;gap:8px;}',
      'details.yc-det>summary::-webkit-details-marker{display:none;}',
      'details.yc-det>summary::before{content:"▸";color:var(--accent-2);transition:transform .15s;}',
      'details.yc-det[open]>summary::before{transform:rotate(90deg);}',
      'details.yc-det>summary small{font-weight:400;color:var(--muted);font-size:.74rem;margin-left:4px;}',
      'details.yc-det>.yc-in{padding:0 18px 16px;}',
      '.yc-chk{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:.82rem;line-height:1.5;}',
      '.yc-chk:last-child{border-bottom:none;}',
      '.yc-chk .st{flex:0 0 74px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding-top:2px;}',
      '.yc-chk .st.ok{color:#22a06b;}.yc-chk .st.review{color:#d98f00;}.yc-chk .st.note{color:var(--muted);}',
      '.yc-chk b{color:var(--ink);display:block;}',
      '.yc-chk span{color:var(--ink-soft);}',
      '.yc-set{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;}',
      '.yc-set label{display:flex;flex-direction:column;gap:4px;font-size:.68rem;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);font-weight:600;}',
      '.yc-set input,.yc-set select{width:130px;}',
      '.yc-empty{padding:22px;text-align:center;color:var(--muted);font-size:.88rem;line-height:1.6;}',
      '.yc-warn{background:rgba(217,143,0,.11);border:1px solid rgba(217,143,0,.4);border-radius:12px;padding:10px 14px;font-size:.8rem;line-height:1.55;color:var(--ink-soft);margin-top:10px;}',
      '.yc-err{background:rgba(220,70,70,.10);border:1px solid rgba(220,70,70,.4);border-radius:12px;padding:10px 14px;font-size:.8rem;line-height:1.55;color:var(--ink);margin-top:10px;}',
      '.yc-modal-back{position:fixed;inset:0;background:rgba(8,5,18,.66);display:none;align-items:center;justify-content:center;z-index:2600;padding:20px;}',
      '.yc-modal-back.open{display:flex;}',
      '.yc-modal{background:var(--surface-2);border:1px solid var(--line);border-radius:18px;max-width:900px;width:100%;max-height:90vh;overflow:auto;padding:22px 24px;box-shadow:0 24px 60px rgba(0,0,0,.45);}',
      '.yc-modal h3{margin:0 0 4px;font-size:1.05rem;color:var(--ink);}',
      '.yc-fields{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0;}',
      '.yc-fields label{display:flex;flex-direction:column;gap:4px;font-size:.68rem;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);font-weight:600;flex:1;min-width:180px;}',
      '.yc-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;}',
      '@media (max-width:640px){.yc-year{min-width:100%;}.yc-card{padding:14px;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ page + buttons ------------------------------ */
  function injectPage() {
    if ($('yearComparePage')) return;
    var host = document.createElement('div');
    host.id = 'yearComparePage';
    host.style.display = 'none';
    host.innerHTML =
      '<div class="section-title">Year Comparison ' +
      '<span style="flex:1;"></span>' +
      '<button class="ghost small" id="ycBackBtn" title="Return to Section View">← Back to Section View</button>' +
      '<button class="ghost small" id="ycPrintBtn" title="Print or save the comparison as a PDF">Print Report</button></div>' +
      '<div id="ycBody"></div>';
    var anchor = $('overallSummaryPage');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor); else document.body.appendChild(host);
    $('ycBackBtn').addEventListener('click', function () { if (typeof setActivePage === 'function') setActivePage('section'); });
    $('ycPrintBtn').addEventListener('click', printReportNow);
    var body = $('ycBody');
    body.addEventListener('click', onClick);
    body.addEventListener('change', onChange);
    body.addEventListener('pointermove', showChartTip);
    body.addEventListener('pointerleave', hideChartTip);
    body.addEventListener('focusin', showChartTip);
    body.addEventListener('focusout', hideChartTip);
    body.addEventListener('toggle', function (e) { var id = e.target && e.target.getAttribute && e.target.getAttribute('data-open'); if (id) state.open[id] = e.target.open; }, true);
  }

  function injectModal() {
    if ($('ycModalBack')) return;
    var m = document.createElement('div');
    m.id = 'ycModalBack'; m.className = 'yc-modal-back';
    m.innerHTML = '<div class="yc-modal" role="dialog" aria-modal="true" aria-labelledby="ycModalTitle"><div id="ycModalBody"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m && !state.busy) closeModal(); });
    m.addEventListener('click', onModalClick);
    m.addEventListener('input', onModalInput);
    m.addEventListener('change', onModalChange);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && m.classList.contains('open') && !state.busy) closeModal(); });
  }

  var ICON = '<svg class="icon" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M12 16V8"/><path d="M17 16v-7"/></svg>';
  function injectButtons() {
    if ($('ycOpenBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'ycOpenBtn'; btn.className = 'ghost';
    btn.title = 'Compare results across years as groups';
    btn.setAttribute('aria-label', 'Open Year Comparison');
    btn.innerHTML = ICON + ' Year Comparison';
    btn.addEventListener('click', openPage);
    var tr = $('teacherReportBtn');
    if (role() === 'hod' || !tr) {
      var wrap = document.querySelector('.masthead-actions');
      btn.className = 'ghost small';
      btn.style.cssText = 'background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.16);color:#fff;margin-right:8px;';
      if (wrap) wrap.prepend(btn); else document.body.appendChild(btn);
    } else tr.insertAdjacentElement('afterend', btn);
  }

  function patchNavigation() {
    if (window.__axYcPatched || typeof window.setActivePage !== 'function') return;
    window.__axYcPatched = true;
    var original = window.setActivePage;
    window.setActivePage = function (page) {
      var r = original.apply(this, arguments);
      var el = $('yearComparePage');
      if (el) el.style.display = page === 'yearCompare' ? 'block' : 'none';
      return r;
    };
  }

  function openPage() {
    if (typeof setActivePage === 'function') setActivePage('yearCompare');
    window.scrollTo(0, 0);
    loadDatasets();
  }

  /* ------------------------------- view helpers ------------------------------- */
  function det(id, title, hint, inner) {
    return '<details class="yc-det" data-open="' + id + '"' + (state.open[id] ? ' open' : '') + '><summary>' + esc(title) + (hint ? ' <small>' + esc(hint) + '</small>' : '') + '</summary><div class="yc-in">' + inner + '</div></details>';
  }
  function table(headers, rows, numFrom) {
    numFrom = numFrom == null ? 1 : numFrom;
    return '<div class="yc-wrap"><table class="yc-table"><thead><tr>' + headers.map(function (h, i) { return '<th' + (i >= numFrom ? ' class="n"' : '') + '>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i >= numFrom ? ' class="n"' : '') + '>' + (c && typeof c === 'object' && 'html' in c ? c.html : esc(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function share(m, k) { return m[k].share == null ? '—' : pct(m[k].share) + ' (' + m[k].n + ' of ' + m.n + ')'; }

  function yearsPanel() {
    var h = '<div class="yc-card yc-library"><div class="yc-head"><h3>Years to compare</h3><span class="yc-cloud-label">Private cloud</span><span class="yc-sp"></span><button class="ghost small" data-act="refresh"'+(state.loading||state.busy?' disabled':'')+'>Refresh</button>';
    if (canManage()) h += '<input type="file" id="ycFileInput" accept=".xls,.xlsx" style="display:none;"><button class="primary" data-act="add"'+(state.busy||state.loading?' disabled':'')+'>Add year</button>';
    h += '</div>';
    if (state.loading) h += '<div class="yc-sub">Loading saved years…</div>';
    if (state.error) h += '<div class="yc-err">' + esc(state.error) + '</div>';
    if (state.tableMissing) h += '<div class="yc-warn">Cloud setup required: run migrations 013 and 014 in Supabase.</div>';
    if (!state.datasets.length && !state.loading) h += '<div class="yc-empty">No years have been added yet.' + (canManage() ? ' Choose <b>Add year</b> and upload the Excel results workbook for one year. Add a workbook for each year you want to compare.' : ' A principal or coordinator needs to add them.') + '</div>';
    h += '<div class="yc-years">' + state.datasets.map(function (d) {
      var on = state.selected.indexOf(d.id) >= 0, r = d.import_report || {}, listed = (d.records || []).length;
      return '<div class="yc-year' + (on ? ' on' : '') + '"><label class="yc-year-pick"><input type="checkbox" data-act="pick" data-id="' + esc(d.id) + '"' + (on ? ' checked' : '') + '><div><b>' + esc(d.label) + '</b><span>' + esc(d.assessment || 'Assessment not named') + (d.grade_level ? ' · ' + esc(d.grade_level) : '') + '</span><span>' + listed + ' students</span></div></label><div class="yc-year-files"><span class="yc-file-badge" title="'+esc(d.source_file||'Saved results')+'">'+(d.source_path?'Workbook saved':'Results saved')+'</span>'+
        (d.source_path?'<button class="ghost small" data-act="download" data-id="'+esc(d.id)+'" title="Download original Excel workbook">Download</button>':'')+
        (canManage()?(d.source_path?'<button class="ghost small" data-act="reload-file" data-id="'+esc(d.id)+'" title="Reimport the original workbook from cloud">Reload file</button>':'<button class="ghost small" data-act="attach" data-id="'+esc(d.id)+'">Attach workbook</button>')+'<button class="ghost small yc-del" data-act="del" data-id="'+esc(d.id)+'" aria-label="Delete '+esc(d.label)+'">Delete</button>':'')+'</div></div>';
    }).join('') + '</div></div>';
    return h;
  }

  function checksBanner(cmp) {
    var review = cmp.checks.filter(function (c) { return c.status === 'review'; });
    if (!review.length) return '';
    var h = '<div class="yc-banner review" role="status"><div><b>'+review.length+' comparison '+(review.length===1?'note':'notes')+'</b><span>'+esc(cmp.A.label)+' vs '+esc(cmp.B.label)+'</span></div><button class="ghost small" data-act="checks">View checks</button>';
    return h + '</div>';
  }

  function headlineTable(analyses, cmp) {
    var st = state.settings, last = analyses[analyses.length - 1], prev = analyses.length > 1 ? analyses[analyses.length - 2] : null;
    var heads = ['Measure'].concat(analyses.map(function (a) { return a.label; }));
    if (prev) heads.push('Change, ' + prev.label + ' to ' + last.label);
    function chg(v) { return prev ? [{ html: '<span class="yc-chg">' + esc(pts(v)) + '</span>' }] : []; }
    var rows = [
      [{html:'<b title="Students with complete results / all listed students">Complete results</b>'}].concat(analyses.map(function(a){return {html:'<b title="'+a.pooled.withMarks+' of '+a.pooled.listed+' have any marks">'+a.pooled.complete+' / '+a.pooled.listed+'</b>'};})).concat(prev?['']:[]),
      [{html:'<b title="Median overall percentage of eligible results">Typical result</b>'}].concat(analyses.map(function(a){return {html:'<b title="'+a.pooled.n+' of '+a.pooled.listed+' listed students">'+pct(a.pooled.median)+'</b>'};})).concat(chg(cmp?cmp.deltas.median:null)),
      [{html:'<b title="Overall result below '+st.support+'%">Support need</b>'}].concat(analyses.map(function(a){return {html:'<b title="'+nOf(a.pooled.support.n,a.pooled.n)+' eligible results">'+pct(a.pooled.support.share)+'</b>'};})).concat(chg(cmp?cmp.deltas.support:null)),
      [{html:'<b title="Overall result at least '+st.excellence+'%">Excellence</b>'}].concat(analyses.map(function(a){return {html:'<b title="'+nOf(a.pooled.excellence.n,a.pooled.n)+' eligible results">'+pct(a.pooled.excellence.share)+'</b>'};})).concat(chg(cmp?cmp.deltas.excellence:null))
    ];
    return '<div class="yc-card yc-overview'+(prev?' has-change':'')+'"><div class="yc-head"><h3>At a glance</h3><span class="yc-sp"></span><span class="yc-mode-pill" title="Changes use percentage points. See How results are calculated for definitions.">'+(st.basis==='complete'?'Complete results':'Available subjects')+'</span></div>' + table(heads, rows, 1) + '</div>';
  }

  function findingsView(cmp) {
    var h = '<div class="yc-findings">';
    cmp.findings.forEach(function (f) {
      var metric,caption;
      if(f.id==='typical'){metric=pts(cmp.deltas.median);caption=pct(cmp.A.pooled.median)+' → '+pct(cmp.B.pooled.median);}
      else if(f.id==='support'){metric=pts(cmp.deltas.support);caption=cmp.B.pooled.support.n+' of '+cmp.B.pooled.n+' need support';}
      else if(f.id==='achievement'){metric=pct(cmp.B.pooled.excellence.share);caption=cmp.B.pooled.excellence.n+' of '+cmp.B.pooled.n+' at '+cmp.settings.excellence+'%+';}
      else if(f.id==='subject'){
        var pr=cmp.subjects.filter(function(s){return f.observation.indexOf('In '+s.stream+', '+s.subject+' ')===0;})[0];
        metric=pr?pr.subject:'Review subject';caption=pr?pr.stream+' · '+pct(pr.b.median)+' median':'See evidence';
      }else{metric='Review needed';caption=f.id==='insufficient'?'More complete results needed':'Comparison inputs differ';}
      h += '<div class="yc-find"><h4>' + esc(f.title) + '</h4><div class="yc-insight-value">'+esc(metric)+'</div><p class="yc-insight-caption">'+esc(caption)+'</p><details class="yc-insight-detail"><summary>Details</summary><p class="obs">'+esc(f.observation)+'</p>' +
        '<div class="lbl">Evidence</div><ul>' + f.evidence.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
        '<div class="lbl">Worth knowing</div><ul>' + f.qualification.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
        '<div class="lbl">Next question</div><p class="next">' + esc(f.next) + '</p></details></div>';
    });
    h += '</div>';
    if (cmp.alsoChecked && cmp.alsoChecked.length) h += '<details class="yc-det"><summary>Other observations</summary><p class="yc-also">' + cmp.alsoChecked.map(function (a) { return esc(a.summary); }).join(' ') + '</p></details>';
    return h;
  }

  function detailSections(analyses, cmp) {
    var st = state.settings, out = '', A = cmp.A, B = cmp.B;
    // checks
    out += det('checks', 'Comparison checks', cmp.checks.filter(function (c) { return c.status === 'review'; }).length + ' need review', cmp.checks.map(function (c) {
      return '<div class="yc-chk"><div class="st ' + c.status + '">' + (c.status === 'ok' ? 'OK' : c.status === 'review' ? 'Review' : 'Note') + '</div><div><b>' + esc(c.label) + '</b><span>' + esc(c.detail) + '</span></div></div>';
    }).join(''));
    // typical
    out += det('typical', 'Typical performance', 'median, middle half, mean', table(['Year', 'Eligible overall results', 'Median', 'Middle half', 'Mean'], analyses.map(function (a) {
      return [a.label, a.pooled.n, pct(a.pooled.median), pct(a.pooled.p25) + ' to ' + pct(a.pooled.p75), pct(a.pooled.mean)];
    }), 1));
    // support
    out += det('support', 'Support need and below-pass', 'two separate measures', table(['Year', 'Below ' + st.support + '% overall (eligible results)', 'Recorded below ' + st.pass + '% in any subject (all listed)', 'All-subject pass confirmed', 'Cannot be confirmed', 'Whole-cohort support limits'], analyses.map(function (a) {
      var m = a.pooled;
      return [a.label, share(m, 'support'), m.belowPass.share == null ? '—' : pct(m.belowPass.share) + ' (' + m.belowPass.recorded + ' of ' + m.belowPass.n + ')', m.belowPass.confirmedPass, m.belowPass.unknown, m.supportBounds ? pct(m.supportBounds.low) + ' to ' + pct(m.supportBounds.high) + ' (' + m.supportBounds.unknown + ' incomplete)' : 'All results complete'];
    }), 1) + '<p class="yc-sub" style="margin-top:8px;">Recorded failures, confirmed passes and unknown outcomes use all listed students, independently of the overall-result filter. A pass requires every applicable subject to be scored and none below ' + st.pass + '%. Absence is separate, not zero. Support limits allow every incomplete overall result to fall on either side of the threshold; these are conservative bounds, not estimates.</p>');
    // streams
    var sr = cmp.streams.map(function (r) {
      var a = r.a, b = r.b;
      return [r.label + (r.enough ? '' : ' (few students)'), a ? a.n : '—', b ? b.n : '—', a && b ? pct(a.median) + ' → ' + pct(b.median) : '—', r.dMedian == null ? '—' : pts(r.dMedian), a && b ? pct(a.support.share) + ' → ' + pct(b.support.share) : '—', a && b ? pct(a.excellence.share) + ' → ' + pct(b.excellence.share) : '—', b ? pct(b.coverage) : '—'];
    });
    var mix = cmp.mix ? '<p class="yc-sub" style="margin-top:8px;">Stream mix: the pooled mean moves ' + esc(pts(cmp.mix.pooled)) + '; with stream sizes held at ' + esc(A.label) + ' levels it moves ' + esc(pts(cmp.mix.within)) + (cmp.mix.reversal ? '. The two point in opposite directions, so read the stream rows rather than the pooled total.' : '.') + '</p>' : '';
    out += det('streams', 'Breadth across streams', A.label + ' to ' + B.label, table(['Stream', 'Students ' + A.label, 'Students ' + B.label, 'Median', 'Change', 'Below ' + st.support + '%', st.excellence + '% or above', 'Coverage ' + B.label], sr, 1) + mix);
    // subjects
    var subs = cmp.subjects.slice().sort(function (x, y) { return x.streamKey < y.streamKey ? -1 : x.streamKey > y.streamKey ? 1 : (x.b.median || 0) - (y.b.median || 0); });
    out += det('subjects', 'Subjects within streams', 'lowest first in each stream', table(['Stream', 'Subject', 'Students ' + A.label + ' / ' + B.label, 'Median', 'Change', 'Below ' + st.pass + '%', 'Missing/invalid ' + A.label + ' / ' + B.label, 'Absent ' + A.label + ' / ' + B.label], subs.map(function (r) {
      return [r.stream, r.subject + (r.enough ? '' : ' (few students)'), r.a.n + ' / ' + r.b.n, r.a.n && r.b.n ? pct(r.a.median) + ' → ' + pct(r.b.median) : '—', r.dMedian == null ? '—' : pts(r.dMedian), pct(r.a.belowShare) + ' → ' + pct(r.b.belowShare), r.a.missing + ' / ' + r.b.missing, r.a.absent + ' / ' + r.b.absent];
    }), 2) + '<p class="yc-sub" style="margin-top:8px;">Subjects are compared inside their own stream. A blank cell means no score; it is never counted as zero.</p>');
    // achievement
    out += det('achievement', 'Achievement', st.excellence + '% or above', table(['Year', 'Share at or above ' + st.excellence + '%'].concat([]), analyses.map(function (a) { return [a.label, share(a.pooled, 'excellence')]; }), 1) +
      table(['Stream', A.label, B.label, 'Change'], cmp.streams.map(function (r) { return [r.label, r.a ? share(r.a, 'excellence') : '—', r.b ? share(r.b, 'excellence') : '—', r.dExcellence == null ? '—' : pts(r.dExcellence)]; }), 1));
    // import notes
    out += det('notes', 'Import notes', 'what was ignored or left out', analyses.map(function (a) {
      var r = a.report || {}, w = (r.warnings || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
      return '<p class="yc-sub"><b>' + esc(a.label) + '</b> · ' + a.pooled.listed + ' students listed, ' + a.pooled.withMarks + ' with marks. ' + cnt(r.padding || 0, 'empty template row', 'empty template rows') + ' ignored' + (r.duplicates ? ', ' + cnt(r.duplicates, 'duplicate row', 'duplicate rows') + ' excluded' : '') + (r.summaryRows ? ', ' + cnt(r.summaryRows, 'summary row', 'summary rows') + ' skipped' : '') + '. Calculated result records are anonymous. Original workbooks are private cloud files.</p>' + (w ? '<ul class="yc-sub">' + w + '</ul>' : '');
    }).join(''));
    // settings
    out += det('settings', 'Settings', 'applied to every year equally',
      '<div class="yc-set"><label>Support threshold, %<input type="number" min="0" max="100" step="1" data-set="support" value="' + st.support + '"></label>' +
      '<label>Pass mark per subject, %<input type="number" min="0" max="100" step="1" data-set="pass" value="' + st.pass + '"></label>' +
      '<label>Excellence threshold, %<input type="number" min="0" max="100" step="1" data-set="excellence" value="' + st.excellence + '"></label>' +
      '<label>Students counted<select data-set="basis"><option value="marked"' + (st.basis === 'marked' ? ' selected' : '') + '>All with marks</option><option value="complete"' + (st.basis === 'complete' ? ' selected' : '') + '>Every subject scored only</option></select></label>' +
      '<button class="ghost small" data-act="reset">Reset to defaults</button></div>' +
      '<p class="yc-sub" style="margin-top:8px;">Support need and below-pass are separate: support uses the overall percentage, below-pass uses each subject. These settings are saved on this device.</p>');
    return out;
  }

  function body() {
    var sel = selectedDatasets();
    if (!state.datasets.length) return '';
    if (!sel.length) return '<div class="yc-card"><div class="yc-empty">Tick at least two years above to compare them.</div></div>';
    var analyses = sel.map(function (d) { return Core.analyseDataset(d, state.settings); });
    if (analyses.length === 1) {
      return headlineTable(analyses, null) + '<div class="yc-charts">'+Charts.status(analyses[0])+Charts.distribution(analyses,Core.BAND_LABELS)+'</div>';
    }
    var cmp = Core.compareDatasets(analyses[analyses.length - 2], analyses[analyses.length - 1], state.settings);
    state.last = { analyses: analyses, cmp: cmp };
    return checksBanner(cmp) + headlineTable(analyses, cmp) + findingsView(cmp) +
      '<div class="yc-charts">'+Charts.trend(analyses,state.chartMetric,state.settings)+Charts.status(analyses[analyses.length-1])+Charts.distribution(analyses,Core.BAND_LABELS)+Charts.streams(cmp)+Charts.subjects(cmp,state.chartStream)+'</div>'+
      '<div class="yc-details-title">Explore details</div>'+detailSections(analyses, cmp)+
      '<details class="yc-det"><summary>How results are calculated</summary><div class="yc-in yc-sub">Typical result is the median. Support means below '+state.settings.support+'%; excellence means '+state.settings.excellence+'% or above. Overall measures use '+(state.settings.basis==='complete'?'complete results only':'available scored subjects')+'. Hover or focus a chart for counts. Changes are percentage points. Different cohorts and papers do not prove individual progress or a teaching effect.</div></details>';
  }

  function render() {
    state.compact=window.matchMedia('(max-width:600px)').matches;
    if(Charts)Charts.setCompact(state.compact);
    hideChartTip();
    var host = $('ycBody');
    if (!host) return;
    state.last = null;
    host.innerHTML = yearsPanel() + body();
    var pb = $('ycPrintBtn');
    if (pb) pb.style.display = state.last ? '' : 'none';
  }

  /* --------------------------------- page events --------------------------------- */
  function onClick(e) {
    var metricButton=e.target.closest?e.target.closest('[data-chart-metric]'):null;
    if(metricButton){state.chartMetric=metricButton.getAttribute('data-chart-metric');render();return;}
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    if(state.busy && act!=='checks')return;
    if(state.loading && ['add','attach','reload-file','del'].indexOf(act)>=0)return;
    if (act === 'add') { e.preventDefault(); state.attachTarget=null; var fi = $('ycFileInput'); if (fi) fi.click(); }
    else if (act === 'refresh' && !state.busy) loadDatasets();
    else if (act === 'checks') { var check=document.querySelector('[data-open="checks"]'); if(check){check.open=true;state.open.checks=true;check.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});} }
    else if (act === 'download' || act === 'reload-file') cloudFile(t.getAttribute('data-id'),act==='reload-file');
    else if (act === 'attach' && canManage()) { state.attachTarget=state.datasets.filter(function(d){return d.id===t.getAttribute('data-id');})[0]; $('ycFileInput').click(); }
    else if (act === 'del') { e.preventDefault(); e.stopPropagation(); askDelete(t.getAttribute('data-id')); }
    else if (act === 'reset') { state.settings = Core.settingsFrom({}); saveSettings(); render(); }
  }

  function hideChartTip(){var tip=$('ycChartTooltip');if(tip)tip.hidden=true;}
  function showChartTip(event){
    var target=event.target.closest?event.target.closest('[data-yc-tip]'):null;
    if(!target){hideChartTip();return;}
    var box=$('ycChartTooltip');
    if(!box){box=document.createElement('div');box.id='ycChartTooltip';box.className='yc-tooltip';box.setAttribute('role','tooltip');document.body.appendChild(box);}
    box.textContent=target.getAttribute('data-yc-tip');box.hidden=false;
    target.setAttribute('aria-describedby','ycChartTooltip');
    var rect=target.getBoundingClientRect(),x=event.clientX==null?rect.left+rect.width/2:event.clientX,y=event.clientY==null?rect.top:event.clientY;
    box.style.left=Math.max(10,Math.min(x+12,window.innerWidth-box.offsetWidth-12))+'px';
    box.style.top=Math.max(10,Math.min(y+16,window.innerHeight-box.offsetHeight-10))+'px';
  }
  async function cloudFile(id,reload){
    if(state.busy || (reload&&!canManage()))return;
    var d=state.datasets.filter(function(x){return x.id===id;})[0];if(!d)return;
    state.busy=true;
    try{
      var blob=await Cloud.create(supabaseClient).download(d);
      if(reload){
        var source=Object.assign({},d,{_reload:true});
        await readFile(new File([blob],d.source_file||'results.xlsx',{type:blob.type}),source);
      }else{
        var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=d.source_file||'results.xlsx';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
      }
    }catch(error){toast('Could not load cloud file: '+error.message,'warning');}
    finally{state.busy=false;if(state.imp)refreshModal();}
  }
  function onChange(e) {
    var t = e.target;
    if(t.hasAttribute('data-chart-metric'))return;
    if(t.hasAttribute('data-chart-stream')){state.chartStream=t.value;render();return;}
    if (t.id === 'ycFileInput') {
      var file = t.files && t.files[0];
      if (file) readFile(file,state.attachTarget);
      t.value = '';   // lets the same file be chosen again later
      return;
    }
    if (t.getAttribute && t.getAttribute('data-act') === 'pick') {
      var id = t.getAttribute('data-id'), i = state.selected.indexOf(id);
      if (t.checked && i < 0) state.selected.push(id); else if (!t.checked && i >= 0) state.selected.splice(i, 1);
      var order = {}; state.datasets.forEach(function (d, ix) { order[d.id] = ix; });
      state.selected.sort(function (a, b) { return order[a] - order[b]; });
      render();
    } else if (t.getAttribute && t.getAttribute('data-set')) {
      var key = t.getAttribute('data-set'), v = key === 'basis' ? t.value : parseFloat(t.value);
      var next = Object.assign({}, state.settings); next[key] = v;
      state.settings = Core.settingsFrom(next); saveSettings(); state.open.settings = true; render();
    }
  }

  function askDelete(id) {
    if(!canManage() || state.busy)return;
    var d = state.datasets.filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var go = function () {
      removeFromStore(d).then(function (warning) {
        state.datasets = state.datasets.filter(function (x) { return x.id !== id; });
        state.selected = state.selected.filter(function (x) { return x !== id; });
        render(); toast(warning || 'Deleted ' + d.label + '.', warning?'warning':'success');
      }, function (err) { state.error = 'Could not delete: ' + err.message; render(); });
    };
    var msg = 'Delete ' + esc(d.label) + ' and its cloud workbook for everyone? Your local original is not affected.';
    if (typeof showConfirm === 'function') showConfirm('Delete ' + d.label + '?', '<p>' + msg + '</p>', go); else if (window.confirm('Delete ' + d.label + '? ' + msg.replace(/<[^>]+>/g, ''))) go();
  }

  /* ---------------------------------- import flow ---------------------------------- */
  function readFile(file,source) {
    if (typeof XLSX === 'undefined') { toast('The Excel reader is not available in this page.', 'warn'); return; }
    try{Cloud.checkFile(file);}catch(error){toast(error.message,'warning');return;}
    return file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array', cellDates: false });
      var sheets = wb.SheetNames.map(function (n) { return { name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true, blankrows: true }) }; });
      var parsed = Core.parseWorkbook(sheets, { fileName: file.name });
      state.imp = {
        fileName: file.name, file:file, cloudSource:source && source._reload?source:null, parsed: parsed, label: source?source.label:parsed.yearGuess || '', assessment: source?source.assessment:parsed.assessmentGuess || '', grade: source?source.grade_level:'', error: '',
        include: parsed.sheets.map(function () { return true; }), streams: parsed.sheets.map(function (s) { return s.stream.label; }), confirmed: false
      };
      openModal();
    }).catch(function () { toast('That file could not be read. Please check it is a valid Excel workbook.', 'warn'); });
  }

  function existingFor(imp) {
    return state.datasets.filter(function (d) { return sameText(d.label, imp.label) && sameText(d.assessment, imp.assessment) && sameText(d.grade_level, imp.grade); })[0];
  }
  function replaceNoticeHtml(imp) {
    var ex = norm(imp.label) ? existingFor(imp) : null;
    return ex ? '<div class="yc-warn"><b>' + esc(ex.label) + '</b>' + (ex.assessment ? ' (' + esc(ex.assessment) + ')' : '') + ' is already saved. Saving will replace it with this file.</div>' : '';
  }
  function updateReplaceNotice() {
    var n = $('ycReplaceNotice'), b = document.querySelector('[data-imp-act=save]');
    if (!state.imp || !n) return;
    var ex = replaceNoticeHtml(state.imp);
    n.innerHTML = ex;
    if (b && !state.busy) b.textContent = ex ? 'Replace saved year' : 'Save year';
  }
  function modalHtml() {
    var imp = state.imp, p = imp.parsed;
    var h = '<h3 id="ycModalTitle">'+(imp.cloudSource?'Reload cloud workbook':'Add a year')+'</h3><div class="yc-sub">' + esc(imp.fileName) + ' · '+(imp.cloudSource?'Loaded from cloud.':'Workbook and results will be saved privately in cloud.')+'</div>';
    if (!p.sheets.length) {
      h += '<div class="yc-err">No result sheets were recognised in this workbook. A result sheet needs a header row with subject names, a row of maximum marks beneath it, and one row per student.</div>';
    } else {
      h += '<div class="yc-fields"><label>Year<input type="text" data-imp="label" value="' + esc(imp.label) + '" placeholder="e.g. 2025-26"></label>' +
        '<label>Assessment<input type="text" data-imp="assessment" value="' + esc(imp.assessment) + '" placeholder="e.g. Annual exam"></label>' +
        '<label>Class or grade<input type="text" data-imp="grade" value="' + esc(imp.grade) + '" placeholder="e.g. First year"></label></div>';
      h += '<div class="yc-wrap"><table class="yc-table"><thead><tr><th>Use</th><th>Sheet</th><th>Stream</th><th class="n">Listed</th><th class="n">With marks</th><th>Subjects found</th></tr></thead><tbody>' +
        p.sheets.map(function (s, i) {
          return '<tr><td><input type="checkbox" data-imp-inc="' + i + '"' + (imp.include[i] ? ' checked' : '') + ' aria-label="Use sheet ' + esc(s.sheet) + '"></td><td>' + esc(s.sheet) + '</td>' +
            '<td><input type="text" data-imp-stream="' + i + '" value="' + esc(imp.streams[i]) + '" style="width:110px;" aria-label="Stream name for ' + esc(s.sheet) + '"></td>' +
            '<td class="n">' + s.listed + '</td><td class="n">' + s.withMarks + '</td><td>' + esc(s.subjects.map(function (x) { return x.name + ' (' + x.max + ')'; }).join(', ')) + '<span class="yc-small">Maximum marks read from Excel row ' + s.maxRowNumber + '.</span>' +
            (s.warnings.length ? '<span class="yc-small">' + s.warnings.map(esc).join(' ') + '</span>' : '') + '<span class="yc-small">' + cnt(s.stats.padding, 'empty row', 'empty rows') + ' ignored' + (s.stats.duplicates ? ', ' + cnt(s.stats.duplicates, 'duplicate', 'duplicates') + ' excluded' : '') + (s.stats.summaryRows ? ', ' + cnt(s.stats.summaryRows, 'summary row', 'summary rows') + ' skipped' : '') + '</span></td></tr>';
        }).join('') + '</tbody></table></div>';
      h += '<p class="yc-sub" style="margin-top:8px;">Sheets may share a stream only when their subjects and maximum marks match. Do not combine different exams into one cohort. Blank or dash cells mean missing; only explicit N/A or exempt means not applicable. Absence remains separate.</p>' +
        '<label class="yc-sub"><input type="checkbox" data-imp-confirm' + (imp.confirmed ? ' checked' : '') + '> I checked the listed students, subject maximum marks and stream labels against this workbook.</label>';
    }
    h += '<div id="ycReplaceNotice">' + (p.sheets.length ? replaceNoticeHtml(imp) : '') + '</div>';
    if (p.skipped.length) h += '<div class="yc-warn"><b>Skipped sheets:</b> ' + p.skipped.map(function (s) { return esc(s.sheet) + ' (' + esc(s.reason) + ')'; }).join('; ') + '</div>';
    if (imp.error) h += '<div class="yc-err">' + esc(imp.error) + '</div>';
    h += '<div class="yc-foot"><button class="ghost" data-imp-act="cancel"' + (state.busy ? ' disabled' : '') + '>Cancel</button>' + (p.sheets.length ? '<button class="primary" data-imp-act="save"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Saving…' : (existingFor(imp) ? 'Replace saved year' : 'Save year')) + '</button>' : '') + '</div>';
    return h;
  }
  function openModal() { $('ycModalBody').innerHTML = modalHtml(); $('ycModalBack').classList.add('open'); }
  function closeModal() { $('ycModalBack').classList.remove('open'); state.imp = null; }
  function refreshModal() { if (state.imp) $('ycModalBody').innerHTML = modalHtml(); }

  function onModalInput(e) {
    var t = e.target, imp = state.imp;
    if (!imp) return;
    if (t.hasAttribute('data-imp')) { imp[t.getAttribute('data-imp')] = t.value; updateReplaceNotice(); }
    else if (t.hasAttribute('data-imp-stream')) { imp.streams[parseInt(t.getAttribute('data-imp-stream'), 10)] = t.value; imp.confirmed = false; var check = document.querySelector('[data-imp-confirm]'); if (check) check.checked = false; }
  }
  function onModalChange(e) {
    var t = e.target, imp = state.imp;
    if (imp && t.hasAttribute('data-imp-inc')) { imp.include[parseInt(t.getAttribute('data-imp-inc'), 10)] = t.checked; }
    if (imp && t.hasAttribute('data-imp-confirm')) imp.confirmed = t.checked;
  }
  function onModalClick(e) {
    var t = e.target.closest ? e.target.closest('[data-imp-act]') : null;
    if (!t || !state.imp) return;
    if (t.getAttribute('data-imp-act') === 'cancel') closeModal();
    else if (t.getAttribute('data-imp-act') === 'save') saveImport();
  }

  function saveImport() {
    if (!canManage() || state.busy) return;
    var imp = state.imp, p = imp.parsed;
    if (!norm(imp.label)) { imp.error = 'Enter the year, for example 2025-26.'; refreshModal(); return; }
    if (!norm(imp.assessment) || !norm(imp.grade)) { imp.error = 'Enter the assessment and class or grade so the same cohort stage can be compared across years.'; refreshModal(); return; }
    if (!imp.confirmed) { imp.error = 'Check the imported students, subject maxima and streams, then tick the confirmation before saving.'; refreshModal(); return; }
    var inc = [];
    p.sheets.forEach(function (s, i) { if (imp.include[i]) inc.push({ parsed: s, streamLabel: imp.streams[i] }); });
    if (!inc.length) { imp.error = 'Tick at least one sheet to use.'; refreshModal(); return; }
    var ds;
    try { ds = Core.buildDataset({ label: imp.label, assessment: imp.assessment, grade: imp.grade, fileName: imp.fileName, skipped: p.skipped }, inc); }
    catch (err) { imp.error = err.message || 'The selected sheets could not be combined.'; refreshModal(); return; }
    if (!ds.records.length) { imp.error = 'No student rows were found in the ticked sheets.'; refreshModal(); return; }
    var existing = existingFor({ label: ds.label, assessment: ds.assessment, grade: ds.grade_level });
    if(imp.cloudSource && existing && existing.id!==imp.cloudSource.id){imp.error='Those year details belong to another saved dataset. Keep this workbook attached to its own year.';refreshModal();return;}
    state.busy = true; imp.error = ''; refreshModal();
    persist(ds,imp.file,existing,imp.cloudSource).then(function (saved) {
      state.busy = false;
      state.datasets = state.datasets.filter(function (d) { return d.id !== saved.id && !(existing && d.id === existing.id); });
      state.datasets.push(saved); sortDatasets();
      state.selected = state.selected.filter(function (id) { return !existing || id !== existing.id; });
      if (state.selected.indexOf(saved.id) < 0) state.selected.push(saved.id);
      var order = {}; state.datasets.forEach(function (d, ix) { order[d.id] = ix; });
      state.selected.sort(function (a, b) { return order[a] - order[b]; });
      closeModal(); render(); toast(saved.cleanupWarning || (existing ? 'Updated ' : 'Saved ') + saved.label + ' in cloud.',saved.cleanupWarning?'warning':'success');
    }, function (err) { state.busy = false; imp.error = 'Could not save: ' + err.message; refreshModal(); });
  }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /* ------------------------------------- print ------------------------------------- */
  function printReportNow() {
    if (!state.last || typeof printReport !== 'function') { toast('Choose two or more years first.', 'warn'); return; }
    var a = state.last.analyses, c = state.last.cmp, st = state.settings;
    var P = function (t) { return '<p style="margin:0 0 6px;font-size:11px;line-height:1.5;">' + esc(t) + '</p>'; };
    var html = P('Each year holds different students. Differences describe the groups, not individual progress, and no cause is implied.') + P(c.headline);
    html += reportSectionHtml('Headline', reportTableHtml(['Measure'].concat(a.map(function (x) { return x.label; })), [
      ['Students with marks, of those listed'].concat(a.map(function (x) { return x.pooled.withMarks + ' of ' + x.pooled.listed + ' (' + pct(x.pooled.coverage) + ')'; })),
      ['Typical result (median)'].concat(a.map(function (x) { return pct(x.pooled.median); })),
      ['Below ' + st.support + '% overall'].concat(a.map(function (x) { return pct(x.pooled.support.share) + ' (' + x.pooled.support.n + ' of ' + x.pooled.n + ')'; })),
      [st.excellence + '% or above'].concat(a.map(function (x) { return pct(x.pooled.excellence.share) + ' (' + x.pooled.excellence.n + ' of ' + x.pooled.n + ')'; }))
    ]));
    html += reportSectionHtml('Findings', c.findings.map(function (f) {
      return '<div style="margin:0 0 10px;"><div style="font-weight:700;font-size:11.5px;">' + esc(f.title) + '. ' + esc(f.observation) + '</div>' +
        '<div style="font-size:10.5px;line-height:1.5;"><b>Evidence:</b> ' + esc(f.evidence.join(' ')) + '</div>' +
        '<div style="font-size:10.5px;line-height:1.5;"><b>Worth knowing:</b> ' + esc(f.qualification.join(' ')) + '</div>' +
        '<div style="font-size:10.5px;line-height:1.5;"><b>Next question:</b> ' + esc(f.next) + '</div></div>';
    }).join(''));
    html += reportSectionHtml('Comparison checks', reportTableHtml(['Check', 'Status', 'Detail'], c.checks.map(function (k) { return [k.label, k.status === 'ok' ? 'OK' : k.status === 'review' ? 'Review' : 'Note', k.detail]; })));
    html += reportSectionHtml('By stream, ' + c.A.label + ' to ' + c.B.label, reportTableHtml(['Stream', 'Students', 'Median', 'Below ' + st.support + '%', st.excellence + '% or above'], c.streams.map(function (r) {
      return [r.label, (r.a ? r.a.n : '—') + ' / ' + (r.b ? r.b.n : '—'), r.a && r.b ? pct(r.a.median) + ' → ' + pct(r.b.median) : '—', r.a && r.b ? pct(r.a.support.share) + ' → ' + pct(r.b.support.share) : '—', r.a && r.b ? pct(r.a.excellence.share) + ' → ' + pct(r.b.excellence.share) : '—'];
    })));
    printReport('Year Comparison: ' + a.map(function (x) { return x.label; }).join(', '), 'Cohort comparison · ' + (st.basis === 'complete' ? 'students with every subject scored' : 'students with marks, available-subject percentages'), html, { compact: true });
  }

  /* ------------------------------------- start ------------------------------------- */
  function init() {
    var r = role();
    if (r !== 'principal' && r !== 'coordinator' && r !== 'hod') return;
    injectCss(); injectPage(); injectModal(); injectButtons(); patchNavigation();
    render();
    window.addEventListener('resize',function(){if(state.compact!==window.matchMedia('(max-width:600px)').matches)render();});
  }
  function boot() {
    if (window.axRole) { init(); return; }
    var tries = 0, t = setInterval(function () {
      tries++;
      if (window.axRole) { clearInterval(t); init(); } else if (tries > 150) clearInterval(t);
    }, 200);
  }
  window.AxiomYearCompare = { open: openPage, _state: state };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
