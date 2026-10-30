const {test}=require('node:test');
const assert=require('node:assert/strict');
const Storage=require('../js/year-compare-storage.js');
const Charts=require('../js/year-compare-charts.js');
const Core=require('../js/year-compare-core.js');
function mock(options={}){
  const files=new Map(),rows=[],events=[];
  const client={storage:{from(bucket){assert.equal(bucket,'year-result-files');return {
    async upload(path,file,config){events.push('upload');assert.equal(config.upsert,false);if(options.uploadFail)return {error:{message:'Upload denied'}};files.set(path,file);return {data:{path}};},
    async remove(paths){events.push('cleanup');if(options.cleanupFail)return {error:{message:'Delete denied'}};paths.forEach(p=>files.delete(p));return {data:[]};},
    async download(path){return files.has(path)?{data:files.get(path)}:{error:{message:'Missing file'}};}
  };}},from(){let payload,id,mode='list';const q={
    select(){return q;},order(){return q;},eq(key,v){if(key==='id')id=v;return q;},
    upsert(p,c){payload=p;mode='save';events.push('save');if(p.id)assert.equal(c.onConflict,'id');return q;},
    update(p){payload=p;mode='save';return q;},delete(){mode='delete';return q;},
    async single(){if(options.saveFail)return {error:{message:'Save failed',code:options.saveCode===undefined?'23514':options.saveCode}};const row={...payload,id:payload.id||id||'year-1'};const old=rows.findIndex(x=>x.id===row.id);if(old>=0)rows.splice(old,1);rows.push(row);return {data:row};},
    async maybeSingle(){return options.verifyFail?{error:{message:'Offline'}}:{data:options.committed?{source_path:[...files.keys()][0]}:null};},
    then(resolve){if(mode==='delete'){if(options.deleteFail)return Promise.resolve({error:{message:'Delete failed'}}).then(resolve);rows.splice(rows.findIndex(x=>x.id===id),1);}return Promise.resolve({data:rows}).then(resolve);}
  };return q;}};
  return {store:Storage.create(client),files,rows,events};
}
const file={name:'Exam results.xlsx',size:1024};
const ds={label:'2026',assessment:'Annual',grade_level:'First year',source_file:file.name,streams:[],records:[]};
test('cloud saves original file and result snapshot, lists and downloads without another upload',async()=>{
  const m=mock(),saved=await m.store.save(ds,file);
  assert.equal(m.files.size,1);assert.equal(m.rows.length,1);
  assert.equal((await m.store.list())[0].source_path,saved.source_path);
  assert.equal(await m.store.download(saved),file);
  assert.deepEqual(m.events,['upload','save']);
});
test('replacement keeps one dataset, switches reference before old file cleanup',async()=>{
  const m=mock(),old=await m.store.save(ds,file),saved=await m.store.save({...ds,label:'2026 '},file,old);
  assert.equal(saved.id,old.id);assert.notEqual(saved.source_path,old.source_path);
  assert.equal(m.rows.length,1);assert.equal(m.files.size,1);
  assert.deepEqual(m.events,['upload','save','upload','save','cleanup']);
});
test('definite save failure cleans new upload; original remains safe',async()=>{
  const m=mock({saveFail:true});m.files.set('old.xlsx',file);
  await assert.rejects(m.store.save(ds,file,{id:'old',source_path:'old.xlsx'}),/Save failed/);
  assert.equal(m.files.size,1);assert.ok(m.files.has('old.xlsx'));
});
test('ambiguous commit never deletes a potentially referenced cloud file',async()=>{
  for(const opts of [{saveFail:true,saveCode:null,committed:true},{saveFail:true,saveCode:null,verifyFail:true},{saveFail:true,saveCode:null}]){
    const m=mock(opts);await assert.rejects(m.store.save(ds,file),/Refresh cloud years/);assert.equal(m.files.size,1);
  }
});
test('upload failure does not write results; file limits and extensions are enforced',async()=>{
  const m=mock({uploadFail:true});await assert.rejects(m.store.save(ds,file),/Upload denied/);
  assert.equal(m.rows.length,0);assert.deepEqual(m.events,['upload']);
  assert.throws(()=>Storage.checkFile({name:'x.pdf',size:10}),/Excel/);
  assert.throws(()=>Storage.checkFile({name:'x.xlsx',size:Storage.maxBytes+1}),/6 MB/);
});
test('reloading a saved workbook updates results without creating another object',async()=>{
  const m=mock(),saved=await m.store.save(ds,file);await m.store.saveSnapshot({...ds,label:'2026 updated'},saved);
  assert.equal(m.files.size,1);assert.equal(m.rows.length,1);assert.deepEqual(m.events,['upload','save']);
});
test('failed dataset deletion preserves the workbook; successful deletion removes both',async()=>{
  const fail=mock({deleteFail:true}),saved=await fail.store.save(ds,file);
  await assert.rejects(fail.store.remove(saved),/Delete failed/);assert.equal(fail.files.size,1);
  const m=mock(),d=await m.store.save(ds,file);await m.store.remove(d);assert.equal(m.rows.length,0);assert.equal(m.files.size,0);
});
test('cleanup failures are surfaced rather than reported as fully cleaned',async()=>{
  const m=mock({cleanupFail:true}),old=await m.store.save(ds,file),saved=await m.store.save(ds,file,old);
  assert.match(saved.cleanupWarning,/could not be removed/);assert.ok(m.files.has(old.source_path));
});
function analysis(label,score){return Core.analyseDataset({label,assessment:'Annual',grade_level:'First year',streams:[{key:'PM',label:'PM',subjects:[{key:'M',name:'Math',max:100}]}],records:Array.from({length:12},(_,i)=>({i:String(i),st:'PM',c:[['s',score]]}))});}
test('charts expose units, accessible data points and exact status counts',()=>{
  const a=analysis('2025',65),b=analysis('2026',85),cmp=Core.compareDatasets(a,b);
  const html=Charts.trend([a,b],'mean',Core.DEFAULTS)+Charts.distribution([a,b],Core.BAND_LABELS)+Charts.status(b)+Charts.streams(cmp)+Charts.subjects(cmp,'PM');
  assert.equal((html.match(/<svg /g)||[]).length,5);assert.match(html,/0–100%/);assert.match(html,/data-yc-tip/);assert.match(html,/Passed every subject/);assert.match(html,/12\/12/);
  assert.doesNotMatch(html,/NaN|Infinity/);
});
test('many years keep chart dimensions valid and labels are escaped',()=>{
  const analyses=Array.from({length:50},(_,i)=>analysis(i===0?'<script>':'Year '+i,60));
  const html=Charts.distribution(analyses,Core.BAND_LABELS)+Charts.trend(analyses,'support',Core.DEFAULTS);
  assert.doesNotMatch(html,/<script>|width="-|NaN|Infinity/);assert.match(html,/&lt;script&gt;/);
});
