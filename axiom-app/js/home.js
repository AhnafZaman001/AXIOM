/* AXIOM's entry point. Existing modules continue to own their data/actions. */
(function(){
  'use strict';
  var identity=null,ready=false;
  var routes=AxiomHomeContent.routes;
  var manage=function(){return ['principal','coordinator'].includes(window.axRole);};
  var host=document.createElement('section');host.id='axiomHome';host.hidden=true;
  // The working Home hub replaces the extra marketing/launch gate.
  var welcome=document.getElementById('welcomeHero');if(welcome)welcome.remove();
  var wrap=document.querySelector('.wrap');if(wrap)wrap.inert=false;
  document.querySelector('.masthead').after(host);
  var nav=document.createElement('nav');nav.className='ax-main-nav';nav.setAttribute('aria-label','AXIOM navigation');
  document.querySelector('.masthead').after(nav);
  var importPanel=document.getElementById('importPanel');
  host.after(importPanel);
  var recent=AxiomHomeHistory.create(function(){return identity&&identity.userId;});
  var history=recent.history,remember=recent.remember;
  function allowed(route){return route!=='reports' && !(['data','admin'].includes(route)&&!manage()) && !(route==='messages'&&window.axRole==='student');}
  function navigation(route){
    var activeRoute=['overall','yearCompare','sectionSummary','teacherReport'].includes(route)?'section':route;
    var primaryRoutes=['home','section','data','messages','admin'];
    nav.innerHTML=primaryRoutes.filter(allowed).map(function(key){
      return '<button type="button" data-home-route="'+key+'"'+(key===activeRoute?' aria-current="page"':'')+'>'+routes[key]+'</button>';
    }).join('');
  }
  var content=AxiomHomeContent.create(host,function(){return {identity:identity,ready:ready};},history,allowed);
  var home=content.home,hub=content.hub;
  function navigate(route){
    if(!allowed(route))return;
    if(route==='import'){navigate('data');return;}
    if(route==='yearCompare'&&window.AxiomYearCompare){AxiomYearCompare.open();return;}
    if(['home','data','messages','admin','overall','section','sectionSummary','teacherReport'].includes(route)){window.setActivePage(route);window.scrollTo(0,0);return;}
    var actions={import:'importBtn',cloud:'uploadCloudBtn',parent:'pcBulkBtn',teachers:'manageTeacherBtn',subjects:'manageSubjectsBtn',backup:'saveDownloadBtn'};
    if(actions[route]){window.setActivePage('section');var action=document.getElementById(actions[route]);if(action)action.click();}
  }
  var original=window.setActivePage;
  window.setActivePage=function(route){
    var result=original.apply(this,arguments);
    var isHub=['home','data','messages','admin'].includes(route);
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
