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
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/styles.css"><link rel="stylesheet" href="/css/year-compare.css"></head><body><main style="padding:24px;max-width:1200px;margin:auto;"><div class="masthead-actions"></div><button id="teacherReportBtn">Teacher Report</button><div id="overallSummaryPage"></div></main><script>${inline}</script><script>
      window.axRole=${JSON.stringify(role)}; window.setActivePage=function(){};
      window.showToast=(text)=>{window.lastToast=text;};
      window.showConfirm=(title,body,callback)=>callback();
      window.reportTableHtml=(heads,rows)=>JSON.stringify({heads,rows});
      window.reportSectionHtml=(title,body)=>title+body;
      window.printReport=(title,subtitle,html)=>{window.printed={title,subtitle,html};};
      window.yearStore=[];
      window.yearFiles=new Map();window.storageUploads=0;window.storageDownloads=0;
      window.supabaseClient={storage:{from(){return {
        async upload(path,file){if(window.failNextUpload){window.failNextUpload=false;return {error:{message:'Upload unavailable'}};}yearFiles.set(path,file);storageUploads++;return {data:{path}};},
        async download(path){storageDownloads++;return yearFiles.has(path)?{data:yearFiles.get(path)}:{error:{message:'File not found'}};},
        async remove(paths){paths.forEach(p=>yearFiles.delete(p));return {data:[]};}
      };}},from(){let op='load',payload,id;const q={
        select(){return q;},order(){return q;},
        upsert(p){op='save';payload=p;return q;},delete(){op='delete';return q;},eq(k,v){id=v;return q;},
        update(p){op='update';payload=p;return q;},
        single(){const prior=yearStore.find(d=>op==='update'?d.id===id:d.id===payload.id||d.label===payload.label);const saved={...prior,...payload,id:prior?.id||'year-'+(yearStore.length+1),created_at:new Date().toISOString()};yearStore=yearStore.filter(d=>d.id!==saved.id);yearStore.push(saved);return Promise.resolve({data:saved});},
        maybeSingle(){return Promise.resolve({data:null});},
        then(resolve){if(op==='delete')yearStore=yearStore.filter(d=>d.id!==id);return Promise.resolve({data:structuredClone(yearStore)}).then(resolve);}
      };return q;}};
      </script><script src="/js/year-compare-core.js"></script><script src="/js/year-compare-storage.js"></script><script src="/js/year-compare-charts.js"></script><script src="/js/year-compare-reports.js"></script><script src="/js/year-compare-export.js"></script><script src="/js/year-compare.js"></script></body></html>`);
  }
  const files={'/js/year-compare-reports.js':'js/year-compare-reports.js','/js/year-compare-export.js':'js/year-compare-export.js','/js/year-compare-core.js':'js/year-compare-core.js','/js/year-compare-storage.js':'js/year-compare-storage.js','/js/year-compare-charts.js':'js/year-compare-charts.js','/js/year-compare.js':'js/year-compare.js','/css/styles.css':'css/styles.css','/css/year-compare.css':'css/year-compare.css','/js/app.js':'js/app.js','/js/parent-comms.js':'js/parent-comms.js'};
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
    const JARGON=/median|quartile|lower quarter|middle 50|typical result|eligible overall/i;
    const assertPlain=async label=>assert.doesNotMatch(await page.locator('#ycBody').innerText(),JARGON,'plain wording: '+label);
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
    assert.match(await page.locator('.yc-overview').innerText(),/9 \/ 12/);
    assert.doesNotMatch(await page.locator('.section-title').innerText(),/results compared as groups/);
    assert.equal(await page.locator('.yc-trend').count(),1);
    await assertPlain('overview');
    assert.match(await page.locator('.yc-overview').innerText(),/Average result[\s\S]*Pass percentage[\s\S]*Needs support[\s\S]*Top results[\s\S]*Highest result/);
    assert.equal(await page.locator('#ycBody details').count(),0,'no FAQ-style drawers or hidden narrative findings');
    assert.match(await page.locator('.yc-terms').innerText(),/Needs support: below 50%/);
    await page.getByRole('button',{name:'Define average result',exact:true}).hover();
    assert.match(await page.locator('#ycChartTooltip').innerText(),/average overall percentage/);
    await page.getByRole('button',{name:'Define needs support',exact:true}).focus();
    assert.match(await page.locator('#ycChartTooltip').innerText(),/below 50%/);
    await page.locator('[data-chart-metric="support"]').click();
    assert.equal(await page.locator('[data-chart-metric="support"]').getAttribute('aria-pressed'),'true');
    await page.locator('.yc-point').first().focus();
    assert.match(await page.locator('#ycChartTooltip').innerText(),/2025/);
    await page.locator('.yc-view-nav [data-view="support"]').click();
    await assertPlain('support');
    assert.match(await page.locator('.yc-chart:has-text("Subject pass outcomes") .yc-stack-counts').first().textContent(),/failed at least one subject/,'every pass-outcome count is written out, even for narrow segments');
    assert.equal(await page.locator('[data-yc-tip*="Failed at least one subject: 1 of 12"]').count(),1);
    assert.equal(await page.locator('[data-yc-tip*="3 incomplete overall results"]').count(),1);
    await page.locator('.yc-view-nav [data-view="subjects"]').click();
    await assertPlain('subjects');
    assert.equal(await page.locator('.yc-map tbody tr').count(),2);
    await page.locator('[data-subject-metric="belowShare"]').click();
    assert.match(await page.locator('.yc-map-cell[data-yc-tip*="2026 · PM Math"]').getAttribute('data-yc-tip'),/1 of 11 scored/);
    await page.locator('.yc-view-nav [data-view="quality"]').click();
    await assertPlain('quality');
    assert.equal(await page.locator('[data-yc-tip*="Partial: 2 of 12"]').count(),1);
    assert.equal(await page.locator('.yc-check-grid').count(),1);
    await page.locator('.yc-view-nav [data-view="overview"]').click();
    const stored=await page.evaluate(()=>JSON.stringify(yearStore));
    assert.doesNotMatch(stored,/Synthetic/,'student names must not reach storage');
    await page.locator('#ycPrintBtn').click();
    assert.match(await page.evaluate(()=>printed.subtitle),/every subject scored/);
    await page.locator('[data-view="reports"]').click();
    assert.match(await page.locator('.yc-meeting-reports').innerText(),/Subject vista/);
    assert.match(await page.locator('.yc-meeting-reports').innerText(),/Pass ≥ 33%/);
    await page.locator('[data-report-tab="top"]').click();
    await page.locator('[data-act="report-names"]').click();
    await page.waitForFunction(()=>document.querySelector('.yc-meeting-reports').textContent.includes('Synthetic'));
    assert.doesNotMatch(await page.evaluate(()=>JSON.stringify(yearStore)),/Synthetic/,'named reports must not modify snapshots');
    const topText=await page.locator('.yc-meeting-reports').innerText();
    assert.match(topText,/Overall marks/);assert.match(topText,/overall marks · Top 10/);assert.match(topText,/Marks \(out of \d+\)/);
    assert.match(topText,/Synthetic/,'overall Top 10 shows the loaded names');
    await assertPlain('top 10 overall');
    await page.locator('[data-overall-view="list"]').click();
    assert.match(await page.locator('.yc-meeting-reports').innerText(),/overall marks · complete list/);
    assert.match(await page.locator('.yc-meeting-reports').innerText(),/Incomplete: \d+ of \d+ subjects/,'incomplete students are listed after the ranked ones, without a rank');
    await page.locator('[data-act="print-top"]').click();
    assert.match(await page.evaluate(()=>printed.title),/Overall complete list/);
    assert.match(await page.evaluate(()=>printed.html),/Synthetic/);
    await page.locator('[data-overall-view="top"]').click();
    await page.locator('[data-act="print-top"]').click();
    assert.match(await page.evaluate(()=>printed.title),/Overall Top 10/);
    await page.locator('[data-top-mode="subjects"]').click();
    await page.locator('[data-report-subject]').selectOption({label:'Math'});
    await page.locator('[data-act="print-top"]').click();
    assert.match(await page.evaluate(()=>printed.title),/Subject Top 10/);
    assert.match(await page.evaluate(()=>printed.html),/Synthetic/);
    assert.doesNotMatch(await page.evaluate(()=>printed.html),/Teacher observations/);
    await page.locator('[data-report-tab="tables"]').click();
    const tablesText=await page.locator('.yc-meeting-reports').innerText();
    for(const value of ['%AGE WISE RESULT','MARKS WISE RESULT','GRADE WISE RESULT','Total Appeared in Exams','90% -> 100%','A+'])assert.ok(tablesText.includes(value),value);
    await assertPlain('school tables');
    const [tablesDownload]=await Promise.all([page.waitForEvent('download'),page.locator('[data-act="download-tables"]').click()]);
    assert.match(tablesDownload.suggestedFilename(),/^Result-tables-.*\.xlsx$/);
    const savedPath=await tablesDownload.path(),xlsx=fs.readFileSync(savedPath);
    assert.equal(xlsx.slice(0,2).toString(),'PK','a real zip container');assert.ok(xlsx.length>1500);
    fs.copyFileSync(savedPath,process.env.AXIOM_XLSX_OUT||path.join(require('node:os').tmpdir(),'axiom-result-tables.xlsx'));
    await page.locator('[data-report-tab="supplies"]').click();
    assert.match(await page.locator('.yc-meeting-reports').innerText(),/1 \/ 12 \(8.3%\)/);
    await page.locator('[data-report-tab="notes"]').click();
    await page.locator('[data-report-note="faculty"]').fill('Teacher-entered faculty observation');
    await page.locator('[data-report-note="reasons"]').fill('Teacher-entered subject explanation');
    await page.locator('[data-report-tab="subjects"]').click();
    await page.locator('[data-act="print-meeting"]').click();
    const meeting=await page.evaluate(()=>printed);
    assert.match(meeting.title,/Meeting report/);
    for(const value of ['Subject vista','subject supplies','Synthetic','Teacher-entered faculty observation','Teacher-entered subject explanation','GRADE WISE RESULT','overall marks'])assert.ok(meeting.html.includes(value),value);
    assert.doesNotMatch(meeting.html,JARGON,'printed meeting report uses plain wording');
    await page.evaluate(()=>{AxiomYearCompare._state.namedYears={};window.printed=null;});
    await page.locator('[data-act="print-meeting"]').click();
    await page.waitForFunction(()=>window.printed&&printed.html.includes('Synthetic'));
    assert.match(await page.evaluate(()=>printed.html),/Teacher-entered subject explanation/,'automatic name loading preserves teacher notes');
    if(process.env.AXIOM_SCREENSHOT){
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-meeting.png'),fullPage:true});
      await page.locator('[data-report-tab="top"]').click();
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-top10.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.waitForFunction(()=>AxiomYearCompare._state.compact===true);
      await page.locator('[data-top-mode="subjects"]').waitFor({state:'visible'});
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-meeting-mobile.png'),fullPage:true,animations:'disabled'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'meeting reports must not overflow mobile');
      await page.setViewportSize({width:1440,height:1000});
      await page.locator('[data-report-tab="subjects"]').click();
    }
    await page.locator('[data-report-year]').selectOption({label:'2025'});
    assert.match(await page.locator('.yc-meeting-reports').innerText(),/Select an earlier year/);
    await page.locator('[data-report-year]').selectOption({label:'2026'});
    // A single selected year still supports the mandatory current-year reports.
    await page.locator('[data-act="pick"]').first().uncheck();
    assert.match(await page.locator('.yc-meeting-reports').innerText(),/Subject vista/);
    await page.locator('[data-act="pick"]').first().check();
    await page.locator('[data-view="overview"]').click();
    await page.locator('[data-act="settings"]').click();
    await page.locator('#ycSettings [data-set="support"]').fill('60');
    await page.locator('#ycSettings [data-set="support"]').press('Tab');
    assert.match(await page.locator('.yc-terms').innerText(),/Needs support: below 60%/);
    await page.locator('#ycSettings [data-act="reset"]').click();
    await page.locator('#ycSettings [data-set="basis"]').selectOption('marked');
    await page.locator('[data-act="close-settings"]').click();
    assert.equal(await page.locator('.yc-overview [title="11 of 12 listed students counted"]').count(),1);
    // Reopen from saved data, not the current screen's in-memory selection.
    await page.evaluate(()=>{AxiomYearCompare._state.loaded=false;AxiomYearCompare.open();});
    await page.waitForFunction(()=>AxiomYearCompare._state.loaded);
    assert.equal(await page.locator('.yc-year').count(),2);
    assert.equal(await page.evaluate(()=>storageUploads),2);
    assert.equal(await page.evaluate(()=>yearFiles.size),2);
    await page.locator('[data-act="reload-file"]').first().click();
    await page.locator('#ycModalBack.open').waitFor();
    assert.match(await page.locator('#ycModalBody').innerText(),/Loaded from cloud/);
    await page.locator('[data-imp-confirm]').check();
    await page.locator('[data-imp-act="save"]').click();
    await page.locator('#ycModalBack.open').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>storageUploads),2,'reload must not duplicate the workbook');
    assert.equal(await page.evaluate(()=>yearStore.length),2);
    const download=page.waitForEvent('download');
    await page.locator('[data-act="download"]').first().click();
    assert.equal((await download).suggestedFilename(),'2025.xlsx');
    // Existing pre-014 snapshots stay usable and can acquire their source file.
    await page.evaluate(()=>{const old=yearStore.find(d=>d.label==='2025');yearFiles.delete(old.source_path);old.source_path=null;});
    await page.locator('[data-act="refresh"]').click();
    await page.locator('[data-act="attach"]').waitFor();
    await page.locator('[data-act="attach"]').click();
    await upload(2025);
    await page.locator('[data-imp-confirm]').check();
    await page.evaluate(()=>{window.failNextUpload=true;});
    await page.locator('[data-imp-act="save"]').click();
    await page.locator('.yc-err').waitFor();
    assert.equal(await page.evaluate(()=>yearStore.length),2,'failed upload preserves prior results');
    await page.locator('[data-imp-act="save"]').click();
    await page.locator('#ycModalBack.open').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>yearStore.length),2,'attaching replaces the same row');
    assert.equal(await page.evaluate(()=>yearFiles.size),2);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.yc-bar').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    if(process.env.AXIOM_SCREENSHOT){
      await page.locator('[data-act="settings"]').click();
      await page.locator('#ycSettings [data-set="basis"]').selectOption('complete');
      await page.locator('[data-act="close-settings"]').click();
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT,fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.waitForFunction(()=>AxiomYearCompare._state.compact===true);
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-mobile.png'),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile must not overflow the page');
      await page.setViewportSize({width:1440,height:1000});
      // Separate visual fixture; synthetic data only, never persisted to a real service.
      await page.evaluate(()=>{
        const ds=[2024,2025,2026].map((year,ix)=>{
          const streams=['PM','PE','ICS'].map(key=>({key,label:key,subjects:[{key:'MATH',name:'Math',max:100},{key:'ENGLISH',name:'English',max:100},{key:'PHYSICS',name:'Physics',max:100},{key:'CHEMISTRY',name:'Chemistry',max:100}]}));
          const records=streams.flatMap((stream,k)=>Array.from({length:40},(_,i)=>{
            const base=43+ix*5+((i*7+k*3)%44);
            return {i:stream.key+i,st:stream.key,c:[['s',Math.min(100,base-6)],['s',Math.min(100,base+4)],['s',Math.min(100,base-1)],['s',Math.min(100,base+2)]]};
          }));
          return {id:'preview-'+year,label:year+'-'+String(year+1).slice(-2),assessment:'Annual exam',grade_level:'First year',streams,records,source_file:'Synthetic results.xlsx',source_path:'preview/'+year+'.xlsx'};
        });
        yearStore=ds;AxiomYearCompare._state.datasets=ds;AxiomYearCompare._state.selected=ds.map(d=>d.id);AxiomYearCompare._state.chartMetric='mean';AxiomYearCompare._state.view='overview';AxiomYearCompare._state.loaded=false;AxiomYearCompare.open();
      });
      await page.waitForFunction(()=>AxiomYearCompare._state.loaded);
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-preview.png'),fullPage:true});
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-overview.png')});
      assert.ok(await page.locator('.yc-spotlight').count()>0,'structured subject evidence is visible without opening text');
      assert.equal(await page.locator('.yc-find details').count(),0);
      await page.locator('.yc-view-nav [data-view="subjects"]').click();
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-subjects.png'),fullPage:true});
      await page.locator('.yc-view-nav [data-view="support"]').click();
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-support.png'),fullPage:true});
      await page.locator('.yc-view-nav [data-view="quality"]').click();
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-quality.png'),fullPage:true});
      await page.locator('.yc-view-nav [data-view="reports"]').click();
      await page.locator('[data-report-tab="tables"]').click();
      await page.locator('[data-report-stream]').selectOption('ICS');
      const headers=await page.locator('.yc-school').first().locator('thead').innerText();
      assert.match(headers,/ICS/);assert.doesNotMatch(headers,/PM|PE/);
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-school-tables.png'),fullPage:true,animations:'disabled'});
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
    if(process.env.AXIOM_SCREENSHOT){
      await page.evaluate(m=>{window.print=()=>{};printReport(m.title,m.subtitle,m.html,{compact:true});},meeting);
      await page.emulateMedia({media:'print'});
      await page.screenshot({path:process.env.AXIOM_SCREENSHOT.replace('.png','-print.png'),fullPage:true});
      await page.pdf({path:process.env.AXIOM_SCREENSHOT.replace('.png','-print.pdf'),format:'A4',printBackground:true});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: XLSX import, cloud workbook save/download/reload without duplication, chart controls/tooltips, reduced motion, mobile, calculations, roles and existing navigation.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
