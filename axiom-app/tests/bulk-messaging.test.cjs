// Run with Node 24+: node --test axiom-app/tests/bulk-messaging.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'supabase/functions/send-parent-message/index.ts'),'utf8').replace(/^import .*;\r?\n/m,'');
const server=stripTypeScriptTypes(source);

function harness(options={}) {
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',WA_PHONE_NUMBER_ID:'sender',WA_ACCESS_TOKEN:'private',MESSAGING_WORKER_SECRET:'worker',...options.env};
  const settings=[{key:'admin_whatsapp',value:'923001111111'},{key:'wa_test_mode',value:options.live?'off':'on'}];
  const batches=new Map(),updates=[],calls=[],tasks=[],queue=[];
  let handler;
  const db={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from(table){
    const q={select(){return q;},eq(){return q;},order(){return q;},range(){return q;},limit(){return q;},maybeSingle:async()=>({data:{role:options.role||'principal'}}),
      update(row){updates.push(row);return q;},then(resolve){return Promise.resolve({data:table==='app_settings'?settings:[],error:options.settingsError&&table==='app_settings'?{message:'offline'}:null}).then(resolve);}};
    return q;
  },async rpc(name,args){
    if(name==='enqueue_message_batch'){if(!batches.has(args.batch))batches.set(args.batch,args);return {data:args.batch};}
    if(name==='claim_message_job')return {data:queue.length?[queue.shift()]:[]};
    throw Error(name);
  }};
  vm.runInNewContext(server,{
    Deno:{env:{get:k=>env[k]},serve:f=>handler=f},createClient:()=>db,
    EdgeRuntime:{waitUntil:p=>tasks.push(p)},Response,Request,AbortSignal,console,
    setTimeout:f=>{f();},fetch:async(url,req)=>{calls.push(JSON.parse(req.body));if(options.networkError)throw Error('connection lost');return new Response(JSON.stringify(options.reject?{error:{message:'Rejected'}}:{messages:[{id:'wa-id'}]}),{status:options.reject?400:200});}
  });
  return {batches,updates,calls,tasks,queue,async request(body,worker=false){const res=await handler(new Request('https://example.test',{method:'POST',headers:worker?{'x-messaging-secret':'worker'}:{authorization:'Bearer session'},body:JSON.stringify(body)}));return {status:res.status,body:await res.json()};}};
}
const batchId='11111111-1111-4111-8111-111111111111';
const message={label:'Ali (A, Roll 1)',studentName:'Ali',to:'03002222222',text:'Ali scored 45%.'};
const enqueue=(extra={})=>({action:'enqueue',batchId,expectedTestMode:true,messages:[message],...extra});

test('test mode queues admin only even with a parent phone; repeated ID is idempotent',async()=>{
  const h=harness();
  assert.equal((await h.request(enqueue())).status,200);
  assert.equal((await h.request(enqueue())).status,200);
  assert.equal(h.batches.size,1);
  const batch=h.batches.get(batchId);
  assert.equal(batch.jobs.length,1);
  assert.equal(batch.jobs[0].recipient,'923001111111');
  assert.equal(batch.jobs[0].kind,'admin_test');
  assert.match(batch.jobs[0].body,/TEST: Intended for Ali/);
  await Promise.all(h.tasks);
});
test('teachers cannot submit batches or inspect jobs',async()=>{
  const h=harness({role:'teacher'});
  assert.equal((await h.request(enqueue())).status,403);
  assert.equal((await h.request({action:'batch-status',batchId})).status,403);
  assert.equal(h.batches.size,0);
});
test('live mode needs approved template and valid parent contacts',async()=>{
  assert.equal((await harness({live:true}).request(enqueue({expectedTestMode:false}))).status,400);
  const h=harness({live:true,env:{WA_TEMPLATE_NAME:'results'}});
  assert.equal((await h.request(enqueue({expectedTestMode:false,messages:[{...message,to:''}]}))).status,400);
  assert.equal((await h.request(enqueue({expectedTestMode:false}))).status,200);
  const jobs=h.batches.get(batchId).jobs;
  assert.equal(jobs.length,2);
  assert.equal(jobs[0].recipient,'923002222222');
  assert.equal(jobs[1].kind,'admin_copy');
  await Promise.all(h.tasks);
});
test('changed mode, malformed items, oversized batches and unavailable settings are blocked',async()=>{
  const h=harness();
  assert.equal((await h.request(enqueue({expectedTestMode:false}))).status,409);
  assert.equal((await h.request(enqueue({messages:[null]}))).status,400);
  assert.equal((await h.request(enqueue({messages:Array(1001).fill(message)}))).status,400);
  assert.equal((await harness({settingsError:true}).request(enqueue())).status,503);
});
test('worker rejects unauthenticated requests; successful send records API acceptance',async()=>{
  const h=harness();h.queue.push({id:1,recipient:'923001111111',kind:'admin_test',body:'test'});
  assert.equal((await h.request({action:'process'})).status,401);
  assert.equal((await h.request({action:'process'},true)).status,200);
  assert.equal(h.calls.length,1);
  assert.equal(h.updates[0].status,'accepted');
});
test('definite Meta rejections are retryable; ambiguous network failures are uncertain',async()=>{
  for(const [options,expected] of [[{reject:true},'failed'],[{networkError:true},'uncertain']]){
    const h=harness(options);h.queue.push({id:1,recipient:'923001111111',kind:'admin_test',body:'test'});
    await h.request({action:'process'},true);
    assert.equal(h.updates[0].status,expected);
  }
});
test('test mode blocks a previously queued parent send',async()=>{
  const h=harness();h.queue.push({id:1,recipient:'923002222222',kind:'parent',body:'test'});
  await h.request({action:'process'},true);
  assert.equal(h.calls.length,0);
  assert.equal(h.updates[0].status,'failed');
});

function frontend(){
  const elements={pcMessageType:{value:'test'},pcTest:{value:'Quiz 1'},pcScope:{value:'section'},pcFilter:{value:'all'}};
  for(const id of ['pcBulkTitle','pcBulkSub','pcSendAll','pcSelection','pcSelectAll','pcPreviewBody','pcBulkBody'])elements[id]={querySelectorAll:()=>[]};
  const defs=[{key:'A',label:'Section A',subjects:['Math']},{key:'B',label:'Section B',subjects:['Math']}];
  const stores={A:{students:[{id:'1',name:'Ali',pct:45,tests:{}},{id:'2',name:'Sara',pct:90,tests:{}}]},B:{students:[{id:'3',name:'Hamza',pct:85,tests:{}}]}};
  const context={window:{},document:{readyState:'loading',addEventListener(){},getElementById:id=>elements[id]},localStorage:{getItem(){return null;}},
    SECTION_DEFS:defs,currentSectionDef:()=>defs[0],ensureSection:key=>stores[key],
    studentOverallAverage:st=>st.pct,studentTotalMarks:()=>({obtained:9,max:20}),classPositionFor:()=>({rank:2,total:2}),latestTest:()=>null,gradeFor:()=> 'D',studentOverallTrend:()=>null};
  let src=fs.readFileSync(path.join(root,'js/parent-comms.js'),'utf8');
  src=src.replace('window.axParentComms = {','window.axParentComms = { PC, bulkMessage, rowKey, selectedBulkMessages, renderBulk,');
  vm.runInNewContext(src,context);
  return {api:context.window.axParentComms,elements};
}
test('individual test messages contain only the selected test, including absence',()=>{
  const {api,elements}=frontend();
  const x={st:{id:'1',tests:{Math:[{test:'Quiz 1',obtained:9,max:20},{test:'Quiz 2',obtained:20,max:20}],English:[{test:'Quiz 1',absent:true}]}},def:{key:'A',subjects:['Math','English']},c:{},snap:{name:'Ali',section:'A',roll:'1',overall:45,strong:[],weak:[]},flags:['Critical zone']};
  const m=api.bulkMessage(x);
  assert.match(m.text,/Math: 9 \/ 20/);assert.match(m.text,/English: Absent/);assert.doesNotMatch(m.text,/Quiz 2|20 \/ 20/);
  elements.pcMessageType.value='low';assert.match(api.bulkMessage(x).text,/Performance alert/);
  elements.pcMessageType.value='congrats';assert.match(api.bulkMessage(x).text,/Congratulations/);
});
test('selection uses section + student identity and excludes filtered-out rows',()=>{
  const {api}=frontend();const a={def:{key:'A'},st:{id:'same'},snap:{name:'Ali',section:'A'},c:{}};
  const b={...a,def:{key:'B'}};
  assert.notEqual(api.rowKey(a),api.rowKey(b));
  api.PC.selected.add(api.rowKey(a));api.PC.lastRows=[b];
  assert.equal(api.selectedBulkMessages().length,0);
});
test('bulk panel filters low/top performers across current or all sections',()=>{
  const {api,elements}=frontend();elements.pcMessageType.value='report';
  elements.pcFilter.value='attention';api.renderBulk();
  assert.equal(api.PC.lastRows.length,1);assert.equal(api.PC.lastRows[0].st.name,'Ali');
  elements.pcScope.value='all';elements.pcFilter.value='top';api.renderBulk();
  assert.equal(api.PC.lastRows.length,2);
  assert.match(elements.pcBulkBody.innerHTML,/Sara/);assert.match(elements.pcBulkBody.innerHTML,/Hamza/);
  assert.doesNotMatch(elements.pcBulkBody.innerHTML,/window.open|data-act="wa"/);
  api.PC.lastRows.forEach(x=>api.PC.selected.add(api.rowKey(x)));api.renderBulk();
  assert.equal(elements.pcSelectAll.checked,true);assert.match(elements.pcSendAll.textContent,/2 selected/);
});
