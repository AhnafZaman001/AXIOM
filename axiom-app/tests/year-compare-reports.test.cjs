const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../js/year-compare-core.js');
const R=require('../js/year-compare-reports.js');
const scored=n=>['s',n],absent=['a',null],missing=['m',null],exempt=['n',null];
function data(cells,label='2026'){
  return {id:label,label,assessment:'Annual',grade_level:'First year',streams:[{key:'PM',label:'Pre-medical',subjects:[{key:'M',name:'Math',max:100},{key:'B',name:'Biology',max:50}]}],records:cells.map((c,i)=>({i:'r'+(i+1),st:'PM',name:'Student '+i,roll:''+(i+1),c}))};
}
test('subject rates use scored subjects, exact pass boundary and separate all unknown categories',()=>{
  const ds=data([[scored(33),scored(16.5)],[scored(0),absent],[missing,exempt],[absent,['i',null]]]);
  const [math,bio]=R.subjectStats(ds,{pass:33})[0].subjects;
  assert.deepEqual([math.n,math.passed,math.failed,math.passRate,math.failRate,math.absent,math.unknown],[2,1,1,50,50,1,1]);
  assert.equal(bio.passRate,100);assert.equal(bio.exempt,1);assert.equal(bio.highest,33);
  assert.equal(R.subjectStats(ds,{pass:40})[0].subjects[0].passRate,0);
  assert.deepEqual(R.subjectStats(ds,{basis:'marked'}),R.subjectStats(ds,{basis:'complete'}));
});
test('supplies count students once and preserve unresolved results and multi-subject failures',()=>{
  const ds=data([[scored(5),scored(5)],[scored(10),missing],[absent,scored(30)],[scored(90),scored(40)],[exempt,exempt]]);
  const t=R.supplies(ds);
  assert.deepEqual(t,{listed:5,passed:1,unknown:2,failed:2,one:1,two:1,three:0,unresolvedFailures:1});
  assert.equal(t.passed+t.failed+t.unknown,t.listed);
  assert.equal(t.one+t.two+t.three,t.failed);
  assert.equal(R.supplies(ds,{},'OTHER').listed,0);
});
test('top ten includes the full tie at rank ten without admitting rank twelve',()=>{
  const marks=[100,99,98,97,96,95,94,93,92,91,91,90];
  const ds=data(marks.map(n=>[scored(n),missing]));ds.records.push({i:'absent',st:'PM',c:[absent,missing]});
  const top=R.topTen(ds,'PM','M');
  assert.equal(top.length,11);assert.deepEqual(top.slice(-2).map(r=>r.rank),[10,10]);
  assert.ok(!top.some(r=>r.marks===90));assert.equal(R.topTen(ds,'PM','B').length,0);
  assert.equal(R.topTen(ds,'OTHER','M').length,0);
});
test('identity hydration verifies the anonymous snapshot and never changes it',()=>{
  const parsed=Core.parseWorkbook([{name:'PM',rows:[['Sr.No','Name','Roll No','Math','Biology'],[null,null,null,100,50],[1,'Sara Khan','001',90,40],[2,'Ali','002',80,35]]}]);
  const ds=Core.buildDataset({label:'2026',assessment:'Annual',grade:'First year'},[{parsed:parsed.sheets[0],streamLabel:'PM'}]);
  const before=JSON.stringify(ds),named=R.hydrateIdentities(ds,parsed);
  assert.equal(named.records[0].name,'Sara Khan');assert.equal(named.records[0].roll,'001');assert.equal(named.records[0].sheet,'PM');
  assert.equal(JSON.stringify(ds),before);assert.ok(!before.includes('Sara'));
  const altered=structuredClone(ds);altered.records[0].c[0][1]=50;
  assert.throws(()=>R.hydrateIdentities(altered,parsed),/do not match/);
  assert.throws(()=>R.hydrateIdentities({...ds,import_report:{}},parsed),/no sheet mapping/);
});
test('reports keep previous-only subjects and streams visible and escape student/teacher text',()=>{
  const previous=data([[scored(80),scored(40)]],'2025'),current=data([[scored(90),scored(45)]]);
  previous.streams[0].subjects[1].key='OLD';previous.streams[0].subjects[1].name='Old subject';
  previous.streams.push({key:'ICS',label:'Old stream',subjects:[{key:'C',name:'Computing',max:100}]});
  previous.records.push({i:'old',st:'ICS',c:[scored(70)]});
  const html=R.subjectsHtml(current,previous,{});
  assert.match(html,/Old subject/);assert.match(html,/Old stream · previous year only/);assert.match(html,/change figures are withheld/);
  assert.match(R.suppliesHtml(current,previous,{}),/Old subject/);
  current.records[0].name='<script>bad</script>';
  assert.ok(!R.topsHtml(current).includes('<script>'));
  assert.ok(!R.notesHtml(current,{faculty:'</textarea><script>bad</script>'},true).includes('<script>'));
});
test('empty subjects use unavailable rates, and three-plus failures form one exclusive bucket',()=>{
  const ds=data([[missing,absent]]);
  assert.equal(R.subjectStats(ds)[0].subjects[0].passRate,null);
  assert.match(R.subjectsHtml(ds,null,{}),/—/);
  ds.streams[0].subjects.push({key:'E',name:'English',max:100});ds.records[0].c=[scored(0),scored(0),scored(0)];
  assert.equal(R.supplies(ds).three,1);assert.equal(R.supplies(ds).failed,1);
});
