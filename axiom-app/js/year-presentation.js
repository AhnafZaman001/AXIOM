/* Opt-in, read-only guided tour. No results or settings are modified. */
(function(){
'use strict';
var animations=[];
var running=false,paused=false,timer=null,index=0,targets=[],viewIndex=0,internal=false;
var views=['overview','subjects','support','quality','reports'];

function cancelAnimations(){animations.forEach(function(a){a.cancel();});animations=[];document.querySelectorAll('.yc-tour-active').forEach(function(el){el.classList.remove('yc-tour-active');});}
window.axTourCancel=cancelAnimations;
window.axTourPause=function(pause){animations.forEach(function(a){if(pause)a.pause();else a.play();});};
window.axTourAnimate=function(el){
 cancelAnimations();
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 el.classList.add('yc-tour-active');
 function play(node,frames,duration){animations.push(node.animate(frames,{duration:duration,easing:'cubic-bezier(.22,.7,.25,1)',fill:'none'}));}
 el.querySelectorAll('.yc-bar,.yc-mini-track i').forEach(function(node){
  var width=Number(node.getAttribute('width')),full=Number(node.getAttribute('data-tour-full'));
  var sweep=full&&width>0?full/width:1.08;
  node.style.transformBox='fill-box';node.style.transformOrigin='left center';
  play(node,[{transform:'scaleX(0)',offset:0},{transform:'scaleX('+sweep+')',offset:.35},{transform:'scaleX(.12)',offset:.6},{transform:'scaleX(1)',offset:1}],2200);
 });
 el.querySelectorAll('.yc-trace').forEach(function(node){play(node,[{strokeDasharray:'1',strokeDashoffset:1},{strokeDasharray:'1',strokeDashoffset:0}],2000);});
 el.querySelectorAll('.yc-point').forEach(function(node){play(node,[{opacity:0},{opacity:1}],2100);});
 el.querySelectorAll('circle[stroke-dasharray],path:not(.yc-trace)').forEach(function(node){
  node.style.transformBox='fill-box';node.style.transformOrigin='center';
  play(node,[{transform:'scale(.85)',opacity:.3},{transform:'scale(1.03)',opacity:1},{transform:'scale(1)',opacity:1}],1800);
 });
};

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
 targets=targets.flatMap(function(el){var steps=Math.max(1,Math.ceil(el.getBoundingClientRect().height/(innerHeight*.75)));return Array.from({length:steps},function(_,i){return {el:el,offset:i*innerHeight*.75};});});
 index=0;toolbar();
}
function step(){
 if(!running||paused)return;
 if(!root()||root().getClientRects().length===0){stop();return;}
 if(index>=targets.length){viewIndex++;if(viewIndex>=views.length){stop();return;}selectView();}
 var target=targets[index++],el=target&&target.el;
 if(el){window.scrollTo({top:Math.max(0,scrollY+el.getBoundingClientRect().top+target.offset-90),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});if(target.offset===0&&window.axTourAnimate)window.axTourAnimate(el);}
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
