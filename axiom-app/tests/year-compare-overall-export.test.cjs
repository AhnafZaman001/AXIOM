// Run with Node 20+: node --test axiom-app/tests/year-compare-overall-export.test.cjs
// Covers: plain wording (no median / quartile jargon), overall marks complete list + Top 10 + year comparison,
// the school-format result tables, the Excel export, and chart counts that never hide a number.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const js=f=>require(path.join(__dirname,'..','js',f));
const Core=js('year-compare-core.js'),Reports=js('year-compare-reports.js'),Charts=js('year-compare-charts.js'),Exporter=js('year-compare-export.js');

/* ---------- fixtures ---------- */
const cell=v=>v==null?['m',null]:v==='AB'?['a',null]:v==='NA'?['n',null]:['s',v];
// streams: { PM: { subjects:[['Physics',100],...], students:[ [marks] | {m:[marks],name,roll,sheet} ] } }
function ds(label,streams,opts={}){
  let n=0;const records=[];
  const list=Object.keys(streams).map(k=>({key:k,label:k,subjects:streams[k].subjects.map(([name,max])=>({key:name.toUpperCase(),name,max}))}));
  Object.keys(streams).forEach(k=>streams[k].students.forEach(s=>{
    const o=Array.isArray(s)?{m:s}:s,r={i:'r'+(++n),st:k,c:o.m.map(cell)};
    if(o.name!==undefined){r.name=o.name;r.roll=o.roll||'';r.sheet=o.sheet||'';}
    records.push(r);
  }));
  return {label,assessment:opts.assessment||'Annual',grade_level:opts.grade||'First year',streams:list,records,import_report:{}};
}
const TWO=[['Physics',100],['Math',100]];
const FIVE=[['A',100],['B',100],['C',100],['D',100],['E',100]];

/* ---------- overall marks: ranking, Top 10, complete list ---------- */
test('only complete results are ranked; ties share a rank; incomplete and no-marks students are listed after, unranked',()=>{
  const d=ds('2026-27',{PM:{subjects:TWO,students:[
    {m:[95,90],name:'Ayesha'},{m:[95,90],name:'Bilal'},{m:[80,80],name:'Chand'},{m:[70,'AB'],name:'Danish'},{m:[null,null],name:'Esha'}]}});
  const g=Reports.overallRanking(d,'',{})[0];
  assert.deepEqual(g.ranked.map(r=>[r.name,r.rank]),[['Ayesha',1],['Bilal',1],['Chand',3]]);
  assert.deepEqual(g.incomplete.map(r=>[r.name,r.rank]),[['Danish',null],['Esha',null]]);
  assert.equal(g.max,200);
  const sum=Reports.overallSummary(g);
  assert.equal(sum.highest,92.5);
  assert.equal(sum.highestMarks,185);
  assert.ok(Math.abs(sum.topAverage-(92.5+92.5+80)/3)<1e-9);
  assert.equal(sum.tenth,null,'fewer than ten complete results cannot have a tenth-place score');
});
test('Top 10 includes everyone tied at rank 10; the complete list adds incomplete students with a reason',()=>{
  const twelve=Array.from({length:12},(_,i)=>({m:[90,90],name:'S'+i}));
  const g=Reports.overallRanking(ds('x',{PM:{subjects:TWO,students:twelve}}),'',{})[0];
  assert.equal(g.top.length,12);                      // all twelve share rank 1
  const d=ds('2026-27',{PM:{subjects:TWO,students:[{m:[95,90],name:'Ayesha'},{m:[70,'AB'],name:'Danish'},{m:[null,null],name:'Esha'}]}});
  const top=Reports.overallHtml(d,null,{},'','top'),list=Reports.overallHtml(d,null,{},'','list');
  assert.ok(!/Danish/.test(top));
  assert.match(list,/Danish/);assert.match(list,/Incomplete: 1 of 2 subjects/);assert.match(list,/No marks/);
  assert.match(list,/Marks \(out of 200\)/);
});
test('overall marks use each stream\'s own total, and an exempt subject lowers a student\'s maximum, not their percentage',()=>{
  const d=ds('x',{PM:{subjects:TWO,students:[{m:[100,'NA'],name:'Exempt'},{m:[90,95],name:'Full'}]}});
  const g=Reports.overallRanking(d,'',{})[0];
  assert.equal(g.ranked[0].name,'Exempt');             // 100/100 beats 185/200
  assert.equal(g.ranked[0].max,100);assert.equal(g.ranked[1].max,200);
});
test('names appear only when identities are attached; otherwise the row says Name unavailable',()=>{
  const named=ds('x',{PM:{subjects:TWO,students:[{m:[90,90],name:'Zainab',roll:'12',sheet:'PM-A'}]}});
  const anon=ds('x',{PM:{subjects:TWO,students:[[90,90]]}});
  assert.match(Reports.overallHtml(named,null,{},'','top'),/Zainab/);
  const html=Reports.overallHtml(anon,null,{},'','top');
  assert.match(html,/Name unavailable/);assert.ok(!/Zainab/.test(html));
});
test('overall comparison shows highest result, top-10 average and 10th place; incompatible assessments withhold the change',()=>{
  const prev=ds('2025-26',{PM:{subjects:TWO,students:Array.from({length:12},(_,i)=>[80+i%3,80])}});
  const cur=ds('2026-27',{PM:{subjects:TWO,students:Array.from({length:12},(_,i)=>[85+i%3,85])}});
  const html=Reports.overallHtml(cur,prev,{},'','top');
  assert.match(html,/Highest result/);assert.match(html,/Average of the top 10/);assert.match(html,/10th place/);
  assert.match(html,/\+5\.0 pp/);
  const other=ds('2026-27',cur.streams.length?{PM:{subjects:TWO,students:[[90,90]]}}:{},{assessment:'Mid term'});
  const withheld=Reports.overallHtml(other,prev,{},'','top');
  assert.match(withheld,/not directly comparable/);assert.ok(!/\+\d\.\d pp/.test(withheld));
});

/* ---------- school-format tables ---------- */
const TOTALS=[[100,100,100,100,100],[90,90,90,90,90],[90,90,90,90,89],[80,80,80,80,79],[70,70,70,70,69]];   // 500, 450, 449, 399, 349
test('percentage bands: 90 is in the top band, 89.8 is not; below 20 has its own row; zero shows a dash in a stream and 0 in the total',()=>{
  const t=Reports.resultTables(ds('2026-27',{PM:{subjects:FIVE,students:TOTALS}}),{}).tables.find(x=>x.id==='percent');
  const row=l=>t.rows.find(r=>r[0]===l);
  assert.equal(t.title,'%AGE WISE RESULT 2026-27');
  assert.deepEqual(row('90% -> 100%'),['90% -> 100%',2,2]);   // 500 and 450 (exactly 90%)
  assert.deepEqual(row('80% -> 89%'),['80% -> 89%',1,1]);     // 449 = 89.8%
  assert.deepEqual(row('70% -> 79%'),['70% -> 79%',1,1]);
  assert.deepEqual(row('60% -> 69%'),['60% -> 69%',1,1]);
  assert.deepEqual(row('Less than 20%'),['Less than 20%','-',0]);
  assert.deepEqual(t.rows[t.rows.length-1],['Total Appeared in Exams',5,5]);
});
test('marks-wise bands use total marks and the configured thresholds; the last row is "N BELOW"',()=>{
  const d=ds('2026-27',{PM:{subjects:FIVE,students:TOTALS}});
  const t=Reports.resultTables(d,{}).tables.find(x=>x.id==='marks');
  assert.equal(t.title,'MARKS WISE RESULT 2026-27');
  assert.deepEqual(t.rows.slice(0,5).map(r=>[r[0],r[1]]),[['500+',1],['450+',1],['400+',1],['350+',1],['350 BELOW',1]]);   // 500 | 450 | 449 | 399 | 349
  const custom=Reports.resultTables(d,{marksBands:'400, 300'}).tables.find(x=>x.id==='marks');
  assert.deepEqual(custom.rows.slice(0,3).map(r=>[r[0],r[1]]),[['400+',3],['300+',2],['300 BELOW','-']]);   // 500, 450, 449 | 399, 349 | none
});
test('grades: F is any subject below the pass mark however high the overall result; E is 33–39% with no failed subject',()=>{
  const students=[[100,100,100,100,20],[36,36,36,36,36],[30,30,30,30,30],[85,85,85,85,85],[75,75,75,75,75],[65,65,65,65,65],[55,55,55,55,55],[45,45,45,45,45]];
  const t=Reports.resultTables(ds('2026-27',{PM:{subjects:FIVE,students}}),{}).tables.find(x=>x.id==='grades');
  const g=Object.fromEntries(t.rows.slice(0,7).map(r=>[r[0],r[2]]));
  assert.deepEqual(g,{'A+':1,A:1,B:1,C:1,D:1,E:1,F:2});    // F: the 84% student with a 20 and the all-30 student
  assert.equal(t.title,'ANNUAL 2026-27');assert.equal(t.subtitle,'GRADE WISE RESULT');
  assert.equal(Reports.gradeFor(85,0,33),'A+');assert.equal(Reports.gradeFor(85,1,33),'F');assert.equal(Reports.gradeFor(33,0,33),'E');assert.equal(Reports.gradeFor(32.9,0,33),'F');
});
test('complete-only tables list incomplete students separately; available-subject mode counts them, and totals always equal students who appeared',()=>{
  const d=ds('2026-27',{PM:{subjects:FIVE,students:[[90,90,90,90,90],[90,90,null,null,null],['AB','AB','AB','AB','AB']]}});
  const complete=Reports.resultTables(d,{basis:'complete'}).tables[0],marked=Reports.resultTables(d,{basis:'marked'}).tables[0];
  const last=t=>t.rows[t.rows.length-1];
  assert.deepEqual(last(complete),['Total Appeared in Exams',2,2]);          // the all-absent student did not appear
  assert.ok(complete.rows.some(r=>r[0]==='Counted in this table'&&r[1]===1));
  assert.ok(complete.rows.some(r=>r[0]==='Incomplete results, not counted'&&r[1]===1));
  assert.ok(!marked.rows.some(r=>/Incomplete results/.test(r[0])));
  assert.equal(marked.rows[0][1],2);                                          // both are in 90% -> 100% when counted on available subjects
  assert.deepEqual(last(marked),['Total Appeared in Exams',2,2]);
});
test('several streams become columns with a Total column that adds up',()=>{
  const d=ds('2026-27',{PM:{subjects:FIVE,students:TOTALS},PE:{subjects:FIVE,students:TOTALS.slice(0,2)}});
  const t=Reports.resultTables(d,{}).tables[0];
  assert.deepEqual(t.head,['','PM','PE','Total']);
  assert.deepEqual(t.rows[0],['90% -> 100%',2,2,4]);
  assert.deepEqual(t.rows[t.rows.length-1],['Total Appeared in Exams',5,2,7]);
  assert.match(Reports.resultTablesHtml(d,{}),/Total Appeared in Exams/);
});

test('school tables and Excel totals respect the selected stream',()=>{
  const d=ds('2026',{PM:{subjects:FIVE,students:TOTALS},PE:{subjects:FIVE,students:TOTALS.slice(0,2)}});
  const result=Reports.resultTables(d,{},'PE');
  result.tables.forEach(t=>{
    assert.deepEqual(t.head.slice(1),['PE','Total']);
    assert.deepEqual(t.rows.at(-1),['Total Appeared in Exams',2,2]);
  });
  assert.doesNotMatch(Reports.resultTablesHtml(d,{},'PE'),/>PM</);
  const sheets=Exporter.fromTables(result);
  assert.deepEqual(sheets[0].rows[1].map(c=>c.v),['','PE','Total']);
});

test('tenth-place result requires ten ranked students, including ties at the cutoff',()=>{
  const d=ds('2026',{PM:{subjects:TWO,students:Array.from({length:11},(_,i)=>[100-Math.min(i,9),100-Math.min(i,9)])}});
  const g=Reports.overallRanking(d,'PM')[0];
  assert.equal(g.top.length,11);
  assert.equal(Reports.overallSummary(g).tenth,91);
  assert.equal(Reports.overallSummary({...g,ranked:g.ranked.slice(0,9),top:g.top.slice(0,9)}).tenth,null);
});

test('grade descriptions remain valid with an edited pass mark and flag provisional grades',()=>{
  const d=ds('2026',{PM:{subjects:TWO,students:[[90,null]]}});
  const notes=Reports.resultTables(d,{pass:50,basis:'marked'}).tables.find(t=>t.id==='grades').notes.join(' ');
  assert.doesNotMatch(notes,/50–39/);assert.match(notes,/provisional/);assert.match(notes,/incomplete results cannot confirm a pass/);
});

/* ---------- Excel export ---------- */
function unzip(bytes){
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let e=bytes.length-22;
  assert.equal(dv.getUint32(e,true),0x06054b50,'end of central directory');
  const count=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const out={};
  for(let i=0;i<count;i++){
    assert.equal(dv.getUint32(p,true),0x02014b50);
    const crc=dv.getUint32(p+16,true),size=dv.getUint32(p+24,true),nl=dv.getUint16(p+28,true),off=dv.getUint32(p+42,true);
    const name=Buffer.from(bytes.slice(p+46,p+46+nl)).toString('utf8');
    const ln=dv.getUint16(off+26,true),lx=dv.getUint16(off+28,true),data=bytes.slice(off+30+ln+lx,off+30+ln+lx+size);
    assert.equal(Exporter.crc32(data),crc,'crc of '+name);
    out[name]=Buffer.from(data).toString('utf8');p+=46+nl;
  }
  return out;
}
test('the .xlsx has every required part, valid checksums, one sheet per table, merged titles, borders and numbers',()=>{
  const files=unzip(Exporter.build(Exporter.fromTables(Reports.resultTables(ds('2026-27',{PM:{subjects:FIVE,students:TOTALS}}),{}))));
  ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml','xl/worksheets/sheet3.xml'].forEach(n=>assert.ok(files[n],n));
  assert.match(files['xl/workbook.xml'],/name="%age wise"/);assert.match(files['xl/workbook.xml'],/name="Marks wise"/);assert.match(files['xl/workbook.xml'],/name="Grade wise"/);
  const s1=files['xl/worksheets/sheet1.xml'];
  assert.match(s1,/%AGE WISE RESULT 2026-27/);assert.match(s1,/<mergeCell ref="A1:C1"\/>/);assert.match(s1,/<c r="B3" s="4"><v>2<\/v><\/c>/);
  assert.match(files['xl/styles.xml'],/<border><left style="thin">/);assert.match(files['xl/styles.xml'],/D9D9D9/);
});
test('text is escaped, sheet names are made safe and unique, and the file name is clean',()=>{
  const d=ds('2026 <27> & co',{PM:{subjects:FIVE,students:TOTALS}});
  const files=unzip(Exporter.build(Exporter.fromTables(Reports.resultTables(d,{}))));
  assert.match(files['xl/worksheets/sheet1.xml'],/2026 &lt;27&gt; &amp; co/);
  assert.ok(!/<27>/.test(files['xl/worksheets/sheet1.xml']));
  const named=unzip(Exporter.build([{name:'a:b/c*d?[e]',rows:[[1]]},{name:'A:B/C*D?[E]',rows:[[2]]},{name:'x'.repeat(40),rows:[[3]]}]))['xl/workbook.xml'];
  const names=[...named.matchAll(/<sheet name="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(names.map(n=>n.toLowerCase())).size,3);names.forEach(n=>{assert.ok(n.length<=31);assert.ok(!/[:\/*?\[\]]/.test(n));});
  assert.equal(Exporter.fileName({label:'2026-27 / final'}),'Result-tables-2026-27-final.xlsx');
});

/* ---------- plain wording ---------- */
const JARGON=/median|quartile|quarter\b|percentile|middle half|middle 50|typical|eligible overall|interquartile/i;
function cohort(label,boost){
  const mk=(n,base)=>Array.from({length:n},(_,i)=>{const v=Math.min(100,base+(i*7)%23);return [v,Math.min(100,v+boost.math),Math.min(100,v-3+(i%4))];});
  return ds(label,{PM:{subjects:[['Physics',100],['Math',100],['Urdu',100]],students:mk(30,55)},ICS:{subjects:[['Physics',100],['Math',100],['Urdu',100]],students:mk(24,50)}});
}
test('findings, headline, charts and reports contain no median or quartile wording',()=>{
  const a=Core.analyseDataset(cohort('2025-26',{math:0})),b=Core.analyseDataset(cohort('2026-27',{math:14}));
  const cmp=Core.compareDatasets(a,b);
  const texts=[cmp.headline].concat(cmp.findings.flatMap(f=>[f.title,f.observation,...f.evidence,...f.qualification,f.next]),cmp.alsoChecked.map(x=>x.summary));
  texts.forEach(t=>assert.ok(!JARGON.test(t),t));
  const html=[Charts.trend([a,b],'mean',Core.DEFAULTS),Charts.trend([a,b],'support',Core.DEFAULTS),Charts.trend([a,b],'excellence',Core.DEFAULTS),Charts.trend([a,b],'median',Core.DEFAULTS),
    Charts.streams(cmp),Charts.streams(cmp,'support'),Charts.streams(cmp,'excellence'),Charts.subjects(cmp,'PM'),Charts.status(b),Charts.outcomes([a,b]),Charts.completeness([a,b]),Charts.supportLimits([a,b]),Charts.movers(cmp),Charts.ranges([a,b]),
    ...cmp.subjects.slice(0,2).flatMap(r=>[Charts.subjectEvidence(r,['x','y'],true),Charts.subjectEvidence(r,['x','y'],false)]),
    Reports.subjectsHtml(cohort('2026-27',{math:14}),cohort('2025-26',{math:0}),{},''),Reports.suppliesHtml(cohort('2026-27',{math:14}),cohort('2025-26',{math:0}),{},''),
    Reports.overallHtml(cohort('2026-27',{math:14}),cohort('2025-26',{math:0}),{},'','top'),Reports.resultTablesHtml(cohort('2026-27',{math:14}),{})].join('\n');
  const plain=html.replace(/data-chart-metric="median"/g,'');
  assert.ok(!JARGON.test(plain),(plain.match(JARGON)||[])[0]);
  assert.match(html,/Average result/);
});
test('the engine reports the average, highest result and pass percentage the screen now uses',()=>{
  const a=Core.analyseDataset(cohort('2025-26',{math:0})),b=Core.analyseDataset(cohort('2026-27',{math:14}));
  const cmp=Core.compareDatasets(a,b);
  assert.ok(Math.abs(cmp.deltas.mean-(b.pooled.mean-a.pooled.mean))<1e-9);
  assert.ok(b.pooled.highest>=b.pooled.mean&&b.pooled.highest<=100);
  const m={belowPass:{confirmedPass:79,recorded:9,unknown:45}};
  assert.ok(Math.abs(Core.passRate(m)-79/88*100)<1e-9);                    // unknown students are not guessed at
  assert.equal(Core.passRate({belowPass:{confirmedPass:0,recorded:0,unknown:5}}),null);
  assert.equal(cmp.findings[0].title,'Average result');
  assert.match(cmp.findings[0].evidence.join(' '),/Highest result/);assert.match(cmp.findings[0].evidence.join(' '),/Passed every subject/);
});
test('marks bands setting accepts text, sorts, de-duplicates and falls back to the school default',()=>{
  assert.deepEqual(Core.settingsFrom({marksBands:'350, 500 450 450;400'}).marksBands,[500,450,400,350]);
  assert.deepEqual(Core.settingsFrom({marksBands:'abc'}).marksBands,[500,450,400,350]);
  assert.deepEqual(Core.settingsFrom({marksBands:'300'}).marksBands,[500,450,400,350]);     // one band is not a table
  assert.deepEqual(Core.settingsFrom({}).marksBands,[500,450,400,350]);
});

/* ---------- chart counts: a bar or segment never hides its number ---------- */
function fakeAnalysis(label,over){return Object.assign({label,pooled:{n:10,listed:10,mean:50,highest:80,support:{n:0,share:0},excellence:{n:0,share:0},belowPass:{confirmedPass:0,recorded:0,unknown:0}}},over||{});}
test('stream bars show "count of counted" even when the value is 0%, and say how many students were counted of those listed',()=>{
  const mk=(listedIncomplete)=>ds('y',{ICS:{subjects:TWO,students:[...Array.from({length:21},()=>[70,70]),...Array.from({length:listedIncomplete},()=>[70,null])]}});
  const a=Core.analyseDataset(mk(28)),b=Core.analyseDataset(Object.assign(mk(0),{label:'2026-27'}));a.label='2025-26';
  const cmp=Core.compareDatasets(a,b);
  const html=Charts.streams(cmp,'excellence');
  assert.match(html,/0\.0% \(0 of 21\)/);
  assert.match(html,/Students counted, of those listed: ICS 21 of 49 \(2025-26\), 21 of 21 \(2026-27\)/);
  assert.match(Charts.streams(cmp,'support'),/Needs support by stream/);
  assert.match(html,/Top results by stream/);
});
test('a pass-outcome segment too narrow for its label still has its number written under the bar',()=>{
  const html=Charts.outcomes([fakeAnalysis('2025-26',{pooled:{listed:133,belowPass:{confirmedPass:79,recorded:9,unknown:45}}}),fakeAnalysis('2026-27',{pooled:{listed:90,belowPass:{confirmedPass:65,recorded:3,unknown:22}}})]);
  assert.match(html,/65 passed every subject · 3 failed at least one subject · 22 cannot confirm yet/);
  assert.match(html,/79 passed every subject · 9 failed at least one subject · 45 cannot confirm yet/);
  assert.match(html,/Failed at least one subject: 3 of 90/);
});
test('small shares get a zoomed, labelled axis; the average keeps 0–100%',()=>{
  const small=[fakeAnalysis('2025-26',{pooled:{n:86,mean:76,support:{n:4,share:4.7},excellence:{n:10,share:11.6},belowPass:{}}}),fakeAnalysis('2026-27',{pooled:{n:68,mean:82,support:{n:1,share:1.5},excellence:{n:25,share:36.8},belowPass:{}}})];
  const support=Charts.trend(small,'support',Core.DEFAULTS),average=Charts.trend(small,'mean',Core.DEFAULTS),top=Charts.trend(small,'excellence',Core.DEFAULTS);
  assert.match(support,/scale 0–15%/);assert.match(support,/>15%</);assert.match(support,/Scale 0–15% so small values are readable/);
  assert.match(average,/scale 0–100%/);assert.ok(!/Scale 0–/.test(average));
  assert.match(top,/scale 0–50%/);
  assert.doesNotMatch(support+average+top,/NaN|Infinity/);
});
