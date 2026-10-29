// Offline browser integration: NODE_PATH must resolve Playwright; Chrome is used by default.
// node axiom-app/tests/year-compare-browser.cjs
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const inline=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('make_xlsx_lib'));
assert.ok(inline,'SheetJS must be available from the real app bundle');
const fixtures=[];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/full') {
    let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    html=html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/,'');
    html=html.replace('<script src="js/supabase-client.js"></script>',`<script>window.axRole='principal';window.supabaseClient={from(){return {select(){return this;},order(){return Promise.resolve({data:[]});}};}};</script>`);
    html=html.replace('<script src="js/auth-guard.js"></script>','');
    html=html.replace('</head>','<style>#welcomeHero{display:none!important}</style></head>');
    res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
  }
  if(url.pathname==='/'){
    const role=['principal','coordinator','hod','teacher','student'].includes(url.searchParams.get('role'))?url.searchParams.get('role'):'principal';
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/styles.css"></head><body><main style="padding:24px;max-width:1200px;margin:auto;"><div class="masthead-actions"></div><button id="teacherReportBtn">Teacher Report</button><div id="overallSummaryPage"></div></main><script>${inline}</script><script>
      window.axRole=${JSON.stringify(role)}; window.setActivePage=function(){};
      window.showToast=(text)=>{window.lastToast=text;};
      window.showConfirm=(title,body,callback)=>callback();
      window.reportTableHtml=(heads,rows)=>JSON.stringify({heads,rows});
      window.reportSectionHtml=(title,body)=>title+body;
      window.printReport=(title,subtitle,html)=>{window.printed={title,subtitle,html};};
      window.yearStore=[];
      window.supabaseClient={from(){let op='load',payload,id;const q={
        select(){return q;},order(){return q;},
        upsert(p){op='save';payload=p;return q;},delete(){op='delete';return q;},eq(k,v){id=v;return q;},
        single(){const prior=yearStore.find(d=>d.label===payload.label);const saved={...payload,id:prior?.id||'year-'+(yearStore.length+1),created_at:new Date().toISOString()};yearStore=yearStore.filter(d=>d.id!==saved.id);yearStore.push(saved);return Promise.resolve({data:saved});},
        then(resolve){if(op==='delete')yearStore=yearStore.filter(d=>d.id!==id);return Promise.resolve({data:structuredClone(yearStore)}).then(resolve);}
      };return q;}};
      </script><script src="/js/year-compare-core.js"></script><script src="/js/year-compare.js"></script></body></html>`);
  }
  const files={'/js/year-compare-core.js':'js/year-compare-core.js','/js/year-compare.js':'js/year-compare.js','/css/styles.css':'css/styles.css','/js/app.js':'js/app.js','/js/parent-comms.js':'js/parent-comms.js'};
  if(!files[url.pathname]){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');
  res.end(fs.readFileSync(path.join(root,files[url.pathname])));
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const origin='http://127.0.0.1:'+server.address().port;
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin);
    await page.locator('#ycOpenBtn').click();
    await page.locator('[data-act="add"]').waitFor();
    await page.locator('#ycFileInput').setInputFiles({name:'broken.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from([0,255,1,2,3,0])});
    await page.waitForFunction(()=>window.lastToast?.includes('could not be read') || document.querySelector('#ycModalBack.open'));
    if(await page.locator('#ycModalBack.open').count()) await page.locator('[data-imp-act="cancel"]').click();
    async function upload(year,mode='normal'){
      const base64=await page.evaluate(({year,mode})=>{
        const rows=[['Sr.No','Student Name','Roll No','Math','English']];
        if(mode!=='noMax')rows.push([null,null,null,100,100]);
        for(let i=0;i<12;i++)rows.push([i+1,'Synthetic '+i,i+1,year===2025?65:90,year===2025?65:90]);
        if(mode==='partial'){rows[2][3]=10;rows[2][4]='AB';rows[3][3]='AB';rows[3][4]='AB';rows[4][4]=null;}
        const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'PM');
        return XLSX.write(wb,{type:'base64',bookType:'xlsx'});
      },{year,mode});
      await page.locator('#ycFileInput').setInputFiles({name:`${year}.xlsx`,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(base64,'base64')});
      await page.locator('#ycModalBack.open').waitFor();
    }
    await upload(2025,'noMax');
    assert.match(await page.locator('#ycModalBody').innerText(),/No result sheets were recognised/);
    await page.locator('[data-imp-act="cancel"]').click();
    await upload(2025);
    await page.locator('[data-imp="assessment"]').fill('Annual exam');
    await page.locator('[data-imp="grade"]').fill('First year');
    await page.locator('[data-imp-act="save"]').click();
    assert.match(await page.locator('#ycModalBody').innerText(),/tick the confirmation/);
    await page.locator('[data-imp-confirm]').check();
    await page.locator('[data-imp-act="save"]').click();
    await page.locator('#ycModalBack.open').waitFor({state:'hidden'});
    await upload(2026,'partial');
    await page.locator('[data-imp="assessment"]').fill('Annual exam');
    await page.locator('[data-imp="grade"]').fill('First year');
    await page.locator('[data-imp-confirm]').check();
    await page.locator('[data-imp-act="save"]').click();
    await page.locator('#ycModalBack.open').waitFor({state:'hidden'});
    assert.equal(await page.locator('.yc-find').count()<=3,true);
    assert.match(await page.locator('#ycBody').innerText(),/9 of 12 listed students/);
    await page.locator('[data-open="support"] summary').click();
    const support=await page.locator('[data-open="support"]').innerText();
    assert.match(support,/1 of 12/);assert.match(support,/3 incomplete/);
    await page.locator('[data-open="subjects"] summary').click();
    assert.match(await page.locator('[data-open="subjects"]').innerText(),/Absent/i);
    const stored=await page.evaluate(()=>JSON.stringify(yearStore));
    assert.doesNotMatch(stored,/Synthetic/,'student names must not reach storage');
    await page.locator('#ycPrintBtn').click();
    assert.match(await page.evaluate(()=>printed.subtitle),/every subject scored/);
    await page.locator('[data-open="settings"] summary').click();
    await page.locator('[data-set="basis"]').selectOption('marked');
    assert.match(await page.locator('#ycBody').innerText(),/11 of 12 listed students/);
    // Reopen from saved data, not the current screen's in-memory selection.
    await page.evaluate(()=>{AxiomYearCompare._state.loaded=false;AxiomYearCompare.open();});
    await page.waitForFunction(()=>AxiomYearCompare._state.loaded);
    assert.equal(await page.locator('.yc-year').count(),2);
    if(process.env.AXIOM_SCREENSHOT){
      await page.locator('[data-set="basis"]').selectOption('complete');
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT,fullPage:true});
    }
    for(const role of ['hod','teacher','student']){
      await page.goto(origin+'/?role='+role);
      if(role==='hod'){
        await page.locator('#ycOpenBtn').click();
        assert.equal(await page.locator('[data-act="add"]').count(),0);
        assert.equal(await page.locator('[data-act="del"]').count(),0);
      }else assert.equal(await page.locator('#ycOpenBtn').count(),0);
    }
    await page.goto(origin+'/full');
    await page.locator('#ycOpenBtn').click();
    assert.equal(await page.locator('#yearComparePage').isVisible(),true);
    assert.equal(await page.locator('#sectionViewPage').isVisible(),false);
    await page.locator('#ycBackBtn').click();
    assert.equal(await page.locator('#yearComparePage').isVisible(),false);
    assert.equal(await page.locator('#sectionViewPage').isVisible(),true);
    for(const [button,target] of [['overallSummaryBtn','overallSummaryPage'],['sectionSummaryBtn','sectionSummaryPage'],['teacherReportBtn','teacherReportPage']]){
      await page.locator('#'+button).click();assert.equal(await page.locator('#'+target).isVisible(),true);
      await page.evaluate(()=>setActivePage('section'));
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: real XLSX import, missing-max rejection, confirmation, anonymous save/reload, denominators, filters, print, role controls and real-app navigation/report regression checks.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
