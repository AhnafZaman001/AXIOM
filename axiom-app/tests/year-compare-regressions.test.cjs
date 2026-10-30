const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../js/year-compare-core.js');
const Charts=require('../js/year-compare-charts.js');

test('visual evidence uses structured subject references and withholds blocked changes',()=>{
  const make=(label,marks)=>({label,assessment:'Annual',grade_level:'First year',streams:[{key:'PM',label:'PM',subjects:marks.map((_,i)=>({key:'S'+i,name:['Math','Biology','Physics','English'][i],max:100}))}],records:Array.from({length:20},(_,i)=>({i:'r'+i,st:'PM',c:marks.map(v=>['s',v])}))});
  const before=make('2025',[35,60,70,75]),after=make('2026',[40,78,77,80]);
  const cmp=C.compareDatasets(before,after);
  assert.equal(cmp.signals.priority.subjectKey,'S0');
  assert.equal(cmp.signals.gain.subjectKey,'S1');
  for(const ref of Object.values(cmp.signals))assert.ok(cmp.subjects.some(r=>r.key===ref.subjectKey&&r.streamKey===ref.streamKey));
  assert.match(Charts.movers(cmp),/percentage points/);
  const blocked=C.compareDatasets(before,{...after,assessment:'Midterm'});
  assert.deepEqual(blocked.signals,{priority:null,gain:null});
  assert.equal(Charts.movers(blocked),'');
});

test('visual outcome stacks keep all listed records and escape labels',()=>{
  const analysis=C.analyseDataset(data([[s(80),s(80)],[s(10),m],[m,m]],'<unsafe>'));
  assert.match(Charts.outcomes([analysis]),/Failed at least one subject: 1 of 3/);
  assert.match(Charts.completeness([analysis]),/Partial: 1 of 3/);
  assert.match(Charts.supportLimits([analysis]),/2 incomplete overall results/);
  assert.ok(!Charts.ranges([analysis]).includes('<unsafe>'));
  assert.match(Charts.ranges([analysis]),/&lt;unsafe&gt;/);
});

function sheet({max=100,name='Ali',score=80,subjects=['Math','English']}={}) {
  return C.parseSheet([
    ['Sr.No','Name','Roll No',...subjects],
    [null,null,null,...subjects.map(()=>max)],
    [1,name,1,...subjects.map(()=>score)]
  ],'PM');
}
function data(records,label='2026',assessment='Annual',grade='First year') {
  return {label,assessment,grade_level:grade,streams:[{key:'PM',label:'PM',subjects:[{key:'M',name:'Math',max:100},{key:'E',name:'English',max:100}]}],records:records.map((c,i)=>({i:'r'+i,st:'PM',c}))};
}
const s=n=>['s',n],m=['m',null],a=['a',null];

test('missing maximum-marks row is rejected rather than consuming a student',()=>{
  const p=C.parseSheet([['Sr.No','Name','Roll No','Math','English'],[1,'Ali',1,80,70],[2,'Sara',2,40,35]],'PM');
  assert.equal(p.ok,false);
  assert.match(p.reason,/maximum/i);
});
test('a full student row after an incomplete maximum row is never chosen as maxima',()=>{
  const p=C.parseSheet([['Sr.No','Name','Roll No','Math','English'],[null,null,null,100,null],[1,'Ali',1,80,70]],'PM');
  assert.equal(p.ok,false);
});
test('merging different maxima in the same stream is blocked without altering percentages',()=>{
  assert.throws(()=>C.buildDataset({label:'2026'},[{parsed:sheet(),streamLabel:'PM'},{parsed:sheet({max:50,name:'Sara',score:40}),streamLabel:'PM'}]),/maximum|maximums|maxima/i);
});
test('missing subject on a sheet cannot silently become not applicable',()=>{
  assert.throws(()=>C.buildDataset({label:'2026'},[{parsed:sheet(),streamLabel:'PM'},{parsed:sheet({subjects:['Math','Physics']}),streamLabel:'PM'}]),/subject/i);
});
test('compatible sheets merge without losing either student',()=>{
  const ds=C.buildDataset({label:'2026'},[{parsed:sheet(),streamLabel:'PM'},{parsed:sheet({name:'Sara'}),streamLabel:'PM'}]);
  assert.equal(ds.records.length,2);
  assert.equal(C.analyseDataset(ds).pooled.median,80);
});
test('known failures, pass and unknown statuses do not disappear under complete-only basis',()=>{
  const ds=data([[s(80),s(80)],[s(10),m],[m,m]]);
  for(const basis of ['marked','complete']) {
    const p=C.analyseDataset(ds,{basis}).pooled;
    assert.equal(p.belowPass.recorded,1);
    assert.equal(p.belowPass.confirmedPass,1);
    assert.equal(p.belowPass.unknown,1);
    assert.equal(p.belowPass.n,3);
    assert.ok(Math.abs(p.belowPass.share-100/3)<1e-10);
    assert.equal(p.supportBounds.n,3);
    assert.equal(p.supportBounds.unknown,2);
    assert.equal(p.supportBounds.low,0);
    assert.ok(Math.abs(p.supportBounds.high-200/3)<1e-10);
  }
});
test('all-absent and all-missing students remain in subject status counts',()=>{
  const result=C.analyseDataset(data([[a,a],[m,m],[s(80),s(80)]]));
  result.streams[0].subjects.forEach(sub=>{
    assert.equal(sub.absent,1);assert.equal(sub.missing,1);assert.equal(sub.n,1);
  });
});
test('default headline uses complete results; available-subject mode remains explicit',()=>{
  const ds=data([[s(80),s(80)],[s(100),m]]);
  assert.equal(C.DEFAULTS.basis,'complete');
  assert.equal(C.analyseDataset(ds).pooled.n,1);
  assert.equal(C.analyseDataset(ds,{basis:'marked'}).pooled.n,2);
});
test('unrecorded assessment and grade cannot yield a ready comparison',()=>{
  const ds=data(Array.from({length:12},()=>[s(70),s(70)]),'2025','','');
  const cmp=C.compareDatasets(ds,{...ds,label:'2026'});
  assert.equal(cmp.status,'review');
  assert.equal(cmp.checks.find(x=>x.id==='assessment').status,'review');
  assert.equal(cmp.checks.find(x=>x.id==='grade').status,'review');
});
test('mismatched assessments do not generate an unqualified higher-result headline',()=>{
  const ds=data(Array.from({length:12},()=>[s(70),s(70)]),'2025','Midterm');
  const cmp=C.compareDatasets(ds,{...ds,label:'2026',assessment:'Annual'});
  assert.match(cmp.headline,/not comparable|not established|provisional|review/i);
  assert.equal(cmp.findings[0].id,'comparability');
});
test('dash and nil placeholders cannot make an incomplete record a confirmed pass',()=>{
  for(const value of ['-','—','nil','x'])assert.equal(C.classifyCell(value).k,'m');
  assert.equal(C.classifyCell('N/A').k,'n');
  assert.equal(C.classifyCell('exempt').k,'n');
});
test('a paper exceeding its own maximum is invalid even if the combined total fits',()=>{
  const p=C.parseSheet([
    ['Sr.No','Name','Roll No','Physics',null,'English'],
    [null,null,null,100,25,100],
    [1,'Ali',1,110,0,70]
  ],'PM');
  assert.equal(p.ok,true);
  assert.equal(p.records[0].c[0][0],'i');
  assert.equal(p.stats.aboveMax,1);
});
test('roll-only students without marks remain listed rather than disappearing as padding',()=>{
  const p=C.parseSheet([['Sr.No','Name','Roll No','Math','English'],[null,null,null,100,100],[1,null,7,null,null]],'PM');
  assert.equal(p.ok,true);assert.equal(p.listed,1);assert.equal(p.withMarks,0);
});
test('conflicting duplicate records require resolution rather than double-counting a student',()=>{
  const p=C.parseSheet([['Sr.No','Name','Roll No','Math','English'],[null,null,null,100,100],[1,'Ali',7,80,70],[2,'Ali',7,40,35]],'PM');
  assert.equal(p.ok,false);assert.match(p.reason,/Conflicting duplicate/);
});
test('no eligible results yields null changes rather than a false zero-point comparison',()=>{
  const ds=data([[m,m]],'2025');
  const cmp=C.compareDatasets(ds,{...ds,label:'2026'});
  assert.equal(cmp.deltas.median,null);assert.equal(cmp.deltas.support,null);
  assert.equal(cmp.A.pooled.supportBounds.low,0);assert.equal(cmp.A.pooled.supportBounds.high,100);
});
