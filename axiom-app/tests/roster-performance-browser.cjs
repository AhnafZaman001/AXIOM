// Focused offline smoke/benchmark for roster paging and interaction only.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
const baseline=cp.execFileSync('git',['show','7794596:axiom-app/js/app.js'],{encoding:'utf8'});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){
  let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  html=html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/,'').replace('<script src="js/supabase-client.js"></script>',`<script>window.axRole='principal';window.supabaseClient={from(){return {select(){return this;},order(){return Promise.resolve({data:[]});}};}};</script>`).replace('<script src="js/auth-guard.js"></script>','').replace('</head>','<style>#welcomeHero{display:none!important}</style></head>');
  res.setHeader('Content-Type','text/html');return res.end(html);
 }
 const p=path.join(root,url.pathname);if(!p.startsWith(root)||!fs.existsSync(p)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(p));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const before of [true,false]){
   const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>{
    if(!r.request().url().startsWith(origin))return r.abort();
    if(before&&r.request().url().endsWith('/js/app.js'))return r.fulfill({contentType:'text/javascript',body:baseline});
    return r.continue();
   });
   await page.goto(origin);await page.waitForFunction(()=>typeof renderTable==='function');
   const timing=await page.evaluate(()=>{
    const def=currentSectionDef();const store=ensureSection(def.key);
    store.students=Array.from({length:1500},(_,i)=>({id:'perf-'+i,name:'Student '+String(i).padStart(4,'0'),rollNo:String(i+1),tests:Object.fromEntries(def.subjects.map(subj=>[subj,Array.from({length:10},(_,j)=>({test:'Test '+j,percent:60+i%40,obtained:60+i%40,max:100,absent:false}))]))}));
    const t=performance.now();refreshAllUI();document.body.offsetHeight;return Math.round(performance.now()-t);
   });
   console.log(before?'Before':'After',timing+'ms initial render');
   if(before){await page.close();continue;}
   assert.equal(await page.locator('#tableBody tr[data-sid]').count(),100);
   assert.match(await page.locator('#tableBody .zone-pill').first().innerText(),/%.*60\/100/);
   await page.evaluate(()=>{window.chartRefreshes=0;const original=renderCharts;renderCharts=function(...args){window.chartRefreshes++;return original(...args);};});
   await page.locator('#tableSectionPagination button', {hasText:'Next'}).click();
   assert.equal(await page.locator('#tableBody tr[data-sid]').first().getAttribute('data-sid'),'perf-100');
   await page.locator('#studentSearch').fill('Student 1499');
   await page.waitForFunction(()=>document.querySelectorAll('#tableBody tr[data-sid]').length===1);
   assert.equal(await page.locator('#tableBody tr[data-sid]').first().getAttribute('data-sid'),'perf-1499');
   assert.equal(await page.evaluate(()=>chartRefreshes),0);
   await page.locator('#studentSearch').fill('');
   await page.waitForFunction(()=>document.querySelectorAll('#tableBody tr[data-sid]').length===100);
   assert.equal(await page.locator('#tableBody tr[data-sid]').first().getAttribute('data-sid'),'perf-0');
   assert.equal(await page.evaluate(()=>{const d=currentSectionDef(),s=ensureSection(d.key);return rosterPrintTable(d,s,s.students,'',d.subjects,'',null).rows.length;}),1500);
   await page.locator('#subjectFilter').selectOption({index:1});
   assert.equal(await page.locator('#tableBody tr[data-sid]').count(),100);
   assert.match(await page.locator('#tableBody .zone-pill').first().innerText(),/%.*60\/100/);
   assert.equal(await page.evaluate(()=>chartRefreshes),0);
   await page.evaluate(()=>{
    const d=currentSectionDef();renderRosterTable({sectionKey:d.key,subjFilterVal:'',zoneFilterVal:'',searchQueryVal:'',quickFilterVal:null,headEl:document.getElementById('trRTableHead'),bodyEl:document.getElementById('trRTableBody'),wrapEl:document.getElementById('trRTableWrap'),emptyEl:document.getElementById('trREmptyState'),sortState:{}});
   });
   assert.equal(await page.locator('#trRTableBody tr[data-sid]').count(),100);
   await page.locator('#trRTableWrapPagination button').last().evaluate(b=>b.click());
   assert.equal(await page.locator('#trRTableBody tr[data-sid]').first().getAttribute('data-sid'),'perf-100');
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.locator('#tableSectionPagination').isVisible(),true);
   assert.deepEqual(errors,[]);console.log('PASS: paging, full-data search/printing, marks, teacher roster, mobile and no redundant chart rebuilds.');
   await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
