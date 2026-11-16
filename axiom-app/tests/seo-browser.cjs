const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json')));
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  const redirect=config.redirects.find(r=>!r.has&&r.source===u.pathname);
  if(redirect){res.writeHead(308,{Location:redirect.destination+u.search});return res.end();}
  const pathname=config.rewrites.find(r=>r.source===u.pathname)?.destination||(u.pathname==='/'?'/index.html':u.pathname);
  const file=path.join(root,pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.xml':'application/xml','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'text/plain');
  res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const js of [true,false]){
   const context=await browser.newContext({javaScriptEnabled:js,viewport:{width:390,height:844}});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   // An unavailable CDN must not hide the public product or trap visitors behind a loader.
   await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
   await page.goto(base);
   await page.getByRole('heading',{level:1,name:/Academic performance analytics/}).waitFor({state:'visible'});
   assert.equal(page.url(),base+'/');
   assert.equal(await page.locator('h1').count(),1);
   assert.ok(await page.locator('#public-title').evaluate(e=>e.getBoundingClientRect().top<innerHeight));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.getByRole('heading',{name:'Discover',exact:true}).waitFor({state:'visible'});
   if(js)assert.deepEqual(errors,[]);
   await page.getByRole('link',{name:'Sign in to AXIOM',exact:true}).click();
   await page.getByRole('heading',{level:1,name:'Sign in to AXIOM'}).waitFor();
   assert.equal(new URL(page.url()).pathname,'/sign-in');
   await page.goto(base+'/login.html?add=1');
   assert.equal(new URL(page.url()).pathname,'/sign-in');
   assert.equal(new URL(page.url()).search,'?add=1');
   await context.close();
  }
  for(const width of [360,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
   await page.goto(base);
   await page.getByRole('heading',{level:1}).waitFor({state:'visible'});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow at '+width);
   if(process.env.SEO_SCREENSHOT_DIR){
     fs.mkdirSync(process.env.SEO_SCREENSHOT_DIR,{recursive:true});
     await page.screenshot({path:path.join(process.env.SEO_SCREENSHOT_DIR,'homepage-'+width+'.png'),fullPage:false});
   }
   await page.close();
  }
  const app=await browser.newPage();
  await app.route('**/*',r=>{
   const url=r.request().url();
   if(url.includes('/js/supabase-client.js'))return r.fulfill({contentType:'text/javascript',body:'window.axRole="principal";window.supabaseClient={from(){return {select(){return this},order(){return Promise.resolve({data:[]})}}}};'});
   if(url.includes('/js/auth-guard.js'))return r.fulfill({contentType:'text/javascript',body:''});
   return url.startsWith(base)?r.continue():r.abort();
  });
  await app.goto(base+'/app');
  await app.evaluate(()=>AxiomHome.ready({user:{id:'seo-check'}},{full_name:'Test campus'}));
  await app.locator('#axiomHome').waitFor({state:'visible'});
  for(const route of ['section','data','messages','admin','home']){
   await app.locator('.ax-main-nav [data-home-route="'+route+'"]').click();
   assert.equal(await app.evaluate(()=>document.body.dataset.axPage),route);
  }
  await app.close();
  console.log('Public/no-JS entry, CDN failure, sign-in/query redirects and four responsive viewport checks passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
