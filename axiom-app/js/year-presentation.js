/* Opt-in, read-only guided tour. No results or settings are modified. */
(function(){
'use strict';
var running=false,paused=false,timer=null,index=0,targets=[],viewIndex=0,internal=false;
var views=['overview','subjects','support','quality','reports'];
function root(){return document.getElementById('yearComparePage');}
function controls(){
 var nav=document.querySelector('#yearComparePage .yc-view-nav');
 if(!nav||nav.querySelector('[data-tour]'))return;
 var b=document.createElement('button');b.className='primary';b.dataset.tour='play';b.textContent='▶ Play presentation';nav.appendChild(b);
}
function toolbar(){
 var bar=document.getElementById('ycTourControls');
 if(!bar){bar=document.createElement('div');bar.id='ycTourControls';document.body.appendChild(bar);}
 bar.innerHTML='<span>Presentation · '+(viewIndex+1)+' / '+views.length+'</span><button data-tour="pause">'+(paused?'Resume':'Pause')+'</button><button data-tour="stop">Stop ✕</button>';
 bar.hidden=!running;
}
function stop(){running=false;paused=false;clearTimeout(timer);document.body.classList.remove('yc-presenting');toolbar();if(window.axTourCancel)window.axTourCancel();}
function schedule(){clearTimeout(timer);if(running&&!paused)timer=setTimeout(step,4200);}
function selectView(){
 internal=true;
 var b=document.querySelector('#yearComparePage .yc-view-nav [data-view="'+views[viewIndex]+'"]');
 if(b)b.click();
 internal=false;
 targets=Array.from(document.querySelectorAll('#ycActiveView .yc-card,#ycActiveView .yc-find,#ycActiveView .yc-spotlight')).filter(function(el){return !el.parentElement.closest('.yc-card,.yc-find,.yc-spotlight');});
 if(!targets.length)targets=[document.getElementById('ycActiveView')].filter(Boolean);
 index=0;toolbar();
}
function step(){
 if(!running||paused)return;
 if(!root()||root().getClientRects().length===0){stop();return;}
 if(index>=targets.length){viewIndex++;if(viewIndex>=views.length){stop();return;}selectView();}
 var el=targets[index++];
 if(el){el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});if(window.axTourAnimate)window.axTourAnimate(el);}
 schedule();
}
document.addEventListener('click',function(e){
 var b=e.target.closest('[data-tour]');
 if(b){
  if(b.dataset.tour==='play'){stop();views=Array.from(document.querySelectorAll('#yearComparePage .yc-view-nav [data-view]')).map(function(x){return x.dataset.view;});if(!views.length)return;running=true;viewIndex=0;document.body.classList.add('yc-presenting');selectView();step();}
  else if(b.dataset.tour==='stop')stop();
  else {paused=!paused;clearTimeout(timer);if(window.axTourPause)window.axTourPause(paused);toolbar();if(!paused)schedule();}
  return;
 }
 if(running&&!internal)stop();
},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape')stop();});
['wheel','touchstart'].forEach(function(type){window.addEventListener(type,function(){if(running&&!paused){paused=true;clearTimeout(timer);if(window.axTourPause)window.axTourPause(true);toolbar();}},{passive:true});});
document.addEventListener('visibilitychange',function(){if(document.hidden)stop();});
window.AxiomYearPresentation={mount:controls,stop:stop};
controls();
})();
