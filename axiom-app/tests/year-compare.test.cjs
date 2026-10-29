// Run with Node 20+: node --test axiom-app/tests/year-compare.test.cjs
// Fixtures are synthetic. They copy the LAYOUT of a real stream result sheet
// (title row, maximum-marks row, "Student Name" label row, padded empty rows)
// but contain no real student data.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Core=require(path.join(__dirname,'..','js','year-compare-core.js'));

/* ---------- fixture helpers ---------- */
function sheetRows({title,subjects,students,pad=0,total=true}){
  const maxTotal=subjects.reduce((a,s)=>a+s.max,0);
  const head=['Sr.No',title,'Roll No.','Matric\nMarks','1st Year\nMarks'];
  const maxRow=[null,null,null,null,null];
  subjects.forEach(s=>{head.push(s.name);maxRow.push(s.max);});
  head.push('TOTAL MARKS','Percentage','Grade','Position');
  maxRow.push(null,null,null,null);
  const label=[null,'Student Name',null,null,null];
  subjects.forEach(()=>label.push(null));
  label.push(maxTotal,null,null,null);
  const rows=[head,maxRow,label];
  students.forEach((s,i)=>{
    const marks=s.marks;
    const sum=marks.reduce((a,m)=>a+(typeof m==='number'?m:0),0);
    rows.push([s.sr===undefined?i+1:s.sr,s.name,s.roll===undefined?i+1:s.roll,null,null,...marks,sum,sum/maxTotal,'X',i+1]);
  });
  for(let i=0;i<pad;i++) rows.push([students.length+i+1,null,null,null,null,...subjects.map(()=>null),0,0,'F',99]);
  return rows;
}
const SUBJ=[{name:'PHYSICS',max:100},{name:'CHEMISTRY',max:100},{name:'MATH',max:100},{name:'ENGLISH',max:100}];
function dataset(label,students,opts={}){
  const rows=sheetRows({title:`RESULT (${opts.stream||'PM'})\n(${label})`,subjects:opts.subjects||SUBJ,students,pad:opts.pad||0});
  const p=Core.parseSheet(rows,`RESULT (${opts.stream||'PM'}) (Pv2025)`);
  assert.equal(p.ok,true,p.reason);
  return Core.buildDataset({label,assessment:opts.assessment===undefined?'Annual exam':opts.assessment,grade:opts.grade||''},[{parsed:p,streamLabel:opts.stream||'PM'}]);
}
// n students scoring `score` in every subject (names are made up)
function cohort(n,score,prefix='S'){return Array.from({length:n},(_,i)=>({name:`${prefix}${i}`,marks:SUBJ.map(()=>score)}));}

/* ---------- reader ---------- */
test('reads a stream sheet: subjects, maxima, stream, year and assessment; names are never stored',()=>{
  const rows=sheetRows({title:'FY BOARD RESULT (PM)\n(2025-26)',subjects:SUBJ,students:[{name:'ALI KHAN',marks:[50,60,70,80]},{name:'SARA AHMED',marks:[90,80,70,60]}]});
  const w=Core.parseWorkbook([{name:'FY BOARD RESULT (PM) (Pv2025)',rows}],{fileName:'x.xls'});
  const p=w.sheets[0];
  assert.deepEqual(p.subjects.map(s=>[s.name,s.max]),[['PHYSICS',100],['CHEMISTRY',100],['MATH',100],['ENGLISH',100]]);
  assert.equal(p.stream.label,'PM');
  assert.equal(w.yearGuess,'2025-26');
  assert.equal(w.assessmentGuess,'FY BOARD RESULT');
  const ds=Core.buildDataset({label:'2025-26',assessment:'FY'},[{parsed:p,streamLabel:'PM'}]);
  const stored=JSON.stringify(ds);
  assert.ok(!/\bALI\b|\bSARA\b|KHAN|AHMED/i.test(stored),'no student names in the stored dataset');
  assert.ok(ds.records.every(r=>/^r\d+$/.test(r.i)),'anonymous record ids');
  assert.ok(!('roll' in ds.records[0]));
});
test('padding rows are ignored; a named student with no marks is listed, not failed',()=>{
  const ds=dataset('2026-27',[{name:'A',marks:[50,50,50,50]},{name:'B',marks:[null,null,null,null]},{name:'C',marks:[0,0,0,0]}],{pad:5});
  const a=Core.analyseDataset(ds);
  assert.equal(a.pooled.listed,3);          // A, B, C — the 5 padding rows are not students
  assert.equal(a.pooled.noMarks,1);         // B has nothing entered
  assert.equal(a.pooled.withMarks,2);       // C scored real zeros
  assert.equal(ds.import_report.padding,5);
});
test('a real zero stays a score and counts as below pass',()=>{
  const ds=dataset('2026-27',[{name:'A',marks:[0,60,60,60]}]);
  const m=Core.analyseDataset(ds).pooled;
  assert.equal(m.withMarks,1);
  assert.equal(m.belowPass.recorded,1);
});
test('a blank subject is not a zero: percentage uses the subjects the student has',()=>{
  const ds=dataset('2026-27',[{name:'A',marks:[80,80,null,80]}]);
  const a=Core.analyseDataset(ds,{basis:'marked'});
  assert.equal(a.pooled.median,80);          // explicitly selected available-subject view
  assert.equal(a.pooled.complete,0);
  assert.equal(a.pooled.partial,1);
  assert.equal(a.pooled.belowPass.unknown,1); // no recorded failure, but a pass cannot be confirmed
  assert.equal(a.pooled.belowPass.confirmedPass,0);
});
test('absent is its own status: not a zero, not a failure',()=>{
  assert.equal(Core.classifyCell('AB').k,'a');
  assert.equal(Core.classifyCell('abs').k,'a');
  assert.equal(Core.classifyCell('N/A').k,'n');
  const ds=dataset('2026-27',[{name:'A',marks:[70,70,'AB',70]}]);
  const m=Core.analyseDataset(ds,{basis:'marked'}).pooled;
  assert.equal(m.median,70);
  assert.equal(m.belowPass.recorded,0);
  assert.equal(m.complete,0);
});
test('marks above the maximum are left out and reported, never scored',()=>{
  const ds=dataset('2026-27',[{name:'A',marks:[150,60,60,60]}]);
  assert.equal(ds.import_report.aboveMax,1);
  const m=Core.analyseDataset(ds,{basis:'marked'}).pooled;
  assert.equal(m.median,60);
  assert.match(ds.import_report.warnings.join(' '),/above the subject maximum/);
});
test('partial paper (theory filled, practical blank) is not scored',()=>{
  const rows=sheetRows({title:'R (PM)\n(2026-27)',subjects:[{name:'PHYSICS',max:100},{name:'MATH',max:100},{name:'ENGLISH',max:100}],students:[{name:'A',marks:[50,50,50]}]});
  // give PHYSICS a second (practical) column with its own maximum
  rows.forEach((r,i)=>r.splice(6,0,i===0?null:i===1?25:i===2?null:null));
  const p=Core.parseSheet(rows,'R (PM)');
  assert.equal(p.subjects.find(s=>s.name==='PHYSICS').max,125);
  assert.equal(p.records[0].c[0][0],'p');   // only the theory column is filled
});
test('rows with no Sr.No are still read, and an exact duplicate row is excluded',()=>{
  const ds=dataset('2026-27',[{name:'A',roll:1,marks:[50,50,50,50]},{name:'B',sr:null,roll:2,marks:[60,60,60,60]},{name:'A',roll:1,marks:[50,50,50,50]}]);
  assert.equal(ds.records.length,2);
  assert.equal(ds.import_report.duplicates,1);
});
test('the same roll number on different students is kept (rolls repeat across sections)',()=>{
  const ds=dataset('2026-27',[{name:'A',roll:5,marks:[50,50,50,50]},{name:'B',roll:5,marks:[60,60,60,60]}]);
  assert.equal(ds.records.length,2);
});
test('summary rows such as Total or Average are skipped',()=>{
  const ds=dataset('2026-27',[{name:'A',marks:[50,50,50,50]},{name:'Average',marks:[50,50,50,50]}]);
  assert.equal(ds.records.length,1);
  assert.equal(ds.import_report.summaryRows,1);
});
test('a sheet with no recognisable layout is skipped with a reason, not guessed',()=>{
  const w=Core.parseWorkbook([{name:'Notes',rows:[['hello'],['world']]}]);
  assert.equal(w.sheets.length,0);
  assert.equal(w.skipped.length,1);
});
test('stream detection ignores year suffixes so streams match across years',()=>{
  assert.equal(Core.detectStream('FY BOARD RESULT (PM) (Pv2025)','').label,'PM');
  assert.equal(Core.detectStream('FY BOARD RESULT (PE) (Pv 2025)','').label,'PE');
  assert.equal(Core.detectStream('Sheet1','FY RESULT (ICS)\n(2026-27)').label,'ICS');
  assert.equal(Core.streamKey('Pre-Med'),'PREMED');
});
test('sheets sharing a stream cannot silently turn omitted subjects into exemptions',()=>{
  const mk=(subjects,students)=>Core.parseSheet(sheetRows({title:'R (PM)\n(2026-27)',subjects,students}),'R (PM)');
  const a=mk(SUBJ,[{name:'A',marks:[50,50,50,50]}]);
  const b=mk([{name:'PHYSICS',max:100},{name:'ENGLISH',max:100}],[{name:'B',marks:[60,60]}]);
  assert.throws(()=>Core.buildDataset({label:'2026-27'},[{parsed:a,streamLabel:'PM'},{parsed:b,streamLabel:'PM'}]),/Subject lists differ/);
});

/* ---------- statistics ---------- */
test('thresholds: exactly at the support line is not support; exactly at 90 is excellent',()=>{
  const ds=dataset('2026-27',[{name:'A',marks:[50,50,50,50]},{name:'B',marks:[49.9,50,50,50]},{name:'C',marks:[90,90,90,90]}]);
  const m=Core.analyseDataset(ds).pooled;
  assert.equal(m.support.n,1);              // only B is below 50
  assert.equal(m.excellence.n,1);           // C at 90 counts
});
test('below-pass counts a student once, however many subjects they fail',()=>{
  const ds=dataset('2026-27',[{name:'A',marks:[10,20,30,80]},{name:'B',marks:[60,60,60,60]}]);
  const m=Core.analyseDataset(ds).pooled;
  assert.equal(m.belowPass.recorded,1);
  assert.equal(m.belowPass.confirmedPass,1);
});
test('settings are editable and apply to every year equally',()=>{
  const ds=dataset('2026-27',cohort(10,55));
  assert.equal(Core.analyseDataset(ds,{support:60}).pooled.support.n,10);
  assert.equal(Core.analyseDataset(ds,{support:50}).pooled.support.n,0);
  assert.equal(Core.settingsFrom({support:'abc'}).support,50);   // bad input falls back to the default
  assert.equal(Core.settingsFrom({excellence:500}).excellence,100);
});
test('basis "complete" leaves out students with a missing subject',()=>{
  const ds=dataset('2026-27',[{name:'A',marks:[80,80,80,80]},{name:'B',marks:[40,40,null,40]}]);
  assert.equal(Core.analyseDataset(ds,{basis:'marked'}).pooled.n,2);
  assert.equal(Core.analyseDataset(ds,{basis:'complete'}).pooled.n,1);
});
test('an empty eligible group does not crash and reports no numbers',()=>{
  const ds=dataset('2026-27',[{name:'A',marks:[null,null,null,null]}]);
  const a=Core.analyseDataset(ds);
  assert.equal(a.pooled.n,0);
  assert.equal(a.pooled.median,null);
  assert.equal(a.pooled.support.share,null);
  assert.equal(a.streams[0].metrics.n,0);
});

/* ---------- comparison checks ---------- */
test('checks flag a changed assessment, subject list and maximum marks',()=>{
  const a=dataset('2025-26',cohort(20,60),{assessment:'Mid term'});
  const b=dataset('2026-27',cohort(20,60),{assessment:'Final',subjects:[{name:'PHYSICS',max:75},{name:'CHEMISTRY',max:100},{name:'ENGLISH',max:100},{name:'BIOLOGY',max:100}]});
  const r=Core.compareDatasets(a,b);
  const st=id=>r.checks.find(c=>c.id===id).status;
  assert.equal(st('assessment'),'review');
  assert.equal(st('basket'),'review');
  assert.equal(st('maxima'),'review');
  assert.equal(r.status,'review');
});
test('checks flag low coverage and a stream present in one year only',()=>{
  const a=dataset('2025-26',cohort(20,60));
  const b=dataset('2026-27',[...cohort(10,60),...Array.from({length:10},(_,i)=>({name:`N${i}`,marks:[null,null,null,null]}))],{stream:'PE'});
  const r=Core.compareDatasets(a,b);
  assert.equal(r.checks.find(c=>c.id==='coverage').status,'review');
  assert.equal(r.checks.find(c=>c.id==='streams').status,'review');
});
test('stream mix can reverse the pooled picture, and the diagnostic says so',()=>{
  // Each stream rises by 5 points, but the weight moves to the lower-scoring stream.
  const mk=(label,x,y)=>{
    const sx=Core.parseSheet(sheetRows({title:'R (X)\n(1)',subjects:SUBJ,students:cohort(x[0],x[1],'X')}),'R (X)');
    const sy=Core.parseSheet(sheetRows({title:'R (Y)\n(1)',subjects:SUBJ,students:cohort(y[0],y[1],'Y')}),'R (Y)');
    return Core.buildDataset({label,assessment:'E'},[{parsed:sx,streamLabel:'X'},{parsed:sy,streamLabel:'Y'}]);
  };
  const a=mk('2025-26',[90,80],[10,50]);
  const b=mk('2026-27',[10,85],[90,55]);
  const r=Core.compareDatasets(a,b);
  assert.ok(r.mix.pooled<0,'pooled mean falls');
  assert.ok(r.mix.within>0,'within-stream change is positive');
  assert.equal(r.mix.reversal,true);
  assert.match(r.findings.find(f=>f.id==='typical').qualification.join(' '),/Stream mix/);
});

/* ---------- findings ---------- */
function mixedCohort(n,base){ // a spread of scores so medians and quartiles are meaningful
  return Array.from({length:n},(_,i)=>{const v=Math.min(100,base+(i%10)*3);return {name:`S${i}`,marks:SUBJ.map(()=>v)};});
}
test('at most three findings; each has evidence, a qualification and a next question; typical result is always first',()=>{
  const a=dataset('2025-26',mixedCohort(40,45));
  const b=dataset('2026-27',mixedCohort(40,62));
  const r=Core.compareDatasets(a,b);
  assert.ok(r.findings.length>=1&&r.findings.length<=3);
  assert.equal(r.findings[0].id,'typical');
  r.findings.forEach(f=>{
    assert.ok(f.evidence.length>=1,f.id+' evidence');
    assert.ok(f.qualification.length>=1,f.id+' qualification');
    assert.ok(f.next&&f.next.length>10,f.id+' next question');
    assert.ok(f.observation.length>10);
  });
  const ids=r.findings.map(f=>f.id);
  assert.equal(new Set(ids).size,ids.length,'one finding per story');
});
test('wording describes cohorts and never states a cause or individual growth',()=>{
  const a=dataset('2025-26',mixedCohort(40,45));
  const b=dataset('2026-27',mixedCohort(40,62));
  const r=Core.compareDatasets(a,b);
  const text=[r.headline,...r.findings.flatMap(f=>[f.observation,...f.evidence,...f.qualification,f.next])].join(' ');
  assert.ok(!/because of|caused|due to|thanks to|as a result of|teacher quality|\bimproved\b|\bgrew\b|\bgrowth\b|\blearned\b/i.test(text),text);
});
test('too few students gives one honest "no clear conclusion" finding',()=>{
  const a=dataset('2025-26',cohort(4,60));
  const b=dataset('2026-27',cohort(4,70));
  const r=Core.compareDatasets(a,b);
  assert.equal(r.findings.length,1);
  assert.equal(r.findings[0].id,'insufficient');
  assert.match(r.headline,/too few/i);
});
test('the subject to investigate belongs to the named stream and is among the lowest in both years',()=>{
  const subs=[{name:'PHYSICS',max:100},{name:'MATH',max:100},{name:'ENGLISH',max:100},{name:'URDU',max:100},{name:'ISLAMIAT',max:100}];
  const mk=(label,mathScore)=>dataset(label,Array.from({length:30},(_,i)=>({name:`S${i}`,marks:[70+(i%5),mathScore+(i%5),75+(i%5),72+(i%5),90]})),{subjects:subs,stream:'ICS'});
  const r=Core.compareDatasets(mk('2025-26',40),mk('2026-27',50));
  const f=r.findings.find(x=>x.id==='subject');
  assert.ok(f,'a subject finding is produced');
  assert.match(f.observation,/In ICS, Math is among the two lowest subjects in both years/);
});
test('support finding reports limits when students without marks could change the share',()=>{
  const a=dataset('2025-26',mixedCohort(40,30));
  const b=dataset('2026-27',[...mixedCohort(30,62),...Array.from({length:10},(_,i)=>({name:`N${i}`,marks:[null,null,null,null]}))]);
  const r=Core.compareDatasets(a,b);
  assert.ok(r.A.pooled.support.n>0);
  const all=[...r.findings,...r.alsoChecked.map(x=>({id:x.id,qualification:[],observation:x.summary}))];
  assert.ok(all.some(f=>f.id==='support'||f.id==='typical'));
  assert.ok(r.B.pooled.supportBounds&&r.B.pooled.supportBounds.high>r.B.pooled.supportBounds.low);
});
test('comparison is symmetric in structure: only two datasets are compared at a time and years keep their labels',()=>{
  const a=dataset('2024-25',mixedCohort(30,50)),b=dataset('2025-26',mixedCohort(30,55));
  const r=Core.compareDatasets(a,b);
  assert.equal(r.A.label,'2024-25');
  assert.equal(r.B.label,'2025-26');
  assert.match(r.findings[0].observation,/2025-26.*2024-25/);
});
