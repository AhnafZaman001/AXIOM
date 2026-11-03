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

// Strips a raw display name down to its "F<number><optional letter>" form,
// e.g. "F16 (PM)" -> "F16", "F1A" -> "F1A". Used only at section-definition
// time (see DEFAULT_RAW_LABELS below) -- never against a name that may have
// since been renamed, or a promoted section's raw teacher-roster match
// breaks (see rawSectionLabel's comment for why that matters).
function rawLabelFromName(name){
  const m = String(name||'').match(/^F\d+[A-Za-z]?/);
  return m ? m[0].toUpperCase() : null;
}
// Captures each section's raw label ONCE, at the point it's first defined
// (from its original/default sheetName), keyed by the stable `key` --
// never recomputed from the section's current (possibly renamed) sheetName.
// This is what makes rawSectionLabel() below immune to renames: promoting a
// section from 1st year to 2nd year (e.g. "F1A" -> "S1A") changes
// def.sheetName, but DEFAULT_RAW_LABELS[key] keeps returning "F1A" forever,
// so the section keeps matching its default TEACHER_DATA roster instead of
// silently vanishing from every teacher's report the moment it's renamed.
const DEFAULT_RAW_LABELS = Object.fromEntries(SECTION_DEFS.map(d=>[d.key, rawLabelFromName(d.sheetName)]));

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
// Registers a section that exists in the cloud `sections` table, called
// once per row right after loading from Supabase, before any UI that reads
// SECTION_DEFS is populated.
//
// Two cases, both handled here:
//  1. Key not known locally at all (added from another device/login) --
//     push a brand new def, same as before.
//  2. Key IS one of the 23 hardcoded SECTION_DEFS -- reconcile that def's
//     mutable fields (sheetName/label/group/subjects) to match the cloud
//     row instead of no-op'ing. This used to just `return` for any known
//     key, on the assumption a hardcoded section's identity is fully
//     described in code -- true for key/group at definition time, but NOT
//     true for sheetName/label once a promotion has renamed it in the
//     cloud (e.g. "F1A" -> "S1A"). Skipping case 2 meant a rename could be
//     written to the cloud successfully (axUpdateSectionMeta) and then
//     silently discarded on the very next fresh load, because nothing ever
//     read it back for an already-known key -- the rename would only
//     "stick" for as long as that one browser tab's in-memory state
//     happened to stay alive.
function registerCloudSectionDef({ key, sheet_name, subject_group, label }){
  if(!key) return;
  const group = SUBJECT_SETS[subject_group] ? subject_group : Object.keys(SUBJECT_SETS)[0];
  if(!SUBJECT_SETS[subject_group]){
    console.warn(`Cloud section "${key}" has no recognizable subject group ("${subject_group}") — defaulting to ${group}.`);
  }
  const sheetName = sheet_name || label || key;
  const resolvedLabel = label || `${sheetName} — ${GROUP_LABELS[group]}`;

  const existing = SECTION_BY_KEY[key];
  if(existing){
    // Case 2: reconcile the already-known def to the cloud's current state.
    if(existing.sheetName !== sheetName) delete SHEETNAME_TO_KEY[normalizeSheetName(existing.sheetName)];
    existing.sheetName = sheetName;
    existing.label = resolvedLabel;
    if(existing.group !== group){
      existing.group = group;
      existing.subjects = SUBJECT_SETS[group]; // per-section overrides re-applied separately, after this
    }
    SHEETNAME_TO_KEY[normalizeSheetName(sheetName)] = key;
    if(!(key in DEFAULT_RAW_LABELS)) DEFAULT_RAW_LABELS[key] = rawLabelFromName(sheetName);
    return;
  }

  // Case 1: genuinely new section, not known locally at all.
  const def = { key, sheetName, group, label: resolvedLabel, subjects: SUBJECT_SETS[group] };
  SECTION_DEFS.push(def);
  SECTION_BY_KEY[key] = def;
  SHEETNAME_TO_KEY[normalizeSheetName(sheetName)] = key;
  if(!(key in DEFAULT_RAW_LABELS)) DEFAULT_RAW_LABELS[key] = rawLabelFromName(sheetName);
}

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
  if(!(key in DEFAULT_RAW_LABELS)) DEFAULT_RAW_LABELS[key] = rawLabelFromName(sheetName);
  return def;
}

/* ------------- Per-section subject overrides -------------
   Real problem this solves: students promoted from 1st year to 2nd
   year need a DIFFERENT subject list for the SAME section (Islamiat
   replaced by Pak Study; I.Com 2nd-year gains 4 new subjects) --
   without changing the subject GROUP itself, since a future brand
   new 1st-year section in that same group should still start with
   the original list.

   Critical thing these functions guard against: def.subjects starts
   out as a SHARED array reference -- every section in the same
   group points at the exact same SUBJECT_SETS[group] array object,
   not a copy of it (see addSectionDef/registerCloudSectionDef
   above). Naively pushing/splicing that array in place would
   silently corrupt every OTHER section sharing that same group.
   applySubjectOverride() always assigns a brand new array, breaking
   the shared reference for just the one section being changed --
   every other section in that group keeps using the original
   shared array, completely unaffected. */
function applySubjectOverride(sectionKey, subjects){
  const def = SECTION_BY_KEY[sectionKey];
  if(!def) return;
  def.subjects = subjects.slice(); // always a fresh array, never the shared group array
}

function addSubjectToSection(sectionKey, subjectName){
  subjectName = String(subjectName||'').trim();
  if(!subjectName) throw new Error('Enter a subject name.');
  const def = SECTION_BY_KEY[sectionKey];
  if(!def) throw new Error('Section not found.');
  if(def.subjects.includes(subjectName)) throw new Error(`"${subjectName}" is already in this section's subject list.`);
  const updated = def.subjects.concat([subjectName]); // new array, doesn't touch the old one
  applySubjectOverride(sectionKey, updated);
  return updated;
}

function removeSubjectFromSection(sectionKey, subjectName){
  const def = SECTION_BY_KEY[sectionKey];
  if(!def) throw new Error('Section not found.');
  if(!def.subjects.includes(subjectName)) throw new Error(`"${subjectName}" isn't in this section's subject list.`);
  if(def.subjects.length <= 1) throw new Error('A section needs at least one subject.');
  const updated = def.subjects.filter(s => s !== subjectName);
  applySubjectOverride(sectionKey, updated);
  return updated;
}

// Every distinct subject name across every group, for the "pick an
// existing subject" half of the Manage Subjects dropdown -- so
// adding e.g. "English" to a section that's missing it doesn't
// require retyping it from scratch.
function allKnownSubjects(){
  const set = new Set();
  Object.values(SUBJECT_SETS).forEach(list => list.forEach(s => set.add(s)));
  SECTION_DEFS.forEach(d => d.subjects.forEach(s => set.add(s)));
  return Array.from(set).sort();
}
// Renames an existing section's display/sheet name in place (student and
// test data are untouched since they're keyed by the stable `key`, not the
// name). Optionally also changes its subject group — e.g. fixing a section
// that was accidentally created as Pre-Medical when it should be ICS —
// which recomputes def.subjects so the right columns show up everywhere.
// Persists both into workspace.sectionRenames/sectionGroupOverrides so they
// survive a Download Workspace -> Upload Workspace round trip. Throws a
// plain Error with a user-facing message on invalid/duplicate names.
function renameSectionDef(key, newName, newGroup){
  newName = String(newName||'').trim();
  if(!newName) throw new Error('Enter a section name.');
  const def = SECTION_BY_KEY[key];
  if(!def) throw new Error('Section not found.');
  if(newGroup && !SUBJECT_SETS[newGroup]) throw new Error('Choose a valid subject group.');
  const normalized = normalizeSheetName(newName);
  const existingKey = SHEETNAME_TO_KEY[normalized];
  if(existingKey && existingKey !== key) throw new Error(`A section named "${newName}" already exists.`);
  delete SHEETNAME_TO_KEY[normalizeSheetName(def.sheetName)];
  def.sheetName = newName;
  if(newGroup){
    def.group = newGroup;
    def.subjects = SUBJECT_SETS[newGroup];
  }
  def.label = `${newName} — ${GROUP_LABELS[def.group]}`;
  SHEETNAME_TO_KEY[normalized] = key;
  if(typeof workspace !== 'undefined' && workspace){
    workspace.sectionRenames = workspace.sectionRenames || {};
    workspace.sectionRenames[key] = newName;
    if(newGroup){
      workspace.sectionGroupOverrides = workspace.sectionGroupOverrides || {};
      workspace.sectionGroupOverrides[key] = newGroup;
    }
  }
  return def;
}
// Re-applies any section renames/group changes stored in a loaded workspace
// file onto the live SECTION_DEFS (called right after a workspace upload,
// since SECTION_DEFS itself isn't part of the saved file — only these maps
// are).
function applyPersistedSectionRenames(){
  if(!workspace) return;
  if(workspace.sectionGroupOverrides){
    Object.entries(workspace.sectionGroupOverrides).forEach(([key, group])=>{
      const def = SECTION_BY_KEY[key];
      if(!def || !SUBJECT_SETS[group] || def.group === group) return;
      def.group = group;
      def.subjects = SUBJECT_SETS[group];
    });
  }
  if(!workspace.sectionRenames) return;
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
  ['Biology', ['BIOLOG','BIO']],
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

// Returns the keyword list to match a subject's header cell against.
// Known subjects (Physics, Chemistry, etc.) use the curated synonym
// list above, which tolerates real-world header variations ("PHYSIC"
// catches "Physics"/"PHY SICS"/etc.). A subject added to a section
// via Manage Subjects that isn't in that curated list (e.g. "Pak
// Study", "Banking", "Business Statistics", "Commercial Geography")
// falls back to matching its own name directly -- otherwise it
// would never be detected on import at all, regardless of what the
// Excel header actually says.
function keywordsForSubject(subj){
  const known = SUBJECT_KEYWORDS.find(k=>k[0]===subj);
  if(known) return known[1];
  return [normalizeHeaderText(subj)];
}
