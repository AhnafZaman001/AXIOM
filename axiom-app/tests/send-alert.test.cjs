// Offline function checks. All authentication and email calls are stubbed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/send-alert/index.ts'),'utf8').replace(/^import .*;\r?\n/gm,''));
function harness(options={}){
  const sends=[],env={RESEND_API_KEY:'fake-secret',ALERT_WEBHOOK_SECRET:'fake-webhook',...options.env};
  let handler;
  const context={Response,AbortSignal,console:{error(){}},Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn;}},
    createClient:()=>({auth:{getUser:async()=>({data:{user:options.unauthorized?null:{id:'user-1',email:'real@example.com'}},error:null})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{full_name:'Real User',role:'principal'}})})}),
    fetch:async(url,config)=>{sends.push({url,config,payload:JSON.parse(config.body)});return new Response(JSON.stringify(options.providerBody||{id:'email-1'}),{status:options.status||200});}};
  vm.runInNewContext(source,context);
  return {sends,call:(body,headers={})=>handler(new Request('https://example.test/send-alert',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}))};
}
test('login uses official sender, existing recipients and authenticated identity',async()=>{
  const h=harness(),response=await h.call({type:'login',email:'forged@example.com'},{authorization:'Bearer fake-token'});
  assert.equal(response.status,200);assert.equal(h.sends.length,1);
  const {url,config,payload}=h.sends[0];
  assert.equal(url,'https://api.resend.com/emails');assert.equal(config.headers.Authorization,'Bearer fake-secret');
  assert.equal(payload.from,'AXIOM Alerts <alerts@keystonelabs.site>');
  assert.deepEqual(Array.from(payload.to),['ahnaf7624@gmail.com','ahnaf7625@gmail.com','zamankips@gmail.com']);
  assert.match(payload.text,/real@example.com/);assert.doesNotMatch(payload.text,/forged@example.com/);assert.match(payload.html,/Real User/);
});
test('missing or invalid user authentication cannot send alerts',async()=>{
  const h=harness({unauthorized:true});assert.equal((await h.call({type:'login'})).status,401);
  assert.equal((await h.call({type:'login'},{authorization:'Bearer bad-token'})).status,401);assert.equal(h.sends.length,0);
});
test('database and file alerts retain their existing authentication and templates',async()=>{
  const h=harness();
  assert.equal((await h.call({type:'db_change',event:'Section removed',summary:'One section'},{'x-alert-secret':'fake-webhook'})).status,200);
  assert.match(h.sends[0].payload.subject,/Critical change/);
  assert.equal((await h.call({type:'file_upload',fileName:'Results.xls'},{authorization:'Bearer token'})).status,200);
  assert.match(h.sends[1].payload.text,/Results.xls/);
});
test('provider rejection or missing API key fails without returning a secret',async()=>{
  for(const options of [{status:403},{status:429},{providerBody:{}},{env:{RESEND_API_KEY:''}}]){
    const h=harness(options),response=await h.call({type:'login'},{authorization:'Bearer token'});
    assert.equal(response.status,500);assert.equal((await response.json()).error,'send failed');
    if(options.env)assert.equal(h.sends.length,0);
  }
});
test('configured recipients and sender override defaults',async()=>{
  const h=harness({env:{ALERT_RECIPIENTS:'admin@example.com',ALERT_FROM:'AXIOM <security@keystonelabs.site>'}});
  await h.call({type:'login'},{authorization:'Bearer token'});
  assert.deepEqual(Array.from(h.sends[0].payload.to),['admin@example.com']);assert.equal(h.sends[0].payload.from,'AXIOM <security@keystonelabs.site>');
});
