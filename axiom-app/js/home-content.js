/* Home content owns markup only; navigation and history are supplied. */
(function(){
'use strict';
  var routes={home:'Home',overall:'Dashboard',section:'Student Workspace',data:'Data Center',reports:'Reports',yearCompare:'Year Comparison',messages:'Messages & Alerts',admin:'Administration'};
  var escape=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  function create(host,getState,history,allowed){
  function button(route,label){return '<button type="button" data-home-route="'+route+'">'+escape(label||routes[route])+'</button>';}
  function home(){
    var current=getState(),identity=current.identity,ready=current.ready;
    var data=ready&&typeof collectOverallRoster==='function'?collectOverallRoster():{students:[],sections:[]};
    var n=data.students.length,avg=n?data.students.reduce(function(sum,s){return sum+s.overall;},0)/n:null;
    var latest=history().filter(function(x){return allowed(x.route);});
    host.innerHTML='<header class="ax-home-head"><div><p class="ax-home-eyebrow">KEYSTONE LABS / AXIOM</p><h2>Home</h2><p>'+(identity&&identity.name?escape(identity.name):'Academic performance workspace')+'</p></div></header>'+
      '<div class="ax-home-stats">'+[['Students with results',ready?n:'—'],['Average result',avg==null?'—':avg.toFixed(1)+'%'],['Active sections',ready?data.sections.length:'—'],['Data',ready?'Loaded':'Loading…']].map(function(x){return '<div><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>';}).join('')+'</div>'+
      '<section class="ax-home-activity"><h3>Recently opened</h3>'+(latest.length?latest.slice(0,4).map(function(x){return '<div class="ax-home-recent">'+button(x.route)+'<time>'+new Date(x.at).toLocaleDateString()+'</time></div>';}).join(''):'<p>Your recent work will appear here.</p>')+'</section>';
  }
  function hub(route){
    var items=route==='reports'?[['overall','Overall Summary'],['sectionSummary','Section Summary'],['teacherReport','Teacher Report']]:route==='data'?[['cloud','Upload a master workbook'],['yearCompare','Year Comparison files']]:route==='messages'?[['parent','Open parent messages']]:[['teachers','Teacher assignments'],['subjects','Section subjects'],['backup','Download workspace']];
    host.innerHTML='<header class="ax-home-head"><h2>'+routes[route]+'</h2></header><div class="ax-home-options">'+items.map(function(item){return button(item[0],item[1]+' →');}).join('')+'</div>';
  }
    return {home:home,hub:hub};
  }
  window.AxiomHomeContent={routes:routes,create:create};
})();
