/* =========================================================================
   AXIOM — Year Comparison core (no DOM, no network)
   Works in the browser (window.AxiomYearCore) and in Node (module.exports),
   so the same code is unit-tested. Three jobs:
     1. READ   a yearly Excel result workbook, tolerantly, without storing names
     2. MEASURE cohort statistics (typical result, support need, excellence...)
     3. COMPARE two yearly datasets and write at most three cautious findings

   Rules this file follows (agreed in the proposal and the supervisor review):
   - Different years hold different students: everything is a COHORT comparison.
     Wording never describes individual growth and never states a cause.
   - A blank subject cell is never a zero mark. Every cell is classified as
     scored / absent / not applicable / missing / partial / invalid.
   - Padding rows (empty template rows) are ignored; named students with no
     marks are counted as "listed, no marks" and reported separately.
   - Percentages are "available-subject" percentages: earned / maximum over the
     subjects the student actually has a score for. Coverage is always reported.
   - Failing = below the pass mark in ANY one subject. A pass can only be
     confirmed when every subject of the stream is scored.
   - Nothing is rounded until display.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AxiomYearCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    support: 50,      // overall % below which a student is counted as needing support
    pass: 33,         // per-subject pass mark (%)
    excellence: 90,   // overall % at or above which a result counts as excellent
    basis: 'complete', // use complete results by default; available-subject mode must be explicitly selected
    minGroup: 5,      // smallest group a subject/stream statement is made about
    minCohort: 10     // smallest cohort for a headline comparison
  };

  // Cell status codes stored with every record
  //   s scored   a absent   n not applicable   m missing (blank)   p partial paper   i invalid
  var BAND_EDGES = [0, 40, 50, 60, 70, 80, 90, 100.0000001];
  var BAND_LABELS = ['Below 40%', '40–49%', '50–59%', '60–69%', '70–79%', '80–89%', '90% and above'];

  /* ------------------------------ small helpers ------------------------------ */
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function up(s) { return norm(s).toUpperCase(); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  var SUBJECT_ALIASES = [
    [/^(MATH|MATHS|MATHEMATICS|MATHEMATIC)$/, 'MATH'],
    [/^(COMPUTER|COMPUTER SCIENCE|COMPUTER STUDIES|COMP SCI|CS)$/, 'COMPUTER'],
    [/^(ISLAMIAT|ISLAMIYAT|ISLAMIC STUDIES|ISLAMIC)( COMPULSORY)?$/, 'ISLAMIAT'],
    [/^(URDU)( COMPULSORY)?$/, 'URDU'],
    [/^(ENG|ENGLISH)( COMPULSORY)?$/, 'ENGLISH'],
    [/^(BIO|BIOLOGY)$/, 'BIOLOGY'],
    [/^(CHEM|CHEMISTRY)$/, 'CHEMISTRY'],
    [/^(PHY|PHYSICS)$/, 'PHYSICS'],
    [/^(TQ|TARJUMA|TARJUMA TUL QURAN|TARJUMA TUL QURAN)$/, 'TQ']
  ];
  function subjectKey(name) {
    var u = up(name).replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    for (var i = 0; i < SUBJECT_ALIASES.length; i++) if (SUBJECT_ALIASES[i][0].test(u)) return SUBJECT_ALIASES[i][1];
    return u;
  }
  function prettySubject(name) {
    var t = norm(name);
    if (!/^[A-Z0-9 .&\/-]+$/.test(t)) return t;
    return t.split(' ').map(function (w) { return w.length <= 3 ? w : w.charAt(0) + w.slice(1).toLowerCase(); }).join(' ');
  }
  function ordinalLow(n) {
    if (n === 1) return 'the lowest';
    var w = { 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth' }[n];
    return 'the ' + (w || n + 'th') + ' lowest';
  }
  function streamKey(label) { return up(label).replace(/[^A-Z0-9]+/g, ''); }

  function sortedNums(arr) { return arr.slice().sort(function (a, b) { return a - b; }); }
  function quantile(arr, q) {
    if (!arr.length) return null;
    var s = sortedNums(arr), pos = (s.length - 1) * q, base = Math.floor(pos), rest = pos - base;
    return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
  }
  function mean(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null; }
  function share(count, n) { return n > 0 ? (count / n) * 100 : null; }

  /* ================================ 1. READER ================================ */
  var NON_SUBJECT = /^(SR\b|S\.? ?NO\b|SERIAL)|ROLL|\bREG\b|REGISTRATION|MATRIC|1ST YEAR|2ND YEAR|FIRST YEAR|SECOND YEAR|BOARD MARKS|TOTAL|PERCENT|%|GRADE|POSITION|RANK|DAILY|REMARK|NAME|RESULT|SECTION|FATHER|PHONE|CONTACT|STATUS|SIGN/;
  var FOOTER_ROW = /^(total|grand|average|avg|mean|pass|fail|percentage|remarks?|max(imum)?|min(imum)?|highest|lowest|class|section|prepared|checked|principal|signature)\b/i;
  var NAME_LABEL = /^(student'?s? )?name$/i;

  function classifyCell(v) {
    if (v === null || v === undefined) return { k: 'm' };
    if (typeof v === 'number') return isFinite(v) ? (v < 0 ? { k: 'i' } : { k: 's', v: v }) : { k: 'i' };
    var t = norm(v);
    if (t === '') return { k: 'm' };
    if (/^(ab|a|abs|absent)$/i.test(t)) return { k: 'a' };
    if (/^(na|n\/a|n\.a\.?|exempt)$/i.test(t)) return { k: 'n' };
    if (/^(nil|-+|—|–|x)$/i.test(t)) return { k: 'm' };
    if (/^\d+(\.\d+)?$/.test(t)) return { k: 's', v: parseFloat(t) };
    return { k: 'i' };
  }

  // One subject may span several columns (theory + practical). Marks are summed;
  // a subject with only some of its papers filled in is "partial", never a score.
  function readSubject(row, subj) {
    var nums = 0, sum = 0, ab = 0, na = 0, inv = 0, need = subj.cols.length;
    for (var i = 0; i < need; i++) {
      var c = classifyCell(row[subj.cols[i]]);
      if (c.k === 's') {
        if (subj.maxByCol && c.v > subj.maxByCol[i] + 1e-9) return ['i', null, 'max'];
        nums++; sum += c.v;
      } else if (c.k === 'a') ab++; else if (c.k === 'n') na++; else if (c.k === 'i') inv++;
    }
    if (nums === need) return sum > subj.max + 1e-9 ? ['i', null, 'max'] : ['s', sum];
    if (nums > 0) return ['p', null];
    if (inv > 0) return ['i', null, 'text'];
    if (ab > 0) return ['a', null];
    if (na === need) return ['n', null];
    return ['m', null];
  }

  function findHeaderRow(rows) {
    var best = -1, bestScore = 0, lim = Math.min(rows.length, 20);
    for (var i = 0; i < lim; i++) {
      var r = rows[i] || [], strs = 0;
      for (var c = 0; c < r.length; c++) if (typeof r[c] === 'string' && norm(r[c])) strs++;
      var hasNumRow = false;
      for (var j = i + 1; j <= i + 3 && j < rows.length; j++) {
        var rr = rows[j] || [], n = 0;
        for (var k = 0; k < rr.length; k++) if (isNum(rr[k])) n++;
        if (n >= 2) hasNumRow = true;
      }
      if (hasNumRow && strs > bestScore) { bestScore = strs; best = i; }
    }
    return best >= 0 && bestScore >= 4 ? best : -1;
  }

  function guessYear(text) {
    var m = String(text || '').match(/(20\d{2})\s*[-–\/]\s*(\d{2,4})/);
    if (m) return m[1] + '-' + m[2].slice(-2);
    m = String(text || '').match(/(20\d{2})/);
    return m ? m[1] : '';
  }
  function guessAssessment(title) {
    var t = norm(String(title || '').split('\n')[0]);
    t = t.replace(/\(.*$/, '').trim();
    return t;
  }
  // Stream (PM / PE / ICS ...) comes from the sheet name or the sheet's own title.
  // Year suffixes such as "(Pv2025)" are ignored so a stream matches across years.
  function detectStream(sheetName, title) {
    function tokens(s) {
      var out = [], re = /\(([^)]*)\)/g, m;
      while ((m = re.exec(String(s || '')))) out.push(norm(m[1]));
      return out;
    }
    function good(t) { return /^[A-Za-z][A-Za-z &\/-]{0,18}$/.test(t) && !/^(pv|prev)/i.test(t); }
    var t = tokens(sheetName).filter(good)[0] || tokens(title).filter(good)[0];
    if (!t) {
      t = norm(String(sheetName || '').replace(/\(.*?\)/g, '').replace(/20\d{2}\s*[-–\/]?\s*\d{0,4}/g, ''));
      if (!t) t = norm(sheetName) || 'Stream';
    }
    return { label: t, key: streamKey(t) };
  }

  function parseSheet(rows, sheetName) {
    rows = (rows || []).map(function (r) { return Array.isArray(r) ? r : []; });
    var skip = function (reason) { return { ok: false, sheet: sheetName, reason: reason }; };
    var h = findHeaderRow(rows);
    if (h < 0) return skip('No header row with subject columns and a maximum-marks row was found.');
    var header = rows[h], width = 0;
    rows.slice(h, h + 6).forEach(function (r) { width = Math.max(width, r.length); });
    var boundary = [];
    for (var c = 0; c < width; c++) if (header[c] !== null && header[c] !== undefined && norm(header[c]) !== '') boundary.push(c);

    // Maximum rows must not contain student identifiers. Numeric student rows
    // cannot be used as maxima, even if they contain more numbers than metadata.
    var cand = [];
    var labelledNameCols = {};
    rows.slice(h, h + 6).forEach(function (row) { row.forEach(function (value, col) { if (NAME_LABEL.test(norm(value))) labelledNameCols[col] = true; }); });
    boundary.forEach(function (col) {
      if (typeof header[col] === 'string' && !labelledNameCols[col] && !NON_SUBJECT.test(up(header[col]))) cand.push(col);
    });
    var maxIdx = -1, maxCount = 0;
    for (var j = h + 1; j <= h + 3 && j < rows.length; j++) {
      var metadataOnly = boundary.every(function (col) {
        if (cand.indexOf(col) >= 0) return true;
        var value = norm(rows[j][col]);
        if (!value || /^TOTAL/.test(up(header[col]))) return true;
        return /^(maximum( marks)?|max\.? marks|full marks|marks|student'?s? name|name)$/i.test(value);
      });
      if (!metadataOnly) break;
      var cnt = 0;
      cand.forEach(function (col) { if (isNum(rows[j][col])) cnt++; });
      if (cnt > maxCount) { maxCount = cnt; maxIdx = j; }
    }
    if (maxIdx < 0 || maxCount < 2) return skip('No maximum-marks row was found under the subject headings.');
    var maxRow = rows[maxIdx];

    var subjects = [];
    cand.forEach(function (col) {
      var next = boundary.filter(function (b) { return b > col; })[0];
      var end = next === undefined ? width : next, cols = [], max = 0;
      for (var x = col; x < end; x++) if (isNum(maxRow[x]) && maxRow[x] > 0) { cols.push(x); max += maxRow[x]; }
      if (cols.length) subjects.push({ name: norm(header[col]), key: subjectKey(header[col]), max: max, cols: cols, maxByCol: cols.map(function (x) { return maxRow[x]; }) });
    });
    if (subjects.length < 2) return skip('Fewer than two subject columns were recognised.');
    if (subjects.length !== cand.length) return skip('Maximum marks are missing or invalid for a subject. Supply a complete maximum-marks row before importing.');
    var subjectKeys = {};
    for (var si = 0; si < subjects.length; si++) {
      if (!subjects[si].key || subjectKeys[subjects[si].key]) return skip('Duplicate or unrecognised subject heading. Combine papers under one subject heading or use distinct subject names.');
      subjectKeys[subjects[si].key] = true;
    }

    // key columns
    var subjCols = {};
    subjects.forEach(function (s) { s.cols.forEach(function (x) { subjCols[x] = 1; }); });
    var nameCol = null, nameLabelRow = -1;
    for (var rI = 0; rI <= Math.min(rows.length - 1, h + 5) && nameCol === null; rI++) {
      for (var cI = 0; cI < rows[rI].length; cI++) {
        if (typeof rows[rI][cI] === 'string' && NAME_LABEL.test(norm(rows[rI][cI])) && !subjCols[cI]) { nameCol = cI; nameLabelRow = rI; break; }
      }
    }
    if (nameCol === null) { // fall back to the text-richest column outside the subjects
      var bestC = -1, bestN = 0;
      for (var cc = 0; cc < width; cc++) {
        if (subjCols[cc]) continue;
        var n2 = 0;
        for (var rr2 = maxIdx + 1; rr2 < rows.length; rr2++) if (typeof rows[rr2][cc] === 'string' && /[A-Za-z]{2}/.test(rows[rr2][cc])) n2++;
        if (n2 > bestN) { bestN = n2; bestC = cc; }
      }
      nameCol = bestC >= 0 ? bestC : null;
    }
    var rollCol = null, totalCol = null;
    boundary.forEach(function (col) {
      var t = up(header[col]);
      if (rollCol === null && /ROLL/.test(t)) rollCol = col;
      if (totalCol === null && /^TOTAL/.test(t)) totalCol = col;
    });
    var title = nameCol !== null && typeof header[nameCol] === 'string' && !NAME_LABEL.test(norm(header[nameCol])) ? header[nameCol] : '';

    var declaredTotal = null;
    if (totalCol !== null) {
      for (var d = h + 1; d <= Math.max(maxIdx, nameLabelRow) + 1 && d < rows.length; d++) {
        if (isNum(rows[d][totalCol]) && rows[d][totalCol] > 0) { declaredTotal = rows[d][totalCol]; break; }
      }
    }
    var summedMax = subjects.reduce(function (a, s) { return a + s.max; }, 0);

    var dataStart = Math.max(maxIdx, nameLabelRow) + 1;
    var stat = { rowsRead: 0, padding: 0, summaryRows: 0, duplicates: 0, unnamedWithMarks: 0, invalidCells: 0, aboveMax: 0, unreadable: 0, totalMismatches: 0 };
    var seen = {}, records = [], overBySubject = {};
    for (var i = dataStart; i < rows.length; i++) {
      var row = rows[i];
      stat.rowsRead++;
      var name = nameCol !== null ? norm(row[nameCol]) : '';
      var roll = rollCol !== null && row[rollCol] != null ? norm(row[rollCol]) : '';
      var cells = subjects.map(function (s) { return readSubject(row, s); });
      var any = cells.some(function (cl) { return cl[0] === 's' || cl[0] === 'p' || cl[0] === 'a' || cl[0] === 'i'; });
      if (!name && !roll && !any) { stat.padding++; continue; }
      var srText = norm(row[0]);
      if ((name && FOOTER_ROW.test(name)) || (!name && FOOTER_ROW.test(srText))) { stat.summaryRows++; continue; }
      var sig = cells.map(function (cl) { return cl[0] + ':' + (cl[1] == null ? '' : cl[1]); }).join(',');
      var key = roll + '|' + name.toLowerCase();
      if ((roll || name) && seen[key] !== undefined) {
        if (seen[key] === sig) { stat.duplicates++; continue; }
        return skip('Conflicting duplicate student rows were found at Excel row ' + (i + 1) + '. Resolve the duplicate results before importing this sheet.');
      } else if (roll || name) seen[key] = sig;
      if (!name) stat.unnamedWithMarks++;
      cells.forEach(function (cl, ci) {
        if (cl[0] !== 'i') return;
        stat.invalidCells++;
        if (cl[2] === 'max') { stat.aboveMax++; overBySubject[subjects[ci].name] = (overBySubject[subjects[ci].name] || 0) + 1; } else stat.unreadable++;
      });
      if (totalCol !== null && isNum(row[totalCol]) && cells.every(function (cl) { return cl[0] === 's'; })) {
        var sumE = cells.reduce(function (a, cl) { return a + cl[1]; }, 0);
        if (Math.abs(sumE - row[totalCol]) > 0.5) stat.totalMismatches++;
      }
      records.push({ c: cells.map(function (cl) { return [cl[0], cl[1]]; }) });
    }
    var withMarks = records.filter(function (r) { return r.c.some(function (cl) { return cl[0] === 's'; }); }).length;
    var warnings = [];
    if (declaredTotal !== null && Math.abs(declaredTotal - summedMax) > 0.5) warnings.push('Subject maximum marks add up to ' + summedMax + ' but the sheet total says ' + declaredTotal + '.');
    if (stat.aboveMax) warnings.push(stat.aboveMax + (stat.aboveMax === 1 ? ' mark is' : ' marks are') + ' above the subject maximum and ' + (stat.aboveMax === 1 ? 'was' : 'were') + ' left out (' + Object.keys(overBySubject).map(function (k) { return k + ' ' + overBySubject[k]; }).join(', ') + ').');
    if (stat.unreadable) warnings.push(stat.unreadable + (stat.unreadable === 1 ? ' cell holds' : ' cells hold') + ' text that is not a mark and ' + (stat.unreadable === 1 ? 'was' : 'were') + ' left out.');
    var st = detectStream(sheetName, title);
    return {
      ok: true, sheet: sheetName, title: norm(title), stream: st,
      yearGuess: guessYear(title) || guessYear(sheetName), assessmentGuess: guessAssessment(title), maxRowNumber: maxIdx + 1,
      subjects: subjects.map(function (s) { return { name: s.name, key: s.key, max: s.max }; }),
      records: records, listed: records.length, withMarks: withMarks, stats: stat, warnings: warnings
    };
  }

  // sheets: [{name, rows}] -> every sheet parsed or skipped with a reason
  function parseWorkbook(sheets, opts) {
    opts = opts || {};
    var parsed = [], skipped = [];
    (sheets || []).forEach(function (s) {
      var r = parseSheet(s.rows, s.name);
      if (r.ok) parsed.push(r); else skipped.push({ sheet: s.name, reason: r.reason });
    });
    var yg = '', ag = '';
    parsed.forEach(function (p) { if (!yg && p.yearGuess) yg = p.yearGuess; if (!ag && p.assessmentGuess) ag = p.assessmentGuess; });
    if (!yg) yg = guessYear(opts.fileName || '');
    return { sheets: parsed, skipped: skipped, yearGuess: yg, assessmentGuess: ag, fileName: opts.fileName || '' };
  }

  // Turn confirmed sheets into one anonymous dataset: no names, no roll numbers.
  // included: [{parsed, streamLabel}]; sheets that share a stream are merged.
  function buildDataset(meta, included) {
    var streams = [], byKey = {}, records = [], report = { sheets: [], padding: 0, summaryRows: 0, duplicates: 0, unnamedWithMarks: 0, invalidCells: 0, aboveMax: 0, unreadable: 0, totalMismatches: 0, warnings: [], skippedSheets: (meta.skipped || []).length };
    included.forEach(function (inc) {
      var p = inc.parsed;
      if (!p.ok) throw new Error('Cannot save an unrecognised result sheet. Correct its headings and maximum marks first.');
      var label = norm(inc.streamLabel) || p.stream.label, key = streamKey(label) || 'STREAM';
      var s = byKey[key];
      if (!s) {
        s = { key: key, label: label, subjects: p.subjects.map(function (sub) { return { key: sub.key, name: prettySubject(sub.name), max: sub.max }; }) };
        byKey[key] = s; streams.push(s);
      } else {
        if (s.subjects.length !== p.subjects.length || p.subjects.some(function (sub) { return !s.subjects.some(function (x) { return x.key === sub.key; }); })) {
          throw new Error('Subject lists differ between sheets assigned to ' + label + '. Use separate stream names or correct the workbook; omitted subjects cannot be assumed not applicable.');
        }
        p.subjects.forEach(function (sub) {
          var existing = s.subjects.filter(function (x) { return x.key === sub.key; })[0];
          if (existing.max !== sub.max) throw new Error('Maximum marks differ for ' + sub.name + ' in ' + label + ' (' + existing.max + ' and ' + sub.max + '). Use separate stream names or align the assessment before combining these sheets.');
        });
      }
    });
    var n = 0;
    included.forEach(function (inc) {
      var p = inc.parsed, key = streamKey(norm(inc.streamLabel) || p.stream.label) || 'STREAM', s = byKey[key];
      var pos = {};
      p.subjects.forEach(function (sub, i) { pos[sub.key] = i; });
      p.records.forEach(function (r) {
        n++;
        var cells = s.subjects.map(function (sub) { return pos[sub.key] === undefined ? ['n', null] : r.c[pos[sub.key]]; });
        records.push({ i: 'r' + n, st: key, c: cells });
      });
      report.sheets.push({ sheet: p.sheet, stream: s.label, listed: p.listed, withMarks: p.withMarks });
      ['padding', 'summaryRows', 'duplicates', 'unnamedWithMarks', 'invalidCells', 'aboveMax', 'unreadable', 'totalMismatches'].forEach(function (f) { report[f] += p.stats[f]; });
      p.warnings.forEach(function (w) { report.warnings.push(p.sheet + ': ' + w); });
    });
    return {
      label: norm(meta.label), assessment: norm(meta.assessment), grade_level: norm(meta.grade),
      source_file: meta.fileName || '', import_report: report, streams: streams, records: records
    };
  }

  /* ============================== 2. STATISTICS ============================== */
  function settingsFrom(s) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    if (s) for (k in s) if (s[k] !== undefined && s[k] !== null && s[k] !== '') o[k] = s[k];
    ['support', 'pass', 'excellence'].forEach(function (f) {
      var v = Number(o[f]);
      o[f] = isFinite(v) ? Math.min(100, Math.max(0, v)) : DEFAULTS[f];
    });
    o.basis = o.basis === 'marked' ? 'marked' : 'complete';
    return o;
  }

  function deriveRecord(rec, stream, st) {
    var earned = 0, max = 0, scored = 0, absent = 0, missing = 0, below = 0, k = stream.subjects.length, applicable = 0;
    rec.c.forEach(function (cl, i) {
      var sub = stream.subjects[i];
      if (cl[0] === 'n') return;
      applicable++;
      if (cl[0] === 's') {
        scored++; earned += cl[1]; max += sub.max;
        if ((cl[1] / sub.max) * 100 < st.pass) below++;
      } else if (cl[0] === 'a') absent++; else missing++;
    });
    return {
      hasMarks: scored > 0, complete: scored > 0 && scored === applicable, scored: scored, applicable: applicable,
      avail: scored > 0 && max > 0 ? (earned / max) * 100 : null, below: below, absent: absent, missing: missing
    };
  }

  function metricsFor(items, st) {
    var listed = items.length, withMarks = items.filter(function (x) { return x.d.hasMarks; });
    var elig = items.filter(function (x) { return st.basis === 'complete' ? x.d.complete : x.d.hasMarks; });
    var vals = elig.map(function (x) { return x.d.avail; });
    var n = elig.length;
    var supportN = elig.filter(function (x) { return x.d.avail < st.support; }).length;
    var excN = elig.filter(function (x) { return x.d.avail >= st.excellence; }).length;
    // Known subject outcomes use all listed students, independently of the
    // subset eligible for an overall median/support/excellence calculation.
    var belowN = items.filter(function (x) { return x.d.below > 0; }).length;
    var confirmed = items.filter(function (x) { return x.d.below === 0 && x.d.complete; }).length;
    var incomplete = items.filter(function (x) { return !x.d.complete; }).length;
    var completeSupport = items.filter(function (x) { return x.d.complete && x.d.avail < st.support; }).length;
    var bands = BAND_LABELS.map(function () { return 0; });
    elig.forEach(function (x) {
      for (var b = 0; b < BAND_LABELS.length; b++) if (x.d.avail >= BAND_EDGES[b] && x.d.avail < BAND_EDGES[b + 1]) { bands[b]++; break; }
    });
    var noMarks = listed - withMarks.length;
    return {
      listed: listed, withMarks: withMarks.length, noMarks: noMarks,
      coverage: share(withMarks.length, listed),
      complete: items.filter(function (x) { return x.d.complete; }).length,
      partial: withMarks.filter(function (x) { return !x.d.complete; }).length,
      completeShare: share(items.filter(function (x) { return x.d.complete; }).length, withMarks.length),
      completeCoverage: share(listed - incomplete, listed),
      n: n, median: quantile(vals, 0.5), mean: mean(vals), p25: quantile(vals, 0.25), p75: quantile(vals, 0.75),
      support: { n: supportN, share: share(supportN, n) },
      excellence: { n: excN, share: share(excN, n) },
      belowPass: { recorded: belowN, n: listed, share: share(belowN, listed), confirmedPass: confirmed, unknown: listed - belowN - confirmed },
      supportBounds: incomplete > 0 && listed > 0 ? { low: share(completeSupport, listed), high: share(completeSupport + incomplete, listed), unknown: incomplete, n: listed } : null,
      bands: bands, bandShares: bands.map(function (b) { return share(b, n); })
    };
  }

  function analyseDataset(ds, settings) {
    var st = settingsFrom(settings), streams = [], all = [];
    (ds.streams || []).forEach(function (s) {
      var recs = (ds.records || []).filter(function (r) { return r.st === s.key; }).map(function (r) { return { r: r, d: deriveRecord(r, s, st) }; });
      all = all.concat(recs);
      var subjects = s.subjects.map(function (sub, idx) {
        var pcts = [], absent = 0, missing = 0, below = 0;
        recs.forEach(function (x) {
          var cl = x.r.c[idx];
          if (!cl || cl[0] === 'n') return;
          if (cl[0] === 's') { var p = (cl[1] / sub.max) * 100; pcts.push(p); if (p < st.pass) below++; }
          else if (cl[0] === 'a') absent++; else missing++;
        });
        return {
          key: sub.key, name: sub.name, max: sub.max, n: pcts.length, absent: absent, missing: missing,
          median: quantile(pcts, 0.5), mean: mean(pcts), p25: quantile(pcts, 0.25),
          below: below, belowShare: share(below, pcts.length)
        };
      });
      streams.push({ key: s.key, label: s.label, subjects: subjects, metrics: metricsFor(recs, st) });
    });
    return {
      label: ds.label, assessment: ds.assessment || '', grade: ds.grade_level || '', id: ds.id,
      settings: st, streams: streams, pooled: metricsFor(all, st), report: ds.import_report || {}
    };
  }

  /* =============================== 3. COMPARISON =============================== */
  function f1(x) { return x == null ? '—' : x.toFixed(1) + '%'; }
  function pts(d) { return (d > 0 ? '+' : d < 0 ? '-' : '') + Math.abs(d).toFixed(1) + ' points'; }
  function dirWord(d, tol, up, down) { return d >= tol ? up : d <= -tol ? down : 'about the same'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function listJoin(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function streamByKey(an, key) { return an.streams.filter(function (s) { return s.key === key; })[0]; }

  function runChecks(A, B, st) {
    var out = [];
    function add(id, label, ok, detail) { out.push({ id: id, label: label, status: ok ? 'ok' : 'review', detail: detail }); }
    var nA = norm(A.assessment).toLowerCase(), nB = norm(B.assessment).toLowerCase();
    add('assessment', 'Same assessment', !!nA && !!nB && nA === nB, !nA || !nB ? 'Assessment is not recorded for one or both years. Confirm the assessment and stage before comparing.' : nA === nB ? A.assessment : 'Assessment names differ: “' + A.assessment + '” and “' + B.assessment + '”.');
    var gA = norm(A.grade).toLowerCase(), gB = norm(B.grade).toLowerCase();
    add('grade', 'Same class or grade', !gA || !gB || gA === gB, !gA || !gB ? 'Not recorded for one or both years, so it cannot be checked.' : (gA === gB ? A.grade : 'Class or grade differs: ' + A.grade + ' and ' + B.grade + '.'));
    if (!gA || !gB) out[out.length - 1].status = 'review';
    var kA = A.streams.map(function (s) { return s.key; }), kB = B.streams.map(function (s) { return s.key; });
    var onlyA = A.streams.filter(function (s) { return kB.indexOf(s.key) < 0; }).map(function (s) { return s.label; });
    var onlyB = B.streams.filter(function (s) { return kA.indexOf(s.key) < 0; }).map(function (s) { return s.label; });
    add('streams', 'Same streams', !onlyA.length && !onlyB.length,
      !onlyA.length && !onlyB.length ? A.streams.map(function (s) { return s.label; }).join(', ') : (onlyA.length ? 'Only in ' + A.label + ': ' + onlyA.join(', ') + '. ' : '') + (onlyB.length ? 'Only in ' + B.label + ': ' + onlyB.join(', ') + '.' : ''));
    var basketDiff = [], maxDiff = [];
    A.streams.forEach(function (sa) {
      var sb = streamByKey(B, sa.key);
      if (!sb) return;
      var ka = sa.subjects.map(function (x) { return x.key; }), kb = sb.subjects.map(function (x) { return x.key; });
      sa.subjects.forEach(function (x) { if (kb.indexOf(x.key) < 0) basketDiff.push(sa.label + ' ' + x.name + ' (only in ' + A.label + ')'); });
      sb.subjects.forEach(function (x) {
        if (ka.indexOf(x.key) < 0) basketDiff.push(sa.label + ' ' + x.name + ' (only in ' + B.label + ')');
        else { var xa = sa.subjects[ka.indexOf(x.key)]; if (xa.max !== x.max) maxDiff.push(sa.label + ' ' + x.name + ' ' + xa.max + ' → ' + x.max); }
      });
    });
    add('basket', 'Same subjects in each stream', !basketDiff.length, basketDiff.length ? 'Subject lists differ: ' + basketDiff.join('; ') + '.' : 'Subject lists match.');
    add('maxima', 'Same maximum marks', !maxDiff.length, maxDiff.length ? 'Maximum marks changed: ' + maxDiff.join('; ') + '.' : 'Maximum marks match.');
    var lowCov = [A, B].filter(function (x) { return x.pooled.coverage != null && x.pooled.coverage < 90; });
    add('coverage', 'Marks present for listed students', !lowCov.length,
      [A, B].map(function (x) { return x.label + ': ' + x.pooled.withMarks + ' of ' + x.pooled.listed + ' listed students have marks (' + f1(x.pooled.coverage) + ')'; }).join('. ') + '.');
    var lowComp = [A, B].filter(function (x) { return x.pooled.complete < x.pooled.listed; });
    add('complete', 'Every subject scored', !lowComp.length,
      [A, B].map(function (x) { return x.label + ': ' + x.pooled.complete + ' of ' + x.pooled.listed + ' listed students have complete results (' + f1(x.pooled.completeCoverage) + ')'; }).join('. ') + '.');
    var small = [A, B].filter(function (x) { return x.pooled.n < st.minCohort; });
    add('size', 'Enough students to compare', !small.length, small.length ? 'Fewer than ' + st.minCohort + ' students in ' + small.map(function (x) { return x.label; }).join(' and ') + '.' : 'Both years have at least ' + st.minCohort + ' students.');
    var rej = [A, B].map(function (x) { return { l: x.label, r: x.report || {} }; });
    var problems = rej.filter(function (x) { return (x.r.summaryRows || 0) + (x.r.invalidCells || 0) + (x.r.duplicates || 0) + (x.r.totalMismatches || 0) > 0; });
    add('import', 'Clean import', !problems.length, problems.length ? problems.map(function (x) {
      var r = x.r, p = [];
      if (r.duplicates) p.push(plural(r.duplicates, 'duplicate row', 'duplicate rows') + ' excluded');
      if (r.summaryRows) p.push(plural(r.summaryRows, 'summary row', 'summary rows') + ' skipped');
      if (r.aboveMax) p.push(plural(r.aboveMax, 'mark above the subject maximum', 'marks above the subject maximum') + ' left out');
      if (r.unreadable) p.push(plural(r.unreadable, 'cell with text instead of a mark', 'cells with text instead of a mark') + ' left out');
      if (r.totalMismatches) p.push(plural(r.totalMismatches, 'row whose sheet total differs from its marks', 'rows whose sheet total differs from their marks'));
      return x.l + ': ' + p.join(', ');
    }).join('. ') + '.' : 'No duplicates, summary rows, marks above the maximum or unreadable cells.');
    return out;
  }

  // Direction of the pooled change versus the same change with stream weights held fixed
  function mixDiagnostic(A, B) {
    var shared = A.streams.filter(function (s) { return streamByKey(B, s.key) && s.metrics.n > 0 && streamByKey(B, s.key).metrics.n > 0; });
    if (shared.length < 2 || A.pooled.mean == null || B.pooled.mean == null) return null;
    var wTotal = shared.reduce(function (a, s) { return a + s.metrics.n; }, 0);
    var fixedB = 0, fixedA = 0;
    shared.forEach(function (s) {
      var w = s.metrics.n / wTotal;
      fixedA += w * s.metrics.mean; fixedB += w * streamByKey(B, s.key).metrics.mean;
    });
    var pooled = B.pooled.mean - A.pooled.mean, within = fixedB - fixedA;
    return {
      pooled: pooled, within: within, shift: pooled - within,
      reversal: Math.abs(pooled) >= 1 && Math.abs(within) >= 1 && (pooled > 0) !== (within > 0),
      material: Math.abs(pooled - within) >= 2
    };
  }

  function streamRows(A, B, st) {
    var keys = [], rows = [];
    A.streams.concat(B.streams).forEach(function (s) { if (keys.indexOf(s.key) < 0) keys.push(s.key); });
    keys.forEach(function (k) {
      var a = streamByKey(A, k), b = streamByKey(B, k), label = (b || a).label;
      var ok = a && b && a.metrics.n >= st.minGroup && b.metrics.n >= st.minGroup;
      rows.push({
        key: k, label: label, a: a ? a.metrics : null, b: b ? b.metrics : null, enough: !!ok,
        dMedian: a && b && a.metrics.median != null && b.metrics.median != null ? b.metrics.median - a.metrics.median : null,
        dSupport: a && b && a.metrics.support.share != null && b.metrics.support.share != null ? b.metrics.support.share - a.metrics.support.share : null,
        dExcellence: a && b && a.metrics.excellence.share != null && b.metrics.excellence.share != null ? b.metrics.excellence.share - a.metrics.excellence.share : null
      });
    });
    return rows;
  }

  function subjectRows(A, B, st) {
    var rows = [];
    A.streams.forEach(function (sa) {
      var sb = streamByKey(B, sa.key);
      if (!sb) return;
      var rankA = sa.subjects.filter(function (x) { return x.n >= st.minGroup; }).slice().sort(function (x, y) { return x.median - y.median; }).map(function (x) { return x.key; });
      var rankB = sb.subjects.filter(function (x) { return x.n >= st.minGroup; }).slice().sort(function (x, y) { return x.median - y.median; }).map(function (x) { return x.key; });
      sa.subjects.forEach(function (xa) {
        var xb = sb.subjects.filter(function (y) { return y.key === xa.key; })[0];
        if (!xb) return;
        var enough = xa.n >= st.minGroup && xb.n >= st.minGroup;
        rows.push({
          stream: sa.label, streamKey: sa.key, subject: xb.name, key: xa.key, a: xa, b: xb, enough: enough,
          dMedian: enough ? xb.median - xa.median : null,
          dP25: enough ? xb.p25 - xa.p25 : null,
          rankA: rankA.indexOf(xa.key) + 1, rankB: rankB.indexOf(xa.key) + 1, of: Math.min(rankA.length, rankB.length),
          rankBOf: rankB.length, sameMax: xa.max === xb.max
        });
      });
    });
    return rows;
  }

  function breadthText(rows, key, tol, up, down, minGroup) {
    var use = rows.filter(function (r) { return r.enough && r[key] != null; });
    if (!use.length) return null;
    var ups = use.filter(function (r) { return r[key] >= tol; }), downs = use.filter(function (r) { return r[key] <= -tol; }), same = use.filter(function (r) { return Math.abs(r[key]) < tol; });
    var names = function (a) { return a.map(function (r) { return r.label; }); };
    var kind;
    if (use.length > 1 && ups.length === use.length) kind = 'all up';
    else if (use.length > 1 && downs.length === use.length) kind = 'all down';
    else if (use.length === 1) kind = 'single';
    else kind = 'mixed';
    var parts = [];
    if (downs.length) parts.push(down + ' in ' + listJoin(names(downs)));
    if (ups.length) parts.push(up + ' in ' + listJoin(names(ups)));
    if (same.length) parts.push('about the same in ' + listJoin(names(same)));
    var text = kind === 'all up' ? up + ' in all ' + use.length + ' streams with enough students' : kind === 'all down' ? down + ' in all ' + use.length + ' streams with enough students' : parts.join('; ');
    var skipped = rows.filter(function (r) { return !r.enough; }).map(function (r) { return r.label; });
    if (skipped.length) text += ' (not assessed for ' + listJoin(skipped) + ': fewer than ' + minGroup + ' students in a year, or present in one year only)';
    return { kind: kind, text: text, ups: ups, downs: downs };
  }

  function buildFindings(ctx) {
    var A = ctx.A, B = ctx.B, st = ctx.settings, P = ctx.pooled, streams = ctx.streams, subjects = ctx.subjects, checks = ctx.checks, mix = ctx.mix;
    var pA = A.pooled, pB = B.pooled;
    var chk = function (id) { return checks.filter(function (c) { return c.id === id; })[0]; };
    var findings = [];

    var blockers = comparabilityBlockers(ctx);
    if (blockers.length) return [{
      id: 'comparability', title: 'Comparability not established',
      observation: 'Review the assessment, grade and subject rules before interpreting a year-to-year change.',
      evidence: blockers.map(function (c) { return c.detail; }),
      qualification: ['The figures describe separate cohorts and remain visible for inspection; the mismatched inputs do not establish an improvement or decline.'],
      next: 'Can the same assessment stage, grade and subject basket be selected for both years?', strength: 0
    }];

    if (pA.n < st.minCohort || pB.n < st.minCohort) {
      return [{
        id: 'insufficient', title: 'No clear conclusion yet',
        observation: 'There are too few eligible overall results to draw a clear comparison.',
        evidence: [A.label + ': ' + pA.n + ' eligible overall results. ' + B.label + ': ' + pB.n + ' eligible overall results.'],
        qualification: ['Percentages from groups under ' + st.minCohort + ' students move a lot when one student changes.'],
        next: 'Can the missing results be entered, or a year with a larger group be added to the comparison?',
        strength: 0
      }];
    }

    var covGap = Math.abs((pB.coverage == null ? 100 : pB.coverage) - (pA.coverage == null ? 100 : pA.coverage)) >= 10 || (pA.coverage < 90) || (pB.coverage < 90);
    var worse = pB.coverage < pA.coverage ? B : A, worseM = worse.pooled;

    /* ---- typical performance ---- */
    var dMed = pB.median - pA.median;
    var typical = {
      id: 'typical', title: 'Typical result',
      observation: 'The typical (median) result among ' + (st.basis === 'complete' ? 'students with complete results' : 'students with available-subject results') + ' is ' + dirWord(dMed, 1.5, 'higher', 'lower') + ' in ' + B.label + ': ' + f1(pB.median) + ' against ' + f1(pA.median) + ' in ' + A.label + ' (' + pts(dMed) + ').',
      evidence: [
        'Students with marks: ' + pB.withMarks + ' of ' + pB.listed + ' listed in ' + B.label + ' (' + f1(pB.coverage) + '); ' + pA.withMarks + ' of ' + pA.listed + ' in ' + A.label + ' (' + f1(pA.coverage) + ').',
        'Middle half of results: ' + f1(pB.p25) + ' to ' + f1(pB.p75) + ' in ' + B.label + '; ' + f1(pA.p25) + ' to ' + f1(pA.p75) + ' in ' + A.label + '.',
        'Mean (secondary): ' + f1(pB.mean) + ' against ' + f1(pA.mean) + '.'
      ],
      qualification: [], next: '', strength: 1 + Math.min(Math.abs(dMed) / 5, 3)
    };
    if (covGap && worseM.noMarks > 0) typical.qualification.push(plural(worseM.noMarks, 'listed student in ' + worse.label + ' has', 'listed students in ' + worse.label + ' have') + ' no marks, so this describes students with marks only, not the whole cohort.');
    if ((pA.partial > 0 || pB.partial > 0)) typical.qualification.push(st.basis === 'complete'
      ? (pA.partial + pB.partial) + ' students across the two cohorts have partial results and are excluded from the overall comparison. Recorded subject failures and missing/absence counts still include them.'
      : 'Available-subject results include ' + (pA.partial + pB.partial) + ' students across the two cohorts with incomplete subject coverage. Their percentages may not be comparable.');
    if (chk('basket').status === 'review' || chk('maxima').status === 'review') typical.qualification.push('Subject lists or maximum marks differ between the years (see Comparison checks), so the two percentages are not built from identical papers.');
    if (mix && (mix.reversal || mix.material)) typical.qualification.push(mix.reversal ? 'Stream mix reverses the picture: the pooled mean moves ' + pts(mix.pooled) + ' but within streams it moves ' + pts(mix.within) + '.' : 'Stream mix differs between the years; the pooled mean moves ' + pts(mix.pooled) + ' against ' + pts(mix.within) + ' with stream weights held fixed.');
    if (!typical.qualification.length) typical.qualification.push('These are different student groups; a difference of ' + pts(dMed) + ' can reflect who was in each group as well as how they performed.');
    typical.next = covGap && worseM.noMarks > 0 ? 'Are the ' + worseM.noMarks + ' listed students in ' + worse.label + ' without marks absent, withdrawn or not yet entered?'
      : mix && (mix.reversal || mix.material) ? 'Does the same direction hold inside each stream?'
      : (chk('basket').status === 'review' || chk('maxima').status === 'review') ? 'Can the subject lists and maximum marks be aligned before the years are compared?'
      : 'Is the difference in the typical result seen in every stream or only some?';
    findings.push(typical);

    /* ---- support need and breadth ---- */
    var dSup = pB.support.share - pA.support.share;
    if (pA.support.n + pB.support.n > 0) {
      var br = breadthText(streams, 'dSupport', 1, 'higher', 'lower', st.minGroup);
      var bound = [];
      [A, B].forEach(function (x) {
        if (x.pooled.supportBounds) bound.push('There are ' + x.pooled.supportBounds.unknown + ' incomplete overall results in ' + x.label + '. Across all ' + x.pooled.listed + ' listed students, the true full-result share below ' + st.support + '% could be between ' + f1(x.pooled.supportBounds.low) + ' and ' + f1(x.pooled.supportBounds.high) + ' (conservative limits, not estimates).');
      });
      var concentrated = br && br.kind === 'mixed' && streams.filter(function (r) { return r.enough; }).length > 1;
      var sup = {
        id: 'support', title: 'Support need',
        observation: 'The share of students below ' + st.support + '% is ' + dirWord(dSup, 1, 'higher', 'lower') + ' in ' + B.label + ': ' + f1(pB.support.share) + ' (' + pB.support.n + ' of ' + pB.n + ') against ' + f1(pA.support.share) + ' (' + pA.support.n + ' of ' + pA.n + ') in ' + A.label + '.',
        evidence: [],
        qualification: bound.slice(), next: '',
        strength: Math.abs(dSup) / 4 + (concentrated ? 0.5 : 0)
      };
      if (br) sup.evidence.push('Across streams: ' + br.text + '.');
      sup.evidence.push('A recorded score below ' + st.pass + '% in at least one subject: ' + pB.belowPass.recorded + ' of ' + pB.belowPass.n + ' listed students (' + f1(pB.belowPass.share) + ') in ' + B.label + ' against ' + pA.belowPass.recorded + ' of ' + pA.belowPass.n + ' (' + f1(pA.belowPass.share) + ') in ' + A.label + '.');
      if (pB.belowPass.unknown > 0) sup.evidence.push('In ' + B.label + ', all-subject pass is confirmed for ' + pB.belowPass.confirmedPass + ' students; ' + pB.belowPass.unknown + ' cannot be confirmed because a subject is blank or absent.');
      sup.qualification.push('The ' + st.support + '% support threshold is a school setting; the ' + st.pass + '% below-pass rule is separate and applies per subject.');
      var smallest = Math.min(pA.n, pB.n);
      if (pA.support.n < 5 || pB.support.n < 5) sup.qualification.push('Counts are small (' + pA.support.n + ' and ' + pB.support.n + ' students), and one student moves the share by about ' + (100 / smallest).toFixed(1) + ' points.');
      sup.next = pB.support.n > 0 ? 'Which stream and subjects account for the ' + pB.support.n + (pB.support.n === 1 ? ' student' : ' students') + ' below ' + st.support + '% in ' + B.label + '?'
        : (pB.noMarks > 0 ? 'Would the ' + pB.noMarks + ' unmarked students in ' + B.label + ' change this once their results are entered?' : 'Is the support need now concentrated in particular subjects rather than particular streams?');
      findings.push(sup);
    }

    /* ---- subject priority ---- */
    var usable = subjects.filter(function (r) { return r.enough && r.rankBOf >= 4; });
    var priority = null, pKind = '';
    usable.forEach(function (r) {
      if (r.rankA <= 2 && r.rankB <= 2) {
        var score = (r.a.median + r.b.median) / 2;
        if (!priority || score < priority.__score) { priority = r; priority.__score = score; pKind = 'recurring'; }
      }
    });
    if (!priority) {
      usable.forEach(function (r) {
        var streamRowsFor = usable.filter(function (x) { return x.streamKey === r.streamKey; });
        var avg = mean(streamRowsFor.map(function (x) { return x.b.belowShare; })) || 0;
        if (r.b.below >= 2 && r.b.belowShare >= 5 && r.b.belowShare >= 2 * avg && (!priority || r.b.belowShare > priority.b.belowShare)) { priority = r; pKind = 'elevated'; }
      });
    }
    var improved = null;
    subjects.filter(function (r) { return r.enough && r.dMedian >= 5 && r.dP25 >= 5 && !(priority && r.streamKey === priority.streamKey && r.key === priority.key); }).forEach(function (r) {
      var m = Math.min(r.dMedian, r.dP25);
      if (!improved || m > improved.__m) { improved = r; improved.__m = m; }
    });

    if (priority) {
      var pr = priority;
      var sf = {
        id: 'subject', title: 'Subject to investigate',
        observation: pKind === 'recurring'
          ? 'In ' + pr.stream + ', ' + pr.subject + ' is among the two lowest subjects in both years (median ' + f1(pr.a.median) + ' in ' + A.label + ', ' + f1(pr.b.median) + ' in ' + B.label + ').'
          : 'In ' + pr.stream + ', ' + pr.subject + ' has the highest share of students below ' + st.pass + '% in ' + B.label + ' (' + pr.b.below + ' of ' + pr.b.n + ', ' + f1(pr.b.belowShare) + ').',
        evidence: [
          pr.subject + ' is ' + ordinalLow(pr.rankB) + ' of ' + pr.rankBOf + ' ' + pr.stream + ' subjects in ' + B.label + ' (' + ordinalLow(pr.rankA).replace(/^the /, '') + ' in ' + A.label + ').',
          'Below ' + st.pass + '%: ' + pr.b.below + ' of ' + pr.b.n + ' (' + f1(pr.b.belowShare) + ') in ' + B.label + ' against ' + pr.a.below + ' of ' + pr.a.n + ' (' + f1(pr.a.belowShare) + ') in ' + A.label + '.'
        ],
        qualification: ['Percentages do not remove differences in paper difficulty or curriculum between the years.'],
        next: 'Were the ' + pr.subject + ' papers comparable across the two years, and if so, which papers or topics do the students below ' + st.pass + '% have in common?',
        strength: 1.2 + Math.min((pr.b.belowShare || 0) / 10, 0.8)
      };
      if (!pr.sameMax) sf.qualification.push('The maximum marks for ' + pr.subject + ' differ between the years.');
      if (pr.a.n < 10 || pr.b.n < 10) sf.qualification.push('Only ' + pr.a.n + ' and ' + pr.b.n + ' students have a ' + pr.subject + ' score in ' + pr.stream + '.');
      if (pr.a.missing + pr.b.missing > 0) sf.qualification.push(pr.a.missing + pr.b.missing + ' ' + pr.stream + ' students have a blank ' + pr.subject + ' cell and are left out of this subject.');
      findings.push(sf);
    }

    /* ---- achievement ---- */
    var dExc = pB.excellence.share - pA.excellence.share;
    if (pA.excellence.n + pB.excellence.n > 0 || improved) {
      var bre = breadthText(streams, 'dExcellence', 1, 'higher', 'lower', st.minGroup);
      var ach = {
        id: 'achievement', title: 'Achievement to understand',
        observation: 'The share of students at or above ' + st.excellence + '% is ' + dirWord(dExc, 1, 'higher', 'lower') + ' in ' + B.label + ': ' + f1(pB.excellence.share) + ' (' + pB.excellence.n + ' of ' + pB.n + ') against ' + f1(pA.excellence.share) + ' (' + pA.excellence.n + ' of ' + pA.n + ') in ' + A.label + '.',
        evidence: [], qualification: [], next: '',
        strength: Math.abs(dExc) / 5 + (improved ? 0.8 : 0)
      };
      if (bre) ach.evidence.push('Across streams: ' + bre.text + '.');
      if (improved) ach.evidence.push(improved.stream + ' ' + improved.subject + ': median ' + f1(improved.a.median) + ' to ' + f1(improved.b.median) + ' (' + pts(improved.dMedian) + ') and lower quartile ' + f1(improved.a.p25) + ' to ' + f1(improved.b.p25) + ' (' + pts(improved.dP25) + '). Both the middle and lower quartile are higher; this does not establish a shift at every point in the distribution.');
      ach.qualification.push(st.excellence + '% is the excellence threshold set here; the school’s own A+ grade boundary is a different measure.');
      if (covGap && worseM.noMarks > 0) ach.qualification.push('Shares are of students with marks; ' + worseM.noMarks + ' listed students in ' + worse.label + ' have none.');
      if (improved) ach.qualification.push('Subject results do not remove differences in paper difficulty or marking between the years.');
      ach.next = improved ? 'Were the ' + improved.stream + ' ' + improved.subject + ' papers and marking comparable across years, and if so, what about this subject is worth understanding?'
        : 'Is the share at ' + st.excellence + '% or above spread across the streams or limited to one?';
      findings.push(ach);
    }

    // at most three: typical is always kept; the others compete on evidence strength
    var order = ['typical', 'support', 'subject', 'achievement'];
    var kept = findings.filter(function (f) { return f.id === 'typical'; });
    findings.filter(function (f) { return f.id !== 'typical' && f.strength > 0; })
      .sort(function (a, b) { return b.strength - a.strength || order.indexOf(a.id) - order.indexOf(b.id); })
      .slice(0, 2).forEach(function (f) { kept.push(f); });
    kept.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
    kept.forEach(function (f) { f.qualification = f.qualification.slice(0, 3); });
    var shown = {};
    kept.forEach(function (f) { shown[f.id] = 1; });
    kept.alsoChecked = findings.filter(function (f) { return !shown[f.id]; }).map(function (f) { return { id: f.id, title: f.title, summary: f.observation }; });
    if (!shown.support && !findings.some(function (f) { return f.id === 'support'; })) kept.alsoChecked.push({ id: 'support', title: 'Support need', summary: 'No eligible overall result is below ' + st.support + '% in either year. Incomplete results may remain outside this measure.' });
    return kept;
  }

  function comparabilityBlockers(ctx) {
    return ctx.checks.filter(function (c) {
      return c.status === 'review' && (['assessment','basket','maxima','streams'].indexOf(c.id) >= 0 || (c.id === 'grade' && ctx.A.grade && ctx.B.grade));
    });
  }

  function headline(ctx) {
    var A = ctx.A, B = ctx.B, st = ctx.settings, pA = A.pooled, pB = B.pooled;
    if (comparabilityBlockers(ctx).length) return 'Comparability is not established. Review the assessment, grade, stream and subject checks before describing an improvement or decline.';
    if (pA.n < st.minCohort || pB.n < st.minCohort) return 'There are too few eligible overall results to draw a clear comparison.';
    var d = pB.median - pA.median;
    var dir = dirWord(d, 1.5, 'higher', 'lower');
    var s = 'Among ' + (st.basis === 'complete' ? 'students with complete results' : 'students with available-subject results') + ', the typical result is ' + dir + ' in ' + B.label + ' compared with ' + A.label + ' (' + pts(d) + ')';
    var cov = ctx.checks.filter(function (c) { return c.id === 'coverage' && c.status === 'review'; }).length;
    if (cov) {
      var w = pB.coverage < pA.coverage ? B : A;
      s += ', but ' + plural(w.pooled.noMarks, 'listed student', 'listed students') + ' in ' + w.label + ' ' + (w.pooled.noMarks === 1 ? 'has' : 'have') + ' no marks, so this is not yet a confident whole-cohort comparison.';
    } else s += '. The groups are different cohorts, so this describes the groups, not individual progress.';
    if (ctx.checks.some(function (c) { return c.status === 'review'; })) s = 'Provisional comparison. ' + s;
    return s;
  }

  function compareDatasets(a, b, settings) {
    var st = settingsFrom(settings);
    var A = a.pooled ? a : analyseDataset(a, st), B = b.pooled ? b : analyseDataset(b, st);
    var checks = runChecks(A, B, st);
    var streams = streamRows(A, B, st), subjects = subjectRows(A, B, st), mix = mixDiagnostic(A, B);
    var ctx = { A: A, B: B, settings: st, pooled: { a: A.pooled, b: B.pooled }, streams: streams, subjects: subjects, checks: checks, mix: mix };
    return {
      A: A, B: B, settings: st, checks: checks, status: checks.some(function (c) { return c.status === 'review'; }) ? 'review' : 'ready',
      streams: streams, subjects: subjects, mix: mix,
      deltas: {
        median: A.pooled.median == null || B.pooled.median == null ? null : B.pooled.median - A.pooled.median,
        support: A.pooled.support.share == null || B.pooled.support.share == null ? null : B.pooled.support.share - A.pooled.support.share,
        excellence: A.pooled.excellence.share == null || B.pooled.excellence.share == null ? null : B.pooled.excellence.share - A.pooled.excellence.share
      },
      headline: headline(ctx), findings: (ctx.found = buildFindings(ctx)), alsoChecked: ctx.found.alsoChecked || []
    };
  }

  return {
    DEFAULTS: DEFAULTS, BAND_LABELS: BAND_LABELS, settingsFrom: settingsFrom,
    classifyCell: classifyCell, subjectKey: subjectKey, streamKey: streamKey, detectStream: detectStream,
    parseSheet: parseSheet, parseWorkbook: parseWorkbook, buildDataset: buildDataset,
    analyseDataset: analyseDataset, compareDatasets: compareDatasets, quantile: quantile,
    fmt: { pct: f1, pts: pts }
  };
});
