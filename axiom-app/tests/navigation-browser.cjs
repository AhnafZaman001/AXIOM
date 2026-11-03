// Focused offline proof for entry points touched by code organization.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const file=path.join(root,url.pathname==='/'?'index.html':url.pathname);
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  let body=fs.readFileSync(file);
  if(url.pathname==='/')body=body.toString()
    .replace(/<script src="https:\/\/cdn.jsdelivr.net\/npm\/@supabase\/supabase-js@2"><\/script>/,'')
    .replace('<script src="js/supabase-client.js"></script>','<script>window.axRole="principal";window.supabaseClient={from(){return {select(){return this},order(){return Promise.resolve({data:[]})}}}};</script>')
    .replace('<script src="js/auth-guard.js"></script>','');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(body);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.evaluate(()=>AxiomHome.ready({user:{id:'navigation-check'}},{full_name:'Example campus'}));
    await page.locator('#axiomHome').waitFor({state:'visible'});
    assert.equal(await page.locator('.wrap').evaluate(el=>el.inert),false);
    for(const route of ['overall','section','reports','data','admin','messages']){
      await page.locator('.ax-main-nav [data-home-route="'+route+'"]').click();
      assert.equal(await page.evaluate(()=>document.body.dataset.axPage),route);
    }
    await page.locator('.ax-main-nav [data-home-route="data"]').click();
    await page.locator('#importPanel').waitFor({state:'visible'});
    await page.locator('#homeBtn').click();
    await page.locator('#importPanel').waitFor({state:'hidden'});
    await page.locator('.ax-main-nav [data-home-route="reports"]').click();
    await page.locator('#axiomHome [data-home-route="sectionSummary"]').click();
    await page.locator('#sectionSummaryPage').waitFor({state:'visible'});
    await page.waitForTimeout(250);
    await page.locator('.ax-main-nav [data-home-route="yearCompare"]').click();
    await page.locator('#yearComparePage').waitFor({state:'visible'});
    await page.locator('#homeBtn').click();
    await page.locator('#axiomHome').waitFor({state:'visible'});
    assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('axiom.home.navigation-check')).some(x=>x.route==='yearCompare')));
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
    await page.evaluate(()=>{axRole='hod';AxiomHome.ready({user:{id:'other-user'}},{full_name:'Other user'});});
    assert.equal(await page.locator('.ax-main-nav [data-home-route="data"]').count(),0);
    assert.equal(await page.locator('.ax-home-bottom').innerText().then(s=>s.includes('Your recent work will appear here.')),true);
    assert.deepEqual(errors,[]);
    console.log('Navigation, Data Center, reports, personal history and mobile checks passed.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
