/* Home content owns markup only; navigation and history are supplied. */
(function(){
'use strict';
  var routes={home:'Home',overall:'Dashboard',section:'Student Workspace',data:'Data Center',reports:'Reports',yearCompare:'Year Comparison',messages:'Messages & Alerts',admin:'Administration'};
  var groups=[['Work',['overall','section','data']],['Analyze',['reports','yearCompare']],['Communicate',['messages']]];
  var descriptions={overall:'Academic overview',section:'Marks, tests and student details',data:'Excel imports and cloud files',reports:'Summaries and printable reports',yearCompare:'Results across academic years',messages:'Parent contacts and message batches'};
  var escape=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  function create(host,getState,history,allowed){
  function button(route,label){return '<button type="button" data-home-route="'+route+'">'+escape(label||routes[route])+'</button>';}
  function home(){
    var current=getState(),identity=current.identity,ready=current.ready;
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
    return {home:home,hub:hub};
  }
  window.AxiomHomeContent={routes:routes,create:create};
})();
