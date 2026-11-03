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

/* ---- 2nd-year teacher roster (source of truth: staff-assigned teacher
   chart, not the 1st-year TEACHER_DATA above) ----
   A promoted section keeps the SAME underlying key/subjects as its 1st-year
   self (see renameSectionDef) but is very often re-staffed for year 2 --
   different teacher, sometimes a teacher who didn't teach that raw class at
   all in year 1. Reusing TEACHER_DATA for promoted sections was exactly the
   bug that made P. H. Shahid Ali's S1A vanish from his own report (see the
   earlier fix): a promoted section's raw code still resolves fine, but the
   *teacher* it resolves to is 1st-year staffing, which is often wrong once
   the section is in year 2.
   This table is keyed by the CURRENT displayed section code (S1A, S16, …)
   exactly as promotion renames it, and is the ONLY source consulted for a
   section currently in that S-prefixed state -- see lookupTeacher below.
   If a subject/section combo isn't listed here, that's read as "no 2nd-year
   teacher on record for it" rather than falling back to TEACHER_DATA, since
   1st- and 2nd-year staffing for the same raw class are frequently
   different people entirely. */
const SECOND_YEAR_TEACHER_DATA = {
  'Physics': [
    {teacher:'P. Saad Ullah', sections:['S1A','S1B','S2','S13']},
    {teacher:'P. Saqib Jamil', sections:['S3','S6','S9']},
    {teacher:'P. Naveed Ikram', sections:['S4','S7','S8']},
    {teacher:'P. Amira', sections:['S14','S15','S16']},
    {teacher:'P. Nayyar Sultan', sections:['S10','S11','S12']},
  ],
  'Chemistry': [
    {teacher:'P. H. Shahid Ali', sections:['S1A','S1B','S2']},
    {teacher:'P. Wahab', sections:['S3','S4','S12']},
    {teacher:'P. Shahid', sections:['S6','S11','S16']},
    {teacher:'P. Qaza', sections:['S13']},
  ],
  'Biology': [
    {teacher:'P. Raza', sections:['S1A','S1B','S2']},
    {teacher:'P. Sheraz', sections:['S3','S4','S11']},
    {teacher:'P. Misbah', sections:['S12','S16']},
  ],
  'Math': [
    {teacher:'P. Khair', sections:['S6','S7','S8']},
    {teacher:'P. Ilyas', sections:['S9','S10']},
    {teacher:'P. Usman', sections:['S13','S14','S15']},
  ],
  'Computer': [
    {teacher:'P. Shan Zafar', sections:['S7','S8','S13','S14']},
    {teacher:'P. Arslan', sections:['S9','S10','S15']},
  ],
  'English': [
    {teacher:'P. Umer Shah', sections:['S1A','S1B','S2','S4']},
    {teacher:'P. Gulzar', sections:['S3','S13','S14','S15']},
    {teacher:'P. Khubaib', sections:['S6','S7','S8','S16']},
    {teacher:'P. Atif Saeed', sections:['S9','S10','S11','S12']},
  ],
  'Urdu': [
    {teacher:'P. Zahida', sections:['S1A','S1B','S2','S16']},
    {teacher:'P. Farrukh', sections:['S3','S4','S10','S13']},
    {teacher:'P. Naseer', sections:['S6','S7','S14','S15']},
    {teacher:'P. Attiya', sections:['S8','S9','S11','S12']},
  ],
  'PAK STUDIES': [
    {teacher:'P. Shumaila', sections:['S1A','S1B','S2','S3','S4']},
    {teacher:'P. Rizwan', sections:['S6','S7','S8','S9','S10']},
    {teacher:'P. Naeem', sections:['S11','S12','S13','S14','S15','S16']},
  ],
  'TQ': [
    {teacher:'P. Ayesha', sections:['S1A','S1B','S2','S3','S4','S9','S15','S16']},
    {teacher:'P. Asma', sections:['S6','S7','S8','S10','S11','S12','S13','S14']},
  ],
  // I.Com subject-specific 2nd-year teachers (P.AB REHMAN / P.M.ALI, both
  // listed against S16) aren't in yet -- the source chart doesn't say which
  // of Banking/B.Stat/Accounting/C.GEO each one covers, so nothing is
  // guessed here. Add rows above once that's confirmed.
};

// Strips a CURRENT display name down to its promoted "S<number><optional
// letter>" form (e.g. "S1A", "S16"), for matching against
// SECOND_YEAR_TEACHER_DATA. Unlike rawSectionLabel()/DEFAULT_RAW_LABELS,
// this is intentionally read from the section's live sheetName every time:
// a section is only "in year 2" for as long as it's actually named that
// way, and reverts to 1st-year staffing if it's ever renamed back.
function secondYearRawLabel(def){
  if(!def) return null;
  const m = String(def.sheetName||'').match(/^S\d+[A-Za-z]?/i);
  return m ? m[0].toUpperCase() : null;
}

// Returns a section's "raw" label (F1A, F9, F16…) for matching against
// TEACHER_DATA regardless of stream suffix. Reads the stable, rename-proof
// DEFAULT_RAW_LABELS registry (captured once when the section was first
// defined) rather than recomputing from def.sheetName -- the sheetName
// changes on promotion (e.g. "F1A" -> "S1A" for 2nd year), and recomputing
// from that live name would return null the moment a section is renamed to
// something that doesn't start with "F", silently dropping it out of every
// teacher's default roster. Falls back to computing from the current name
// for the rare case a section predates this registry (e.g. an older saved
// workspace loaded before this fix existed).
function rawSectionLabel(def){
  if(!def) return null;
  if(def.key in DEFAULT_RAW_LABELS && DEFAULT_RAW_LABELS[def.key]) return DEFAULT_RAW_LABELS[def.key];
  return rawLabelFromName(def.sheetName);
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
// override first. Then, if the section is CURRENTLY in its promoted/2nd-year
// state (its live sheetName reads as "S1A", "S16", etc.), consults ONLY
// SECOND_YEAR_TEACHER_DATA -- that chart is the sole source of truth for a
// promoted section's teacher, so a combo missing from it means "no 2nd-year
// teacher on record", not "fall back to whoever taught it in year 1".
// Otherwise falls back to the 1st-year default roster (matched by raw
// section label, e.g. F16 PM/PE/ICS/ICOM all share the same default F16 row).
function lookupTeacher(subject, def){
  if(!def || !subject) return null;
  const override = getTeacherOverride(def.key, subject);
  if(override !== undefined) return override || null;
  const year2Raw = secondYearRawLabel(def);
  if(year2Raw){
    const entries2 = SECOND_YEAR_TEACHER_DATA[subject];
    const hit2 = entries2 && entries2.find(e=>e.sections.includes(year2Raw));
    return hit2 ? hit2.teacher : null;
  }
  const raw = rawSectionLabel(def);
  if(!raw) return null;
  const entries = TEACHER_DATA[subject];
  if(!entries) return null;
  const hit = entries.find(e=>e.sections.includes(raw));
  return hit ? hit.teacher : null;
}
