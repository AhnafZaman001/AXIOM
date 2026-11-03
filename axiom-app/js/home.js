/* AXIOM's entry point. Existing modules continue to own their data/actions. */
(function(){
  'use strict';
  var identity=null,ready=false;
  var routes={home:'Home',overall:'Dashboard',section:'Student Workspace',data:'Data Center',reports:'Reports',yearCompare:'Year Comparison',messages:'Messages & Alerts',admin:'Administration'};
  var groups=[['Work',['overall','section','data']],['Analyze',['reports','yearCompare']],['Communicate',['messages']]];
  var descriptions={overall:'Academic overview',section:'Marks, tests and student details',data:'Excel imports and cloud files',reports:'Summaries and printable reports',yearCompare:'Results across academic years',messages:'Parent contacts and message batches'};
  var manage=function(){return ['principal','coordinator'].includes(window.axRole);};
  var escape=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var host=document.createElement('section');host.id='axiomHome';host.hidden=true;
  document.querySelector('.masthead').after(host);
  var nav=document.createElement('nav');nav.className='ax-main-nav';nav.setAttribute('aria-label','AXIOM navigation');
  document.querySelector('.masthead').after(nav);
  var importPanel=document.getElementById('importPanel');
  host.after(importPanel);
  function storageKey(){return identity?'axiom.home.'+identity.userId:null;}
  function history(){try{return JSON.parse(localStorage.getItem(storageKey())||'[]');}catch(e){return [];}}
  function remember(route){if(!storageKey()||route==='home')return;try{localStorage.setItem(storageKey(),JSON.stringify([{route:route,at:Date.now()}].concat(history().filter(function(x){return x.route!==route;})).slice(0,6)));}catch(e){}}
  function allowed(route){return !(['data','admin'].includes(route)&&!manage()) && !(route==='messages'&&window.axRole==='student');}
  function button(route,label){return '<button type="button" data-home-route="'+route+'">'+escape(label||routes[route])+'</button>';}
  function navigation(route){nav.innerHTML=Object.keys(routes).filter(allowed).map(function(key){return '<button type="button" data-home-route="'+key+'"'+(key===route?' aria-current="page"':'')+'>'+routes[key]+'</button>';}).join('');}
  function home(){
    var data=ready&&typeof collectOverallRoster==='function'?collectOverallRoster():{students:[],sections:[]};
    var n=data.students.length,avg=n?data.students.reduce(function(sum,s){return sum+s.overall;},0)/n:null;
    var latest=history().filter(function(x){return allowed(x.route);});
    host.innerHTML='<header class="ax-home-head"><div><p class="ax-home-eyebrow">KEYSTONE LABS / AXIOM</p><h2>Home</h2><p>'+(identity&&identity.name?escape(identity.name):'Academic performance workspace')+'</p></div>'+button('overall','Open dashboard →')+'</header>'+
      '<div class="ax-home-stats">'+[['Students with results',ready?n:'—'],['Average result',avg==null?'—':avg.toFixed(1)+'%'],['Active sections',ready?data.sections.length:'—'],['Data',ready?'Loaded':'Loading…']].map(function(x){return '<div><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>';}).join('')+'</div>'+
      '<div class="ax-home-work">'+groups.map(function(g){return '<section><h3>'+g[0]+'</h3>'+g[1].filter(allowed).map(function(key){return '<button type="button" class="ax-home-link" data-home-route="'+key+'"><span><b>'+routes[key]+'</b><small>'+descriptions[key]+'</small></span><span aria-hidden="true">↗</span></button>';}).join('')+'</section>';}).join('')+'</div>'+
      '<div class="ax-home-bottom"><section><h3>Continue</h3>'+(latest.length?button(latest[0].route,'Return to '+routes[latest[0].route]+' →'):'<p>Open a workspace to begin.</p>')+'</section><section><h3>Recently opened</h3>'+(latest.length?latest.slice(0,4).map(function(x){return '<div class="ax-home-recent">'+button(x.route)+'<time>'+new Date(x.at).toLocaleDateString()+'</time></div>';}).join(''):'<p>Your recent work will appear here.</p>')+'</section></div>';
  }
  function hub(route){
    var items=route==='reports'?[['overall','Overall Summary'],['sectionSummary','Section Summary'],['teacherReport','Teacher Report']]:route==='data'?[['cloud','Upload a master workbook'],['yearCompare','Year Comparison files']]:route==='messages'?[['parent','Open parent messages']]:[['teachers','Teacher assignments'],['subjects','Section subjects'],['backup','Download workspace']];
    host.innerHTML='<header class="ax-home-head"><h2>'+routes[route]+'</h2></header><div class="ax-home-options">'+items.map(function(item){return button(item[0],item[1]+' →');}).join('')+'</div>';
  }
  function navigate(route){
    if(!allowed(route))return;
    if(route==='import'){navigate('data');return;}
    if(route==='yearCompare'&&window.AxiomYearCompare){AxiomYearCompare.open();return;}
    if(['home','data','reports','messages','admin','overall','section','sectionSummary','teacherReport'].includes(route)){window.setActivePage(route);window.scrollTo(0,0);return;}
    var actions={import:'importBtn',cloud:'uploadCloudBtn',parent:'pcBulkBtn',teachers:'manageTeacherBtn',subjects:'manageSubjectsBtn',backup:'saveDownloadBtn'};
    if(actions[route]){window.setActivePage('section');var action=document.getElementById(actions[route]);if(action)action.click();}
  }
  var original=window.setActivePage;
  window.setActivePage=function(route){
    var result=original.apply(this,arguments);
    var isHub=['home','data','reports','messages','admin'].includes(route);
    host.hidden=!isHub;
    if(isHub){if(route==='home')home();else hub(route);}
    if(route==='data'&&manage()){
      importPanel.classList.add('open');
      if(typeof renderLoadedTests==='function')renderLoadedTests();
      if(typeof refreshCloudFileList==='function')refreshCloudFileList();
    }
    remember(route);navigation(route);
    return result;
  };
  document.addEventListener('click',function(e){var b=e.target.closest('[data-home-route]');if(b)navigate(b.dataset.homeRoute);});
  document.getElementById('homeBtn').addEventListener('click',function(e){e.stopImmediatePropagation();navigate('home');},true);
  document.getElementById('importBtn').addEventListener('click',function(e){e.stopImmediatePropagation();navigate('data');},true);
  window.AxiomHome={ready:function(session,profile){identity={userId:session.user.id,name:profile.campus_name||profile.institution_name||profile.full_name};ready=true;navigation(document.body.dataset.axPage||'home');if(!host.hidden)home();}};
  window.setActivePage('home');
})();
