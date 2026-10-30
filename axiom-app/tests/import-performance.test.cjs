const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const fn=source.slice(source.indexOf('function applyImport('),source.indexOf('/* ---- 008_'));
function harness(students=[]){
  let id=0,saves=0;
  const store={students:structuredClone(students)};
  const ctx={ensureSection:()=>store,uid:()=>`new-${++id}`,markDirty:()=>saves++};
  vm.createContext(ctx);vm.runInContext(fn,ctx);
  return {store,apply:ctx.applyImport,saves:()=>saves};
}
const row=(name,rollNo,percent=80)=>({name,rollNo,matric:900,absent:false,subjectResults:{Math:{obtained:percent,max:100,percent}}});
const parsed=(students,testName='Test 1')=>({testName,matched:[{sectionKey:'F1A',subjects:['Math'],students}]});
test('imports merge by roll then normalized name, replace a test and preserve other history',()=>{
 const h=harness();h.apply(parsed([row('Ayesha','1'),row('Bilal','2')]));
 h.apply(parsed([row('AYESHA','1',90)],'Test 2'));
 h.apply(parsed([row(' ayesha ','1',75)],'test 1'));
 assert.equal(h.store.students.length,2);
 assert.deepEqual(Array.from(h.store.students[0].tests.Math,t=>t.percent),[75,90]);
 assert.equal(h.saves(),3);
});
test('corrected rolls and duplicate names keep first-match behavior',()=>{
 const h=harness([{id:'a',name:'Same',rollNo:'1',tests:{}},{id:'b',name:'Same',rollNo:'2',tests:{}}]);
 h.apply(parsed([row('same','3'),row('Other','1'),row('SAME','2',95)]));
 assert.equal(h.store.students.length,3);
 assert.equal(h.store.students[0].rollNo,'3');
 assert.equal(h.store.students[1].tests.Math[0].percent,95);
 assert.equal(h.store.students[2].name,'Other');
});
test('a batch can defer full-workspace saves while standalone imports still save',()=>{
 const h=harness();for(let i=0;i<10;i++)h.apply(parsed([row('A','1')],`T${i}`),true);
 assert.equal(h.saves(),0);assert.equal(h.store.students[0].tests.Math.length,10);
 h.apply(parsed([row('A','1')],'last'));assert.equal(h.saves(),1);
});
test('large repeated imports do not scan the roster for each student',()=>{
 const h=harness();const rows=Array.from({length:5000},(_,i)=>row(`Student ${i}`,String(i+1)));
 h.apply(parsed(rows));
 h.store.students.find=()=>{throw Error('quadratic roster scan');};
 h.apply(parsed(rows,'Test 2'));
 assert.equal(h.store.students.length,5000);
 assert.ok(h.store.students.every(s=>s.tests.Math.length===2));
});
