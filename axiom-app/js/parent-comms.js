/* =========================================================================
   AXIOM — Parents & communication
   1. Report Cards   : branded A4 progress report per student (single or a
                       whole section, one card per page) — uses the browser's
                       print dialog, so "Save as PDF" works everywhere.
   2. Message Parent : ready-to-send WhatsApp / email / copy-paste progress
                       message in English or Urdu, built from the student's
                       real numbers (overall %, total marks, position, subjects).
   3. Parent Messages: section-wide list with contact status, "needs attention"
                       flags (critical zone or a sharp drop), Excel import of
                       parent contacts and a fill-in template.
   Contacts live in the cloud table parent_contacts (migration_008), keyed by
   section + roll no (or name), so they survive re-importing results.
   Loaded after app.js; relies on its globals (workspace, SECTION_DEFS, ...).
   ========================================================================= */
(function(){
'use strict';

/* ------------------------------------------------------------- state --- */
const PC = { map:{}, loaded:false, loading:null, tableMissing:false, lang:'en', admin:null, status:null, lastRows:[], selected:new Set(), poll:null, pending:null };
try { PC.lang = localStorage.getItem('ax.pcLang') || 'en'; } catch(e){}

const role = ()=> window.axRole || '';
const canEdit = ()=> role()==='principal' || role()==='coordinator';
const el = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function schoolName(){
  let n = (typeof workspace !== 'undefined' && workspace && workspace.schoolName) || '';
  if(!n){ try{ n = localStorage.getItem('ax.schoolName') || ''; }catch(e){} }
  return String(n||'').trim();
}

/* ----------------------------------------------------------- contacts --- */
function studentKey(st){
  const r = st.rollNo!=null ? String(st.rollNo).trim() : '';
  return r || String(st.name||'').trim().toLowerCase();
}
function getContact(secKey, st){
  return (PC.map[secKey]||{})[studentKey(st)] || {};
}
function setContactLocal(secKey, st, c){
  PC.map[secKey] = PC.map[secKey] || {};
  PC.map[secKey][studentKey(st)] = { parentName:c.parentName||'', phone:c.phone||'', email:c.email||'' };
}
async function ensureContacts(){
  if(PC.loaded) return;
  if(PC.loading) return PC.loading;
  PC.loading = (async()=>{
    try{
      const rows = await axLoadParentContacts();
      rows.forEach(r=>{
        PC.map[r.section_key] = PC.map[r.section_key] || {};
        PC.map[r.section_key][r.student_key] = { parentName:r.parent_name||'', phone:r.phone||'', email:r.email||'' };
      });
    }catch(e){
      console.warn('Parent contacts unavailable:', e);
      PC.tableMissing = true;
    }
    try{
      const cfg = await axLoadSettings();          // admin number lives here, never in parent_contacts
      PC.admin = waNumber(cfg.admin_whatsapp);
    }catch(e){ PC.admin = null; }
    PC.loaded = true;
  })();
  return PC.loading;
}
// 03001234567 / 3001234567 / +92 300 1234567 / 0092300... -> 923001234567
function waNumber(raw){
  let d = String(raw||'').replace(/\D/g,'');
  if(!d) return null;
  if(d.startsWith('00')) d = d.slice(2);
  else if(d.startsWith('0')) d = '92' + d.slice(1);
  else if(d.length===10 && d.startsWith('3')) d = '92' + d;
  return (d.length>=11 && d.length<=15) ? d : null;
}
// The admin's own number is a test/copy destination only — it must never be
// stored as a parent's contact.
function isAdminNumber(phone){ return !!(PC.admin && waNumber(phone) === PC.admin); }
async function saveContact(secKey, st, c){
  if(isAdminNumber(c.phone)) throw new Error('That is the admin number. It receives copies automatically and is not saved as a parent contact.');
  const row = { section_key:secKey, student_key:studentKey(st), student_name:st.name,
                parent_name:c.parentName||null, phone:c.phone||null, email:c.email||null };
  await axSaveParentContacts([row]);
  setContactLocal(secKey, st, c);
}

/* ------------------------------------------------- student numbers --- */
function subjectRows(st, def){
  const rows = [];
  def.subjects.forEach(subj=>{
    const arr = (st.tests||{})[subj] || [];
    if(!arr.length) return;
    let ob=0, mx=0, n=0;
    arr.forEach(t=>{
      if(t && !t.absent && t.obtained!=null && t.max!=null && !isNaN(+t.obtained) && !isNaN(+t.max)){ ob+=+t.obtained; mx+=+t.max; n++; }
    });
    const lt = latestTest(st, subj);
    const latest = (lt && !lt.absent && lt.percent!=null) ? lt.percent : null;
    rows.push({ subject:subj, tests:arr.length, attempted:n, ob:Math.round(ob*100)/100, mx:Math.round(mx*100)/100,
                aggPct: mx ? Math.round(ob/mx*1000)/10 : null, latest });
  });
  return rows;
}
function snapshot(st, def){
  const overall = studentOverallAverage(st, def);
  const tm = studentTotalMarks(st, def);
  const pos = classPositionFor(st.id, def);
  const rows = subjectRows(st, def);
  const withLatest = rows.filter(r=>r.latest!=null);
  const strong = withLatest.filter(r=>r.latest>=80).sort((a,b)=>b.latest-a.latest).slice(0,2);
  const weak = withLatest.filter(r=>r.latest<70).sort((a,b)=>a.latest-b.latest).slice(0,3);
  return { st, def, name:st.name, first:String(st.name||'').trim().split(/\s+/)[0] || st.name,
    roll:(st.rollNo!=null && st.rollNo!=='') ? String(st.rollNo) : '', section:def.label,
    overall, grade: overall!=null ? gradeFor(overall) : '', ob:tm.obtained, mx:tm.max, pos, rows, strong, weak,
    trend: studentOverallTrend(st, def) };
}
function performanceWord(p){
  if(p==null) return '—';
  if(p>=90) return 'Outstanding';
  if(p>=80) return 'Very Good';
  if(p>=70) return 'Good';
  if(p>=60) return 'Fair';
  return 'Needs Support';
}
// Why a student deserves a call/message: critical zone, or a sharp drop.
function attentionReasons(st, def){
  const o = studentOverallAverage(st, def);
  if(o==null) return null;
  const tr = studentOverallTrend(st, def);
  const r = [];
  if(o < 60) r.push(`Critical zone (${o}%)`);
  if(tr!=null && tr <= -10) r.push(`Dropped ${Math.abs(tr)} points since the previous test`);
  return r.length ? r : null;
}

/* --------------------------------------------------------- messages --- */
function buildMessage(snap, lang, parentName){
  const sch = schoolName();
  const o = snap.overall;
  const ob = (snap.ob!=null && snap.mx!=null) ? `${snap.ob} / ${snap.mx}` : null;
  const L = [];
  if(lang === 'ur'){
    L.push(`السلام علیکم ${parentName ? parentName : 'محترم والدین'}،`, '');
    L.push(`${snap.name} (${snap.section}${snap.roll ? `، رول نمبر ${snap.roll}` : ''}) کی تعلیمی کارکردگی کی رپورٹ:`, '');
    if(o!=null) L.push(`- مجموعی نتیجہ: ${o}% (گریڈ ${snap.grade})`);
    if(ob) L.push(`- کل نمبر: ${ob}`);
    if(snap.pos) L.push(`- کلاس میں پوزیشن: ${snap.pos.total} میں سے ${snap.pos.rank}`);
    if(snap.strong.length) L.push(`- بہترین مضامین: ${snap.strong.map(r=>`${r.subject} (${r.latest}%)`).join('، ')}`);
    if(snap.weak.length) L.push(`- توجہ طلب مضامین: ${snap.weak.map(r=>`${r.subject} (${r.latest}%)`).join('، ')}`);
    L.push('');
    if(o!=null && o < 60) L.push('براہِ کرم اسکول تشریف لا کر ملاقات کریں تاکہ بچے کی بہتری کے لیے مل کر منصوبہ بنایا جا سکے۔');
    else if(o!=null && o < 80) L.push('مزید بہتری کے لیے گھر پر روزانہ مطالعے کی حوصلہ افزائی فرمائیں۔');
    else L.push('شاندار کارکردگی ہے۔ اللہ کرے اسی طرح محنت جاری رہے۔');
    L.push('', 'شکریہ،', sch || 'اسکول انتظامیہ');
  } else {
    L.push(`Assalam-o-Alaikum ${parentName ? parentName : 'Parent / Guardian'},`, '');
    L.push(`Progress update for ${snap.name} (${snap.section}${snap.roll ? `, Roll No. ${snap.roll}` : ''}):`, '');
    if(o!=null) L.push(`- Overall result: ${o}% (Grade ${snap.grade})`);
    if(ob) L.push(`- Total marks: ${ob}`);
    if(snap.pos) L.push(`- Class position: ${snap.pos.rank} of ${snap.pos.total}`);
    if(snap.strong.length) L.push(`- Strongest subjects: ${snap.strong.map(r=>`${r.subject} (${r.latest}%)`).join(', ')}`);
    if(snap.weak.length) L.push(`- Needs attention: ${snap.weak.map(r=>`${r.subject} (${r.latest}%)`).join(', ')}`);
    L.push('');
    if(o!=null && o < 60) L.push(`We would appreciate it if you could visit the school so we can plan together how to support ${snap.first}.`);
    else if(o!=null && o < 80) L.push(`With steady daily study at home, ${snap.first} can improve further.`);
    else L.push(`${snap.first} is doing very well. Please encourage the same effort.`);
    L.push('', 'Regards,', sch || 'School Administration');
  }
  return L.join('\n');
}
function openWhatsApp(phone, text){
  const n = waNumber(phone);
  if(!n){ showToast('This parent has no valid WhatsApp number saved.', 'warning'); return false; }
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return true;
}
function openMail(email, subject, text){
  if(!email){ showToast('This parent has no email address saved.', 'warning'); return false; }
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  return true;
}

/* ------------------------------------------------------ report cards --- */
function cardStyles(){
  if(el('ledgerCardStyle')) return;
  const s = document.createElement('style');
  s.id = 'ledgerCardStyle';
  s.textContent = `
    #ledgerPrintArea .rc{page-break-after:always;break-after:page;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1b2533;}
    #ledgerPrintArea .rc:last-child{page-break-after:auto;break-after:auto;}
    #ledgerPrintArea .rc-head{background:#14233b;color:#fff;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;border-radius:6px 6px 0 0;}
    #ledgerPrintArea .rc-school{font-family:Georgia,'Times New Roman',serif;font-size:21px;letter-spacing:.04em;}
    #ledgerPrintArea .rc-doc{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:#a9b8d0;margin-top:3px;}
    #ledgerPrintArea .rc-issued{font-size:9.5px;color:#a9b8d0;text-align:right;line-height:1.6;}
    #ledgerPrintArea .rc-gold{height:3px;background:#b08d3c;margin-bottom:14px;}
    #ledgerPrintArea .rc-ident{width:100%;border-collapse:collapse;margin-bottom:12px;}
    #ledgerPrintArea .rc-ident td{padding:7px 10px;border:1px solid #e1e6ec;font-size:11px;width:25%;vertical-align:top;background:#fff;}
    #ledgerPrintArea .rc-ident .k{display:block;font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;color:#7b8696;margin-bottom:2px;}
    #ledgerPrintArea .rc-ident .v{font-size:12px;font-weight:600;color:#14233b;}
    #ledgerPrintArea .rc-sum{display:flex;gap:8px;margin:0 0 14px;}
    #ledgerPrintArea .rc-card{flex:1;border:1px solid #e1e6ec;border-top:3px solid #14233b;border-radius:4px;padding:9px 10px;background:#fafbfc;text-align:center;}
    #ledgerPrintArea .rc-card .n{font-family:Georgia,serif;font-size:21px;color:#14233b;font-weight:700;}
    #ledgerPrintArea .rc-card .l{font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;color:#7b8696;margin-top:3px;}
    #ledgerPrintArea .rc-card .s{font-size:9px;color:#5b6676;margin-top:2px;}
    #ledgerPrintArea .rc h4{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:#14233b;margin:14px 0 6px;border-bottom:1px solid #cfd6df;padding-bottom:4px;}
    #ledgerPrintArea .rc table.rc-sub{width:100%;border-collapse:collapse;font-size:10px;}
    #ledgerPrintArea .rc-sub th{background:#14233b;color:#fff;text-align:left;padding:6px 7px;font-size:8px;letter-spacing:.06em;text-transform:uppercase;}
    #ledgerPrintArea .rc-sub td{padding:6px 7px;border-bottom:1px solid #e6eaef;}
    #ledgerPrintArea .rc-sub .num{text-align:right;font-variant-numeric:tabular-nums;}
    #ledgerPrintArea .rc-sub tr.tot td{border-top:2px solid #14233b;border-bottom:none;font-weight:700;background:#f3f5f8;}
    #ledgerPrintArea .rc-note{font-size:10.5px;line-height:1.6;color:#2f3b4b;margin:0 0 4px;}
    #ledgerPrintArea .rc-lines{margin-top:6px;}
    #ledgerPrintArea .rc-lines div{border-bottom:1px solid #aeb8c6;height:20px;}
    #ledgerPrintArea .rc-sign{display:flex;gap:30px;margin-top:34px;}
    #ledgerPrintArea .rc-sign div{flex:1;border-top:1px solid #14233b;padding-top:4px;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#5b6676;text-align:center;}
    #ledgerPrintArea .rc-foot{margin-top:14px;font-size:7.5px;color:#98a2b0;text-align:center;}
  `;
  document.head.appendChild(s);
}
function trendText(t){
  if(t==null) return 'No previous test to compare';
  if(t > 0.4) return `Improved by ${t} points since the previous test`;
  if(t < -0.4) return `Down ${Math.abs(t)} points since the previous test`;
  return 'Steady compared with the previous test';
}
function remarksText(snap){
  const o = snap.overall;
  if(o==null) return 'No results are available yet for this student.';
  const parts = [];
  parts.push(`${snap.first}'s overall performance is ${performanceWord(o).toLowerCase()} at ${o}% (Grade ${snap.grade})${snap.pos ? `, placing ${snap.pos.rank} of ${snap.pos.total} in the section` : ''}.`);
  if(snap.strong.length) parts.push(`Strengths: ${snap.strong.map(r=>r.subject).join(' and ')}.`);
  if(snap.weak.length) parts.push(`Areas needing attention: ${snap.weak.map(r=>`${r.subject} (${r.latest}%)`).join(', ')}.`);
  if(o < 60) parts.push('A meeting with the parent or guardian is recommended to agree a support plan.');
  else if(o < 80) parts.push('Regular revision at home is encouraged to lift results further.');
  else parts.push('Keep up the excellent work.');
  return parts.join(' ');
}
function cardHtml(snap, storeAvgFn){
  const sch = schoolName();
  const o = snap.overall;
  const z = o!=null ? (zoneOf(o,false)||'grey') : 'grey';
  const teacher = s => { try{ return lookupTeacher(s, snap.def) || '—'; }catch(e){ return '—'; } };
  const store = workspace.sections[snap.def.key];
  const rowsHtml = snap.rows.map(r=>{
    const zz = r.latest!=null ? (zoneOf(r.latest,false)||'grey') : 'grey';
    const avg = store ? subjectClassAverage(store, r.subject) : null;
    return `<tr><td><b>${esc(r.subject)}</b></td><td>${esc(teacher(r.subject))}</td>
      <td class="num">${r.tests}</td><td class="num">${r.attempted ? `${r.ob} / ${r.mx}` : '—'}</td>
      <td class="num">${r.aggPct!=null ? r.aggPct+'%' : '—'}</td>
      <td class="num">${r.latest!=null ? `<span class="rpt-badge rpt-badge-${zz}">${r.latest}%</span>` : '—'}</td>
      <td class="num">${avg!=null ? avg+'%' : '—'}</td>
      <td>${r.latest!=null ? performanceWord(r.latest) : '—'}</td></tr>`;
  }).join('');
  const totPct = (snap.ob!=null && snap.mx) ? Math.round(snap.ob/snap.mx*1000)/10 : null;
  const totRow = `<tr class="tot"><td colspan="3">Total (all attempted tests)</td><td class="num">${snap.ob!=null ? `${snap.ob} / ${snap.mx}` : '—'}</td><td class="num">${totPct!=null ? totPct+'%' : '—'}</td><td colspan="3"></td></tr>`;
  const issued = new Date().toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});
  return `<div class="rc">
    <div class="rc-head">
      <div><div class="rc-school">${esc(sch || 'AXIOM')}</div><div class="rc-doc">Progress Report Card</div></div>
      <div class="rc-issued">${esc(snap.section)}<br>Issued ${esc(issued)}</div>
    </div><div class="rc-gold"></div>
    <table class="rc-ident"><tr>
      <td><span class="k">Student</span><span class="v">${esc(snap.name)}</span></td>
      <td><span class="k">Roll No.</span><span class="v">${esc(snap.roll || '—')}</span></td>
      <td><span class="k">Section</span><span class="v">${esc(snap.section)}</span></td>
      <td><span class="k">Matric Marks</span><span class="v">${snap.st.matric!=null && snap.st.matric!=='' ? esc(snap.st.matric) : '—'}</span></td>
    </tr></table>
    <div class="rc-sum">
      <div class="rc-card"><div class="n">${o!=null ? o+'%' : '—'}</div><div class="l">Overall</div><div class="s">${esc(performanceWord(o))}</div></div>
      <div class="rc-card"><div class="n">${esc(snap.grade || '—')}</div><div class="l">Grade</div><div class="s">${esc(trendText(snap.trend))}</div></div>
      <div class="rc-card"><div class="n">${snap.ob!=null ? `${snap.ob} / ${snap.mx}` : '—'}</div><div class="l">Total Marks</div><div class="s">${totPct!=null ? totPct+'% of marks attempted' : ''}</div></div>
      <div class="rc-card"><div class="n">${snap.pos ? `${snap.pos.rank} / ${snap.pos.total}` : '—'}</div><div class="l">Class Position</div><div class="s">${esc(snap.section)}</div></div>
    </div>
    <h4>Subject-wise performance</h4>
    <table class="rc-sub"><thead><tr><th>Subject</th><th>Teacher</th><th class="num">Tests</th><th class="num">Marks</th><th class="num">Overall</th><th class="num">Latest test</th><th class="num">Section avg</th><th>Standing</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="8">No test results recorded yet.</td></tr>'}${snap.rows.length ? totRow : ''}</tbody></table>
    <h4>Remarks</h4>
    <p class="rc-note">${esc(remarksText(snap))}</p>
    <h4>Class teacher's comments</h4>
    <div class="rc-lines"><div></div><div></div></div>
    <div class="rc-sign"><div>Class Teacher</div><div>Principal</div><div>Parent / Guardian</div></div>
    <div class="rc-foot">${esc(sch || 'AXIOM')} · Confidential academic record · Generated by AXIOM</div>
  </div>`;
}
function printCards(snaps){
  if(!snaps.length){ showToast('No students with results to print.', 'warning'); return; }
  cardStyles();
  const area = ensurePrintInfrastructure();
  area.className = '';
  area.innerHTML = snaps.map(s=>cardHtml(s)).join('');
  document.body.classList.add('ledger-printing');
  const cleanup = ()=>{ document.body.classList.remove('ledger-printing'); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 60000);
  setTimeout(()=>{ try{ window.print(); }catch(e){ showToast('Printing is not available in this preview.', 'warning'); cleanup(); } }, 60);
}
function printStudentCard(id, secKey){
  const f = findStudentAnywhere(id, secKey);
  if(!f){ showToast('Could not find this student.', 'warning'); return; }
  printCards([snapshot(f.student, f.def)]);
}
function printSectionCards(){
  const def = currentSectionDef();
  const store = ensureSection(def.key);
  const withData = store.students.filter(s=>studentOverallAverage(s, def)!=null);
  if(!withData.length){ showToast('No student in this section has results yet.', 'warning'); return; }
  const snaps = withData.map(s=>snapshot(s, def)).sort((a,b)=> (a.pos?a.pos.rank:9999) - (b.pos?b.pos.rank:9999));
  const skipped = store.students.length - withData.length;
  showConfirm(`Print ${snaps.length} report cards?`,
    `<p style="margin:0;">One card per page for <b>${esc(def.label)}</b>, ordered by class position. In the print dialog choose <b>Save as PDF</b> to keep a copy.${skipped ? `<br><br>${skipped} student(s) with no results are skipped.` : ''}</p>`,
    ()=>printCards(snaps));
}

/* ------------------------------------------------------------- UI shell --- */
function injectUi(){
  if(el('pcSingleOverlay')) return;
  const css = document.createElement('style');
  css.textContent = `
    #confirmModal{z-index:70 !important;}   /* confirm dialogs must sit above the Parent Messages window */
    .pc-modal{max-width:620px !important;width:94% !important;max-height:92vh;overflow:auto;}
    .pc-wide{max-width:980px !important;}
    .pc-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
    .pc-row .field{flex:1;min-width:150px;}
    .pc-row input,.pc-row select{width:100%;}
    #pcMsgText{width:100%;min-height:210px;font:inherit;font-size:.9rem;line-height:1.55;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--paper);color:inherit;resize:vertical;box-sizing:border-box;}
    .pc-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:14px;}
    .pc-badge{display:inline-block;min-width:18px;padding:0 6px;margin-left:6px;border-radius:10px;background:#dc2626;color:#fff;font-size:.7rem;font-weight:700;line-height:18px;text-align:center;}
    .pc-flag{display:inline-block;padding:2px 8px;border-radius:10px;background:#fee2e2;color:#b91c1c;font-size:.72rem;font-weight:600;margin:1px 4px 1px 0;}
    .pc-ok{color:#15803d;font-weight:600;} .pc-miss{color:var(--muted);}
    .pc-hint{color:var(--muted);font-size:.8rem;margin:2px 0 10px;}
    .pc-auto{margin:0 0 10px;padding:9px 12px;border-radius:10px;font-size:.82rem;line-height:1.5;background:var(--paper);border:1px solid var(--line);}
    .pc-auto.test{background:#fef3c7;border-color:#f59e0b;color:#78350f;} .pc-auto.live{background:#dcfce7;border-color:#22c55e;color:#14532d;} .pc-auto.off{color:var(--muted);}
    .pc-table{width:100%;border-collapse:collapse;font-size:.86rem;}
    .pc-table th{text-align:left;padding:8px 10px;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--paper-raised);}
    .pc-table td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:middle;}
    .pc-table td.act{white-space:nowrap;text-align:right;}
  `;
  document.head.appendChild(css);
  document.body.insertAdjacentHTML('beforeend', `
  <div class="modal-overlay" id="pcSingleOverlay"><div class="modal pc-modal">
    <h3 id="pcSingleTitle">Message Parent</h3>
    <div class="pc-hint" id="pcSingleMeta"></div>
    <div class="pc-row">
      <div class="field"><label>Parent / guardian name</label><input type="text" id="pcParent" placeholder="e.g. Mr. Raza"></div>
      <div class="field"><label>WhatsApp / mobile</label><input type="text" id="pcPhone" placeholder="0300 1234567"></div>
      <div class="field"><label>Email</label><input type="text" id="pcEmail" placeholder="parent@example.com"></div>
    </div>
    <div class="pc-hint" id="pcContactNote"></div>
    <div class="pc-row"><div class="field" style="max-width:200px;"><label>Message language</label>
      <select id="pcLang"><option value="en">English</option><option value="ur">اردو (Urdu)</option></select></div></div>
    <textarea id="pcMsgText" dir="auto" spellcheck="false"></textarea>
    <div class="pc-hint">You can edit the message before sending. WhatsApp and email open on your device with the text ready — nothing is sent until you press Send there.</div>
    <div class="pc-actions">
      <button class="ghost" id="pcSaveContact">Save contact</button>
      <button class="ghost" id="pcCopy">Copy</button>
      <button class="ghost" id="pcEmailBtn">Email</button>
      <button class="ghost" id="pcAdminCopy" title="Open WhatsApp to the admin number with this message, to test it">Test on admin</button>
      <button class="ghost" id="pcWhatsApp">WhatsApp</button>
      <button class="primary" id="pcAuto" title="Send through AXIOM automatically (also copies the admin number)">Send automatically</button>
      <button class="ghost" id="pcSingleClose">Close</button>
    </div>
  </div></div>

  <div class="modal-overlay" id="pcBulkOverlay"><div class="modal pc-modal pc-wide">
    <h3 id="pcBulkTitle">Parent Messages</h3>
    <div class="pc-hint" id="pcBulkSub"></div>
    <div class="pc-row" style="align-items:flex-end;">
      <div class="field" style="max-width:190px;"><label>Show</label>
        <select id="pcFilter"><option value="all">All students</option><option value="attention">Needs attention (below 60% or drop ≥10)</option><option value="top">Top performers (80% or above)</option><option value="nocontact">Missing contact</option></select></div>
      <div class="field"><label>Sections</label><select id="pcScope"><option value="section">Current section</option><option value="all">All sections</option></select></div>
      <div class="field"><label>Message type</label><select id="pcMessageType"><option value="report">Progress report summary</option><option value="low">Low-performance alert</option><option value="congrats">Congratulations</option><option value="test">Individual test marks</option></select></div>
      <div class="field" id="pcTestField" style="display:none;"><label>Test</label><select id="pcTest"></select></div>
      <div class="field" style="max-width:170px;"><label>Message language</label>
        <select id="pcBulkLang"><option value="en">English</option><option value="ur">اردو (Urdu)</option></select></div>
      <div class="field" id="pcSchoolField" style="max-width:260px;"><label>School name (on cards &amp; messages)</label><input type="text" id="pcSchool" placeholder="e.g. KIPS College"></div>
      <span style="flex:1;"></span>
      <button class="ghost small" id="pcTemplateBtn">Download contact template</button>
      <button class="ghost small" id="pcImportBtn">Import contacts (Excel)</button>
      <input type="file" id="pcImportFile" accept=".xlsx,.xls,.csv" style="display:none;">
    </div>
    <div class="pc-auto" id="pcAutoBanner"></div>
    <div class="table-wrap" style="max-height:48vh;"><table class="pc-table"><thead><tr>
      <th><input type="checkbox" id="pcSelectAll" aria-label="Select all shown students"></th><th>Student</th><th>Overall</th><th>Flags</th><th>Parent contact</th><th></th></tr></thead><tbody id="pcBulkBody"></tbody></table></div>
    <div class="pc-hint" id="pcSelection" aria-live="polite"></div>
    <div class="pc-actions"><button class="ghost" id="pcPreview">Preview selected messages</button><button class="ghost" id="pcHistory">Refresh batch history</button></div>
    <div id="pcPreviewBody" style="max-height:30vh;overflow:auto;"></div>
    <div id="pcBatchHistory"></div><div id="pcBatchProgress" aria-live="polite"></div>
    <div class="pc-actions"><button class="ghost" id="pcBulkClose">Close</button>
      <button class="primary" id="pcSendAll">Send all shown automatically</button></div>
  </div></div>`);

  el('pcSingleClose').onclick = ()=> el('pcSingleOverlay').classList.remove('open');
  el('pcBulkClose').onclick = ()=> { el('pcBulkOverlay').classList.remove('open'); clearTimeout(PC.poll); };
  el('pcLang').onchange = ()=>{ setLang(el('pcLang').value); refreshSingleText(); };
  el('pcBulkLang').onchange = ()=>{ setLang(el('pcBulkLang').value); };
  el('pcFilter').onchange = renderBulk;
  el('pcScope').onchange = ()=>{ PC.selected.clear(); populateTests(); renderBulk(); };
  el('pcMessageType').onchange = ()=>{ el('pcTestField').style.display=el('pcMessageType').value==='test'?'':'none'; renderBulk(); };
  el('pcTest').onchange = renderBulk;
  el('pcSelectAll').onchange = ()=>{ PC.lastRows.forEach(x=>{ if(el('pcSelectAll').checked) PC.selected.add(rowKey(x)); else PC.selected.delete(rowKey(x)); }); renderBulk(); };
  el('pcPreview').onclick = previewBulk;
  el('pcHistory').onclick = loadBatchHistory;
  el('pcSchool').onchange = ()=>{ try{ localStorage.setItem('ax.schoolName', el('pcSchool').value.trim()); }catch(e){} showToast('School name saved on this device.', 'success'); };
  el('pcCopy').onclick = async ()=>{
    try{ await navigator.clipboard.writeText(el('pcMsgText').value); showToast('Message copied.', 'success'); }
    catch(e){ el('pcMsgText').select(); document.execCommand && document.execCommand('copy'); showToast('Message copied.', 'success'); }
  };
  el('pcWhatsApp').onclick = ()=> openWhatsApp(el('pcPhone').value, el('pcMsgText').value);
  el('pcEmailBtn').onclick = ()=> openMail(el('pcEmail').value.trim(), `Progress update — ${single.snap.name}`, el('pcMsgText').value);
  el('pcSaveContact').onclick = onSaveContact;
  el('pcAdminCopy').onclick = ()=>{
    if(!PC.admin){ showToast('Admin number is not set up yet (see SETUP.md, "Automatic WhatsApp").', 'warning'); return; }
    const label = `${single.snap.name} (${single.snap.section}${single.snap.roll ? ', Roll ' + single.snap.roll : ''})`;
    openWhatsApp(PC.admin, `[TEST] Intended for ${label}\n\n` + el('pcMsgText').value);
  };
  el('pcAuto').onclick = sendSingleAuto;
  el('pcSendAll').onclick = sendAllShown;
  el('pcTemplateBtn').onclick = downloadTemplate;
  el('pcImportBtn').onclick = ()=> el('pcImportFile').click();
  el('pcImportFile').onchange = e=>{ const f = e.target.files[0]; e.target.value=''; if(f) importContacts(f); };
}
function setLang(l){
  PC.lang = l;
  try{ localStorage.setItem('ax.pcLang', l); }catch(e){}
  if(el('pcLang')) el('pcLang').value = l;
  if(el('pcBulkLang')) el('pcBulkLang').value = l;
}

/* ---------------------------------------------------- single message --- */
let single = { snap:null, secKey:null };
function refreshSingleText(){
  if(!single.snap) return;
  el('pcMsgText').value = buildMessage(single.snap, PC.lang, el('pcParent').value.trim());
}
async function openSingle(id, secKey){
  if(role()==='student') return;
  injectUi();
  await ensureContacts();
  const f = findStudentAnywhere(id, secKey);
  if(!f){ showToast('Could not find this student.', 'warning'); return; }
  const snap = snapshot(f.student, f.def);
  single = { snap, secKey: f.def.key };
  const c = getContact(f.def.key, f.student);
  el('pcSingleTitle').textContent = `Message Parent — ${f.student.name}`;
  el('pcSingleMeta').textContent = `${f.def.label}${snap.roll ? ' · Roll ' + snap.roll : ''}${snap.overall!=null ? ' · Overall ' + snap.overall + '% (' + snap.grade + ')' : ''}`;
  el('pcParent').value = c.parentName || ''; el('pcPhone').value = c.phone || ''; el('pcEmail').value = c.email || '';
  const editor = canEdit();
  ['pcParent','pcPhone','pcEmail'].forEach(i=> el(i).readOnly = !editor);
  el('pcSaveContact').style.display = editor ? '' : 'none';
  el('pcAuto').style.display = editor ? '' : 'none';
  el('pcAdminCopy').style.display = (editor && PC.admin) ? '' : 'none';
  el('pcContactNote').textContent = PC.tableMissing
    ? 'Parent contacts are not set up in the database yet (run migration_008_parent_contacts.sql). You can still copy the message.'
    : (editor ? 'Contacts are saved to the cloud and reused every time results are re-imported.'
              : 'Only the principal or a coordinator can edit contact details.');
  setLang(PC.lang);
  refreshSingleText();
  el('pcParent').oninput = refreshSingleText;
  el('pcSingleOverlay').classList.add('open');
}
async function onSaveContact(){
  const f = findStudentAnywhere(single.snap.st.id, single.secKey);
  if(!f) return;
  const c = { parentName: el('pcParent').value.trim(), phone: el('pcPhone').value.trim(), email: el('pcEmail').value.trim() };
  if(c.phone && !waNumber(c.phone)){ showToast('That phone number looks invalid. Example: 0300 1234567', 'warning'); return; }
  try{ await saveContact(f.def.key, f.student, c); showToast('Parent contact saved.', 'success'); if(el('pcBulkOverlay').classList.contains('open')) renderBulk(); }
  catch(e){ console.error(e); showToast('Could not save the contact: ' + (e.message||e), 'warning'); }
}

/* -------------------------------------------------------- bulk panel --- */
async function openBulk(){
  if(role()==='student') return;
  injectUi();
  await ensureContacts();
  el('pcSchoolField').style.display = canEdit() ? '' : 'none';
  el('pcImportBtn').style.display = canEdit() ? '' : 'none';
  el('pcSendAll').style.display = canEdit() ? '' : 'none';
  el('pcSchool').value = schoolName();
  populateTests();
  refreshStatus();
  if(canEdit()) loadBatchHistory();
  setLang(PC.lang);
  renderBulk();
  el('pcBulkOverlay').classList.add('open');
}
function renderBulk(){
  const def = currentSectionDef();
  const filter = el('pcFilter').value;
  const list = bulkDefs().flatMap(d=>ensureSection(d.key).students.map(st=>({ st, def:d, snap: snapshot(st, d), flags: attentionReasons(st, d), c: getContact(d.key, st) })))
    .sort((a,b)=> (a.snap.pos?a.snap.pos.rank:9999) - (b.snap.pos?b.snap.pos.rank:9999));
  const flagged = list.filter(x=>x.flags).length, withPhone = list.filter(x=>waNumber(x.c.phone)).length;
  el('pcBulkTitle').textContent = `Parent Messages — ${el('pcScope').value==='all'?'All sections':def.label}`;
  el('pcBulkSub').textContent = `${list.length} students · ${flagged} need attention · ${withPhone} have a WhatsApp number saved`
    + (PC.tableMissing ? ' · Contacts database not set up yet (run migration 008).' : '');
  const rows = list.filter(x=> (filter==='attention' ? x.flags : filter==='top' ? x.snap.overall!=null && x.snap.overall>=80 : filter==='nocontact' ? !waNumber(x.c.phone) : true)
    && (el('pcMessageType').value!=='test' || testRows(x).length));
  PC.lastRows = rows;
  const count = rows.filter(x=>PC.selected.has(rowKey(x))).length;
  el('pcSendAll').textContent = `Send to ${count} selected students`;
  el('pcSelection').textContent = `${count} selected from ${rows.length} shown. Only selected, currently shown students will be sent messages.`;
  el('pcSelectAll').checked = !!rows.length && count===rows.length;
  el('pcSelectAll').indeterminate = count>0 && count<rows.length;
  el('pcPreviewBody').innerHTML='';
  el('pcBulkBody').innerHTML = rows.length ? rows.map(x=>{
    const ok = waNumber(x.c.phone);
    return `<tr data-id="${esc(x.st.id)}" data-section="${esc(x.def.key)}">
      <td><input type="checkbox" data-select="${esc(rowKey(x))}" aria-label="Select ${esc(x.st.name)}" ${PC.selected.has(rowKey(x))?'checked':''}></td>
      <td><b>${esc(x.st.name)}</b><div class="pc-hint" style="margin:0;">${esc(x.def.label)} · ${x.snap.roll ? 'Roll ' + esc(x.snap.roll) : ''}</div></td>
      <td>${x.snap.overall!=null ? `<b>${x.snap.overall}%</b> ${esc(x.snap.grade)}` : '—'}</td>
      <td>${x.flags ? x.flags.map(f=>`<span class="pc-flag">${esc(f)}</span>`).join('') : '<span class="pc-miss">—</span>'}</td>
      <td>${ok ? `<span class="pc-ok">${esc(x.c.parentName || 'Parent')}</span> <span class="pc-miss">${esc(x.c.phone)}</span>` : '<span class="pc-miss">No number saved</span>'}</td>
      <td class="act"><button class="ghost small" data-act="msg">Contact / message…</button></td></tr>`;
  }).join('') : `<tr><td colspan="6" class="pc-miss" style="padding:22px;text-align:center;">No students match this filter or selected test.</td></tr>`;
  el('pcBulkBody').querySelectorAll('[data-select]').forEach(c=>{ c.onchange=()=>{ if(c.checked) PC.selected.add(c.dataset.select); else PC.selected.delete(c.dataset.select); renderBulk(); }; });
  el('pcBulkBody').querySelectorAll('button').forEach(b=>{
    b.onclick = ()=>{
      const id = b.closest('tr').dataset.id;
      const x = list.find(y=>String(y.st.id)===String(id) && y.def.key===b.closest('tr').dataset.section);
      if(!x) return;
      openSingle(x.st.id, x.def.key);
    };
  });
}

/* ------------------------------------------- automatic sending (server) --- */
async function refreshStatus(){
  const b = el('pcAutoBanner');
  if(!b) return;
  if(!canEdit()){ b.style.display='none'; return; }
  b.style.display=''; b.className='pc-auto off'; b.textContent = 'Checking automatic sending…';
  try{
    PC.status = await axCallMessenger({action:'status'});
  }catch(e){ PC.status = null; }
  const s = PC.status;
  if(!s || !s.configured){
    b.className='pc-auto off';
    b.textContent = 'Automatic sending is not set up yet — the WhatsApp button still works manually. See SETUP.md, "Automatic WhatsApp".';
    el('pcSendAll').disabled = true; return;
  }
  el('pcSendAll').disabled = false;
  if(!s.adminSet) { b.className='pc-auto off'; b.textContent='Admin number is not set. Add it in app_settings (SETUP.md) before sending.'; el('pcSendAll').disabled = true; return; }
  if(!s.queueConfigured) { b.className='pc-auto off'; b.textContent='Bulk queue setup is incomplete. Deploy the updated function and configure the worker secret and schedule (SETUP.md).'; el('pcSendAll').disabled=true; return; }
  if(s.testMode){ b.className='pc-auto test'; b.innerHTML='<b>TEST MODE.</b> Nothing is sent to parents. Every message goes only to the admin number, labelled with the parent it was meant for.'; }
  else { b.className='pc-auto live'; b.innerHTML='<b>LIVE.</b> Messages go to each parent\'s saved number, and a copy of each goes to the admin number.'; }
}
function makeMessage(snap, c, secKey){
  return { to: c.phone || '', text: buildMessage(snap, PC.lang, c.parentName),
           label: `${snap.name} (${snap.section}${snap.roll ? ', Roll ' + snap.roll : ''})`, studentName: snap.name };
}
function describeResult(j){
  const firstFail = (j.results||[]).map(r=>[r.parent,r.admin]).flat().find(x=>String(x).startsWith('failed'));
  const base = j.testMode
    ? `Test mode: ${j.adminSent} of ${j.total} message(s) accepted by WhatsApp for the admin number. Parents were not contacted.`
    : `${j.parentSent} sent to parents, ${j.adminSent} copies to the admin number.`;
  return base + (j.failed ? ` ${j.failed} failed${firstFail ? ' — ' + String(firstFail).replace(/^failed:\s*/,'') : ''}.` : '');
}
async function sendSingleAuto(){
  const snap = single.snap; if(!snap) return;
  const f = findStudentAnywhere(snap.st.id, single.secKey);
  const c = { parentName: el('pcParent').value.trim(), phone: el('pcPhone').value.trim() };
  const m = makeMessage(snap, c, single.secKey); m.text = el('pcMsgText').value;
  const btn = el('pcAuto'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Sending…';
  try{
    const j = await axCallMessenger({ action:'send', messages:[m] });
    showToast(describeResult(j), j.failed ? 'warning' : 'success', 6500);
  }catch(e){ showToast('Could not send: ' + (e.message||e), 'warning', 6500); }
  btn.disabled = false; btn.textContent = old;
}

function bulkDefs(){ return el('pcScope').value==='all' ? SECTION_DEFS : [currentSectionDef()]; }
function rowKey(x){ return JSON.stringify([x.def.key,String(x.st.id)]); }
function populateTests(){
  const names = new Set();
  bulkDefs().forEach(d=>ensureSection(d.key).students.forEach(st=>Object.values(st.tests||{}).forEach(ts=>ts.forEach(t=>{ if(t.test) names.add(t.test); }))));
  el('pcTest').innerHTML = [...names].sort().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
}
function testRows(x){
  const name=el('pcTest').value;
  return x.def.subjects.flatMap(subject=>(x.st.tests?.[subject]||[]).filter(t=>t.test===name).map(t=>({subject,...t})));
}
function bulkMessage(x){
  const m=makeMessage(x.snap,x.c,x.def.key), type=el('pcMessageType').value;
  if(type==='report') return m;
  const greeting = PC.lang==='ur' ? 'محترم والدین،' : `Dear ${x.c.parentName||'Parent / Guardian'},`;
  const identity=`${x.snap.name} (${x.snap.section}${x.snap.roll?', Roll '+x.snap.roll:''})`;
  let content;
  if(type==='test') {
    const marks=testRows(x).map(t=>`${t.subject}: ${t.absent?(PC.lang==='ur'?'غیر حاضر':'Absent'):`${t.obtained ?? '—'} / ${t.max ?? '—'}`}`).join('\n');
    content=`${PC.lang==='ur'?'ٹیسٹ کے نتائج':'Test results'} — ${el('pcTest').value}\n${identity}\n\n${marks}`;
  } else if(type==='low') {
    content=PC.lang==='ur'
      ? `${identity}\nمجموعی نتیجہ: ${x.snap.overall ?? '—'}%\nبراہ کرم بچے کی تعلیمی کارکردگی میں بہتری کے لیے اسکول سے رابطہ کریں۔`
      : `Performance alert for ${identity}\nOverall result: ${x.snap.overall ?? '—'}%\n${(x.flags||[]).join('; ')}\nPlease contact the school so we can discuss difficulties and plan support together.`;
  } else {
    content=PC.lang==='ur'
      ? `${identity}\nمجموعی نتیجہ: ${x.snap.overall ?? '—'}%\nشاندار کارکردگی پر مبارکباد! اسی طرح محنت جاری رکھیں۔`
      : `Congratulations to ${identity}!\nOverall result: ${x.snap.overall ?? '—'}%\nWe are proud of this excellent performance. Please encourage the same effort.`;
  }
  m.text=`${greeting}\n\n${content}\n\n${schoolName()||'School Administration'}`;
  return m;
}
function selectedBulkMessages(){ return PC.lastRows.filter(x=>PC.selected.has(rowKey(x))).map(bulkMessage); }
function previewBulk(){
  const msgs=selectedBulkMessages();
  el('pcPreviewBody').innerHTML=msgs.length?msgs.map(m=>`<details><summary>${esc(m.label)}</summary><pre style="white-space:pre-wrap;">${esc(m.text)}</pre></details>`).join(''):'Select students first.';
}
async function sendAllShown(){
  if(!canEdit()) return;
  if(PC.submitting) return;
  const msgs=selectedBulkMessages();
  if(!msgs.length) { showToast('Select at least one student.', 'warning'); return; }
  if(msgs.length>1000) { showToast('Select at most 1000 students per batch.', 'warning'); return; }
  await refreshStatus();
  const s=PC.status;
  if(!s?.configured || !s.adminSet || !s.queueConfigured) return;
  if(!s.testMode && msgs.some(m=>!waNumber(m.to)||isAdminNumber(m.to))) { showToast('Every selected student needs a valid parent number in live mode.', 'warning'); return; }
  const payload=JSON.stringify({messages:msgs,testMode:s.testMode});
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  // Preserve the idempotency key on a network failure so a retry cannot duplicate a batch.
  if(!PC.pending || PC.pending.payload!==payload) {
    let saved; try{ saved=JSON.parse(sessionStorage.getItem('ax.pendingBulk')||'null'); }catch(e){}
    PC.pending={payload,id:saved?.hash===hash?saved.id:crypto.randomUUID()};
    try{sessionStorage.setItem('ax.pendingBulk',JSON.stringify({hash,id:PC.pending.id}));}catch(e){}
  }
  const batchId=PC.pending.id;
  const preview=msgs.map(m=>`<details><summary>${esc(m.label)}</summary><pre style="white-space:pre-wrap;">${esc(m.text)}</pre></details>`).join('');
  showConfirm(`Send to ${msgs.length} selected students?`,
    `<p>${s.testMode?'TEST MODE: every message goes only to the admin number. Parents will not be contacted.':'LIVE MODE: messages go to parents and copies go to the admin.'}</p><p>Each student receives a separate personalised message. Review before sending:</p><div style="max-height:35vh;overflow:auto;">${preview}</div>`, async()=>{
    if(PC.submitting) return;
    PC.submitting=true;
    const btn=el('pcSendAll'); btn.disabled=true; btn.textContent='Queueing…';
    try {
      const j=await axCallMessenger({action:'enqueue',batchId,expectedTestMode:s.testMode,title:el('pcMessageType').selectedOptions[0].textContent,messages:msgs});
      try{sessionStorage.removeItem('ax.pendingBulk');}catch(e){}
      PC.pending=null; PC.selected.clear(); renderBulk();
      showToast(`${j.students} student messages queued. You may close this page; server processing continues.`, 'success',7000);
      loadBatchHistory(); watchBatch(j.batchId);
    } catch(e) { showToast('Could not confirm queue submission: '+(e.message||e)+'. Retry the same selection to safely check again.', 'warning',8000); }
    finally { PC.submitting=false; btn.disabled=false; }
  });
}
async function loadBatchHistory(){
  if(!canEdit()) return;
  try {
    const j=await axCallMessenger({action:'batches'});
    el('pcBatchHistory').innerHTML='<b>Recent batches</b>'+j.batches.map(b=>`<div><button class="ghost small" data-batch="${esc(b.id)}">View progress</button> ${esc(b.title)} · ${b.test_mode?'TEST':'LIVE'} · ${esc(new Date(b.created_at).toLocaleString())}</div>`).join('');
    el('pcBatchHistory').querySelectorAll('[data-batch]').forEach(b=>{ b.onclick=()=>watchBatch(b.dataset.batch); });
  } catch(e) { el('pcBatchHistory').textContent='Batch history unavailable: '+(e.message||e); }
}
async function watchBatch(id){
  clearTimeout(PC.poll);
  PC.watching=id;
  try {
    const j=await axCallMessenger({action:'batch-status',batchId:id});
    if(PC.watching!==id) return;
    const counts={}; j.jobs.forEach(x=>counts[x.status]=(counts[x.status]||0)+1);
    el('pcBatchProgress').innerHTML=`<p><b>Batch progress:</b> ${esc(Object.entries(counts).map(([k,v])=>`${v} ${k}`).join(' · '))}</p><p class="pc-hint">Accepted means WhatsApp accepted the API request; delivery/read receipts are not tracked. Uncertain sends require checking WhatsApp before sending a replacement.</p>`+
      (counts.failed?'<button class="ghost" id="pcRetryFailed">Retry rejected messages only</button>':'')+
      j.jobs.map(x=>`<div>${esc(x.label)} · ${esc(x.kind)} · <b>${esc(x.status)}</b>${x.status==='uncertain'||x.status==='failed'?' — '+esc(x.detail):''}</div>`).join('');
    if(el('pcRetryFailed')) el('pcRetryFailed').onclick=async()=>{
      el('pcRetryFailed').disabled=true;
      try{await axCallMessenger({action:'retry-failed',batchId:id});watchBatch(id);}catch(e){showToast('Retry failed: '+(e.message||e),'warning');watchBatch(id);}
    };
    if((counts.queued||counts.sending) && el('pcBulkOverlay').classList.contains('open')) PC.poll=setTimeout(()=>watchBatch(id),4000);
  } catch(e) { el('pcBatchProgress').textContent='Could not load progress: '+(e.message||e); }
}

/* ------------------------------------------ Excel import / template --- */
const HEAD = {
  roll:  ['roll','rollno','rollnumber','rno','id'],
  name:  ['name','student','studentname'],
  parent:['parent','parentname','father','fathername','guardian','guardianname','mother'],
  phone: ['phone','mobile','whatsapp','contact','cell','phoneno','mobileno','number','contactnumber'],
  email: ['email','emailaddress','mail'],
};
const norm = s => String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
// Exact header match first ("Phone"), then a looser "contains" match so
// "Phone (WhatsApp)", "Father's Name" or "Mobile No." are recognised too.
function pickCol(headers, keys, exclude){
  exclude = exclude || [];
  const n = headers.map(norm);
  let i = n.findIndex((h,k)=> !exclude.includes(k) && keys.includes(h));
  if(i>=0) return i;
  return n.findIndex((h,k)=> !exclude.includes(k) && h && keys.some(key=> key.length>=4 && h.includes(key)));
}

function downloadTemplate(){
  if(typeof XLSX==='undefined'){ showToast('Excel support is not loaded.', 'warning'); return; }
  const def = currentSectionDef(), store = ensureSection(def.key);
  const aoa = [['Roll No.','Student Name','Parent Name','Phone (WhatsApp)','Email']];
  store.students.forEach(st=>{
    const c = getContact(def.key, st);
    aoa.push([st.rollNo||'', st.name, c.parentName||'', c.phone||'', c.email||'']);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Parent Contacts');
  XLSX.writeFile(wb, `Parent-Contacts-${String(def.label).replace(/[^\w-]+/g,'_')}.xlsx`);
}
async function importContacts(file){
  if(!canEdit()){ showToast('Only the principal or a coordinator can import contacts.', 'warning'); return; }
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:''});
    if(rows.length < 2) throw new Error('The file has no data rows.');
    const headers = rows[0];
    const ix = {}; // order matters: "Parent Name" must be claimed before the generic student "name" column
    ix.parent = pickCol(headers, HEAD.parent);
    ix.roll   = pickCol(headers, HEAD.roll, [ix.parent]);
    ix.phone  = pickCol(headers, HEAD.phone, [ix.parent, ix.roll]);
    ix.email  = pickCol(headers, HEAD.email, [ix.parent, ix.roll, ix.phone]);
    ix.name   = pickCol(headers, HEAD.name,  [ix.parent, ix.roll, ix.phone, ix.email]);
    if(ix.phone<0 && ix.email<0) throw new Error('Could not find a Phone or Email column. Use "Download contact template" for the right layout.');
    if(ix.roll<0 && ix.name<0) throw new Error('Could not find a Roll No. or Student Name column.');
    const def = currentSectionDef(), store = ensureSection(def.key);
    const out = []; let unmatched = 0, bad = 0, adminSkipped = 0;
    rows.slice(1).forEach(r=>{
      const roll = ix.roll>=0 ? String(r[ix.roll]).trim() : '';
      const nm = ix.name>=0 ? String(r[ix.name]).trim().toLowerCase() : '';
      if(!roll && !nm) return;
      const st = store.students.find(s=> (roll && s.rollNo!=null && String(s.rollNo).trim()===roll) || (!roll && nm && s.name.trim().toLowerCase()===nm))
              || (nm && store.students.find(s=>s.name.trim().toLowerCase()===nm));
      if(!st){ unmatched++; return; }
      let phone = ix.phone>=0 ? String(r[ix.phone]).trim() : '';
      if(phone && isAdminNumber(phone)){ adminSkipped++; phone = ''; }
      if(phone && !waNumber(phone)) bad++;
      const c = { parentName: ix.parent>=0 ? String(r[ix.parent]).trim() : '', phone, email: ix.email>=0 ? String(r[ix.email]).trim() : '' };
      out.push({ st, c });
    });
    if(!out.length) throw new Error(`No rows matched students in ${def.label}. Check the Roll No. / Name columns.`);
    await axSaveParentContacts(out.map(({st,c})=>({ section_key:def.key, student_key:studentKey(st), student_name:st.name,
      parent_name:c.parentName||null, phone:c.phone||null, email:c.email||null })));
    out.forEach(({st,c})=> setContactLocal(def.key, st, c));
    PC.tableMissing = false;
    renderBulk();
    showToast(`Imported ${out.length} contact(s)${unmatched ? `, ${unmatched} row(s) did not match a student` : ''}${bad ? `, ${bad} phone number(s) look invalid` : ''}${adminSkipped ? `, ${adminSkipped} admin number(s) ignored` : ''}.`, bad||unmatched||adminSkipped ? 'warning' : 'success', 5200);
  }catch(e){
    console.error(e);
    showToast('Import failed: ' + (e.message||e), 'warning', 5200);
  }
}

/* ---------------------------------------- attention badge + import alert --- */
function attentionCount(def){
  const store = workspace.sections[def.key];
  return store ? store.students.filter(st=>attentionReasons(st, def)).length : 0;
}
function updateBadge(){
  const b = el('pcBadge'); if(!b) return;
  try{
    const n = attentionCount(currentSectionDef());
    b.textContent = n || ''; b.style.display = n ? 'inline-block' : 'none'; b.className = 'pc-badge';
    b.title = n ? `${n} student(s) in this section need attention` : '';
  }catch(e){}
}
function attentionSet(){
  const s = new Set();
  SECTION_DEFS.forEach(def=>{
    const store = workspace.sections[def.key];
    if(store) store.students.forEach(st=>{ if(attentionReasons(st, def)) s.add(def.key+'|'+st.id); });
  });
  return s;
}
function hook(name, wrapper){
  const orig = window[name];
  if(typeof orig !== 'function') return;
  window[name] = function(){ return wrapper(orig, this, arguments); };
}

/* ----------------------------------------------------------------- init --- */
function wire(){
  const on = (id, fn)=>{ const b = el(id); if(b) b.addEventListener('click', fn); };
  on('pcCardsBtn', printSectionCards);
  on('pcBulkBtn', openBulk);
  on('drawerCardBtn', ()=>{ const n = el('drawerStudentName'); if(n.dataset.sid) printStudentCard(n.dataset.sid, n.dataset.skey); });
  on('drawerMsgBtn', ()=>{ const n = el('drawerStudentName'); if(n.dataset.sid) openSingle(n.dataset.sid, n.dataset.skey); });
  hook('refreshAllUI', (orig, self, args)=>{ const r = orig.apply(self, args); updateBadge(); return r; });
  // After results are imported, say who newly needs attention.
  hook('applyPendingImportList', (orig, self, args)=>{
    let before; try{ before = attentionSet(); }catch(e){ before = null; }
    const r = orig.apply(self, args);
    Promise.resolve(r).then(()=>{
      try{
        updateBadge();
        if(!before) return;
        let fresh = 0; attentionSet().forEach(k=>{ if(!before.has(k)) fresh++; });
        if(fresh) showToast(`${fresh} student(s) newly need attention. Open Parent Messages to review and notify parents.`, 'warning', 7000);
      }catch(e){}
    });
    return r;
  });
  updateBadge();
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
window.axParentComms = { snapshot, buildMessage, waNumber, attentionReasons, cardHtml, printCards }; // exposed for testing/debug
})();
