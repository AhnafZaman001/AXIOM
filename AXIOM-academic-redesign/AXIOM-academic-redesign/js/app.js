/* ---- 001_section-definitions.js ---- */

/* ===================== SECTION DEFINITIONS ===================== */
const SUBJECT_SETS = {
  PM:   ['Physics','Chemistry','Biology','English','Urdu','Islamiat','TQ'],
  PE:   ['Physics','Chemistry','Math','English','Urdu','Islamiat','TQ'],
  ICS:  ['Physics','Computer','Math','English','Urdu','Islamiat','TQ'],
  ICOM: ['Economics','B.Math','Accounting','Commerce','English','Urdu','Islamiat','TQ']
};
const GROUP_LABELS = { PM:'Pre-Medical', PE:'Pre-Engineering', ICS:'ICS', ICOM:'I.Com' };

// key: internal id, sheetName: exact name expected in workbook, group -> subject set
const SECTION_DEFS = [
  {key:'F1A', sheetName:'F1A', group:'PM'},
  {key:'F1B', sheetName:'F1B', group:'PM'},
  {key:'F2', sheetName:'F2', group:'PM'},
  {key:'F3', sheetName:'F3', group:'PM'},
  {key:'F4', sheetName:'F4', group:'PM'},
  {key:'F10PM', sheetName:'F10 PM', group:'PM'},
  {key:'F11', sheetName:'F11', group:'PM'},
  {key:'F12', sheetName:'F12', group:'PM'},
  {key:'F16PM', sheetName:'F16 (PM)', group:'PM'},
  {key:'F6PE', sheetName:'F6 PE', group:'PE'},
  {key:'F9PE', sheetName:'F9 PE', group:'PE'},
  {key:'F10PE', sheetName:'F10 PE', group:'PE'},
  {key:'F13PE', sheetName:'F13 (PE)', group:'PE'},
  {key:'F16PE', sheetName:'F16 (PE)', group:'PE'},
  {key:'F7ICS', sheetName:'F7 ICS', group:'ICS'},
  {key:'F8ICS', sheetName:'F8 ICS', group:'ICS'},
  {key:'F9ICS', sheetName:'F9 ICS', group:'ICS'},
  {key:'F10ICS', sheetName:'F10 ICS', group:'ICS'},
  {key:'F13ICS', sheetName:'F13 (ICS)', group:'ICS'},
  {key:'F14ICS', sheetName:'F14 (ICS)', group:'ICS'},
  {key:'F15ICS', sheetName:'F15 (ICS)', group:'ICS'},
  {key:'F16ICS', sheetName:'F16 (ICS)', group:'ICS'},
  {key:'F16ICOM', sheetName:'F16 (i.com)', group:'ICOM'},
].map(d => ({...d, label: `${d.sheetName} — ${GROUP_LABELS[d.group]}`, subjects: SUBJECT_SETS[d.group]}));

const SECTION_BY_KEY = Object.fromEntries(SECTION_DEFS.map(d=>[d.key,d]));

function normalizeSheetName(s){
  return String(s||'').toUpperCase().replace(/[()]/g,'').replace(/\s+/g,' ').trim();
}
const SHEETNAME_TO_KEY = Object.fromEntries(SECTION_DEFS.map(d=>[normalizeSheetName(d.sheetName), d.key]));

// ---- Forgiving sheet-name matching (handles typos, missing spaces, hyphens
// instead of parentheses/spaces, etc.) so an import doesn't dead-end just
// because a tab is named "F1-A" or "F16PM" instead of the exact expected name.
function compactSheetName(s){
  // Strip everything except letters/digits so spacing/punctuation differences
  // (hyphens, underscores, dots, parentheses, extra spaces) don't matter.
  return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
const SHEETNAME_COMPACT_TO_KEY = Object.fromEntries(SECTION_DEFS.map(d=>[compactSheetName(d.sheetName), d.key]));

function levenshteinDistance(a, b){
  const m = a.length, n = b.length;
  if(m === 0) return n;
  if(n === 0) return m;
  const dp = Array.from({length:m+1}, ()=>new Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0] = i;
  for(let j=0;j<=n;j++) dp[0][j] = j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[m][n];
}

// Tries, in order: exact normalized match -> punctuation/spacing-insensitive
// match -> small-edit-distance fuzzy match (only if there's one unambiguous
// closest known section). Returns {key, method} or null if nothing is close.
function matchSheetNameToKey(sheetName){
  const norm = normalizeSheetName(sheetName);
  if(SHEETNAME_TO_KEY[norm]) return {key: SHEETNAME_TO_KEY[norm], method:'exact'};

  const compact = compactSheetName(sheetName);
  if(SHEETNAME_COMPACT_TO_KEY[compact]) return {key: SHEETNAME_COMPACT_TO_KEY[compact], method:'normalized'};

  let bestKey = null, bestDist = Infinity, tiedAtBest = 0;
  Object.entries(SHEETNAME_COMPACT_TO_KEY).forEach(([candidateCompact, key])=>{
    const dist = levenshteinDistance(compact, candidateCompact);
    const threshold = Math.max(1, Math.floor(candidateCompact.length * 0.25));
    if(dist <= threshold){
      if(dist < bestDist){ bestDist = dist; bestKey = key; tiedAtBest = 1; }
      else if(dist === bestDist){ tiedAtBest++; }
    }
  });
  // Only accept the fuzzy match if exactly one known section is that close —
  // an ambiguous guess is worse than surfacing it as unmatched.
  if(bestKey && tiedAtBest === 1) return {key: bestKey, method:'fuzzy'};
  return null;
}

/* ------------- Dynamic add/remove of sections (used by the UI's
   "Add Section" / "Delete Section" controls). SECTION_DEFS, SECTION_BY_KEY
   and SHEETNAME_TO_KEY are mutated in place (push/splice, not reassigned)
   so every later module — which all read these globals live — picks up
   the change automatically without any extra plumbing. ------------- */
function slugifySectionKey(sheetName){
  return String(sheetName||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function uniqueSectionKey(baseKey){
  let key = baseKey || 'SEC';
  let n = 2;
  while(SECTION_BY_KEY[key]){ key = (baseKey||'SEC') + n; n++; }
  return key;
}
// Creates a new section, adds it to SECTION_DEFS/SECTION_BY_KEY/SHEETNAME_TO_KEY,
// and returns the new definition. Throws a plain Error with a user-facing
// message if the name is missing/duplicate or the group is unknown.
function addSectionDef(sheetName, group){
  sheetName = String(sheetName||'').trim();
  if(!sheetName) throw new Error('Enter a section name.');
  if(!SUBJECT_SETS[group]) throw new Error('Choose a valid subject group.');
  const normalized = normalizeSheetName(sheetName);
  if(SHEETNAME_TO_KEY[normalized]) throw new Error(`A section named "${sheetName}" already exists.`);
  const key = uniqueSectionKey(slugifySectionKey(sheetName));
  const def = {
    key, sheetName, group,
    label: `${sheetName} — ${GROUP_LABELS[group]}`,
    subjects: SUBJECT_SETS[group]
  };
  SECTION_DEFS.push(def);
  SECTION_BY_KEY[key] = def;
  SHEETNAME_TO_KEY[normalized] = key;
  return def;
}
// Renames an existing section's display/sheet name in place (student and
// test data are untouched since they're keyed by the stable `key`, not the
// name). Persists the new name into workspace.sectionRenames so it survives
// a Download Workspace -> Upload Workspace round trip. Throws a plain Error
// with a user-facing message on invalid/duplicate names.
function renameSectionDef(key, newName){
  newName = String(newName||'').trim();
  if(!newName) throw new Error('Enter a section name.');
  const def = SECTION_BY_KEY[key];
  if(!def) throw new Error('Section not found.');
  const normalized = normalizeSheetName(newName);
  const existingKey = SHEETNAME_TO_KEY[normalized];
  if(existingKey && existingKey !== key) throw new Error(`A section named "${newName}" already exists.`);
  delete SHEETNAME_TO_KEY[normalizeSheetName(def.sheetName)];
  def.sheetName = newName;
  def.label = `${newName} — ${GROUP_LABELS[def.group]}`;
  SHEETNAME_TO_KEY[normalized] = key;
  if(typeof workspace !== 'undefined' && workspace){
    workspace.sectionRenames = workspace.sectionRenames || {};
    workspace.sectionRenames[key] = newName;
  }
  return def;
}
// Re-applies any section renames stored in a loaded workspace file onto the
// live SECTION_DEFS (called right after a workspace upload, since SECTION_DEFS
// itself isn't part of the saved file — only the rename map is).
function applyPersistedSectionRenames(){
  if(!workspace || !workspace.sectionRenames) return;
  Object.entries(workspace.sectionRenames).forEach(([key, name])=>{
    const def = SECTION_BY_KEY[key];
    if(!def || def.sheetName === name) return;
    delete SHEETNAME_TO_KEY[normalizeSheetName(def.sheetName)];
    def.sheetName = name;
    def.label = `${name} — ${GROUP_LABELS[def.group]}`;
    SHEETNAME_TO_KEY[normalizeSheetName(name)] = key;
  });
}
// Removes a section definition (and, if a workspace already exists, its
// student/test data) by key. Returns true if a section was removed.
function removeSectionDef(key){
  const idx = SECTION_DEFS.findIndex(d=>d.key===key);
  if(idx === -1) return false;
  const def = SECTION_DEFS[idx];
  SECTION_DEFS.splice(idx, 1);
  delete SECTION_BY_KEY[key];
  delete SHEETNAME_TO_KEY[normalizeSheetName(def.sheetName)];
  if(typeof workspace !== 'undefined' && workspace && workspace.sections) delete workspace.sections[key];
  return true;
}

// Ordered so more specific keywords are checked first (B.Math before Math)
const SUBJECT_KEYWORDS = [
  ['B.Math', ['B.MATH','B MATH','BUSINESS MATH']],
  ['Physics', ['PHYSIC']],
  ['Chemistry', ['CHEM']],
  ['Biology', ['BIOLOG']],
  ['Computer', ['COMPUTER']],
  ['Math', ['MATH']],
  ['English', ['ENGLISH']],
  ['Urdu', ['URDU']],
  ['Islamiat', ['ISLAM']],
  ['TQ', ['TARBIYAH','QURAN','TQ']],
  ['Economics', ['ECONOM']],
  ['Accounting', ['ACCOUNT']],
  ['Commerce', ['COMMERCE']],
];

/* ---- 002_teacher-reference-subject-section-teacher.js ---- */

/* ===================== TEACHER REFERENCE (subject + section -> teacher) ===================== */
// Sections here use the "raw" section label (e.g. F1A, F9, F16) regardless of
// which stream (PM/PE/ICS/ICOM) that section belongs to, since one teacher
// typically covers a subject for a given raw section across streams.
const TEACHER_DATA = {
  'Physics': [
    {teacher:'P. G.M. Ali', sections:['F1A','F1B','F2']},
    {teacher:'P. Sajib Jamil', sections:['F3','F6','F9']},
    {teacher:'P. Naveed Ikram', sections:['F4','F7','F8']},
    {teacher:'P. Amira', sections:['F14','F15','F16']},
    {teacher:'P. Nayyar Sultan', sections:['F10','F11','F12']},
  ],
  'Chemistry': [
    {teacher:'P. H. Shahid Ali', sections:['F1A','F1B','F2']},
    {teacher:'P. Wahab', sections:['F3','F4','F9','F12']},
    {teacher:'P. Nawaz', sections:['F6','F10','F11','F16']},
  ],
  'Biology': [
    {teacher:'P. Raza', sections:['F1A','F1B','F2']},
    {teacher:'P. Sheraz', sections:['F3','F4','F11']},
    {teacher:'P. Misbah', sections:['F10','F12','F16']},
  ],
  'Math': [
    {teacher:'P. Khair', sections:['F6','F7','F8','F10']},
    {teacher:'P. Ilyas', sections:['F9','F16']},
    {teacher:'P. Asad', sections:['F13','F14','F15']},
  ],
  'Computer': [
    {teacher:'P. Waseem', sections:['F7','F8','F13','F14']},
    {teacher:'P. Zirwa', sections:['F9','F10','F15','F16']},
  ],
  'English': [
    {teacher:'P. Umer Shah', sections:['F1A','F1B','F2','F4']},
    {teacher:'P. Gulzar', sections:['F3','F13','F14','F15']},
    {teacher:'P. Khubaib', sections:['F6','F7','F8','F16']},
    {teacher:'P. Imran Malik', sections:['F9']},
    {teacher:'P. Ashraf', sections:['F10']},
    {teacher:'P. Atif Saeed', sections:['F11','F12']},
  ],
  'Urdu': [
    {teacher:'P. Zahida', sections:['F1A','F1B','F2','F16']},
    {teacher:'P. Farrukh', sections:['F3','F4','F10','F13']},
    {teacher:'P. Naseer', sections:['F6','F7','F14','F15']},
    {teacher:'P. Attiya', sections:['F8','F9','F11','F12']},
  ],
  'Islamiat': [
    {teacher:'P. Aisha', sections:['F1A','F1B','F2','F9']},
    {teacher:'P. Rokaya', sections:['F3','F4','F11','F12']},
    {teacher:'P. Asma', sections:['F6','F7','F13','F14']},
    {teacher:'P. Habiba', sections:['F8','F10','F15','F16']},
  ],
  'I.Com': [
    {teacher:'P. M. Ali', sections:['F16']},
  ],
};

// Strips a section def's display name down to its "raw" label (F1A, F9, F16…)
// so it can be matched against TEACHER_DATA regardless of stream suffix.
function rawSectionLabel(def){
  if(!def) return null;
  const m = String(def.sheetName||'').match(/^F\d+[A-Za-z]?/);
  return m ? m[0].toUpperCase() : null;
}

/* ---- Teacher overrides (per exact section, not just raw label) ----
   TEACHER_DATA above is the *default* roster. Real schools reshuffle who
   teaches what mid-term, so overrides let a specific section+subject be
   reassigned to a different teacher without touching the default roster.
   Stored in workspace.teacherOverrides so it's saved/loaded with the
   workspace file: { [sectionKey]: { [subject]: teacherName } }.
   An empty string means "explicitly cleared / no teacher assigned". */
function getTeacherOverride(sectionKey, subject){
  const bySection = workspace && workspace.teacherOverrides && workspace.teacherOverrides[sectionKey];
  return bySection ? bySection[subject] : undefined; // undefined = no override on record
}
function setTeacherOverride(sectionKey, subject, teacherName){
  if(!workspace) return;
  workspace.teacherOverrides = workspace.teacherOverrides || {};
  workspace.teacherOverrides[sectionKey] = workspace.teacherOverrides[sectionKey] || {};
  workspace.teacherOverrides[sectionKey][subject] = teacherName; // '' clears it
}
function clearTeacherOverride(sectionKey, subject){
  if(workspace && workspace.teacherOverrides && workspace.teacherOverrides[sectionKey]){
    delete workspace.teacherOverrides[sectionKey][subject];
  }
}

// Returns the teacher name for a subject in a given section def, or null if
// there's no record for that combination. Checks this exact section's
// override first, then falls back to the default roster (matched by raw
// section label, e.g. F16 PM/PE/ICS/ICOM all share the same default F16 row).
function lookupTeacher(subject, def){
  if(!def || !subject) return null;
  const override = getTeacherOverride(def.key, subject);
  if(override !== undefined) return override || null;
  const raw = rawSectionLabel(def);
  if(!raw) return null;
  const entries = TEACHER_DATA[subject];
  if(!entries) return null;
  const hit = entries.find(e=>e.sections.includes(raw));
  return hit ? hit.teacher : null;
}

/* ---- 003_zone-logic.js ---- */

/* ===================== ZONE LOGIC ===================== */
function zoneOf(percent, absent){
  if(absent) return 'grey';
  if(percent === null || percent === undefined || Number.isNaN(percent)) return null;
  if(percent >= 90) return 'green';
  if(percent >= 80) return 'blue';
  if(percent >= 70) return 'yellow';
  if(percent >= 60) return 'pink';
  return 'red';
}
const ZONE_RANK = {red:0, pink:1, yellow:2, blue:3, green:4};
const ZONE_LABEL = {green:'Green',blue:'Blue',yellow:'Yellow',pink:'Pink',red:'Red',grey:'Absent'};
const ZONE_EMOJI = {green:'🟢',blue:'🔵',yellow:'🟡',pink:'🩷',red:'🔴',grey:'⚪'};

/* ---- 004_ui-polish-avatars-toasts-counters-theme-confetti.js ---- */

/* ===================== UI POLISH: avatars, toasts, counters, theme, confetti ===================== */
function initialsOf(name){
  const parts = String(name||'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return '?';
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
}
function avatarClassFor(name){
  let hash = 0;
  const s = String(name||'');
  for(let i=0;i<s.length;i++) hash = (hash*31 + s.charCodeAt(i)) >>> 0;
  return 'a' + (hash % 6 + 1);
}
function avatarHtml(name){
  return `<span class="avatar-initials ${avatarClassFor(name)}">${escapeHtml(initialsOf(name))}</span>`;
}

function prefersReducedMotion(){
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function playInterfaceSound(type){
  try{
    if(localStorage.getItem('spl-sounds') !== 'on') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    if(!window.__splAudioCtx) window.__splAudioCtx = new AC();
    const ctx = window.__splAudioCtx;
    if(ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const freqs = type==='error' ? [392.00, 329.63] : type==='warning' ? [440.00] : [523.25, 659.25];
    freqs.forEach((f, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t0 = now + i*0.09;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.08, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.24);
    });
  }catch(e){ /* audio unavailable, ignore */ }
}

const TOAST_ICONS = {
  success: '<svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
  warning: '<svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 2 18a1.5 1.5 0 0 0 1.3 2.2h17.4A1.5 1.5 0 0 0 22 18L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z"/></svg>',
  info: '<svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
};
function showToast(message, type, duration){
  type = type || 'info';
  duration = duration || 3200;
  const stack = document.getElementById('toastStack');
  if(!stack){ return; }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.style.setProperty('--toast-life', (duration/1000)+'s');
  el.setAttribute('role', type==='error' ? 'alert' : 'status');
  const iconWrap = document.createElement('span');
  iconWrap.style.cssText = 'flex:none;display:inline-flex;margin-top:1px;';
  iconWrap.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;
  const iconColor = type==='success' ? '#4ADE80' : type==='error' ? '#F87171' : type==='warning' ? '#FCD34D' : 'var(--accent-2)';
  iconWrap.firstElementChild.style.stroke = iconColor;
  const textEl = document.createElement('span');
  textEl.textContent = message;
  el.style.display = 'flex';
  el.style.alignItems = 'flex-start';
  el.style.gap = '10px';
  el.appendChild(iconWrap);
  el.appendChild(textEl);
  stack.appendChild(el);
  playInterfaceSound(type);
  setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); }, duration + 400);
}

function animateCounters(host){
  const els = host.querySelectorAll('[data-count]');
  if(prefersReducedMotion()){
    els.forEach(el=>{
      const target = parseFloat(el.getAttribute('data-count'));
      const suffix = el.getAttribute('data-suffix') || '';
      el.textContent = (Number.isInteger(target) ? target : target.toFixed(1)) + suffix;
    });
    return;
  }
  els.forEach(el=>{
    const target = parseFloat(el.getAttribute('data-count'));
    const suffix = el.getAttribute('data-suffix') || '';
    const isFloat = !Number.isInteger(target);
    const duration = 650;
    const start = performance.now();
    function step(now){
      const p = Math.min(1, (now-start)/duration);
      const eased = 1 - Math.pow(1-p, 3);
      const val = target*eased;
      el.textContent = (isFloat ? val.toFixed(1) : Math.round(val)) + suffix;
      if(p < 1) requestAnimationFrame(step);
      else el.textContent = (isFloat ? target.toFixed(1) : target) + suffix;
    }
    requestAnimationFrame(step);
  });
}

function triggerEntranceAnimations(){
  if(prefersReducedMotion()) return;
  const els = document.querySelectorAll('.hero-metric, .card, .chart-card');
  els.forEach((el,i)=>{
    el.classList.remove('enter-anim');
    void el.offsetWidth; // restart animation
    el.style.animationDelay = Math.min(i*45, 400) + 'ms';
    el.classList.add('enter-anim');
  });
}

function launchConfetti(){
  if(prefersReducedMotion()) return;
  const colors = ['#3f7150','#3a6ea8','#c98f2b','#b0567a','#b5433a','#4a6fa5'];
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);
  for(let i=0;i<28;i++){
    const p = document.createElement('span');
    p.className = 'confetti-piece';
    p.style.left = (Math.random()*100)+'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random()*0.3)+'s';
    p.style.animationDuration = (1.4+Math.random()*0.8)+'s';
    container.appendChild(p);
  }
  setTimeout(()=>{ if(container.parentNode) container.parentNode.removeChild(container); }, 2600);
}

function updateLastUpdatedNow(){
  const el = document.getElementById('lastUpdated');
  if(!el) return;
  const now = new Date();
  el.textContent = 'Last updated: ' + now.toLocaleDateString(undefined,{month:'short',day:'numeric'}) + ' ' + now.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
}

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if(btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  try{ localStorage.setItem('spl-theme', theme); }catch(e){ /* storage unavailable, theme just won't persist */ }
}

/* ---- 005_workspace-state.js ---- */

/* ===================== WORKSPACE STATE ===================== */
let workspace = { sections: {}, sectionRenames: {}, teacherOverrides: {} }; // { [sectionKey]: { students: [ {id,name,rollNo,matric,tests:{ [subject]: [ {test,date,obtained,max,percent,absent,position} ] } } ] } }
// sectionRenames: { [sectionKey]: newSheetName } — see renameSectionDef()
// teacherOverrides: { [sectionKey]: { [subject]: teacherName } } — see setTeacherOverride()
let dirty = false;
let fileHandle = null; // File System Access API handle, if connected
let lastImportSnapshot = null; // JSON string of workspace right before the most recent import was applied
let lastImportLabel = null; // human-readable description of what would be undone

function uid(){ return 's'+Math.random().toString(36).slice(2,10); }

/* ---- 006_support-intervention-plans.js ---- */

/* ===================== SUPPORT / INTERVENTION PLANS ===================== */
// Data model: student.supportPlans = [ { id, priority, problem, intervention,
//   createdAt, lastReviewedAt, nextReviewAt, followUpInterval, followUpComment,
//   status, history: [ {id, date, comment, status} ] } ]
// Old workspace files simply lack this field; every reader below falls back
// to an empty array so nothing crashes and nothing is overwritten.
const PRIORITY_META = {
  high:{emoji:'🔴', label:'High'},
  medium:{emoji:'🟠', label:'Medium'},
  low:{emoji:'🟢', label:'Low'}
};
const SUPPORT_STATUS_META = {
  active:'Active', improving:'Improving', resolved:'Resolved',
  no_improvement:'No Improvement', escalated:'Escalated'
};
function ensureSupportPlans(student){
  if(!student.supportPlans) student.supportPlans = [];
  return student.supportPlans;
}
// Picks the single most relevant plan to summarise: prefers a plan that
// isn't resolved yet, and among those the most recently created one.
function activeSupportPlan(student){
  const plans = student.supportPlans || [];
  if(!plans.length) return null;
  const open = plans.filter(p=>p.status !== 'resolved');
  const pool = open.length ? open : plans;
  return pool.slice().sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0))[0];
}
// Returns {label, cls} describing where nextReviewAt sits relative to today,
// or null if there's no follow-up date to compare against.
function followUpStatus(nextReviewAt){
  if(!nextReviewAt) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(nextReviewAt+'T00:00:00');
  if(isNaN(due.getTime())) return null;
  const diffDays = Math.round((due - today) / 86400000);
  if(diffDays > 0) return {label:`Review in ${diffDays} day${diffDays===1?'':'s'}`, cls:'upcoming'};
  if(diffDays === 0) return {label:'Follow-up due today', cls:'due'};
  return {label:`Follow-up overdue by ${-diffDays} day${diffDays===-1?'':'s'}`, cls:'overdue'};
}
// Suggests a "last reviewed" date by finding the most recent test date
// recorded for the student across their section's subjects.
function suggestLastReviewDate(student, def){
  let latestDate = null;
  (def.subjects||[]).forEach(subj=>{
    const arr = (student.tests||{})[subj] || [];
    if(arr.length){
      const t = arr[arr.length-1];
      if(t.date && (!latestDate || t.date > latestDate)) latestDate = t.date;
    }
  });
  return latestDate;
}
function computeNextReviewDate(interval, base, custom){
  if(interval === 'custom') return custom || base || new Date().toISOString().slice(0,10);
  const days = {'3_days':3, '7_days':7, '14_days':14, '30_days':30}[interval] || 7;
  const d = base ? new Date(base+'T00:00:00') : new Date();
  if(isNaN(d.getTime())) return new Date().toISOString().slice(0,10);
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

let supportPlanCtx = null; // {sid, skey, planId}
function openSupportPlanModal(sid, skey, planId){
  const found = findStudentAnywhere(sid, skey);
  if(!found) return;
  const { student, def } = found;
  supportPlanCtx = { sid: student.id, skey: def.key, planId: planId || null };
  const plan = planId ? ensureSupportPlans(student).find(p=>p.id===planId) : null;

  document.getElementById('supportPlanTitle').textContent = plan ? 'Edit Support Plan' : 'Create Support Plan';
  document.getElementById('spPriority').value = plan ? plan.priority : 'medium';
  document.getElementById('spStatus').value = plan ? plan.status : 'active';
  document.getElementById('spProblem').value = plan ? (plan.problem||'') : '';
  document.getElementById('spIntervention').value = plan ? (plan.intervention||'') : '';
  document.getElementById('spLastReviewed').value = plan ? (plan.lastReviewedAt||'') : (suggestLastReviewDate(student, def) || new Date().toISOString().slice(0,10));
  document.getElementById('spInterval').value = plan ? (plan.followUpInterval||'7_days') : '7_days';
  document.getElementById('spCustomDate').value = (plan && plan.followUpInterval==='custom') ? (plan.nextReviewAt||'') : '';
  document.getElementById('spCustomDateField').style.display = document.getElementById('spInterval').value === 'custom' ? 'flex' : 'none';
  document.getElementById('spComment').value = plan ? (plan.followUpComment||'') : '';

  document.getElementById('supportPlanOverlay').classList.add('open');
}
function closeSupportPlanModal(){
  document.getElementById('supportPlanOverlay').classList.remove('open');
  supportPlanCtx = null;
}
function saveSupportPlanFromModal(){
  if(!supportPlanCtx) return;
  const found = findStudentAnywhere(supportPlanCtx.sid, supportPlanCtx.skey);
  if(!found) return;
  const { student, def } = found;
  const problem = document.getElementById('spProblem').value.trim();
  if(!problem){ showToast('Please describe the problem or concern first.', 'warning'); return; }

  const priority = document.getElementById('spPriority').value;
  const intervention = document.getElementById('spIntervention').value.trim();
  const lastReviewedAt = document.getElementById('spLastReviewed').value || new Date().toISOString().slice(0,10);
  const followUpInterval = document.getElementById('spInterval').value;
  const customDate = document.getElementById('spCustomDate').value;
  const nextReviewAt = computeNextReviewDate(followUpInterval, lastReviewedAt, customDate);
  const followUpComment = document.getElementById('spComment').value.trim();
  const status = document.getElementById('spStatus').value;

  const plans = ensureSupportPlans(student);
  if(supportPlanCtx.planId){
    const plan = plans.find(p=>p.id===supportPlanCtx.planId);
    if(plan) Object.assign(plan, {priority, problem, intervention, lastReviewedAt, followUpInterval, nextReviewAt, followUpComment, status});
  } else {
    plans.push({
      id: uid(), priority, problem, intervention,
      createdAt: new Date().toISOString().slice(0,10),
      lastReviewedAt, followUpInterval, nextReviewAt, followUpComment, status,
      history: []
    });
  }
  markDirty();
  closeSupportPlanModal();
  renderTable();
  renderPinnedPanel();
  if(document.getElementById('studentDrawerOverlay').classList.contains('open')) openStudentDrawerById(student.id, def.key);
  showToast('✓ Support plan saved.', 'success');
}
document.getElementById('spInterval').addEventListener('change', (e)=>{
  document.getElementById('spCustomDateField').style.display = e.target.value === 'custom' ? 'flex' : 'none';
});
document.getElementById('spSaveBtn').addEventListener('click', saveSupportPlanFromModal);
document.getElementById('spCancelBtn').addEventListener('click', closeSupportPlanModal);
document.getElementById('supportPlanOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'supportPlanOverlay') closeSupportPlanModal(); });

let followUpCtx = null; // {sid, skey, planId}
function openFollowUpModal(sid, skey, planId){
  followUpCtx = { sid, skey, planId };
  document.getElementById('fuDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('fuComment').value = '';
  document.getElementById('fuStatus').value = 'improving';
  document.getElementById('followUpOverlay').classList.add('open');
}
function closeFollowUpModal(){
  document.getElementById('followUpOverlay').classList.remove('open');
  followUpCtx = null;
}
function saveFollowUpFromModal(){
  if(!followUpCtx) return;
  const found = findStudentAnywhere(followUpCtx.sid, followUpCtx.skey);
  if(!found) return;
  const { student, def } = found;
  const plan = ensureSupportPlans(student).find(p=>p.id===followUpCtx.planId);
  if(!plan) return;
  const date = document.getElementById('fuDate').value || new Date().toISOString().slice(0,10);
  const comment = document.getElementById('fuComment').value.trim();
  const status = document.getElementById('fuStatus').value;
  if(!plan.history) plan.history = [];
  plan.history.push({ id: uid(), date, comment, status });
  plan.status = status;
  plan.lastReviewedAt = date;
  markDirty();
  closeFollowUpModal();
  renderTable();
  renderPinnedPanel();
  if(document.getElementById('studentDrawerOverlay').classList.contains('open')) openStudentDrawerById(student.id, def.key);
  showToast('✓ Follow-up recorded.', 'success');
}
document.getElementById('fuSaveBtn').addEventListener('click', saveFollowUpFromModal);
document.getElementById('fuCancelBtn').addEventListener('click', closeFollowUpModal);
document.getElementById('followUpOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'followUpOverlay') closeFollowUpModal(); });
document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Escape') return;
  if(document.getElementById('supportPlanOverlay').classList.contains('open')) closeSupportPlanModal();
  if(document.getElementById('followUpOverlay').classList.contains('open')) closeFollowUpModal();
});

// Renders the collapsible Support/Intervention section shown at the top of
// the student profile drawer: current status summary + full plan history.
function renderSupportSectionHtml(student, def){
  const plans = student.supportPlans || [];
  const active = activeSupportPlan(student);
  let html = '<div class="support-section">';
  html += `<div class="support-section-head"><h4>Support / Intervention</h4>
    <button class="ghost small" onclick="openSupportPlanModal('${student.id}','${def.key}')">+ New Plan</button></div>`;

  if(!active){
    html += '<div class="hint">No active support plan.</div>';
  } else {
    const pm = PRIORITY_META[active.priority] || {};
    const fu = followUpStatus(active.nextReviewAt);
    html += `<div class="support-status-card">
      <div class="ssc-top">
        <span class="priority-badge ${active.priority}">${pm.emoji||''} ${pm.label||active.priority} Priority</span>
        <span class="support-status-tag ${active.status}">${SUPPORT_STATUS_META[active.status]||active.status}</span>
      </div>
      <div class="ssc-problem">${escapeHtml(active.problem)}</div>
      ${fu ? `<div class="followup-indicator ${fu.cls}">${fu.label}</div>` : ''}
      <div class="ssc-actions">
        <button class="ghost small" onclick="openFollowUpModal('${student.id}','${def.key}','${active.id}')">+ Add Follow-up</button>
        <button class="ghost small" onclick="openSupportPlanModal('${student.id}','${def.key}','${active.id}')">Edit Plan</button>
      </div>
    </div>`;
  }

  if(plans.length){
    html += `<div class="support-history-toggle" onclick="this.nextElementSibling.classList.toggle('open')">View full history (${plans.length} plan${plans.length>1?'s':''})</div>`;
    html += '<div class="support-history-panel">';
    plans.slice().sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0)).forEach(plan=>{
      const pm = PRIORITY_META[plan.priority] || {};
      html += `<div class="support-plan-item">
        <div class="spi-head">
          <span class="priority-badge ${plan.priority}">${pm.emoji||''} ${pm.label||plan.priority}</span>
          <span class="support-status-tag ${plan.status}">${SUPPORT_STATUS_META[plan.status]||plan.status}</span>
          <span class="hint">Created ${escapeHtml(plan.createdAt||'—')}</span>
        </div>
        <div class="hint"><strong style="color:var(--ink);">Problem:</strong> ${escapeHtml(plan.problem||'—')}</div>
        <div class="hint"><strong style="color:var(--ink);">Intervention:</strong> ${escapeHtml(plan.intervention||'—')}</div>
        <div class="hint">Next follow-up: ${escapeHtml(plan.nextReviewAt||'—')}</div>`;
      (plan.history||[]).slice().sort((a,b)=> (a.date||'').localeCompare(b.date||'')).forEach(h=>{
        html += `<div class="followup-entry"><span class="hint">${escapeHtml(h.date||'')}</span> — ${escapeHtml(h.comment||'')}
          <span class="support-status-tag ${h.status}">${SUPPORT_STATUS_META[h.status]||h.status}</span></div>`;
      });
      html += `</div>`;
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}
// Small badge shown in the main table next to a student's name when they
// have an active (non-resolved) support plan; clicking it just opens the
// row like any other cell since it lives inside the clickable <tr>.
function supportIndicatorHtml(student){
  const active = activeSupportPlan(student);
  if(!active) return '';
  const pm = PRIORITY_META[active.priority] || {};
  const fu = followUpStatus(active.nextReviewAt);
  let title = `${pm.label||active.priority} priority support plan — ${SUPPORT_STATUS_META[active.status]||active.status}`;
  if(fu) title += ` · ${fu.label}`;
  const overdueMark = fu && fu.cls === 'overdue' ? ' ⏰' : '';
  return `<span class="support-indicator" title="${escapeHtml(title)}">${pm.emoji||''}${overdueMark}</span>`;
}

function ensureSection(key){
  if(!workspace.sections[key]) workspace.sections[key] = { students: [] };
  return workspace.sections[key];
}
function markDirty(){
  dirty = true;
  updateStatusLine();
  updateLastUpdatedNow();
  if(fileHandle) autoSaveToHandle();
}
function updateStatusLine(){
  const el = document.getElementById('statusLine');
  if(fileHandle){
    el.className = dirty ? 'status-line unsaved' : 'status-line';
    el.innerHTML = `<span class="dot"></span>${dirty ? 'Saving to pendrive file…' : 'Synced to pendrive file'}`;
  } else {
    el.className = dirty ? 'status-line unsaved' : 'status-line';
    el.innerHTML = `<span class="dot"></span>${dirty ? 'Unsaved changes — download workspace to keep them' : 'No changes yet'}`;
  }
}

/* ---- 007_excel-import-engine.js ---- */

/* ===================== EXCEL IMPORT ENGINE ===================== */
let pendingImport = null; // holds parsed-but-unapplied result

function cellIsNumber(v){ return typeof v === 'number' && !Number.isNaN(v); }

function parseSheetForSection(rows, def){
  const subjects = def.subjects;
  const warnings = [];
  // 1. find header row
  let headerRowIdx = -1, bestMatches = 0;
  for(let i=0;i<Math.min(8, rows.length);i++){
    const row = rows[i] || [];
    let matches = 0;
    row.forEach(cell=>{
      if(typeof cell === 'string'){
        const up = cell.toUpperCase();
        for(const subj of subjects){
          const kws = SUBJECT_KEYWORDS.find(k=>k[0]===subj);
          if(kws && kws[1].some(kw=>up.includes(kw))){ matches++; break; }
        }
      }
    });
    if(matches > bestMatches){ bestMatches = matches; headerRowIdx = i; }
  }
  if(headerRowIdx === -1 || bestMatches < 2){
    return {error:`Could not locate a subject header row for ${def.sheetName}`};
  }
  const headerRow = rows[headerRowIdx] || [];
  const maxRow = rows[headerRowIdx+1] || [];

  // 2. map subject -> columns
  const hits = []; // {subject, col}
  headerRow.forEach((cell, c)=>{
    if(typeof cell === 'string'){
      const up = cell.toUpperCase();
      for(const subj of subjects){
        const kws = SUBJECT_KEYWORDS.find(k=>k[0]===subj);
        if(kws && kws[1].some(kw=>up.includes(kw))){ hits.push({subject:subj, col:c}); break; }
      }
    }
  });
  hits.sort((a,b)=>a.col-b.col);
  // Boundaries = any non-empty header cell (not just recognized subjects) so a
  // trailing subject block never swallows unrelated columns like TOTAL MARKS.
  const boundaryCols = [];
  headerRow.forEach((cell,c)=>{ if(cell !== null && cell !== undefined && cell !== '') boundaryCols.push(c); });
  const subjectCols = {};
  hits.forEach((h)=>{
    const nextBoundary = boundaryCols.find(c => c > h.col);
    const nextCol = nextBoundary !== undefined ? nextBoundary : headerRow.length;
    const cols = [];
    for(let c=h.col; c<nextCol; c++){
      if(cellIsNumber(maxRow[c])) cols.push(c);
    }
    if(!subjectCols[h.subject]) subjectCols[h.subject] = [];
    subjectCols[h.subject].push(...cols);
  });
  subjects.forEach(s=>{ if(!subjectCols[s]) { subjectCols[s]=[]; warnings.push(`${s}: no columns detected`); } });

  // 3. locate key columns (Sr No, Name, Roll, Matric, Position)
  const scanRows = rows.slice(0, headerRowIdx+6);
  function findCol(keyword){
    for(let r=0;r<scanRows.length;r++){
      const row = scanRows[r] || [];
      for(let c=0;c<row.length;c++){
        if(typeof row[c]==='string' && row[c].toUpperCase().includes(keyword)) return c;
      }
    }
    return null;
  }
  const srCol = findCol('SR') ?? 0;
  const nameCol = findCol('NAME') ?? 1;
  const rollCol = findCol('ROLL');
  const matricCol = findCol('MATRIC');
  const positionCol = findCol('POSITION');

  // 4. find data start
  let dataStart = -1;
  for(let i=headerRowIdx+1;i<Math.min(headerRowIdx+9, rows.length);i++){
    const v = (rows[i]||[])[srCol];
    if(v === 1){ dataStart = i; break; }
  }
  if(dataStart === -1){ dataStart = headerRowIdx+3; warnings.push('Could not confidently find first data row; used a best guess.'); }

  // 5. walk data rows
  const students = [];
  for(let i=dataStart;i<rows.length;i++){
    const row = rows[i] || [];
    const srVal = row[srCol];
    if(!(typeof srVal === 'number' && srVal > 0)) break;
    const name = row[nameCol];
    if(typeof name !== 'string' || !name.trim()) continue;
    const rollNo = rollCol!=null ? row[rollCol] : null;
    const matric = matricCol!=null ? row[matricCol] : null;
    const position = positionCol!=null ? row[positionCol] : null;

    const subjectResults = {};
    let totalObtained = 0, anyNumeric = false;
    subjects.forEach(subj=>{
      const cols = subjectCols[subj];
      if(!cols || !cols.length){ subjectResults[subj] = null; return; }
      let obtained = 0, max = 0;
      cols.forEach(c=>{
        if(cellIsNumber(maxRow[c])) max += maxRow[c];
        if(cellIsNumber(row[c])){ obtained += row[c]; anyNumeric = true; }
      });
      totalObtained += obtained;
      const percent = max > 0 ? Math.round((obtained/max)*1000)/10 : null;
      subjectResults[subj] = {obtained, max, percent};
    });
    const absent = !anyNumeric || totalObtained === 0;
    students.push({name: name.trim(), rollNo, matric, position, absent, subjectResults});
  }

  return {
    sectionKey: def.key, label: def.label, subjects,
    subjectCols, headerRowIdx, students, warnings
  };
}

function runImport(workbook, testName, testDate){
  const matched = [];
  const unmatched = [];
  workbook.SheetNames.forEach(sheetName=>{
    const match = matchSheetNameToKey(sheetName);
    if(!match){ unmatched.push(sheetName); return; }
    const def = SECTION_BY_KEY[match.key];
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
    const result = parseSheetForSection(rows, def);
    if(result.error){ unmatched.push(`${sheetName} (${result.error})`); return; }
    if(match.method !== 'exact'){
      const how = match.method === 'fuzzy' ? 'a close-match guess' : 'punctuation/spacing-insensitive matching';
      result.warnings.unshift(`Tab "${sheetName}" matched to section "${def.sheetName}" via ${how} — please double-check this is the right section before confirming.`);
    }
    matched.push(result);
  });
  return {matched, unmatched, testName, testDate};
}

function applyImport(parsed){
  parsed.matched.forEach(sec=>{
    const store = ensureSection(sec.sectionKey);
    sec.students.forEach(s=>{
      let student = null;
      if(s.rollNo){
        student = store.students.find(x=>x.rollNo && String(x.rollNo).trim()===String(s.rollNo).trim());
      }
      if(!student){
        student = store.students.find(x=>x.name.trim().toLowerCase()===s.name.trim().toLowerCase());
      }
      if(!student){
        student = {id:uid(), name:s.name, rollNo:s.rollNo, matric:s.matric, tests:{}};
        store.students.push(student);
      } else {
        if(s.rollNo) student.rollNo = s.rollNo;
        if(s.matric!=null) student.matric = s.matric;
      }
      sec.subjects.forEach(subj=>{
        const r = s.subjectResults[subj];
        if(!student.tests[subj]) student.tests[subj] = [];
        const entry = {
          test: parsed.testName, date: parsed.testDate || null,
          obtained: r ? r.obtained : null, max: r ? r.max : null,
          percent: r ? r.percent : null, absent: s.absent,
          position: s.position != null ? s.position : null
        };
        const existingIdx = student.tests[subj].findIndex(t=>t.test.toLowerCase()===parsed.testName.toLowerCase());
        if(existingIdx >= 0) student.tests[subj][existingIdx] = entry;
        else student.tests[subj].push(entry);
      });
    });
  });
  markDirty();
}

/* ---- 008_render-toolbar-selects.js ---- */

/* ===================== RENDER: TOOLBAR SELECTS ===================== */
function populateSectionSelects(){
  const opts = SECTION_DEFS.map(d=>`<option value="${d.key}">${d.label}</option>`).join('');
  ['sectionSelect','atSection','asSection'].forEach(id=>{
    document.getElementById(id).innerHTML = opts;
  });
}

function currentSectionKey(){ return document.getElementById('sectionSelect').value; }
function currentSectionDef(){ return SECTION_BY_KEY[currentSectionKey()]; }

function populateSubjectFilter(){
  const def = currentSectionDef();
  const sel = document.getElementById('subjectFilter');
  sel.innerHTML = `<option value="">All Subjects</option>` + def.subjects.map(s=>`<option value="${s}">${s}</option>`).join('');
  const chartSel = document.getElementById('chartSubjectSelect');
  chartSel.innerHTML = def.subjects.map(s=>`<option value="${s}">${s}</option>`).join('');
  const reportSel = document.getElementById('reportSubjectSelect');
  reportSel.innerHTML = def.subjects.map(s=>`<option value="${s}">${s}</option>`).join('');
  const compSel = document.getElementById('compareSectionSelect');
  const otherSections = SECTION_DEFS.filter(d=>d.key!==currentSectionKey());
  compSel.innerHTML = otherSections.map(d=>`<option value="${d.key}">${d.label}</option>`).join('');
  updateSubjectTeacherHint();
}

// Updates the small hint under the section-view Subject Filter with the
// teacher on record for the currently selected subject + section.
function updateSubjectTeacherHint(){
  const hintEl = document.getElementById('subjectTeacherHint');
  if(!hintEl) return;
  const subj = document.getElementById('subjectFilter').value;
  if(!subj){ hintEl.textContent = ''; return; }
  const teacher = lookupTeacher(subj, currentSectionDef());
  hintEl.textContent = teacher ? `👩‍🏫 Teacher: ${teacher}` : `No teacher on record for ${subj} in this section.`;
}

function populateAddTestSubject(){
  const def = SECTION_BY_KEY[document.getElementById('atSection').value];
  document.getElementById('atSubject').innerHTML = def.subjects.map(s=>`<option value="${s}">${s}</option>`).join('');
  updateAtSubjectTeacherHint();
}

// Same idea as updateSubjectTeacherHint(), but for the Add/Edit Test panel,
// which has its own independent Section + Subject selects.
function updateAtSubjectTeacherHint(){
  const hintEl = document.getElementById('atSubjectTeacherHint');
  if(!hintEl) return;
  const def = SECTION_BY_KEY[document.getElementById('atSection').value];
  const subj = document.getElementById('atSubject').value;
  if(!subj || !def){ hintEl.textContent = ''; return; }
  const teacher = lookupTeacher(subj, def);
  hintEl.textContent = teacher ? `👩‍🏫 Teacher: ${teacher}` : `No teacher on record for ${subj} in this section.`;
}
function populateAddTestStudents(){
  const store = ensureSection(document.getElementById('atSection').value);
  document.getElementById('atStudent').innerHTML = store.students.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('') || `<option value="">(no students yet)</option>`;
}

function escapeHtml(str){ return String(str??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
// Small muted "Roll X · Section" tag shown next to a student's name in summary
// views (Overall Summary, Section Summary, Top Achievers, Critical/Exceptional
// popups) so students can be identified unambiguously.
function rollSectionTag(rollNo, sectionLabel){
  const bits = [];
  if(rollNo != null && rollNo !== '') bits.push(`Roll ${escapeHtml(rollNo)}`);
  if(sectionLabel) bits.push(escapeHtml(sectionLabel));
  if(!bits.length) return '';
  return `<span class="extra-detail" style="margin-left:6px;">(${bits.join(' · ')})</span>`;
}

/* ---- 009_main-table-render.js ---- */

/* ===================== MAIN TABLE RENDER ===================== */
let showExtra = false;

function latestTest(student, subject){
  const arr = (student.tests||{})[subject];
  if(!arr || !arr.length) return null;
  return arr[arr.length-1];
}

let quickFilter = null; // 'atrisk' | 'improving' | 'declining' | 'absent' | null
let searchQuery = '';

function studentMatchesQuick(student, def, quick){
  const subjFilter = document.getElementById('subjectFilter').value;
  const subjectsToCheck = subjFilter ? [subjFilter] : def.subjects;
  if(quick === 'atrisk'){
    return subjectsToCheck.some(subj=>{
      const t = latestTest(student, subj);
      return t && zoneOf(t.percent, t.absent) === 'red';
    });
  }
  if(quick === 'absent'){
    return subjectsToCheck.some(subj=>{
      const t = latestTest(student, subj);
      return t && t.absent;
    });
  }
  if(quick === 'improving' || quick === 'declining'){
    return subjectsToCheck.some(subj=>{
      const arr = (student.tests||{})[subj] || [];
      const c = classifyTransition(arr);
      return c && c.key === quick;
    });
  }
  return true;
}

function studentPassesFilters(student, def){
  const subjFilter = document.getElementById('subjectFilter').value;
  const zoneFilter = document.getElementById('zoneFilter').value;
  if(searchQuery && !student.name.toLowerCase().includes(searchQuery)) return false;
  if(quickFilter && !studentMatchesQuick(student, def, quickFilter)) return false;
  if(!zoneFilter) return true;
  const subjectsToCheck = subjFilter ? [subjFilter] : def.subjects;
  return subjectsToCheck.some(subj=>{
    const t = latestTest(student, subj);
    if(!t) return false;
    const z = zoneOf(t.percent, t.absent);
    return z === zoneFilter;
  });
}

function subjectClassAverage(store, subj){
  const vals = [];
  store.students.forEach(st=>{
    const t = latestTest(st, subj);
    if(t && !t.absent && t.percent != null) vals.push(t.percent);
  });
  return vals.length ? Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*10)/10 : null;
}

function renderTable(){
  const def = currentSectionDef();
  const store = ensureSection(def.key);
  const head = document.getElementById('tableHeadRow');
  const body = document.getElementById('tableBody');
  const tableSection = document.getElementById('tableSection');
  const emptyState = document.getElementById('emptyState');

  const subjFilter = document.getElementById('subjectFilter').value;
  const zoneFilterVal = document.getElementById('zoneFilter').value;
  const subjectsShown = subjFilter ? [subjFilter] : def.subjects;

  let headHtml = `<th>Student</th>`;
  if(showExtra) headHtml += `<th>Roll No.</th><th>Matric</th><th>Position</th>`;
  subjectsShown.forEach(s=>{
    const avg = subjectClassAverage(store, s);
    headHtml += `<th>${s}${avg!=null ? `<span class="subject-th-avg">avg ${avg}%</span>` : ''}</th>`;
  });
  head.innerHTML = headHtml;

  const students = store.students.filter(s=>studentPassesFilters(s, def));

  renderHeroMetrics(def, store);

  if(store.students.length === 0){
    tableSection.style.display='none'; emptyState.style.display='block';
    emptyState.innerHTML = `<div class="es-icon"><svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></div><h3>No students in this section yet</h3><div>Import an Excel file, or add a student manually to get started.</div><div style="margin-top:16px;"><button class="primary" onclick="document.getElementById('importBtn').click()">Import Assessment</button></div>`;
    document.getElementById('transitionCardsWrap').innerHTML='';
    document.getElementById('moversWrap').innerHTML='';
    document.getElementById('insightsWrap').innerHTML='';
    renderCharts(def, store);
    return;
  }

  if(students.length === 0){
    tableSection.style.display='none'; emptyState.style.display='block';
    emptyState.innerHTML = `<div class="es-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div><h3>No students match the current filters</h3><div>Try clearing the zone filter or quick filter chips above.</div>`;
  } else {
    tableSection.style.display='block'; emptyState.style.display='none';
  }

  body.innerHTML = students.map(st=>{
    let row = `<td class="name-cell"><span class="pin-star${st.pinned?' pinned':''}" data-pin-sid="${st.id}" title="${st.pinned?'Unpin student':'Pin student'}" role="button" aria-label="${st.pinned?'Unpin student':'Pin student'}">${st.pinned?'★':'☆'}</span>${supportIndicatorHtml(st)}${avatarHtml(st.name)}${escapeHtml(st.name)}</td>`;
    if(showExtra){
      const latestPos = (()=>{
        for(const subj of def.subjects){ const t=latestTest(st,subj); if(t && t.position!=null) return t.position; }
        return null;
      })();
      row += `<td class="extra-detail">${escapeHtml(st.rollNo ?? '—')}</td><td class="extra-detail">${st.matric ?? '—'}</td><td class="extra-detail">${latestPos ?? '—'}</td>`;
    }
    subjectsShown.forEach(subj=>{
      const arr = (st.tests||{})[subj] || [];
      const t = arr.length ? arr[arr.length-1] : null;
      const z = t ? zoneOf(t.percent, t.absent) : null;
      // When "All Subjects" is shown alongside an active zone filter, only the
      // subject(s) actually matching that zone should display their real value —
      // every other subject cell for this student collapses to a dash.
      const zoneMismatch = zoneFilterVal && (!subjFilter) && z !== zoneFilterVal;
      if(zoneMismatch){
        row += `<td class="zone-cell"><span class="zone-pill none">—</span></td>`;
        return;
      }
      const pillLabel = t ? (t.absent ? 'Absent' : `${t.percent}%`) : '—';
      let trendTag = '';
      if(arr.length >= 2){
        const prev = arr[arr.length-2];
        if(t && !t.absent && prev && !prev.absent && t.percent!=null && prev.percent!=null){
          const d = Math.round((t.percent - prev.percent)*10)/10;
          if(d > 0) trendTag = `<span class="delta-tag up">▲+${d}</span>`;
          else if(d < 0) trendTag = `<span class="delta-tag down">▼${d}</span>`;
          else trendTag = `<span class="delta-tag flat">·0</span>`;
        }
      }
      const dots = arr.map(tt=>{
        const zz = zoneOf(tt.percent, tt.absent);
        return `<span class="d ${zz||'none'}" title="${escapeHtml(tt.test)}: ${tt.absent?'Absent':(tt.percent+'%')}"></span>`;
      }).join('');
      row += `<td class="zone-cell">
        <span class="zone-pill ${z||'none'}">${ZONE_EMOJI[z]||''} ${pillLabel}</span>${trendTag}
        <div class="trend-dots">${dots}</div>
      </td>`;
    });
    return `<tr data-sid="${st.id}">${row}</tr>`;
  }).join('');

  renderTransitionCards(def, store);
  renderCharts(def, store);
  renderMovers(def, store);
  renderInsights(def, store);
}

/* ---- 010_zone-transition-report.js ---- */

/* ===================== ZONE TRANSITION REPORT ===================== */
function classifyTransition(tests){
  const zones = tests.map(t=>zoneOf(t.percent, t.absent)).filter(z=>z && z!=='grey');
  if(zones.length < 2) return null;
  const first = zones[0], last = zones[zones.length-1];
  const allSame = zones.every(z=>z===zones[0]);
  if(allSame) return {key:`stay-${zones[0]}`, label:`Stayed ${ZONE_LABEL[zones[0]]} Throughout`};
  if(ZONE_RANK[last] > ZONE_RANK[first]) return {key:'improved', label:`${ZONE_LABEL[first]} → ${ZONE_LABEL[last]} (Improved)`};
  if(ZONE_RANK[last] < ZONE_RANK[first]) return {key:'declined', label:`${ZONE_LABEL[first]} → ${ZONE_LABEL[last]} (Declined)`};
  return {key:'mixed', label:'Fluctuating'};
}

function renderTransitionCards(def, store){
  const subj = document.getElementById('reportSubjectSelect').value || def.subjects[0];
  const groups = {};
  store.students.forEach(st=>{
    const arr = ((st.tests||{})[subj]) || [];
    const c = classifyTransition(arr);
    if(!c) return;
    if(!groups[c.key]) groups[c.key] = {label:c.label, names:[]};
    groups[c.key].names.push({name:st.name, id:st.id});
  });
  const keys = Object.keys(groups);
  if(!keys.length){
    document.getElementById('transitionCardsWrap').innerHTML = `<div class="card">
      <h4>Not enough data yet</h4>
      <div class="empty">Need at least two tests recorded for ${escapeHtml(subj)} to show zone transitions.</div>
      <button class="ghost small" id="transitionImportBtn" style="margin-top:8px;">Import Test</button>
    </div>`;
    const btn = document.getElementById('transitionImportBtn');
    if(btn) btn.addEventListener('click', ()=>{
      document.getElementById('importPanel').classList.add('open');
      document.getElementById('importPanel').scrollIntoView({behavior:'smooth', block:'start'});
    });
    return;
  }
  document.getElementById('transitionCardsWrap').innerHTML = keys.map(k=>{
    const g = groups[k];
    const cls = k==='improved' ? 'card' : (k==='declined' ? 'card' : 'card');
    return `<div class="${cls}">
      <h4>${escapeHtml(g.label)}</h4>
      <div class="count">${g.names.length}</div>
      <ul>${g.names.slice(0,10).map(n=>`<li class="person-link" data-sid="${n.id}">${escapeHtml(n.name)}</li>`).join('')}${g.names.length>10?`<li class="empty">+${g.names.length-10} more</li>`:''}</ul>
    </div>`;
  }).join('');
}

/* ---- 011_charts-hand-rolled-svg-offline-safe.js ---- */

/* ===================== CHARTS (hand-rolled SVG, offline-safe) ===================== */
function lineChartSVG(labels, values, color, stats){
  const w=520, h=200, pad=32;
  const max=100, min=0;
  const stepX = labels.length>1 ? (w-2*pad)/(labels.length-1) : 0;
  const pts = values.map((v,i)=>{
    if(v==null) return null;
    const x = pad + i*stepX;
    const y = h-pad - ((v-min)/(max-min))*(h-2*pad);
    return [x,y];
  });
  let path = '';
  pts.forEach((p,i)=>{
    if(!p) return;
    path += (path==='' ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ' ';
  });
  const gridLines = [0,25,50,75,100].map(v=>{
    const y = h-pad-(v/100)*(h-2*pad);
    return `<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="#ded7c6" stroke-width="1"/>
      <text x="${pad-6}" y="${y+3}" font-size="9" fill="#7a7367" text-anchor="end" font-family="monospace">${v}</text>`;
  }).join('');
  const dots = pts.map((p,i)=>{
    if(!p) return '';
    const s = (stats && stats[i]) || {};
    const tip = `${escapeHtml(labels[i])}\nAvg: ${values[i]}%${s.high!=null ? `\nHigh: ${s.high}%` : ''}${s.low!=null ? `\nLow: ${s.low}%` : ''}${s.passRate!=null ? `\nPass rate: ${s.passRate}%` : ''}`;
    return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="6" fill="${color}" opacity="0" ><title>${escapeHtml(tip)}</title></circle>
      <circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${color}"><title>${escapeHtml(tip)}</title></circle>`;
  }).join('');
  const xLabels = labels.map((l,i)=>{
    const x = pad+i*stepX;
    return `<text x="${x}" y="${h-8}" font-size="9" fill="#7a7367" text-anchor="middle" font-family="sans-serif">${escapeHtml(l).slice(0,14)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;">
    ${gridLines}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
    ${dots}${xLabels}
  </svg>`;
}

function barChartSVG(zoneCounts){
  const order = ['green','blue','yellow','pink','red','grey'];
  const colors = {green:'#3f7150',blue:'#3a6ea8',yellow:'#c98f2b',pink:'#b0567a',red:'#b5433a',grey:'#8a8478'};
  const w=520, h=200, pad=32;
  const max = Math.max(1, ...order.map(k=>zoneCounts[k]||0));
  const bw = (w-2*pad)/order.length;
  const bars = order.map((k,i)=>{
    const v = zoneCounts[k]||0;
    const bh = (v/max)*(h-2*pad-16);
    const x = pad + i*bw + bw*0.2;
    const y = h-pad-bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw*0.6).toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors[k]}" rx="2"/>
      <text x="${(x+bw*0.3).toFixed(1)}" y="${h-pad+12}" font-size="9" fill="#7a7367" text-anchor="middle" font-family="sans-serif">${ZONE_LABEL[k]}</text>
      <text x="${(x+bw*0.3).toFixed(1)}" y="${(y-5).toFixed(1)}" font-size="10" fill="#1c2b45" text-anchor="middle" font-family="monospace">${v}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;">
    <line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="#1c2b45" stroke-width="1"/>
    ${bars}
  </svg>`;
}

/* ---- 012_hero-metrics.js ---- */

/* ===================== HERO METRICS ===================== */
function renderHeroMetrics(def, store){
  const host = document.getElementById('heroStrip');
  const total = store.students.length;
  if(total === 0){
    host.innerHTML = `<div class="hero-metric"><div class="hm-label">Students</div><div class="hm-value">0</div></div>`;
    return;
  }

  // Class average: mean of each subject's latest-test class average
  const subjAvgs = def.subjects.map(s=>subjectClassAverage(store, s)).filter(v=>v!=null);
  const classAvg = subjAvgs.length ? Math.round((subjAvgs.reduce((a,b)=>a+b,0)/subjAvgs.length)*10)/10 : null;

  let improving = 0, atRisk = 0;
  store.students.forEach(st=>{
    let isImproving = false, isAtRisk = false;
    def.subjects.forEach(subj=>{
      const arr = (st.tests||{})[subj] || [];
      const c = classifyTransition(arr);
      if(c && c.key === 'improved') isImproving = true;
      const t = latestTest(st, subj);
      if(t && zoneOf(t.percent, t.absent) === 'red') isAtRisk = true;
    });
    if(isImproving) improving++;
    if(isAtRisk) atRisk++;
  });

  let strongest = null, weakest = null;
  def.subjects.forEach(s=>{
    const avg = subjectClassAverage(store, s);
    if(avg == null) return;
    if(!strongest || avg > strongest.avg) strongest = {subj:s, avg};
    if(!weakest || avg < weakest.avg) weakest = {subj:s, avg};
  });

  host.innerHTML = `
    <div class="hero-metric"><div class="hm-label">Students</div><div class="hm-value" data-count="${total}">0</div></div>
    <div class="hero-metric accent"><div class="hm-label">Class Average</div><div class="hm-value" ${classAvg!=null?`data-count="${classAvg}" data-suffix="%"`:''}>${classAvg!=null?'0%':'—'}</div></div>
    <div class="hero-metric good"><div class="hm-label">Improving</div><div class="hm-value" data-count="${improving}">0</div></div>
    <div class="hero-metric warn"><div class="hm-label">At Risk</div><div class="hm-value" data-count="${atRisk}">0</div></div>
    <div class="hero-metric gold"><div class="hm-label">Strongest Subject</div><div class="hm-value small">${strongest?`${escapeHtml(strongest.subj)} (${strongest.avg}%)`:'—'}</div></div>
    <div class="hero-metric"><div class="hm-label">Weakest Subject</div><div class="hm-value small">${weakest?`${escapeHtml(weakest.subj)} (${weakest.avg}%)`:'—'}</div></div>
  `;
  animateCounters(host);
}

/* ---- 013_top-movers-needs-attention.js ---- */

/* ===================== TOP MOVERS / NEEDS ATTENTION ===================== */
function renderMovers(def, store){
  const wrap = document.getElementById('moversWrap');
  const movers = []; // {name, subj, delta}
  const attention = []; // {name, reason}

  store.students.forEach(st=>{
    let worstAttentionReason = null;
    def.subjects.forEach(subj=>{
      const arr = (st.tests||{})[subj] || [];
      if(arr.length >= 2){
        const last = arr[arr.length-1], prev = arr[arr.length-2];
        if(!last.absent && !prev.absent && last.percent!=null && prev.percent!=null){
          const d = Math.round((last.percent - prev.percent)*10)/10;
          movers.push({name:st.name, rollNo:st.rollNo, id:st.id, subj, delta:d});
          if(d <= -10 && !worstAttentionReason) worstAttentionReason = `${subj} dropped ${Math.abs(d)}% since last test`;
        }
      }
      const absentCount = arr.filter(t=>t.absent).length;
      if(absentCount >= 2 && !worstAttentionReason) worstAttentionReason = `Absent ${absentCount}× in ${subj}`;
      const last = arr.length ? arr[arr.length-1] : null;
      const prevZone = arr.length >= 2 ? zoneOf(arr[arr.length-2].percent, arr[arr.length-2].absent) : null;
      const lastZone = last ? zoneOf(last.percent, last.absent) : null;
      if(lastZone === 'red' && prevZone && prevZone !== 'red' && !worstAttentionReason){
        worstAttentionReason = `Entered Red zone in ${subj}`;
      }
    });
    if(worstAttentionReason) attention.push({name:st.name, rollNo:st.rollNo, id:st.id, reason:worstAttentionReason});
  });

  movers.sort((a,b)=>b.delta-a.delta);
  const topMovers = movers.slice(0,8);

  wrap.innerHTML = `
    <div class="card">
      <h4>Top Movers</h4>
      <div class="count">${topMovers.length}</div>
      <ul>${topMovers.length ? topMovers.map(m=>`<li class="person-link" data-sid="${m.id}">${escapeHtml(m.name)}${m.rollNo!=null&&m.rollNo!==''?` <span class="extra-detail">(Roll ${escapeHtml(m.rollNo)})</span>`:''} — ${escapeHtml(m.subj)} <span class="delta-tag ${m.delta>0?'up':m.delta<0?'down':'flat'}">${m.delta>0?'▲+':m.delta<0?'▼':'·'}${m.delta}</span></li>`).join('') : '<li class="empty">No test-to-test comparisons yet.</li>'}</ul>
    </div>
    <div class="card">
      <h4>Needs Attention</h4>
      <div class="count">${attention.length}</div>
      <ul>${attention.length ? attention.slice(0,10).map(a=>`<li class="person-link" data-sid="${a.id}">${escapeHtml(a.name)}${a.rollNo!=null&&a.rollNo!==''?` <span class="extra-detail">(Roll ${escapeHtml(a.rollNo)})</span>`:''} — ${escapeHtml(a.reason)}</li>`).join('') + (attention.length>10?`<li class="empty">+${attention.length-10} more</li>`:'') : '<li class="empty">Nobody flagged right now.</li>'}</ul>
    </div>
  `;
}

/* ---- 014_auto-generated-insights.js ---- */

/* ===================== AUTO-GENERATED INSIGHTS ===================== */
function renderInsights(def, store){
  const wrap = document.getElementById('insightsWrap');
  const facts = [];

  def.subjects.forEach(subj=>{
    const {testOrder, avgs} = subjectTestOrderAndStats(store, subj);
    if(testOrder.length >= 2){
      const last = avgs[avgs.length-1], prev = avgs[avgs.length-2];
      if(last != null && prev != null){
        const d = Math.round((last-prev)*10)/10;
        if(Math.abs(d) >= 0.1){
          facts.push({icon: d<0 ? '📉' : '📈', text:`${subj} average ${d<0?'dropped':'rose'} ${Math.abs(d)}% since ${testOrder[testOrder.length-2]}.`});
        }
      }
    }
    const zc = zoneCountsFor(store, subj, testOrder.length ? testOrder[testOrder.length-1] : null);
    const totalGraded = Object.values(zc).reduce((a,b)=>a+b,0) - zc.grey;
    if(totalGraded > 0 && zc.red > 0){
      const share = Math.round((zc.red/totalGraded)*1000)/10;
      if(share >= 20) facts.push({icon:'⚠️', text:`${subj}: ${zc.red} student${zc.red===1?'':'s'} (${share}%) currently in the Red zone.`});
    }
    if(zc.grey >= 2){
      facts.push({icon:'⚪', text:`${subj}: ${zc.grey} students marked Absent on the latest test.`});
    }
  });

  if(!facts.length){
    wrap.innerHTML = `<li class="empty">Not enough data yet to generate insights — import a second test for a subject to see trends.</li>`;
    return;
  }
  wrap.innerHTML = facts.slice(0,12).map(f=>`<li><span class="ins-icon">${f.icon}</span><span>${f.text}</span></li>`).join('');
}

function subjectTestOrderAndStats(store, subj){
  const testOrder = [];
  store.students.forEach(st=>{
    ((st.tests||{})[subj]||[]).forEach(t=>{ if(!testOrder.includes(t.test)) testOrder.push(t.test); });
  });
  const avgs = [], stats = [];
  testOrder.forEach(tn=>{
    const vals = [];
    let passCount = 0, totalCount = 0;
    store.students.forEach(st=>{
      const arr = (st.tests||{})[subj]||[];
      const entry = arr.find(t=>t.test===tn);
      if(!entry) return;
      totalCount++;
      if(!entry.absent && entry.percent!=null){
        vals.push(entry.percent);
        if(entry.percent >= 60) passCount++;
      }
    });
    const avg = vals.length ? Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*10)/10 : null;
    avgs.push(avg);
    stats.push({
      high: vals.length ? Math.max(...vals) : null,
      low: vals.length ? Math.min(...vals) : null,
      passRate: totalCount ? Math.round((passCount/totalCount)*1000)/10 : null
    });
  });
  return {testOrder, avgs, stats};
}

function zoneCountsFor(store, subj, testName){
  const zoneCounts = {green:0,blue:0,yellow:0,pink:0,red:0,grey:0};
  store.students.forEach(st=>{
    const arr = (st.tests||{})[subj] || [];
    const t = testName ? arr.find(tt=>tt.test===testName) : (arr.length ? arr[arr.length-1] : null);
    if(!t) return;
    const z = zoneOf(t.percent, t.absent);
    if(z) zoneCounts[z]++;
  });
  return zoneCounts;
}

function renderCharts(def, store){
  const subj = document.getElementById('chartSubjectSelect').value || def.subjects[0];
  const {testOrder, avgs, stats} = subjectTestOrderAndStats(store, subj);

  if(testOrder.length === 0){
    document.getElementById('lineChartHost').innerHTML = `<div class="hint">No test data yet for ${escapeHtml(subj)}. Import a test to see a trend.</div>`;
  } else if(testOrder.length === 1){
    document.getElementById('lineChartHost').innerHTML = `<div class="hint">Only one test available — import another to see a trend.</div>`;
  } else {
    document.getElementById('lineChartHost').innerHTML = lineChartSVG(testOrder, avgs, '#4a6fa5', stats);
  }
  // ===== Compare against =====
  const compareMode = document.getElementById('compareAgainstSelect').value;
  const compareSectionSel = document.getElementById('compareSectionSelect');
  compareSectionSel.style.display = compareMode === 'section' ? 'inline-block' : 'none';
  const compareRowWrap = document.getElementById('compareRowWrap');
  const latestTestName = testOrder.length ? testOrder[testOrder.length-1] : null;
  const classAvgLatest = avgs.length ? avgs[avgs.length-1] : null;
  let compareLabel = '', compareVal = null;
  if(compareMode === 'previous' && avgs.length >= 2){
    compareLabel = 'Previous test';
    compareVal = avgs[avgs.length-2];
  } else if(compareMode === 'section' && compareSectionSel.value){
    const otherDef = SECTION_BY_KEY[compareSectionSel.value];
    const otherStore = ensureSection(compareSectionSel.value);
    if(otherDef.subjects.includes(subj)){
      compareLabel = otherDef.label;
      compareVal = subjectClassAverage(otherStore, subj);
    } else {
      compareLabel = otherDef.label + ' (no ' + subj + ')';
    }
  } else if(compareMode === 'school'){
    const vals = [];
    SECTION_DEFS.forEach(d=>{
      if(!d.subjects.includes(subj)) return;
      const s = ensureSection(d.key);
      const a = subjectClassAverage(s, subj);
      if(a != null) vals.push(a);
    });
    compareLabel = 'All sections average';
    compareVal = vals.length ? Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*10)/10 : null;
  }
  if(classAvgLatest == null || compareVal == null){
    compareRowWrap.innerHTML = compareLabel ? `<div class="hint">Not enough data to compare against ${escapeHtml(compareLabel)} yet.</div>` : '';
  } else {
    const d = Math.round((classAvgLatest - compareVal)*10)/10;
    const deltaHtml = d > 0 ? `<span class="delta-tag up">▲+${d}</span>` : d < 0 ? `<span class="delta-tag down">▼${d}</span>` : `<span class="delta-tag flat">·0</span>`;
    compareRowWrap.innerHTML = `<div class="compare-row">
        <span>This section: <b>${classAvgLatest}%</b></span>
        <div class="cr-bar"><div class="cr-fill" style="width:${Math.min(100,classAvgLatest)}%"></div><div class="cr-fill bench" style="width:${Math.min(100,compareVal)}%"></div></div>
        <span>${escapeHtml(compareLabel)}: <b>${compareVal}%</b> ${deltaHtml}</span>
      </div>`;
  }

  // ===== Zone distribution + deltas =====
  const zoneCounts = zoneCountsFor(store, subj, latestTestName);
  document.getElementById('barChartHost').innerHTML = barChartSVG(zoneCounts);

  const zoneOrder = ['green','blue','yellow','pink','red','grey'];
  const colors = {green:'var(--green)',blue:'var(--blue)',yellow:'var(--yellow)',pink:'var(--pink)',red:'var(--red)',grey:'var(--grey)'};
  let prevZoneCounts = null;
  if(testOrder.length >= 2) prevZoneCounts = zoneCountsFor(store, subj, testOrder[testOrder.length-2]);
  document.getElementById('zoneListHost').innerHTML = zoneOrder.map(z=>{
    const v = zoneCounts[z]||0;
    let delta = '';
    if(prevZoneCounts){
      const d = v - (prevZoneCounts[z]||0);
      if(d > 0) delta = `<span class="delta-tag up">▲+${d}</span>`;
      else if(d < 0) delta = `<span class="delta-tag down">▼${d}</span>`;
      else delta = `<span class="delta-tag flat">·0</span>`;
    }
    return `<div class="zone-list-row"><span class="zl-dot" style="background:${colors[z]}"></span><span class="zl-label">${ZONE_LABEL[z]}</span><span class="zl-count">${v}</span>${delta}</div>`;
  }).join('');
  document.getElementById('zoneDeltaHost').innerHTML = prevZoneCounts
    ? `<span class="tooltip-hint" style="display:inline;">vs ${escapeHtml(testOrder[testOrder.length-2])}</span>` : '';
}

/* ---- 015_save-load-workspace.js ---- */

/* ===================== SAVE / LOAD WORKSPACE ===================== */
function serializeWorkspace(){ return JSON.stringify(workspace, null, 0); }

async function autoSaveToHandle(){
  if(!fileHandle) return;
  try{
    const writable = await fileHandle.createWritable();
    await writable.write(serializeWorkspace());
    await writable.close();
    dirty = false;
    updateStatusLine();
  }catch(e){
    console.error('auto-save failed', e);
  }
}

async function connectPendriveFile(){
  if(!window.showSaveFilePicker){
    showToast('Your browser doesn\'t support direct file connection (works in Chrome/Edge). Use Download/Upload Workspace instead.', 'warning', 5000);
    return;
  }
  try{
    const handle = await window.showOpenFilePicker({
      types:[{description:'Workspace file', accept:{'application/json':['.json']}}],
      excludeAcceptAllOption:false, multiple:false
    }).then(h=>h[0]).catch(async ()=>{
      // user may want to create a new one
      return await window.showSaveFilePicker({suggestedName:'data.json', types:[{description:'Workspace file', accept:{'application/json':['.json']}}]});
    });
    fileHandle = handle;
    // try to read existing content
    try{
      const file = await fileHandle.getFile();
      const text = await file.text();
      if(text && text.trim()){
        const parsed = JSON.parse(text);
        if(parsed && parsed.sections){ workspace = parsed; }
      }
    }catch(e){ /* new/empty file, ignore */ }
    dirty = false;
    updateStatusLine();
    refreshAllUI();
    showToast('Connected — changes will auto-save to this file as you work.', 'success');
  }catch(e){
    if(e.name !== 'AbortError') console.error(e);
  }
}

function downloadWorkspace(){
  const blob = new Blob([serializeWorkspace()], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url; a.download = `workspace_${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  dirty = false;
  updateStatusLine();
  showToast('✓ Workspace downloaded.', 'success');
}

function uploadWorkspace(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      if(!parsed || !parsed.sections) throw new Error('not a valid workspace file');
      workspace = parsed;
      workspace.sectionRenames = workspace.sectionRenames || {};
      workspace.teacherOverrides = workspace.teacherOverrides || {};
      applyPersistedSectionRenames();
      populateSectionSelects();
      dirty = false;
      updateStatusLine();
      updateLastUpdatedNow();
      refreshAllUI();
      showToast('✓ Workspace loaded.', 'success');
    }catch(e){
      showToast('Could not read that file — it doesn\'t look like a workspace file saved by this tool.', 'error', 5000);
    }
  };
  reader.readAsText(file);
}

window.addEventListener('beforeunload', (e)=>{
  if(dirty){ e.preventDefault(); e.returnValue=''; }
});

/* ---- 016_student-detail-drawer.js ---- */

/* ===================== STUDENT DETAIL DRAWER ===================== */
function findStudentById(id){
  const store = ensureSection(currentSectionKey());
  return store.students.find(s=>s.id===id);
}
// Searches every section for a student by id. Used for cross-section contexts
// (Overall/Section Summary lists) where the student may not be in the
// currently-selected section dropdown.
function findStudentAnywhere(id, sectionKeyHint){
  if(sectionKeyHint){
    const store = workspace.sections[sectionKeyHint];
    const s = store && store.students.find(x=>x.id===id);
    if(s) return {student:s, def: SECTION_BY_KEY[sectionKeyHint]};
  }
  for(const def of SECTION_DEFS){
    const store = workspace.sections[def.key];
    if(!store) continue;
    const s = store.students.find(x=>x.id===id);
    if(s) return {student:s, def};
  }
  return null;
}

/* ---- 017_pinned-favourite-students.js ---- */

/* ===================== PINNED FAVOURITE STUDENTS ===================== */
// Toggles the `pinned` flag on a student (searched across all sections so this
// works from the table, the drawer, or the favourites panel itself). Persists
// naturally as part of the student object inside `workspace`.
function togglePinStudent(id, sectionKeyHint){
  const found = findStudentAnywhere(id, sectionKeyHint);
  if(!found) return;
  found.student.pinned = !found.student.pinned;
  markDirty();
  renderTable();
  renderPinnedPanel();
  const overlay = document.getElementById('studentDrawerOverlay');
  if(overlay.classList.contains('open') && document.getElementById('drawerStudentName').dataset.sid === id){
    updateDrawerPinButton(found.student);
  }
  showToast(found.student.pinned ? `★ ${found.student.name} pinned to favourites.` : `☆ ${found.student.name} unpinned.`, 'success', 2500);
}

function updateDrawerPinButton(student){
  const btn = document.getElementById('drawerPinBtn');
  if(!btn) return;
  btn.classList.toggle('pinned', !!student.pinned);
  btn.innerHTML = student.pinned ? '★ Pinned' : '☆ Pin Student';
  btn.title = student.pinned ? 'Unpin this student' : 'Pin this student for quick access';
}

// Renders the dedicated favourites panel: a one-click-access strip of chips
// for every pinned student across all sections. Hidden entirely when nobody
// is pinned.
function renderPinnedPanel(){
  const panel = document.getElementById('pinnedPanel');
  const list = document.getElementById('pinnedPanelList');
  if(!panel || !list) return;
  const pinned = [];
  SECTION_DEFS.forEach(def=>{
    const store = workspace.sections[def.key];
    if(!store) return;
    store.students.forEach(s=>{ if(s.pinned) pinned.push({student:s, def}); });
  });
  if(!pinned.length){ panel.style.display = 'none'; list.innerHTML = ''; return; }
  panel.style.display = 'block';
  list.innerHTML = pinned.map(({student, def})=>`
    <span class="pinned-chip" data-sid="${student.id}" data-skey="${def.key}" role="button" tabindex="0" title="Open ${escapeHtml(student.name)}'s profile">
      ★ ${escapeHtml(student.name)}
      <span class="unpin-x" data-unpin-sid="${student.id}" data-unpin-skey="${def.key}" title="Unpin ${escapeHtml(student.name)}">✕</span>
    </span>`).join('');
}

document.getElementById('pinnedPanelList').addEventListener('click', (e)=>{
  const x = e.target.closest('.unpin-x');
  if(x){
    togglePinStudent(x.getAttribute('data-unpin-sid'), x.getAttribute('data-unpin-skey'));
    return;
  }
  const chip = e.target.closest('.pinned-chip[data-sid]');
  if(!chip) return;
  openStudentDrawerById(chip.getAttribute('data-sid'), chip.getAttribute('data-skey'));
});

document.getElementById('drawerPinBtn').addEventListener('click', ()=>{
  const nameEl = document.getElementById('drawerStudentName');
  const sid = nameEl.dataset.sid;
  const skey = nameEl.dataset.skey;
  if(sid) togglePinStudent(sid, skey);
});

function openStudentDrawerById(id, sectionKeyHint){
  const found = findStudentAnywhere(id, sectionKeyHint);
  if(!found) return;
  const {student, def} = found;

  const drawerNameEl = document.getElementById('drawerStudentName');
  drawerNameEl.innerHTML = avatarHtml(student.name) + escapeHtml(student.name);
  drawerNameEl.dataset.sid = student.id;
  drawerNameEl.dataset.skey = def.key;
  updateDrawerPinButton(student);
  const metaBits = [];
  if(student.rollNo) metaBits.push(`Roll ${student.rollNo}`);
  if(student.matric != null) metaBits.push(`Matric ${student.matric}`);
  metaBits.push(def.label);
  document.getElementById('drawerStudentMeta').textContent = metaBits.join(' · ');

  let bodyHtml = '';
  def.subjects.forEach(subj=>{
    const arr = (student.tests||{})[subj] || [];
    const t = arr.length ? arr[arr.length-1] : null;
    const z = t ? zoneOf(t.percent, t.absent) : null;
    const pillLabel = t ? (t.absent ? 'Absent' : `${t.percent}%`) : '—';
    let trendTag = '';
    if(arr.length >= 2){
      const prev = arr[arr.length-2];
      if(t && !t.absent && prev && !prev.absent && t.percent!=null && prev.percent!=null){
        const d = Math.round((t.percent - prev.percent)*10)/10;
        if(d > 0) trendTag = `<span class="delta-tag up">▲+${d}</span>`;
        else if(d < 0) trendTag = `<span class="delta-tag down">▼${d}</span>`;
        else trendTag = `<span class="delta-tag flat">·0</span>`;
      }
    }
    const absentCount = arr.filter(tt=>tt.absent).length;
    const dots = arr.map(tt=>{
      const zz = zoneOf(tt.percent, tt.absent);
      return `<span class="d ${zz||'none'}" title="${escapeHtml(tt.test)}: ${tt.absent?'Absent':(tt.percent+'%')}"></span>`;
    }).join('');
    bodyHtml += `<div class="drawer-subject-row">
      <div>
        <div class="drawer-subject-name">${escapeHtml(subj)}</div>
        <div class="trend-dots" style="margin-top:5px;">${dots}</div>
      </div>
      <div style="text-align:right;">
        <span class="zone-pill ${z||'none'}">${ZONE_EMOJI[z]||''} ${pillLabel}</span>${trendTag}
        ${absentCount ? `<div class="hint" style="margin-top:3px;">${absentCount} absence${absentCount>1?'s':''} recorded</div>` : ''}
      </div>
    </div>`;
  });
  document.getElementById('drawerBody').innerHTML = renderSupportSectionHtml(student, def) + (bodyHtml || `<div class="hint">No subjects configured for this section.</div>`);

  document.getElementById('studentDrawerOverlay').classList.add('open');
}

function closeStudentDrawer(){
  document.getElementById('studentDrawerOverlay').classList.remove('open');
}

/* ---- 018_stat-list-drawer-click-a-count-see-who-s-in-it.js ---- */

/* ===================== STAT LIST DRAWER (click a count, see who's in it) ===================== */
// students: array of {id, name, sectionKey, sectionLabel, overall, extra}
let lastStatListData = null;
function openStatListDrawer(title, subtitle, students){
  lastStatListData = {title, subtitle, students};
  document.getElementById('statListTitle').textContent = title;
  document.getElementById('statListSubtitle').textContent = subtitle || '';
  const body = document.getElementById('statListBody');
  if(!students.length){
    body.innerHTML = `<div class="hint" style="padding:12px;">No students match this.</div>`;
  } else {
    body.innerHTML = students.map(s=>{
      const z = s.overall!=null ? zoneOf(s.overall, false) : null;
      const pill = s.overall!=null ? `<span class="zone-pill ${z}">${s.overall}%</span>` : '';
      return `<div class="stat-list-row" data-sid="${s.id}" data-skey="${s.sectionKey}">
        <div><div class="slr-name">${escapeHtml(s.name)}</div><div class="slr-meta">${s.rollNo!=null&&s.rollNo!==''?`Roll ${escapeHtml(s.rollNo)} · `:''}${escapeHtml(s.sectionLabel||'')}</div></div>
        ${pill}
      </div>`;
    }).join('');
  }
  document.getElementById('statListOverlay').classList.add('open');
}
function closeStatListDrawer(){
  document.getElementById('statListOverlay').classList.remove('open');
}
document.getElementById('statListCloseBtn').addEventListener('click', closeStatListDrawer);
document.getElementById('statListOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'statListOverlay') closeStatListDrawer();
});
document.getElementById('statListBody').addEventListener('click', (e)=>{
  const row = e.target.closest('.stat-list-row[data-sid]');
  if(!row) return;
  closeStatListDrawer();
  openStudentDrawerById(row.getAttribute('data-sid'), row.getAttribute('data-skey'));
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeStatListDrawer();
});
document.getElementById('drawerCloseBtn').addEventListener('click', closeStudentDrawer);
document.getElementById('studentDrawerOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'studentDrawerOverlay') closeStudentDrawer();
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeStudentDrawer();
});

// Clicking a table row opens that student's drawer; clicking the pin star toggles pin instead
document.getElementById('tableBody').addEventListener('click', (e)=>{
  const star = e.target.closest('.pin-star[data-pin-sid]');
  if(star){
    togglePinStudent(star.getAttribute('data-pin-sid'), currentSectionKey());
    return;
  }
  const tr = e.target.closest('tr[data-sid]');
  if(!tr) return;
  openStudentDrawerById(tr.getAttribute('data-sid'), currentSectionKey());
});

// Clicking a name inside Movers / Needs Attention / Zone Transition cards, the Top 10
// Overall table, or a stat-list drawer opens the same per-student drawer.
document.addEventListener('click', (e)=>{
  if(e.target.closest('#tableBody')) return; // handled by the dedicated listener above
  const link = e.target.closest('.person-link[data-sid], tr[data-sid]');
  if(!link) return;
  openStudentDrawerById(link.getAttribute('data-sid'), link.getAttribute('data-skey') || null);
});

/* ---- 019_ui-wiring.js ---- */

/* ===================== UI WIRING ===================== */
function refreshAllUI(){
  populateSubjectFilter();
  renderTable();
  renderPinnedPanel();
  if(overallSummaryOpen) renderOverallSummary();
  if(sectionSummaryOpen) renderSectionSummary();
  if(teacherReportOpen) renderTeacherReport();
}

/* ---- 020_overall-summary-cross-section-executive-dashboard.js ---- */

/* ===================== OVERALL SUMMARY (cross-section executive dashboard) ===================== */
let overallSummaryOpen = false;
let sectionSummaryOpen = false;
let teacherReportOpen = false;

function studentOverallAverage(st, def){
  const pcts = def.subjects.map(subj=>{
    const t = latestTest(st, subj);
    return (t && !t.absent && t.percent!=null) ? t.percent : null;
  }).filter(v=>v!=null);
  if(!pcts.length) return null;
  return Math.round((pcts.reduce((a,b)=>a+b,0)/pcts.length)*10)/10;
}
function gradeFor(pct){
  if(pct==null) return '—';
  if(pct>=90) return 'A+'; if(pct>=80) return 'A'; if(pct>=70) return 'B';
  if(pct>=60) return 'C'; if(pct>=50) return 'D'; return 'F';
}
function studentOverallTrend(st, def){
  let delta = null, n = 0;
  def.subjects.forEach(subj=>{
    const arr = (st.tests||{})[subj] || [];
    if(arr.length>=2){
      const last=arr[arr.length-1], prev=arr[arr.length-2];
      if(!last.absent && !prev.absent && last.percent!=null && prev.percent!=null){
        delta = (delta||0) + (last.percent - prev.percent); n++;
      }
    }
  });
  if(!n) return null;
  return Math.round((delta/n)*10)/10;
}

function collectOverallRoster(){
  // {students:[{name,id,sectionKey,sectionLabel,def,st,overall}], sections:[{def,store,avg,passRate,students,top}]}
  const students = [];
  const sections = [];
  SECTION_DEFS.forEach(def=>{
    const store = workspace.sections[def.key];
    if(!store || !store.students.length) return;
    let sumAvg=0, cntAvg=0, passCount=0, passTotal=0, top=null;
    store.students.forEach(st=>{
      const overall = studentOverallAverage(st, def);
      if(overall!=null){
        students.push({name:st.name, rollNo:st.rollNo, id:st.id, sectionKey:def.key, sectionLabel:def.label, def, st, overall, trend: studentOverallTrend(st, def)});
        sumAvg += overall; cntAvg++;
        if(!top || overall > top.overall) top = {name:st.name, rollNo:st.rollNo, overall};
      }
      def.subjects.forEach(subj=>{
        const t = latestTest(st, subj);
        if(t && !t.absent && t.percent!=null){ passTotal++; if(t.percent>=50) passCount++; }
      });
    });
    sections.push({
      def, store,
      avg: cntAvg ? Math.round((sumAvg/cntAvg)*10)/10 : null,
      passRate: passTotal ? Math.round((passCount/passTotal)*1000)/10 : null,
      top, studentCount: store.students.length
    });
  });
  return {students, sections};
}

function subjectWiseToppers(){
  // subject name -> best {name, score, percent, sectionLabel}
  const bySubject = {};
  SECTION_DEFS.forEach(def=>{
    const store = workspace.sections[def.key];
    if(!store) return;
    def.subjects.forEach(subj=>{
      store.students.forEach(st=>{
        const t = latestTest(st, subj);
        if(!t || t.absent || t.percent==null) return;
        if(!bySubject[subj] || t.percent > bySubject[subj].percent){
          bySubject[subj] = {name:st.name, rollNo:st.rollNo, percent:t.percent, obtained:t.obtained, max:t.max, sectionLabel:def.label};
        }
      });
    });
  });
  return bySubject;
}

function renderOverallSummary(){
  const {students, sections} = collectOverallRoster();
  const totalStudents = students.length;
  const totalSubjects = new Set(SECTION_DEFS.flatMap(d=>d.subjects)).size;
  const overallAvgAll = totalStudents ? Math.round((students.reduce((a,b)=>a+b.overall,0)/totalStudents)*10)/10 : null;
  const highest = students.reduce((m,s)=>(!m||s.overall>m.overall)?s:m, null);
  const critical = students.filter(s=>s.overall!=null && s.overall<50);
  const exceptional = students.filter(s=>s.overall!=null && s.overall>=90);
  const passCount = students.filter(s=>s.overall!=null && s.overall>=50).length;
  const passRateAll = totalStudents ? Math.round((passCount/totalStudents)*1000)/10 : null;

  document.getElementById('osQuickStats').innerHTML = totalStudents === 0 ? `
    <div class="hero-metric"><div class="hm-label">Students</div><div class="hm-value">0</div></div>
  ` : `
    <div class="hero-metric"><div class="hm-label">👨‍🎓 Total Students</div><div class="hm-value" data-count="${totalStudents}">0</div></div>
    <div class="hero-metric"><div class="hm-label">📚 Total Subjects</div><div class="hm-value" data-count="${totalSubjects}">0</div></div>
    <div class="hero-metric accent"><div class="hm-label">📈 Overall Average</div><div class="hm-value" data-count="${overallAvgAll}" data-suffix="%">0%</div></div>
    <div class="hero-metric gold"><div class="hm-label">🏆 Highest Percentage</div><div class="hm-value small">${highest?`${escapeHtml(highest.name)} (${highest.overall}%)${rollSectionTag(highest.rollNo, highest.sectionLabel)}`:'—'}</div></div>
    <div class="hero-metric warn clickable" data-filter="critical"><div class="hm-label">⚠ Critical Students</div><div class="hm-value" data-count="${critical.length}">0</div></div>
    <div class="hero-metric good clickable" data-filter="exceptional"><div class="hm-label">⭐ Exceptional Students</div><div class="hm-value" data-count="${exceptional.length}">0</div></div>
    <div class="hero-metric good"><div class="hm-label">📊 Pass Rate</div><div class="hm-value" ${passRateAll!=null?`data-count="${passRateAll}" data-suffix="%"`:''}>${passRateAll!=null?'0%':'—'}</div></div>
    <div class="hero-metric warn"><div class="hm-label">📉 Failure Rate</div><div class="hm-value" ${passRateAll!=null?`data-count="${Math.round((100-passRateAll)*10)/10}" data-suffix="%"`:''}>${passRateAll!=null?'0%':'—'}</div></div>
  `;
  animateCounters(document.getElementById('osQuickStats'));

  // Top 10 overall
  const ranked = students.slice().sort((a,b)=>b.overall-a.overall).slice(0,10);
  document.getElementById('osTopStudentsBody').innerHTML = ranked.length ? ranked.map((s,i)=>{
    const trendTag = s.trend==null ? '<span class="delta-tag flat">—</span>' :
      s.trend>0 ? `<span class="delta-tag up">▲+${s.trend}</span>` :
      s.trend<0 ? `<span class="delta-tag down">▼${s.trend}</span>` : `<span class="delta-tag flat">·0</span>`;
    return `<tr data-sid="${s.id}" data-skey="${s.sectionKey}"><td>${i+1}</td><td class="name-cell">${escapeHtml(s.name)}${s.rollNo!=null&&s.rollNo!==''?` <span class="extra-detail">(Roll ${escapeHtml(s.rollNo)})</span>`:''}</td><td>${escapeHtml(s.sectionLabel)}</td>
      <td><span class="zone-pill ${zoneOf(s.overall,false)}">${s.overall}%</span></td><td>${gradeFor(s.overall)}</td><td>${trendTag}</td></tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px;">No data yet — import results to see the overall dashboard.</td></tr>`;

  // Subject-wise toppers
  const toppers = subjectWiseToppers();
  const subjNames = Object.keys(toppers).sort();
  document.getElementById('osSubjectToppersWrap').innerHTML = subjNames.length ? subjNames.map(subj=>{
    const t = toppers[subj];
    return `<div class="card"><h4>🥇 ${escapeHtml(subj)}</h4>
      <div class="count">${t.percent}%</div>
      <ul><li>${escapeHtml(t.name)}</li><li class="extra-detail">${t.rollNo!=null&&t.rollNo!==''?`Roll ${escapeHtml(t.rollNo)} · `:''}${t.sectionLabel}${t.obtained!=null&&t.max!=null?` · ${t.obtained}/${t.max}`:''}</li></ul>
    </div>`;
  }).join('') : `<div class="card"><div class="empty">No subject data yet.</div></div>`;

  // Section ranking
  const rankedSections = sections.slice().filter(s=>s.avg!=null).sort((a,b)=>b.avg-a.avg);
  document.getElementById('osSectionRankBody').innerHTML = rankedSections.length ? rankedSections.map((s,i)=>`
    <tr><td>${i+1}</td><td class="name-cell">${escapeHtml(s.def.label)}</td>
    <td><span class="zone-pill ${zoneOf(s.avg,false)}">${s.avg}%</span></td>
    <td>${s.passRate!=null?s.passRate+'%':'—'}</td>
    <td>${s.top?`${escapeHtml(s.top.name)}${s.top.rollNo!=null&&s.top.rollNo!==''?` <span class="extra-detail">(Roll ${escapeHtml(s.top.rollNo)})</span>`:''}`:'—'}</td><td>${s.studentCount}</td></tr>
  `).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px;">No section data yet.</td></tr>`;

  // Performance zone cards (all sections combined)
  const zoneOrder = OVERALL_ZONE_ORDER;
  document.getElementById('osZoneCardsWrap').innerHTML = zoneOrder.map(z=>{
    const count = students.filter(s=>s.overall!=null && s.overall>=z.min && s.overall<z.max).length;
    const pct = totalStudents ? Math.round((count/totalStudents)*1000)/10 : 0;
    return `<div class="card clickable" data-filter="zone:${z.key}"><h4>${ZONE_EMOJI[z.key]} ${z.label}</h4>
      <div class="count">${count}</div>
      <ul><li>${z.range}</li><li class="extra-detail">${pct}% of all students</li></ul>
    </div>`;
  }).join('');

  // Smart insights
  const insights = [];
  if(rankedSections.length){
    insights.push(`<b>${escapeHtml(rankedSections[0].def.label)}</b> leads all sections with a ${rankedSections[0].avg}% average.`);
    const hardest = rankedSections.slice().sort((a,b)=>a.avg-b.avg)[0];
    if(hardest && hardest.def.key !== rankedSections[0].def.key){
      insights.push(`<b>${escapeHtml(hardest.def.label)}</b> has the lowest section average at ${hardest.avg}%.`);
    }
  }
  const subjAverages = {};
  Object.keys(toppers).forEach(subj=>{
    const vals = [];
    SECTION_DEFS.forEach(def=>{
      const store = workspace.sections[def.key];
      if(!store || !def.subjects.includes(subj)) return;
      store.students.forEach(st=>{
        const t = latestTest(st, subj);
        if(t && !t.absent && t.percent!=null) vals.push(t.percent);
      });
    });
    if(vals.length) subjAverages[subj] = Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*10)/10;
  });
  const subjEntries = Object.entries(subjAverages);
  if(subjEntries.length){
    const easiest = subjEntries.slice().sort((a,b)=>b[1]-a[1])[0];
    const hardestSubj = subjEntries.slice().sort((a,b)=>a[1]-b[1])[0];
    insights.push(`<b>${escapeHtml(hardestSubj[0])}</b> has the highest failure risk with a ${hardestSubj[1]}% average across all sections.`);
    insights.push(`<b>${escapeHtml(easiest[0])}</b> is the strongest-performing subject with a ${easiest[1]}% average.`);
  }
  if(totalStudents){
    insights.push(`${critical.length} student${critical.length===1?'':'s'} (${Math.round((critical.length/totalStudents)*1000)/10}%) require academic intervention.`);
    insights.push(`${exceptional.length} student${exceptional.length===1?'':'s'} achieved distinction (90%+ overall).`);
  }
  document.getElementById('osInsightsWrap').innerHTML = insights.length ? insights.map(t=>`<li>${t}</li>`).join('') : `<li class="empty">Import results across sections to generate insights.</li>`;

  triggerEntranceAnimations();
}

const OVERALL_ZONE_ORDER = [
  {key:'green', label:'Exceptional', range:'90–100%', min:90, max:101},
  {key:'blue', label:'Good', range:'80–89%', min:80, max:90},
  {key:'yellow', label:'Average', range:'70–79%', min:70, max:80},
  {key:'pink', label:'Weak', range:'60–69%', min:60, max:70},
  {key:'red', label:'Critical', range:'Below 60%', min:-1, max:60},
];

function getOverallFilteredStudents(filterKey){
  const {students} = collectOverallRoster();
  if(filterKey === 'critical') return students.filter(s=>s.overall!=null && s.overall<50).sort((a,b)=>a.overall-b.overall);
  if(filterKey === 'exceptional') return students.filter(s=>s.overall!=null && s.overall>=90).sort((a,b)=>b.overall-a.overall);
  if(filterKey.startsWith('zone:')){
    const zk = filterKey.slice(5);
    const z = OVERALL_ZONE_ORDER.find(x=>x.key===zk);
    if(!z) return [];
    return students.filter(s=>s.overall!=null && s.overall>=z.min && s.overall<z.max).sort((a,b)=>b.overall-a.overall);
  }
  return [];
}

document.getElementById('osQuickStats').addEventListener('click', (e)=>{
  const el = e.target.closest('[data-filter]');
  if(!el) return;
  const key = el.getAttribute('data-filter');
  const list = getOverallFilteredStudents(key);
  const title = key==='critical' ? '⚠ Critical Students (below 50%)' : '⭐ Exceptional Students (90%+)';
  openStatListDrawer(title, `${list.length} student${list.length===1?'':'s'} across all sections`, list);
});
document.getElementById('osZoneCardsWrap').addEventListener('click', (e)=>{
  const el = e.target.closest('[data-filter]');
  if(!el) return;
  const key = el.getAttribute('data-filter');
  const zk = key.slice(5);
  const z = OVERALL_ZONE_ORDER.find(x=>x.key===zk);
  const list = getOverallFilteredStudents(key);
  openStatListDrawer(`${ZONE_EMOJI[zk]} ${z.label} (${z.range})`, `${list.length} student${list.length===1?'':'s'} across all sections`, list);
});

function setActivePage(page){
  // page: 'section' | 'overall' | 'sectionSummary' | 'teacherReport'
  overallSummaryOpen = (page === 'overall');
  sectionSummaryOpen = (page === 'sectionSummary');
  teacherReportOpen = (page === 'teacherReport');
  document.getElementById('overallSummaryPage').style.display = page==='overall' ? 'block' : 'none';
  document.getElementById('sectionSummaryPage').style.display = page==='sectionSummary' ? 'block' : 'none';
  document.getElementById('teacherReportPage').style.display = page==='teacherReport' ? 'block' : 'none';
  document.getElementById('sectionViewPage').style.display = page==='section' ? 'block' : 'none';
  document.getElementById('heroStrip').style.display = page==='section' ? 'grid' : 'none';
  document.getElementById('overallSummaryBtn').classList.toggle('primary', page==='overall');
  document.getElementById('overallSummaryBtn').classList.toggle('ghost', page!=='overall');
  document.getElementById('overallSummaryBtn').textContent = page==='overall' ? '← Back to Section View' : 'Overall Summary';
  document.getElementById('sectionSummaryBtn').classList.toggle('primary', page==='sectionSummary');
  document.getElementById('sectionSummaryBtn').classList.toggle('ghost', page!=='sectionSummary');
  document.getElementById('sectionSummaryBtn').textContent = page==='sectionSummary' ? '← Back to Section View' : 'Section Summary';
  document.getElementById('teacherReportBtn').classList.toggle('primary', page==='teacherReport');
  document.getElementById('teacherReportBtn').classList.toggle('ghost', page!=='teacherReport');
  document.getElementById('teacherReportBtn').textContent = page==='teacherReport' ? '← Back to Section View' : 'Teacher Report';
  if(page==='overall') renderOverallSummary();
  if(page==='sectionSummary') renderSectionSummary();
  if(page==='teacherReport') renderTeacherReport();
}
function getSectionFilteredStudents(sectionKey, filterKey){
  const {students} = collectOverallRoster();
  const scoped = students.filter(s=>s.sectionKey===sectionKey && s.overall!=null);
  if(filterKey==='red') return scoped.filter(s=>s.overall<60).sort((a,b)=>a.overall-b.overall);
  if(filterKey==='green') return scoped.filter(s=>s.overall>=90).sort((a,b)=>b.overall-a.overall);
  if(filterKey.startsWith('zone:')){
    const zk = filterKey.slice(5);
    const z = OVERALL_ZONE_ORDER.find(x=>x.key===zk);
    if(!z) return [];
    return scoped.filter(s=>s.overall>=z.min && s.overall<z.max).sort((a,b)=>b.overall-a.overall);
  }
  return [];
}

function renderSectionSummary(){
  const def = currentSectionDef();
  const key = currentSectionKey();
  document.getElementById('ssSectionLabelTag').textContent = `— ${def.label}`;

  const {students: allStudents, sections} = collectOverallRoster();
  const sectionStudents = allStudents.filter(s=>s.sectionKey===key);
  const store = workspace.sections[key];
  const totalInSection = store ? store.students.length : 0;

  const scored = sectionStudents.filter(s=>s.overall!=null);
  const avg = scored.length ? Math.round((scored.reduce((a,s)=>a+s.overall,0)/scored.length)*10)/10 : null;
  const redStudents = scored.filter(s=>s.overall<60);
  const greenStudents = scored.filter(s=>s.overall>=90);
  const passCount = scored.filter(s=>s.overall>=50).length;
  const passRate = scored.length ? Math.round((passCount/scored.length)*1000)/10 : null;

  const rankedSections = sections.slice().filter(s=>s.avg!=null).sort((a,b)=>b.avg-a.avg);
  const rankIdx = rankedSections.findIndex(s=>s.def.key===key);
  const rank = rankIdx>=0 ? rankIdx+1 : null;
  const totalRankedSections = rankedSections.length;
  const aheadCount = rank!=null ? rank-1 : null;
  const behindCount = rank!=null ? totalRankedSections-rank : null;
  const schoolAvgAll = rankedSections.length ? Math.round((rankedSections.reduce((a,s)=>a+s.avg,0)/rankedSections.length)*10)/10 : null;
  const deltaVsSchool = (avg!=null && schoolAvgAll!=null) ? Math.round((avg-schoolAvgAll)*10)/10 : null;

  document.getElementById('ssQuickStats').innerHTML = totalInSection===0 ? `
    <div class="hero-metric"><div class="hm-label">Students</div><div class="hm-value">0</div></div>
  ` : `
    <div class="hero-metric"><div class="hm-label">👨‍🎓 Students</div><div class="hm-value" data-count="${totalInSection}">0</div></div>
    <div class="hero-metric accent"><div class="hm-label">📈 Section Average</div><div class="hm-value" ${avg!=null?`data-count="${avg}" data-suffix="%"`:''}>${avg!=null?'0%':'—'}</div></div>
    <div class="hero-metric warn clickable" data-filter="red"><div class="hm-label">🔴 Red Zone</div><div class="hm-value" data-count="${redStudents.length}">0</div></div>
    <div class="hero-metric good clickable" data-filter="green"><div class="hm-label">🟢 Green Zone</div><div class="hm-value" data-count="${greenStudents.length}">0</div></div>
    <div class="hero-metric good"><div class="hm-label">📊 Pass Rate</div><div class="hm-value" ${passRate!=null?`data-count="${passRate}" data-suffix="%"`:''}>${passRate!=null?'0%':'—'}</div></div>
    <div class="hero-metric gold"><div class="hm-label">🏅 Rank</div><div class="hm-value small">${rank!=null?`#${rank} of ${totalRankedSections}`:'—'}</div></div>
  `;
  animateCounters(document.getElementById('ssQuickStats'));

  const subjAvgs = def.subjects.map(subj=>{
    const vals = [];
    (store?store.students:[]).forEach(st=>{
      const t = latestTest(st, subj);
      if(t && !t.absent && t.percent!=null) vals.push(t.percent);
    });
    return {subject:subj, avg: vals.length?Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*10)/10:null};
  }).filter(x=>x.avg!=null);

  const insights = [];
  if(avg!=null && rank!=null) insights.push(`<b>${escapeHtml(def.label)}</b> averages ${avg}%, ranking <b>#${rank} of ${totalRankedSections}</b> sections.`);
  if(deltaVsSchool!=null){
    if(deltaVsSchool > 0) insights.push(`This section is <b>${deltaVsSchool}% above</b> the all-sections average (${schoolAvgAll}%).`);
    else if(deltaVsSchool < 0) insights.push(`This section is <b>${Math.abs(deltaVsSchool)}% below</b> the all-sections average (${schoolAvgAll}%).`);
    else insights.push(`This section is exactly at the all-sections average (${schoolAvgAll}%).`);
  }
  if(aheadCount!=null && behindCount!=null && totalRankedSections>1) insights.push(`It leads <b>${aheadCount}</b> section${aheadCount===1?'':'s'} and trails <b>${behindCount}</b>.`);
  if(subjAvgs.length){
    const strongest = subjAvgs.slice().sort((a,b)=>b.avg-a.avg)[0];
    const weakest = subjAvgs.slice().sort((a,b)=>a.avg-b.avg)[0];
    insights.push(`Strongest subject: <b>${escapeHtml(strongest.subject)}</b> (${strongest.avg}%). Weakest: <b>${escapeHtml(weakest.subject)}</b> (${weakest.avg}%).`);
  }
  if(scored.length) insights.push(`${redStudents.length} student${redStudents.length===1?'':'s'} (${Math.round((redStudents.length/scored.length)*1000)/10}%) are in the Red Zone and may need intervention.`);
  document.getElementById('ssInsightsWrap').innerHTML = insights.length ? insights.map(t=>`<li>${t}</li>`).join('') : `<li class="empty">Import results for this section to generate insights.</li>`;

  document.getElementById('ssZoneCardsWrap').innerHTML = OVERALL_ZONE_ORDER.map(z=>{
    const count = scored.filter(s=>s.overall>=z.min && s.overall<z.max).length;
    const pct = scored.length ? Math.round((count/scored.length)*1000)/10 : 0;
    return `<div class="card clickable" data-sszone="${z.key}"><h4>${ZONE_EMOJI[z.key]} ${z.label}</h4>
      <div class="count">${count}</div>
      <ul><li>${z.range}</li><li class="extra-detail">${pct}% of this section</li></ul>
    </div>`;
  }).join('');

  document.getElementById('ssSubjectBody').innerHTML = subjAvgs.length ? subjAvgs.map(sa=>{
    const redN = (store.students||[]).filter(st=>{ const t=latestTest(st,sa.subject); return t && !t.absent && t.percent!=null && t.percent<60; }).length;
    const greenN = (store.students||[]).filter(st=>{ const t=latestTest(st,sa.subject); return t && !t.absent && t.percent!=null && t.percent>=90; }).length;
    const schoolVals = [];
    SECTION_DEFS.forEach(d2=>{
      if(!d2.subjects.includes(sa.subject)) return;
      const st2 = workspace.sections[d2.key];
      if(!st2) return;
      st2.students.forEach(s2=>{ const t=latestTest(s2,sa.subject); if(t && !t.absent && t.percent!=null) schoolVals.push(t.percent); });
    });
    const schoolSubjAvg = schoolVals.length ? Math.round((schoolVals.reduce((a,b)=>a+b,0)/schoolVals.length)*10)/10 : null;
    const delta = schoolSubjAvg!=null ? Math.round((sa.avg-schoolSubjAvg)*10)/10 : null;
    const deltaTag = delta==null ? '—' : delta>0?`<span class="delta-tag up">▲+${delta}</span>`:delta<0?`<span class="delta-tag down">▼${delta}</span>`:`<span class="delta-tag flat">·0</span>`;
    return `<tr><td class="name-cell">${escapeHtml(sa.subject)}</td><td><span class="zone-pill ${zoneOf(sa.avg,false)}">${sa.avg}%</span></td><td>${redN}</td><td>${greenN}</td><td>${deltaTag}</td></tr>`;
  }).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px;">No subject data yet.</td></tr>`;

  document.getElementById('ssCompareBody').innerHTML = rankedSections.length ? rankedSections.map((s,i)=>`
    <tr data-jump-section="${s.def.key}" style="cursor:pointer;${s.def.key===key?'background:var(--gold-bg);font-weight:600;':''}"><td>${i+1}</td><td class="name-cell">${escapeHtml(s.def.label)}</td>
    <td><span class="zone-pill ${zoneOf(s.avg,false)}">${s.avg}%</span></td><td>${s.studentCount}</td></tr>
  `).join('') : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px;">No section data yet.</td></tr>`;

  triggerEntranceAnimations();
}
document.getElementById('ssQuickStats').addEventListener('click', (e)=>{
  const el = e.target.closest('[data-filter]');
  if(!el) return;
  const filterKey = el.getAttribute('data-filter');
  const list = getSectionFilteredStudents(currentSectionKey(), filterKey);
  const title = filterKey==='red' ? '🔴 Red Zone Students' : '🟢 Green Zone Students';
  openStatListDrawer(title, `${list.length} student${list.length===1?'':'s'} in ${currentSectionDef().label}`, list);
});
document.getElementById('ssZoneCardsWrap').addEventListener('click', (e)=>{
  const el = e.target.closest('[data-sszone]');
  if(!el) return;
  const zk = el.getAttribute('data-sszone');
  const z = OVERALL_ZONE_ORDER.find(x=>x.key===zk);
  const list = getSectionFilteredStudents(currentSectionKey(), `zone:${zk}`);
  openStatListDrawer(`${ZONE_EMOJI[zk]} ${z.label} (${z.range})`, `${list.length} student${list.length===1?'':'s'} in ${currentSectionDef().label}`, list);
});
document.getElementById('ssCompareBody').addEventListener('click', (e)=>{
  const tr = e.target.closest('tr[data-jump-section]');
  if(!tr) return;
  document.getElementById('sectionSelect').value = tr.getAttribute('data-jump-section');
  refreshAllUI();
  renderSectionSummary();
});

/* ---- 021_teacher-report.js ---- */

/* ===================== TEACHER REPORT ===================== */
// Built from *effective* assignments (default roster + any overrides), so a
// teacher who was just reassigned via Manage Teacher Assignments shows up
// correctly here, and one who was fully reassigned away from a subject drops
// off the list for it.
function getAllTeacherNames(){
  const set = new Set();
  SECTION_DEFS.forEach(def=>{
    def.subjects.forEach(subject=>{
      const t = lookupTeacher(subject, def);
      if(t) set.add(t);
    });
  });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}

function populateTeacherSelect(){
  const sel = document.getElementById('teacherSelect');
  const prev = sel.value;
  sel.innerHTML = `<option value="">— Choose a teacher —</option>` +
    getAllTeacherNames().map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if(prev) sel.value = prev;
}

// For one teacher, returns [{subject, rows:[{def, raw, avg, studentCount, redCount, greenCount}]}]
// one row per actual section that teacher effectively covers for that subject
// (default roster, overridden by any per-section reassignment on record).
function getTeacherAssignments(teacherName){
  const bySubject = {};
  SECTION_DEFS.forEach(def=>{
    def.subjects.forEach(subject=>{
      if(lookupTeacher(subject, def) !== teacherName) return;
      const store = workspace.sections[def.key];
      const students = store ? store.students : [];
      const avg = store ? subjectClassAverage(store, subject) : null;
      const redCount = students.filter(st=>{ const t=latestTest(st,subject); return t && !t.absent && t.percent!=null && t.percent<60; }).length;
      const greenCount = students.filter(st=>{ const t=latestTest(st,subject); return t && !t.absent && t.percent!=null && t.percent>=90; }).length;
      (bySubject[subject] = bySubject[subject] || []).push({def, raw: rawSectionLabel(def), avg, studentCount: students.length, redCount, greenCount});
    });
  });
  return Object.entries(bySubject).map(([subject, rows])=>({subject, rows}));
}

function renderTeacherReport(){
  populateTeacherSelect();
  const teacherName = document.getElementById('teacherSelect').value;
  const body = document.getElementById('teacherReportBody');
  if(!teacherName){
    body.innerHTML = `<div class="chart-card" style="text-align:center;color:var(--muted);padding:30px;">Select a teacher above to see their subject &amp; section performance report.</div>`;
    return;
  }

  const assignments = getTeacherAssignments(teacherName);
  if(!assignments.length){
    body.innerHTML = `<div class="chart-card" style="text-align:center;color:var(--muted);padding:30px;">No subject/section records found for ${escapeHtml(teacherName)}.</div>`;
    return;
  }

  const allRows = [];
  assignments.forEach(a=>a.rows.forEach(r=>allRows.push({...r, subject:a.subject})));
  const scoredRows = allRows.filter(r=>r.avg!=null && r.studentCount>0);
  const totalWeight = scoredRows.reduce((s,r)=>s+r.studentCount,0);
  const overallAvg = totalWeight ? Math.round((scoredRows.reduce((s,r)=>s+r.avg*r.studentCount,0)/totalWeight)*10)/10 : null;
  const totalStudents = allRows.reduce((s,r)=>s+r.studentCount,0);
  const totalRed = allRows.reduce((s,r)=>s+r.redCount,0);
  const totalGreen = allRows.reduce((s,r)=>s+r.greenCount,0);

  let html = `<div class="hero-strip">
    <div class="hero-metric"><div class="hm-label">📚 Subjects Taught</div><div class="hm-value">${assignments.length}</div></div>
    <div class="hero-metric"><div class="hm-label">🏫 Sections Covered</div><div class="hm-value">${allRows.length}</div></div>
    <div class="hero-metric"><div class="hm-label">👨‍🎓 Total Students</div><div class="hm-value">${totalStudents}</div></div>
    <div class="hero-metric accent"><div class="hm-label">📈 Overall Average</div><div class="hm-value">${overallAvg!=null?overallAvg+'%':'—'}</div></div>
    <div class="hero-metric warn"><div class="hm-label">🔴 Red Zone</div><div class="hm-value">${totalRed}</div></div>
    <div class="hero-metric good"><div class="hm-label">🟢 Green Zone</div><div class="hm-value">${totalGreen}</div></div>
  </div>`;

  assignments.forEach(a=>{
    const rows = a.rows.slice().sort((x,y)=>{
      if(x.avg==null && y.avg==null) return 0;
      if(x.avg==null) return 1;
      if(y.avg==null) return -1;
      return y.avg-x.avg;
    });
    const scored = rows.filter(r=>r.avg!=null);
    const weight = scored.reduce((s,r)=>s+r.studentCount,0);
    const subjAvg = weight ? Math.round((scored.reduce((s,r)=>s+r.avg*r.studentCount,0)/weight)*10)/10 : null;
    const best = scored[0];
    const worst = scored.length ? scored[scored.length-1] : null;
    const spread = (best && worst && best!==worst) ? Math.round((best.avg-worst.avg)*10)/10 : null;

    html += `<div class="section-title">${escapeHtml(a.subject)} <span class="filters" style="font-weight:400;">${subjAvg!=null?`— teacher average ${subjAvg}%`:'— no scored data yet'}</span></div>`;

    if(rows.length > 1 && spread!=null && spread > 0){
      html += `<div class="chart-card" style="margin-bottom:10px;">
        <b>${escapeHtml(a.subject)}</b> across ${escapeHtml(teacherName)}'s sections ranges from
        <b>${worst.avg}%</b> (${escapeHtml(worst.def.label)}) to <b>${best.avg}%</b> (${escapeHtml(best.def.label)}) —
        a spread of <b>${spread} point${spread===1?'':'s'}</b>.
      </div>`;
    }

    html += `<div class="table-wrap" style="max-height:320px;margin-bottom:6px;">
      <table class="main-table">
        <thead><tr>
          <th>Section</th><th>Average %</th><th>Students</th><th>🔴 Red</th><th>🟢 Green</th>
        </tr></thead>
        <tbody>
          ${rows.map(r=>{
            const isBest = best && r===best && scored.length>1;
            const isWorst = worst && r===worst && scored.length>1;
            const rowStyle = isBest ? 'background:var(--gold-bg);font-weight:600;' : isWorst ? 'background:rgba(200,60,60,0.08);' : '';
            const avgCell = r.avg!=null ? `<span class="zone-pill ${zoneOf(r.avg,false)}">${r.avg}%</span>` : '<span style="color:var(--muted);">—</span>';
            return `<tr style="${rowStyle}">
              <td class="name-cell">${escapeHtml(r.def.label)}${isBest?' 🏆':''}${isWorst?' ⚠️':''}</td>
              <td>${avgCell}</td><td>${r.studentCount}</td><td>${r.redCount}</td><td>${r.greenCount}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  });

  body.innerHTML = html;
  triggerEntranceAnimations();
}

function toggleOverallSummary(open){ setActivePage(open ? 'overall' : 'section'); }
function toggleSectionSummary(open){ setActivePage(open ? 'sectionSummary' : 'section'); }
function toggleTeacherReport(open){ setActivePage(open ? 'teacherReport' : 'section'); }
document.getElementById('overallSummaryBtn').addEventListener('click', ()=>toggleOverallSummary(!overallSummaryOpen));
document.getElementById('sectionSummaryBtn').addEventListener('click', ()=>toggleSectionSummary(!sectionSummaryOpen));
document.getElementById('teacherReportBtn').addEventListener('click', ()=>toggleTeacherReport(!teacherReportOpen));
document.getElementById('teacherSelect').addEventListener('change', renderTeacherReport);
document.getElementById('homeBtn').addEventListener('click', ()=>setActivePage('section'));

document.getElementById('sectionSelect').addEventListener('change', refreshAllUI);
document.getElementById('subjectFilter').addEventListener('change', ()=>{ updateSubjectTeacherHint(); renderTable(); });
document.getElementById('zoneFilter').addEventListener('change', renderTable);
document.getElementById('studentSearch').addEventListener('input', (e)=>{
  searchQuery = e.target.value.trim().toLowerCase();
  renderTable();
});
document.getElementById('chartSubjectSelect').addEventListener('change', ()=>renderCharts(currentSectionDef(), ensureSection(currentSectionKey())));
document.getElementById('reportSubjectSelect').addEventListener('change', ()=>renderTransitionCards(currentSectionDef(), ensureSection(currentSectionKey())));
document.getElementById('compareAgainstSelect').addEventListener('change', ()=>renderCharts(currentSectionDef(), ensureSection(currentSectionKey())));
document.getElementById('compareSectionSelect').addEventListener('change', ()=>renderCharts(currentSectionDef(), ensureSection(currentSectionKey())));

/* ---- 022_quick-filter-chips.js ---- */

/* ===================== QUICK FILTER CHIPS ===================== */
document.querySelectorAll('#quickChipRow .chip').forEach(chip=>{
  const activate = ()=>{
    const key = chip.getAttribute('data-quick');
    quickFilter = (quickFilter === key) ? null : key;
    document.querySelectorAll('#quickChipRow .chip').forEach(c=>{
      const isActive = c.getAttribute('data-quick')===quickFilter;
      c.classList.toggle('active', isActive);
      c.setAttribute('aria-pressed', String(isActive));
    });
    renderTable();
  };
  chip.addEventListener('click', activate);
  chip.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); activate(); }
  });
});

/* ---- 023_toolbar-dropdown-menus.js ---- */

/* ===================== TOOLBAR DROPDOWN MENUS ===================== */
function toggleDropdown(btnId, menuId){
  document.getElementById(btnId).addEventListener('click', (e)=>{
    e.stopPropagation();
    const menu = document.getElementById(menuId);
    const willOpen = !menu.classList.contains('open');
    document.querySelectorAll('.menu-dropdown').forEach(m=>m.classList.remove('open'));
    if(willOpen) menu.classList.add('open');
  });
}
toggleDropdown('addMenuBtn','addMenuDropdown');
toggleDropdown('moreMenuBtn','moreMenuDropdown');
document.addEventListener('click', ()=>document.querySelectorAll('.menu-dropdown').forEach(m=>m.classList.remove('open')));
document.getElementById('addMenuDropdown').addEventListener('click', ()=>document.getElementById('addMenuDropdown').classList.remove('open'));
document.getElementById('moreMenuDropdown').addEventListener('click', ()=>document.getElementById('moreMenuDropdown').classList.remove('open'));

document.getElementById('extraDetailsBtn').addEventListener('click', (e)=>{
  showExtra = !showExtra;
  e.target.textContent = showExtra ? 'Hide Extra Details' : 'Show Extra Details';
  renderTable();
});

function togglePanel(id){
  ['importPanel','addTestPanel','addStudentPanel','addSectionPanel','renameSectionPanel','manageTeacherPanel'].forEach(p=>{
    document.getElementById(p).classList.toggle('open', p===id ? !document.getElementById(id).classList.contains('open') : false);
  });
}
document.getElementById('importBtn').addEventListener('click', ()=>togglePanel('importPanel'));
document.getElementById('addTestBtn').addEventListener('click', ()=>{
  togglePanel('addTestPanel');
  document.getElementById('atSection').value = currentSectionKey();
  populateAddTestSubject(); populateAddTestStudents();
});
document.getElementById('addStudentBtn').addEventListener('click', ()=>{
  togglePanel('addStudentPanel');
  document.getElementById('asSection').value = currentSectionKey();
});
document.getElementById('atSection').addEventListener('change', ()=>{ populateAddTestSubject(); populateAddTestStudents(); });
document.getElementById('atSubject').addEventListener('change', updateAtSubjectTeacherHint);

document.getElementById('cancelImportBtn').addEventListener('click', ()=>{
  document.getElementById('importPanel').classList.remove('open');
  pendingImport = null;
  document.getElementById('importPreviewArea').innerHTML='';
  document.getElementById('applyImportBtn').disabled = true;
  document.getElementById('acceptMappingRow').style.display = 'none';
  document.getElementById('acceptMappingCheck').checked = false;
});

document.getElementById('importFileInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const testName = document.getElementById('importTestName').value.trim();
  if(!testName){ showToast('Please enter a Test / Exam Name before choosing the file.', 'warning'); e.target.value=''; return; }
  const testDate = document.getElementById('importTestDate').value || null;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:'array', cellDates:false});
  pendingImport = runImport(wb, testName, testDate);
  renderImportPreview(pendingImport);
});

function renderImportPreview(parsed){
  const area = document.getElementById('importPreviewArea');
  let html = `<div class="preview-box">`;
  html += `<table><thead><tr><th>Section</th><th>Subjects Detected</th><th>Students Found</th><th>Absent</th><th>Notes</th></tr></thead><tbody>`;
  parsed.matched.forEach(sec=>{
    const subjInfo = sec.subjects.map(s=>{
      const n = (sec.subjectCols[s]||[]).length;
      return `${s}${n?` (${n} col${n>1?'s':''})`:' <span class="warn-text">(not found)</span>'}`;
    }).join(', ');
    const absentCount = sec.students.filter(s=>s.absent).length;
    html += `<tr><td>${escapeHtml(sec.label)}</td><td>${subjInfo}</td><td>${sec.students.length}</td><td>${absentCount}</td>
      <td>${sec.warnings.length ? `<span class="warn-text">${sec.warnings.join('; ')}</span>` : `<span class="ok-text">OK</span>`}</td></tr>`;
  });
  html += `</tbody></table>`;
  // Sample rows so the mapping can actually be eyeballed before it's accepted, not just trusted blind.
  parsed.matched.forEach(sec=>{
    if(!sec.students.length) return;
    const sample = sec.students.slice(0, 5);
    html += `<div class="hint" style="margin-top:10px;"><b>${escapeHtml(sec.label)} — sample rows</b></div>`;
    html += `<table style="margin-top:4px;"><thead><tr><th>Name</th>${sec.subjects.map(s=>`<th>${escapeHtml(s)}</th>`).join('')}</tr></thead><tbody>`;
    sample.forEach(s=>{
      html += `<tr><td>${escapeHtml(s.name)}${s.absent ? ' <span class="warn-text">(absent)</span>' : ''}</td>`;
      html += sec.subjects.map(subj=>{
        const r = s.subjectResults[subj];
        if(!r || r.max===0) return `<td class="warn-text">—</td>`;
        return `<td>${r.obtained}/${r.max} (${r.percent}%)</td>`;
      }).join('');
      html += `</tr>`;
    });
    html += `</tbody></table>`;
  });
  if(parsed.unmatched.length){
    html += `<div class="hint" style="margin-top:8px;"><b>Sheets not recognized (skipped):</b> ${parsed.unmatched.map(escapeHtml).join(', ')}</div>`;
  }
  if(!parsed.matched.length){
    html += `<div class="warn-text">No recognizable sections were found in this file.</div>`;
  }
  html += `</div>`;
  area.innerHTML = html;
  document.getElementById('acceptMappingCheck').checked = false;
  document.getElementById('acceptMappingRow').style.display = parsed.matched.length ? 'flex' : 'none';
  updateApplyImportEnabled();
}

function updateApplyImportEnabled(){
  const hasMatches = !!(pendingImport && pendingImport.matched.length);
  const accepted = document.getElementById('acceptMappingCheck').checked;
  document.getElementById('applyImportBtn').disabled = !(hasMatches && accepted);
}
document.getElementById('acceptMappingCheck').addEventListener('change', updateApplyImportEnabled);

document.getElementById('applyImportBtn').addEventListener('click', ()=>{
  if(!pendingImport) return;
  if(!document.getElementById('acceptMappingCheck').checked) return;
  // Snapshot the workspace so this import can be undone in one click if it turns out wrong.
  lastImportSnapshot = JSON.stringify(workspace);
  lastImportLabel = pendingImport.testName || 'last import';
  document.getElementById('undoImportBtn').disabled = false;
  document.getElementById('undoImportBtn').title = `Undo "${lastImportLabel}" and restore the workspace to how it was before this import`;
  applyImport(pendingImport);
  document.getElementById('importPanel').classList.remove('open');
  document.getElementById('importPreviewArea').innerHTML='';
  document.getElementById('applyImportBtn').disabled = true;
  document.getElementById('acceptMappingRow').style.display = 'none';
  document.getElementById('acceptMappingCheck').checked = false;
  document.getElementById('importFileInput').value='';
  pendingImport = null;
  refreshAllUI();
  showToast('✓ Import applied — undo anytime from the ⋯ More menu.', 'success');
  launchConfetti();
});

document.getElementById('undoImportBtn').addEventListener('click', ()=>{
  if(!lastImportSnapshot) return;
  if(!confirm(`Undo "${lastImportLabel}"? This restores the workspace to how it was right before that import was applied.`)) return;
  workspace = JSON.parse(lastImportSnapshot);
  lastImportSnapshot = null;
  lastImportLabel = null;
  document.getElementById('undoImportBtn').disabled = true;
  document.getElementById('undoImportBtn').title = 'Restore the workspace to how it was just before the last import was applied';
  markDirty();
  refreshAllUI();
  showToast('Import undone.', 'success');
});

document.getElementById('atSaveBtn').addEventListener('click', ()=>{
  const secKey = document.getElementById('atSection').value;
  const studentId = document.getElementById('atStudent').value;
  const subject = document.getElementById('atSubject').value;
  const testName = document.getElementById('atTestName').value.trim();
  const obtained = parseFloat(document.getElementById('atObtained').value);
  const max = parseFloat(document.getElementById('atMax').value);
  const absent = document.getElementById('atAbsent').value === 'yes';
  if(!studentId){ showToast('No student selected.', 'warning'); return; }
  if(!testName){ showToast('Enter a test name.', 'warning'); return; }
  if(!absent && (Number.isNaN(obtained) || Number.isNaN(max) || max<=0)){ showToast('Enter valid obtained/max marks, or mark as Absent.', 'warning'); return; }
  const store = ensureSection(secKey);
  const student = store.students.find(s=>s.id===studentId);
  if(!student) return;
  if(!student.tests[subject]) student.tests[subject] = [];
  const percent = absent ? null : Math.round((obtained/max)*1000)/10;
  const entry = {test:testName, date:null, obtained: absent?null:obtained, max: absent?null:max, percent, absent, position:null};
  const idx = student.tests[subject].findIndex(t=>t.test.toLowerCase()===testName.toLowerCase());
  if(idx>=0) student.tests[subject][idx] = entry; else student.tests[subject].push(entry);
  markDirty();
  document.getElementById('addTestPanel').classList.remove('open');
  document.getElementById('atTestName').value=''; document.getElementById('atObtained').value=''; document.getElementById('atMax').value='';
  if(secKey === currentSectionKey()) renderTable();
  showToast(`✓ Score saved for ${student.name}.`, 'success');
});
document.getElementById('atCancelBtn').addEventListener('click', ()=>document.getElementById('addTestPanel').classList.remove('open'));

document.getElementById('asSaveBtn').addEventListener('click', ()=>{
  const secKey = document.getElementById('asSection').value;
  const name = document.getElementById('asName').value.trim();
  if(!name){ showToast('Enter a student name.', 'warning'); return; }
  const rollNo = document.getElementById('asRoll').value.trim() || null;
  const matric = document.getElementById('asMatric').value ? Number(document.getElementById('asMatric').value) : null;
  const store = ensureSection(secKey);
  store.students.push({id:uid(), name, rollNo, matric, tests:{}});
  markDirty();
  document.getElementById('addStudentPanel').classList.remove('open');
  document.getElementById('asName').value=''; document.getElementById('asRoll').value=''; document.getElementById('asMatric').value='';
  if(secKey === currentSectionKey()) refreshAllUI();
  showToast(`✓ ${name} added.`, 'success');
});
document.getElementById('asCancelBtn').addEventListener('click', ()=>document.getElementById('addStudentPanel').classList.remove('open'));

/* ---- Generic confirm modal (Yes/Cancel), reused for section deletion ---- */
let _confirmOkCallback = null;
function showConfirm(title, bodyHtml, onConfirm){
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').innerHTML = bodyHtml;
  _confirmOkCallback = onConfirm;
  document.getElementById('confirmModal').classList.add('open');
}
document.getElementById('confirmCancelBtn').addEventListener('click', ()=>{
  document.getElementById('confirmModal').classList.remove('open');
  _confirmOkCallback = null;
});
document.getElementById('confirmOkBtn').addEventListener('click', ()=>{
  document.getElementById('confirmModal').classList.remove('open');
  const cb = _confirmOkCallback;
  _confirmOkCallback = null;
  if(cb) cb();
});

/* ---- Add Section ---- */
document.getElementById('addSectionBtn').addEventListener('click', ()=>{
  togglePanel('addSectionPanel');
  document.getElementById('nsName').value = '';
  document.getElementById('nsGroup').value = 'PM';
});
document.getElementById('nsCancelBtn').addEventListener('click', ()=>document.getElementById('addSectionPanel').classList.remove('open'));
document.getElementById('nsSaveBtn').addEventListener('click', ()=>{
  const name = document.getElementById('nsName').value.trim();
  const group = document.getElementById('nsGroup').value;
  try{
    const def = addSectionDef(name, group);
    ensureSection(def.key);
    markDirty();
    populateSectionSelects();
    document.getElementById('sectionSelect').value = def.key;
    populateSubjectFilter();
    refreshAllUI();
    document.getElementById('addSectionPanel').classList.remove('open');
    document.getElementById('nsName').value = '';
    showToast(`✓ Section "${def.sheetName}" added.`, 'success');
  }catch(err){
    showToast(err.message, 'warning');
  }
});

/* ---- Delete Section ---- */
document.getElementById('deleteSectionBtn').addEventListener('click', ()=>{
  const key = currentSectionKey();
  const def = SECTION_BY_KEY[key];
  if(!def) return;
  if(SECTION_DEFS.length <= 1){
    showToast('At least one section must remain — add another section before deleting this one.', 'warning');
    return;
  }
  const store = workspace.sections[key];
  const studentCount = store ? store.students.length : 0;
  const dataWarning = studentCount > 0
    ? `This section has <b>${studentCount}</b> student record(s) with all of their test scores. `
    : '';
  showConfirm(
    'Delete Section?',
    `${dataWarning}Are you sure you want to permanently delete <b>${escapeHtml(def.label)}</b>? This cannot be undone (unless you have a saved workspace backup).`,
    ()=>{
      removeSectionDef(key);
      markDirty();
      populateSectionSelects();
      document.getElementById('sectionSelect').value = currentSectionKey() || SECTION_DEFS[0].key;
      populateSubjectFilter();
      refreshAllUI();
      showToast(`Section "${def.sheetName}" deleted.`, 'success');
    }
  );
});

/* ---- Rename Section ---- */
document.getElementById('renameSectionBtn').addEventListener('click', ()=>{
  togglePanel('renameSectionPanel');
  const def = currentSectionDef();
  document.getElementById('rsName').value = def ? def.sheetName : '';
});
document.getElementById('rsCancelBtn').addEventListener('click', ()=>document.getElementById('renameSectionPanel').classList.remove('open'));
document.getElementById('rsSaveBtn').addEventListener('click', ()=>{
  const key = currentSectionKey();
  const name = document.getElementById('rsName').value.trim();
  try{
    const def = renameSectionDef(key, name);
    markDirty();
    populateSectionSelects();
    document.getElementById('sectionSelect').value = key;
    populateSubjectFilter();
    refreshAllUI();
    document.getElementById('renameSectionPanel').classList.remove('open');
    showToast(`✓ Section renamed to "${def.sheetName}".`, 'success');
  }catch(err){
    showToast(err.message, 'warning');
  }
});

/* ---- Manage Teacher Assignments (handles teacher shuffles between sections) ---- */
function populateMtSectionSelect(){
  document.getElementById('mtSection').innerHTML = SECTION_DEFS.map(d=>`<option value="${d.key}">${d.label}</option>`).join('');
}
function populateMtSubjects(){
  const def = SECTION_BY_KEY[document.getElementById('mtSection').value];
  document.getElementById('mtSubject').innerHTML = def.subjects.map(s=>`<option value="${s}">${s}</option>`).join('');
  updateMtHint();
}
function populateMtTeacherList(){
  document.getElementById('mtTeacherNameList').innerHTML = getAllTeacherNames().map(n=>`<option value="${escapeHtml(n)}"></option>`).join('');
}
function updateMtHint(){
  const sectionKey = document.getElementById('mtSection').value;
  const subject = document.getElementById('mtSubject').value;
  const def = SECTION_BY_KEY[sectionKey];
  const override = getTeacherOverride(sectionKey, subject);
  const effective = lookupTeacher(subject, def);
  document.getElementById('mtTeacherName').value = effective || '';
  const hint = document.getElementById('mtCurrentHint');
  if(override !== undefined){
    hint.textContent = effective ? `Currently assigned (custom): ${effective}` : 'Currently: no teacher assigned (cleared for this section).';
  } else {
    hint.textContent = effective ? `Currently assigned (default roster): ${effective}` : 'No teacher on record for this subject in this section yet.';
  }
}
document.getElementById('manageTeacherBtn').addEventListener('click', ()=>{
  document.getElementById('moreMenuDropdown').classList.remove('open');
  togglePanel('manageTeacherPanel');
  populateMtSectionSelect();
  document.getElementById('mtSection').value = currentSectionKey();
  populateMtSubjects();
  populateMtTeacherList();
});
document.getElementById('mtSection').addEventListener('change', populateMtSubjects);
document.getElementById('mtSubject').addEventListener('change', updateMtHint);
document.getElementById('mtSaveBtn').addEventListener('click', ()=>{
  const sectionKey = document.getElementById('mtSection').value;
  const subject = document.getElementById('mtSubject').value;
  const def = SECTION_BY_KEY[sectionKey];
  const name = document.getElementById('mtTeacherName').value.trim();
  if(!subject){ showToast('Choose a subject.', 'warning'); return; }
  setTeacherOverride(sectionKey, subject, name);
  markDirty();
  updateMtHint();
  populateMtTeacherList();
  updateSubjectTeacherHint();
  updateAtSubjectTeacherHint();
  if(typeof teacherReportOpen !== 'undefined' && teacherReportOpen) renderTeacherReport();
  showToast(name ? `✓ ${name} assigned to ${subject} in ${def.sheetName}.` : `✓ Teacher cleared for ${subject} in ${def.sheetName}.`, 'success');
});
document.getElementById('mtClearBtn').addEventListener('click', ()=>{
  const sectionKey = document.getElementById('mtSection').value;
  const subject = document.getElementById('mtSubject').value;
  const def = SECTION_BY_KEY[sectionKey];
  clearTeacherOverride(sectionKey, subject);
  markDirty();
  updateMtHint();
  updateSubjectTeacherHint();
  updateAtSubjectTeacherHint();
  if(typeof teacherReportOpen !== 'undefined' && teacherReportOpen) renderTeacherReport();
  showToast(`Reset "${subject}" in ${def.sheetName} to the default roster.`, 'success');
});
document.getElementById('mtCancelBtn').addEventListener('click', ()=>document.getElementById('manageTeacherPanel').classList.remove('open'));

document.getElementById('connectFileBtn').addEventListener('click', connectPendriveFile);
document.getElementById('saveDownloadBtn').addEventListener('click', downloadWorkspace);
document.getElementById('loadUploadBtn').addEventListener('click', ()=>document.getElementById('workspaceFileInput').click());
document.getElementById('workspaceFileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(file) uploadWorkspace(file);
  e.target.value='';
});

/* ---- 024_init.js ---- */

/* ===================== INIT ===================== */
let savedTheme = 'light';
try{ savedTheme = localStorage.getItem('spl-theme') || 'light'; }catch(e){ /* storage unavailable */ }
applyTheme(savedTheme);
document.getElementById('themeToggleBtn').addEventListener('click', ()=>{
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(cur);
});

populateSectionSelects();
populateSubjectFilter();
updateStatusLine();
updateLastUpdatedNow();
renderTable();
renderPinnedPanel();

(function runLoadingSequence(){
  const screen = document.getElementById('loadingScreen');
  if(!screen) return;
  if(prefersReducedMotion()){
    screen.remove();
    return;
  }
  const fill = document.getElementById('loadingBarFill');
  const status = document.getElementById('loadingStatus');
  const steps = [
    [22, 'Loading student records…'],
    [55, 'Calculating averages…'],
    [82, 'Detecting trends…'],
    [100, 'Building dashboard…']
  ];
  let i = 0;
  function next(){
    if(i >= steps.length){
      setTimeout(()=>{
        screen.classList.add('hide');
        setTimeout(()=>{ if(screen.parentNode) screen.parentNode.removeChild(screen); }, 550);
        triggerEntranceAnimations();
      }, 200);
      return;
    }
    const [pct, label] = steps[i++];
    if(fill) fill.style.width = pct + '%';
    if(status) status.textContent = label;
    setTimeout(next, 240);
  }
  next();
})();

/* ---- 025_print-report-generation-native-browser-print-no-ex.js ---- */

/* ===================== PRINT REPORT GENERATION (native browser print, no external libraries) ===================== */
function dateStamp(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function stripEmoji(s){
  return (s||'').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF⚠️⚠]/gu,'').replace(/\s+/g,' ').trim();
}
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function reportTableHtml(headers, rows){
  const thead = '<tr>' + headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('') + '</tr>';
  const tbody = rows.map(r=>'<tr>' + r.map(c=>`<td>${escapeHtml(c)}</td>`).join('') + '</tr>').join('');
  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}
function reportSectionHtml(label, innerHtml){
  return `<h3 class="rpt-section">${escapeHtml(label)}</h3>${innerHtml}`;
}
/* Opens a hidden print-only iframe (avoids popup blockers), writes the report into it, then triggers the
   browser's native print dialog — the user can choose "Save as PDF" as the destination. No external
   library or network request is ever needed, so this can't be blocked by a CDN or CSP issue. */
function ensurePrintInfrastructure(){
  if(!document.getElementById('ledgerPrintStyle')){
    const style = document.createElement('style');
    style.id = 'ledgerPrintStyle';
    style.textContent = `
      #ledgerPrintArea{ display:none; }
      @media print{
        body.ledger-printing > *:not(#ledgerPrintArea){ display:none !important; }
        body.ledger-printing #ledgerPrintArea{
          display:block !important; position:static; inset:auto; margin:0; padding:0;
        }
        @page{ size:A4; margin:32px; }
      }
      #ledgerPrintArea{
        font-family: Georgia, 'Times New Roman', serif; color:#1c2b45;
      }
      #ledgerPrintArea .rpt-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1c2b45;padding-bottom:8px;margin-bottom:14px;}
      #ledgerPrintArea .rpt-brand{font-size:16px;font-weight:700;}
      #ledgerPrintArea .rpt-brand-sub{font-size:9px;color:#777;text-transform:uppercase;letter-spacing:1px;margin-top:2px;}
      #ledgerPrintArea .rpt-generated{font-size:9px;color:#999;text-align:right;}
      #ledgerPrintArea .rpt-title{font-size:15px;font-weight:700;margin:6px 0 2px;}
      #ledgerPrintArea .rpt-sub{font-size:10.5px;color:#666;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #ddd;}
      #ledgerPrintArea h3.rpt-section{font-size:11.5px;font-weight:700;color:#1c2b45;margin:16px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px;}
      #ledgerPrintArea table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px;}
      #ledgerPrintArea th{background:#1c2b45;color:#fff;text-align:left;padding:5px 8px;font-weight:700;}
      #ledgerPrintArea td{padding:5px 8px;border-bottom:1px solid #ddd;}
      #ledgerPrintArea tbody tr:nth-child(even) td{background:#f7f6f2;}
      #ledgerPrintArea .rpt-footer{margin-top:20px;padding-top:6px;border-top:1px solid #ddd;font-size:8px;color:#999;display:flex;justify-content:space-between;}
    `;
    document.head.appendChild(style);
  }
  let area = document.getElementById('ledgerPrintArea');
  if(!area){
    area = document.createElement('div');
    area.id = 'ledgerPrintArea';
    document.body.appendChild(area);
  }
  return area;
}
function printReport(title, subtitle, bodyHtml){
  const area = ensurePrintInfrastructure();
  area.innerHTML = `
    <div class="rpt-header">
      <div><div class="rpt-brand">AXIOM</div><div class="rpt-brand-sub">Student Performance Tracker</div></div>
      <div class="rpt-generated">Generated ${escapeHtml(new Date().toLocaleString())}</div>
    </div>
    <div class="rpt-title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="rpt-sub">${escapeHtml(subtitle)}</div>` : ''}
    ${bodyHtml}
    <div class="rpt-footer"><span>AXIOM — Student Performance Tracker</span><span>${escapeHtml(new Date().toLocaleDateString())}</span></div>
  `;
  document.body.classList.add('ledger-printing');
  const cleanup = ()=>{
    document.body.classList.remove('ledger-printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Fallback cleanup in case afterprint doesn't fire (some browsers/sandboxes)
  setTimeout(cleanup, 60000);
  setTimeout(()=>{
    try{
      window.print();
    }catch(e){
      showToast('This preview does not allow printing. Please open the downloaded HTML file directly in your browser and try again.', 'warn');
      cleanup();
    }
  }, 50);
}

function generateOverallSummaryPDF(){
  const {students, sections} = collectOverallRoster();
  const totalStudents = students.length;
  const overallAvgAll = totalStudents ? Math.round((students.reduce((a,b)=>a+b.overall,0)/totalStudents)*10)/10 : null;
  const critical = students.filter(s=>s.overall!=null && s.overall<50);
  const exceptional = students.filter(s=>s.overall!=null && s.overall>=90);
  const passCount = students.filter(s=>s.overall!=null && s.overall>=50).length;
  const passRateAll = totalStudents ? Math.round((passCount/totalStudents)*1000)/10 : null;
  const rankedSections = sections.slice().filter(s=>s.avg!=null).sort((a,b)=>b.avg-a.avg);
  const ranked = students.slice().sort((a,b)=>b.overall-a.overall).slice(0,10);

  let body = '';
  body += reportSectionHtml('Key Statistics', reportTableHtml(['Metric','Value'], [
    ['Total Students', String(totalStudents)],
    ['Overall Average', overallAvgAll!=null?overallAvgAll+'%':'—'],
    ['Pass Rate', passRateAll!=null?passRateAll+'%':'—'],
    ['Critical Students (below 50%)', String(critical.length)],
    ['Exceptional Students (90%+)', String(exceptional.length)],
  ]));

  if(rankedSections.length){
    body += reportSectionHtml('Section Ranking', reportTableHtml(['#','Section','Average %','Pass Rate','Students'],
      rankedSections.map((s,i)=>[i+1, s.def.label, s.avg+'%', s.passRate!=null?s.passRate+'%':'—', s.studentCount])));
  }

  if(ranked.length){
    body += reportSectionHtml('Top 10 Students Overall', reportTableHtml(['#','Name','Section','Overall %','Grade'],
      ranked.map((s,i)=>[i+1, s.name, s.sectionLabel, s.overall+'%', gradeFor(s.overall)])));
  }

  printReport('Overall Summary Report', `${totalStudents} student${totalStudents===1?'':'s'} across ${sections.length} section${sections.length===1?'':'s'} — all subjects`, body);
}

function generateSectionSummaryPDF(){
  const def = currentSectionDef();
  const key = currentSectionKey();
  const {students: allStudents, sections} = collectOverallRoster();
  const sectionStudents = allStudents.filter(s=>s.sectionKey===key);
  const store = workspace.sections[key];
  const scored = sectionStudents.filter(s=>s.overall!=null);
  const avg = scored.length ? Math.round((scored.reduce((a,s)=>a+s.overall,0)/scored.length)*10)/10 : null;
  const redStudents = scored.filter(s=>s.overall<60);
  const greenStudents = scored.filter(s=>s.overall>=90);
  const passCount = scored.filter(s=>s.overall>=50).length;
  const passRate = scored.length ? Math.round((passCount/scored.length)*1000)/10 : null;
  const rankedSections = sections.slice().filter(s=>s.avg!=null).sort((a,b)=>b.avg-a.avg);
  const rankIdx = rankedSections.findIndex(s=>s.def.key===key);
  const rank = rankIdx>=0 ? rankIdx+1 : null;

  let body = '';
  body += reportSectionHtml('Key Statistics', reportTableHtml(['Metric','Value'], [
    ['Students', String(sectionStudents.length)],
    ['Section Average', avg!=null?avg+'%':'—'],
    ['Rank', rank!=null?`#${rank} of ${rankedSections.length}`:'—'],
    ['Pass Rate', passRate!=null?passRate+'%':'—'],
    ['Red Zone (below 60%)', String(redStudents.length)],
    ['Green Zone (90%+)', String(greenStudents.length)],
  ]));

  const subjAvgs = def.subjects.map(subj=>{
    const vals = [];
    (store?store.students:[]).forEach(st=>{
      const t = latestTest(st, subj);
      if(t && !t.absent && t.percent!=null) vals.push(t.percent);
    });
    return {subject:subj, avg: vals.length?Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*10)/10:null};
  }).filter(x=>x.avg!=null);
  if(subjAvgs.length){
    body += reportSectionHtml('Subject Breakdown', reportTableHtml(['Subject','Average %'], subjAvgs.map(sa=>[sa.subject, sa.avg+'%'])));
  }

  if(sectionStudents.length){
    body += reportSectionHtml('All Students', reportTableHtml(['Name','Roll No.','Overall %','Grade'],
      sectionStudents.slice().sort((a,b)=>(b.overall??-1)-(a.overall??-1)).map(s=>[s.name, (s.rollNo!=null&&s.rollNo!=='')?s.rollNo:'—', s.overall!=null?s.overall+'%':'—', s.overall!=null?gradeFor(s.overall):'—'])));
  }

  printReport(`${def.label} — Section Summary Report`, `${sectionStudents.length} student${sectionStudents.length===1?'':'s'} in this section`, body);
}

function generateTeacherReportPDF(){
  const teacherName = document.getElementById('teacherSelect').value;
  if(!teacherName){ showToast('Select a teacher first.', 'warn'); return; }
  const assignments = getTeacherAssignments(teacherName);
  const allRows = [];
  assignments.forEach(a=>a.rows.forEach(r=>allRows.push(Object.assign({}, r, {subject:a.subject}))));
  const scoredRows = allRows.filter(r=>r.avg!=null && r.studentCount>0);
  const totalWeight = scoredRows.reduce((s,r)=>s+r.studentCount,0);
  const overallAvg = totalWeight ? Math.round((scoredRows.reduce((s,r)=>s+r.avg*r.studentCount,0)/totalWeight)*10)/10 : null;
  const totalStudents = allRows.reduce((s,r)=>s+r.studentCount,0);
  const totalRed = allRows.reduce((s,r)=>s+r.redCount,0);
  const totalGreen = allRows.reduce((s,r)=>s+r.greenCount,0);

  let body = '';
  body += reportSectionHtml('Summary', reportTableHtml(['Metric','Value'], [
    ['Subjects Taught', String(assignments.length)],
    ['Sections Covered', String(allRows.length)],
    ['Total Students', String(totalStudents)],
    ['Overall Average', overallAvg!=null?overallAvg+'%':'—'],
    ['Red Zone', String(totalRed)],
    ['Green Zone', String(totalGreen)],
  ]));

  assignments.forEach(a=>{
    const rows = a.rows.slice().sort((x,y2)=>{
      if(x.avg==null && y2.avg==null) return 0;
      if(x.avg==null) return 1;
      if(y2.avg==null) return -1;
      return y2.avg-x.avg;
    });
    body += reportSectionHtml(a.subject, reportTableHtml(['Section','Average %','Students','Red','Green'],
      rows.map(r=>[r.def.label, r.avg!=null?r.avg+'%':'—', r.studentCount, r.redCount, r.greenCount])));
  });

  printReport(`${teacherName} — Teacher Performance Report`, `${assignments.length} subject${assignments.length===1?'':'s'} · ${allRows.length} section${allRows.length===1?'':'s'} · ${totalStudents} student${totalStudents===1?'':'s'}`, body);
}

function generateStatListPDF(){
  if(!lastStatListData || !lastStatListData.students.length){ showToast('No student list to print.', 'warn'); return; }
  const { title, subtitle, students } = lastStatListData;
  const cleanTitle = stripEmoji(title) || 'Student List';
  const body = reportTableHtml(['#','Name','Roll No.','Section','Overall %'],
    students.map((s,i)=>[i+1, s.name, (s.rollNo!=null&&s.rollNo!=='')?s.rollNo:'—', s.sectionLabel||'—', s.overall!=null?s.overall+'%':'—']));
  printReport(cleanTitle + ' — Report', subtitle || `${students.length} student${students.length===1?'':'s'}`, body);
}

const printOverallBtn = document.getElementById('printOverallBtn');
if(printOverallBtn) printOverallBtn.addEventListener('click', generateOverallSummaryPDF);
const printSectionBtn = document.getElementById('printSectionBtn');
if(printSectionBtn) printSectionBtn.addEventListener('click', generateSectionSummaryPDF);
const printTeacherBtn = document.getElementById('printTeacherBtn');
if(printTeacherBtn) printTeacherBtn.addEventListener('click', generateTeacherReportPDF);
const statListPrintBtn = document.getElementById('statListPrintBtn');
if(statListPrintBtn) statListPrintBtn.addEventListener('click', generateStatListPDF);

/* ---- 026_keyboard-shortcuts-command-palette-focus-mode-pres.js ---- */

/* ===================== KEYBOARD SHORTCUTS / COMMAND PALETTE / FOCUS MODE / PRESENTATION MODE ===================== */
const SHORTCUTS = [
  {keys:['Ctrl','K'], label:'Open Command Search'},
  {keys:['Ctrl','I'], label:'Import Assessment'},
  {keys:['Ctrl','E'], label:'Export Current Report'},
  {keys:['Ctrl','O'], label:'Open Overall Summary'},
  {keys:['Ctrl','Shift','S'], label:'Open Section Summary'},
  {keys:['Ctrl','Shift','T'], label:'Open Teacher Summary'},
  {keys:['Ctrl','F'], label:'Focus Search'},
  {keys:['Ctrl','Shift','F'], label:'Focus Mode'},
  {keys:['Ctrl','P'], label:'Presentation Mode'},
  {keys:['Esc'], label:'Close drawers, dialogs, or exit Focus / Presentation Mode'},
  {keys:['?'], label:'Open Keyboard Shortcuts Help'},
];
// Note: the spec listed Ctrl+F for both "Focus Search" and, separately, as the Focus Mode
// shortcut. Those can't both be Ctrl+F, so Focus Mode uses Ctrl+Shift+F here to avoid the clash
// (Ctrl+F stays "Focus Search", matching the shortcut list in full).

function renderShortcutsModal(){
  const grid = document.getElementById('shortcutsGrid');
  if(!grid) return;
  grid.innerHTML = SHORTCUTS.map(s=>`
    <div class="shortcut-row">
      <div class="sc-label">${escapeHtml(s.label)}</div>
      <div class="sc-keys">${s.keys.map((k,i)=>`${i>0?'<span class="plus">+</span>':''}<kbd>${escapeHtml(k)}</kbd>`).join('')}</div>
    </div>`).join('');
}
function openShortcutsModal(){
  renderShortcutsModal();
  document.getElementById('shortcutsModal').classList.add('open');
}
function closeShortcutsModal(){
  document.getElementById('shortcutsModal').classList.remove('open');
}
document.getElementById('shortcutsCloseBtn').addEventListener('click', closeShortcutsModal);
document.getElementById('shortcutsModal').addEventListener('click', (e)=>{
  if(e.target.id === 'shortcutsModal') closeShortcutsModal();
});
const shortcutsHelpBtn = document.getElementById('shortcutsHelpBtn');
if(shortcutsHelpBtn) shortcutsHelpBtn.addEventListener('click', openShortcutsModal);

/* ---- Export current report (Ctrl+E): picks the right print generator for whatever's open ---- */
function exportCurrentReport(){
  if(document.getElementById('statListOverlay').classList.contains('open')) return generateStatListPDF();
  if(overallSummaryOpen) return generateOverallSummaryPDF();
  if(sectionSummaryOpen) return generateSectionSummaryPDF();
  if(teacherReportOpen) return generateTeacherReportPDF();
  showToast('Open Overall Summary, Section Summary, or Teacher Report to export it.', 'warning');
}

/* ---- Focus Search (Ctrl+F) ---- */
function focusSearchInput(){
  if(overallSummaryOpen || sectionSummaryOpen || teacherReportOpen) setActivePage('section');
  const input = document.getElementById('studentSearch');
  if(input){ input.focus(); input.select(); }
}

/* ---- Focus Mode (Ctrl+Shift+F) ---- */
let focusModeActive = false;
function enterFocusMode(){
  if(presentationModeActive) exitPresentationMode();
  if(focusModeActive) return;
  focusModeActive = true;
  document.body.classList.add('focus-mode');
  showToast('Focus Mode on. Press Esc to exit.', 'success');
}
function exitFocusMode(){
  if(!focusModeActive) return;
  focusModeActive = false;
  document.body.classList.remove('focus-mode');
}
function toggleFocusMode(){ focusModeActive ? exitFocusMode() : enterFocusMode(); }
document.getElementById('focusModeExitBtn').addEventListener('click', exitFocusMode);
const focusModeBtn = document.getElementById('focusModeBtn');
if(focusModeBtn) focusModeBtn.addEventListener('click', enterFocusMode);

/* ---- Presentation Mode (Ctrl+P) ---- */
let presentationModeActive = false;
let preModeTheme = null;
function enterPresentationMode(){
  if(focusModeActive) exitFocusMode();
  if(presentationModeActive) return;
  presentationModeActive = true;
  preModeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme('dark'); // keep the dark, premium theme for projectors/boardrooms
  document.body.classList.add('presentation-mode');
  showToast('Presentation Mode on. Press Esc to exit.', 'success');
}
function exitPresentationMode(){
  if(!presentationModeActive) return;
  presentationModeActive = false;
  document.body.classList.remove('presentation-mode');
  if(preModeTheme) applyTheme(preModeTheme);
  preModeTheme = null;
}
function togglePresentationMode(){ presentationModeActive ? exitPresentationMode() : enterPresentationMode(); }
document.getElementById('presentationModeExitBtn').addEventListener('click', exitPresentationMode);
const presentationModeBtn = document.getElementById('presentationModeBtn');
if(presentationModeBtn) presentationModeBtn.addEventListener('click', enterPresentationMode);

/* ---- Command Palette / Command Search (Ctrl+K) ---- */
const COMMANDS = [
  {label:'Import Assessment', hint:['Ctrl','I'], action:()=>{ setActivePage('section'); togglePanel('importPanel'); }},
  {label:'Export Current Report', hint:['Ctrl','E'], action:exportCurrentReport},
  {label:'Open Overall Summary', hint:['Ctrl','O'], action:()=>toggleOverallSummary(true)},
  {label:'Open Section Summary', hint:['Ctrl','Shift','S'], action:()=>toggleSectionSummary(true)},
  {label:'Open Teacher Summary', hint:['Ctrl','Shift','T'], action:()=>toggleTeacherReport(true)},
  {label:'Back to Section View', hint:[], action:()=>setActivePage('section')},
  {label:'Focus Search', hint:['Ctrl','F'], action:focusSearchInput},
  {label:'Enter Focus Mode', hint:['Ctrl','Shift','F'], action:enterFocusMode},
  {label:'Enter Presentation Mode', hint:['Ctrl','P'], action:enterPresentationMode},
  {label:'Add / Edit Test Score', hint:[], action:()=>{
    setActivePage('section'); togglePanel('addTestPanel');
    document.getElementById('atSection').value = currentSectionKey();
    populateAddTestSubject(); populateAddTestStudents();
  }},
  {label:'Add Student', hint:[], action:()=>{
    setActivePage('section'); togglePanel('addStudentPanel');
    document.getElementById('asSection').value = currentSectionKey();
  }},
  {label:'Toggle Light / Dark Theme', hint:[], action:()=>{
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(cur);
  }},
  {label:'Keyboard Shortcuts Help', hint:['?'], action:openShortcutsModal},
];

let cmdkFiltered = COMMANDS;
let cmdkActiveIndex = 0;
function renderCmdkResults(){
  const host = document.getElementById('cmdkResults');
  if(!cmdkFiltered.length){
    host.innerHTML = `<div class="cmdk-empty">No matching commands.</div>`;
    return;
  }
  host.innerHTML = cmdkFiltered.map((c,i)=>`
    <div class="cmdk-item ${i===cmdkActiveIndex?'active':''}" data-idx="${i}">
      <span>${escapeHtml(c.label)}</span>
      <span class="sc-keys">${c.hint.map((k,j)=>`${j>0?'<span class="plus">+</span>':''}<kbd>${escapeHtml(k)}</kbd>`).join('')}</span>
    </div>`).join('');
}
function openCommandPalette(){
  document.getElementById('commandPaletteOverlay').classList.add('open');
  const input = document.getElementById('cmdkInput');
  input.value = '';
  cmdkFiltered = COMMANDS;
  cmdkActiveIndex = 0;
  renderCmdkResults();
  setTimeout(()=>input.focus(), 30);
}
function closeCommandPalette(){
  document.getElementById('commandPaletteOverlay').classList.remove('open');
}
function runActiveCommand(){
  const cmd = cmdkFiltered[cmdkActiveIndex];
  closeCommandPalette();
  if(cmd) cmd.action();
}
document.getElementById('cmdkInput').addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  cmdkFiltered = !q ? COMMANDS : COMMANDS.filter(c=>c.label.toLowerCase().includes(q));
  cmdkActiveIndex = 0;
  renderCmdkResults();
});
document.getElementById('cmdkInput').addEventListener('keydown', (e)=>{
  if(e.key === 'ArrowDown'){ e.preventDefault(); cmdkActiveIndex = Math.min(cmdkActiveIndex+1, cmdkFiltered.length-1); renderCmdkResults(); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); cmdkActiveIndex = Math.max(cmdkActiveIndex-1, 0); renderCmdkResults(); }
  else if(e.key === 'Enter'){ e.preventDefault(); runActiveCommand(); }
});
document.getElementById('cmdkResults').addEventListener('click', (e)=>{
  const item = e.target.closest('.cmdk-item[data-idx]');
  if(!item) return;
  cmdkActiveIndex = +item.getAttribute('data-idx');
  runActiveCommand();
});
document.getElementById('commandPaletteOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'commandPaletteOverlay') closeCommandPalette();
});

/* ---- Global shortcut dispatcher ---- */
function isTypingTarget(el){
  if(!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
document.addEventListener('keydown', (e)=>{
  const key = e.key;
  const ctrlOrCmd = e.ctrlKey || e.metaKey;

  if(key === 'Escape'){
    let handled = false;
    if(document.getElementById('commandPaletteOverlay').classList.contains('open')){ closeCommandPalette(); handled = true; }
    if(document.getElementById('shortcutsModal').classList.contains('open')){ closeShortcutsModal(); handled = true; }
    if(document.getElementById('statListOverlay').classList.contains('open')){ closeStatListDrawer(); handled = true; }
    if(document.getElementById('studentDrawerOverlay').classList.contains('open')){ closeStudentDrawer(); handled = true; }
    document.querySelectorAll('.panel.open').forEach(p=>{ p.classList.remove('open'); handled = true; });
    document.querySelectorAll('.menu-dropdown.open').forEach(m=>{ m.classList.remove('open'); handled = true; });
    if(!handled && presentationModeActive){ exitPresentationMode(); handled = true; }
    if(!handled && focusModeActive){ exitFocusMode(); handled = true; }
    return;
  }

  if(ctrlOrCmd && !e.altKey && (key === 'k' || key === 'K')){ e.preventDefault(); openCommandPalette(); return; }
  if(ctrlOrCmd && !e.shiftKey && !e.altKey && (key === 'i' || key === 'I')){ e.preventDefault(); setActivePage('section'); togglePanel('importPanel'); return; }
  if(ctrlOrCmd && !e.shiftKey && !e.altKey && (key === 'e' || key === 'E')){ e.preventDefault(); exportCurrentReport(); return; }
  if(ctrlOrCmd && !e.shiftKey && !e.altKey && (key === 'o' || key === 'O')){ e.preventDefault(); toggleOverallSummary(true); return; }
  if(ctrlOrCmd && e.shiftKey && (key === 's' || key === 'S')){ e.preventDefault(); toggleSectionSummary(true); return; }
  if(ctrlOrCmd && e.shiftKey && (key === 't' || key === 'T')){ e.preventDefault(); toggleTeacherReport(true); return; }
  if(ctrlOrCmd && e.shiftKey && (key === 'f' || key === 'F')){ e.preventDefault(); toggleFocusMode(); return; }
  if(ctrlOrCmd && !e.shiftKey && !e.altKey && (key === 'f' || key === 'F')){ e.preventDefault(); focusSearchInput(); return; }
  if(ctrlOrCmd && !e.shiftKey && !e.altKey && (key === 'p' || key === 'P')){ e.preventDefault(); togglePresentationMode(); return; }
  if(key === '?' && !isTypingTarget(e.target)){ e.preventDefault(); openShortcutsModal(); return; }
});

/* ---- 027_premium-micro-interactions-visual-only.js ---- */

/* ================= Premium micro-interactions (visual only) ================= */
(function(){
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Ripple + spotlight targets ---
  const RIPPLE_SELECTOR = 'button, .chip';
  const SPOTLIGHT_SELECTOR = '.card, .chart-card, .hero-metric';

  if(!reduceMotion){
    document.addEventListener('pointerdown', function(e){
      const target = e.target.closest(RIPPLE_SELECTOR);
      if(!target) return;
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.6;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
      target.appendChild(ripple);
      setTimeout(()=>{ if(ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 600);
    }, true);
  }

  document.addEventListener('pointermove', function(e){
    const target = e.target.closest(SPOTLIGHT_SELECTOR);
    if(!target) return;
    const rect = target.getBoundingClientRect();
    let layer = target.querySelector(':scope > .spotlight-layer');
    if(!layer){
      layer = document.createElement('div');
      layer.className = 'spotlight-layer';
      target.appendChild(layer);
    }
    target.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width * 100) + '%');
    target.style.setProperty('--my', ((e.clientY - rect.top) / rect.height * 100) + '%');
  }, true);

  // --- Custom floating tooltips (replaces native title tooltip) ---
  let tipEl = null;
  let tipTimer = null;
  function hideTooltip(){
    if(tipEl){ tipEl.classList.remove('show'); }
    if(tipTimer){ clearTimeout(tipTimer); tipTimer = null; }
  }
  document.addEventListener('mouseover', function(e){
    const target = e.target.closest('[title]');
    if(!target || !target.getAttribute('title')) return;
    const text = target.getAttribute('title');
    target.setAttribute('data-spl-title', text);
    target.removeAttribute('title');
    tipTimer = setTimeout(()=>{
      if(!tipEl){
        tipEl = document.createElement('div');
        tipEl.className = 'spl-tooltip';
        document.body.appendChild(tipEl);
      }
      tipEl.textContent = text;
      const rect = target.getBoundingClientRect();
      const above = rect.top > 60;
      tipEl.className = 'spl-tooltip ' + (above ? 'pos-top' : 'pos-bottom');
      document.body.appendChild(tipEl);
      const tipRect = tipEl.getBoundingClientRect();
      let left = rect.left + rect.width/2 - tipRect.width/2;
      left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
      const top = above ? (rect.top - tipRect.height - 10) : (rect.bottom + 10);
      tipEl.style.left = left + 'px';
      tipEl.style.top = top + 'px';
      requestAnimationFrame(()=> tipEl.classList.add('show'));
    }, 350);
  }, true);
  document.addEventListener('mouseout', function(e){
    const target = e.target.closest('[data-spl-title]');
    if(!target) return;
    target.setAttribute('title', target.getAttribute('data-spl-title'));
    target.removeAttribute('data-spl-title');
    hideTooltip();
  }, true);
  document.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('blur', hideTooltip);

  // --- Interface Sounds toggle ---
  const soundBtn = document.getElementById('soundToggleBtn');
  const soundLabel = document.getElementById('soundToggleLabel');
  function refreshSoundLabel(){
    let on = false;
    try{ on = localStorage.getItem('spl-sounds') === 'on'; }catch(e){}
    if(soundLabel) soundLabel.textContent = 'Interface Sounds: ' + (on ? 'On' : 'Off');
    if(soundBtn) soundBtn.classList.toggle('active', on);
  }
  if(soundBtn){
    soundBtn.addEventListener('click', function(){
      let on = false;
      try{ on = localStorage.getItem('spl-sounds') === 'on'; }catch(e){}
      try{ localStorage.setItem('spl-sounds', on ? 'off' : 'on'); }catch(e){}
      refreshSoundLabel();
      if(!on && typeof playInterfaceSound === 'function') playInterfaceSound('success');
    });
    refreshSoundLabel();
  }
})();
