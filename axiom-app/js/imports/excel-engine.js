/* ---- 007_excel-import-engine.js ---- */

/* ===================== EXCEL IMPORT ENGINE ===================== */
let pendingImport = null; // holds parsed-but-unapplied result

function cellIsNumber(v){ return typeof v === 'number' && !Number.isNaN(v); }

// Excel headers sometimes wrap onto two lines inside a single cell (e.g. a
// merged "PAK \nSTUDIES" cell), which puts a newline where a plain subject
// name like "PAK STUDIES" has a space. A straight substring check then never
// matches even though the header is clearly the right column. Collapsing all
// whitespace (newlines, tabs, repeated spaces) down to single spaces before
// comparing makes header/subject matching resilient to that line-wrapping.
function normalizeHeaderText(s){
  return String(s||'').toUpperCase().replace(/\s+/g,' ').trim();
}

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
        const up = normalizeHeaderText(cell);
        for(const subj of subjects){
          const kws = keywordsForSubject(subj);
          if(kws.some(kw=>up.includes(kw))){ matches++; break; }
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
      const up = normalizeHeaderText(cell);
      for(const subj of subjects){
        const kws = keywordsForSubject(subj);
        if(kws.some(kw=>up.includes(kw))){ hits.push({subject:subj, col:c}); break; }
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

// Auto-name a test/import when the user leaves the "Test / Exam Name" field
// blank, so entering a name is a convenience rather than a requirement.
// Produces sequential names like "Test 1", "Test 2", ... by checking how many
// tests already exist across the current workspace data.
function generateDefaultTestName(){
  let maxNum = 0;
  try{
    const sections = (typeof workspace !== 'undefined' && workspace && workspace.sections) ? workspace.sections : {};
    Object.values(sections).forEach(sec=>{
      (sec.students||[]).forEach(stu=>{
        Object.values(stu.tests||{}).forEach(entries=>{
          (entries||[]).forEach(entry=>{
            const m = /^Test (\d+)$/.exec(entry.test||'');
            if(m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
          });
        });
      });
    });
  }catch(err){ /* fall back to Test 1 if workspace shape is unexpected */ }
  return `Test ${maxNum + 1}`;
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

function applyImport(parsed, deferSave = false){
  parsed.matched.forEach(sec=>{
    const store = ensureSection(sec.sectionKey);
    // Index once per section instead of scanning the whole roster per row.
    // First matches win, preserving the existing duplicate/name fallback rules.
    const byName = new Map();
    const byRoll = new Map();
    const indexRolls = ()=>{
      byRoll.clear();
      store.students.forEach(st=>{
        if(st.rollNo){
          const key = String(st.rollNo).trim();
          if(!byRoll.has(key)) byRoll.set(key, st);
        }
      });
    };
    indexRolls();
    store.students.forEach(st=>{
      const key = st.name.trim().toLowerCase();
      if(!byName.has(key)) byName.set(key, st);
    });
    sec.students.forEach(s=>{
      let student = null;
      if(s.rollNo){
        student = byRoll.get(String(s.rollNo).trim());
      }
      if(!student){
        student = byName.get(s.name.trim().toLowerCase());
      }
      if(!student){
        student = {id:uid(), name:s.name, rollNo:s.rollNo, matric:s.matric, tests:{}};
        store.students.push(student);
        byName.set(s.name.trim().toLowerCase(), student);
        if(s.rollNo) byRoll.set(String(s.rollNo).trim(), student);
      } else {
        if(s.rollNo){
          const changed = String(student.rollNo || '').trim() !== String(s.rollNo).trim();
          student.rollNo = s.rollNo;
          // A corrected roll number must remove the old key immediately.
          if(changed) indexRolls();
        }
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
  if(!deferSave) markDirty();
}
