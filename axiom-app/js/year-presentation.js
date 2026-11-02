/* Short visual replay for the current Year Comparison view. */
(function(){
'use strict';
var animations=[],endTimer=null,stepTimer=null,scrollFrame=null,running=false;
function clearVisuals(){
  clearTimeout(endTimer);
  clearTimeout(stepTimer);
  if(scrollFrame)cancelAnimationFrame(scrollFrame);scrollFrame=null;
  animations.forEach(function(a){a.cancel();});animations=[];
  document.body.classList.remove('yc-presenting');
  document.querySelectorAll('.yc-tour-active').forEach(function(el){el.classList.remove('yc-tour-active');});
}
function sweepToEnd(view){
  if(!view)return;
  var start=scrollY;
  var end=Math.max(start,scrollY+view.getBoundingClientRect().bottom-innerHeight+36);
  var began=performance.now(),duration=1150;
  function move(now){
    var progress=Math.min(1,(now-began)/duration),ease=1-Math.pow(1-progress,3);
    scrollTo(0,start+(end-start)*ease);
    if(progress<1&&running)scrollFrame=requestAnimationFrame(move);else scrollFrame=null;
  }
  scrollFrame=requestAnimationFrame(move);
}
function cancel(){clearVisuals();running=false;}
function play(node,frames,duration,delay){
  animations.push(node.animate(frames,{duration:duration,delay:delay||0,easing:'cubic-bezier(.18,.8,.22,1)',fill:'none'}));
}
function replay(){
  clearVisuals();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var view=document.getElementById('ycActiveView');if(!view)return;
  document.body.classList.add('yc-presenting');
  Array.from(view.querySelectorAll('.yc-card,.yc-find,.yc-spotlight')).forEach(function(card,i){
    if(card.parentElement.closest('.yc-card,.yc-find,.yc-spotlight'))return;
    card.classList.add('yc-tour-active');
    play(card,[{opacity:.42,transform:'translateY(12px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],440,i*70);
  });
  view.querySelectorAll('.yc-bar,.yc-mini-track i').forEach(function(node,i){
    var width=Number(node.getAttribute('width')),full=Number(node.getAttribute('data-tour-full'));
    var sweep=full&&width>0?Math.min(5,full/width):1.13;
    node.style.transformBox='fill-box';node.style.transformOrigin='left center';
    play(node,[{transform:'scaleX(0)'},{transform:'scaleX('+sweep+')',offset:.32},{transform:'scaleX(.22)',offset:.58},{transform:'scaleX(1)'}],1250,130+(i%10)*28);
  });
  view.querySelectorAll('.yc-trace').forEach(function(node){play(node,[{strokeDasharray:'1',strokeDashoffset:1},{strokeDasharray:'1',strokeDashoffset:0}],1050,120);});
  view.querySelectorAll('.yc-point').forEach(function(node,i){play(node,[{opacity:0,transform:'scale(.3)'},{opacity:1,transform:'scale(1.15)'},{opacity:1,transform:'scale(1)'}],650,420+i*60);});
  view.querySelectorAll('circle[stroke-dasharray],path:not(.yc-trace)').forEach(function(node){node.style.transformBox='fill-box';node.style.transformOrigin='center';play(node,[{transform:'scale(.7)',opacity:.3},{transform:'scale(1.08)',opacity:1},{transform:'scale(1)',opacity:1}],850,180);});
  endTimer=setTimeout(function(){
    document.body.classList.remove('yc-presenting');
    document.querySelectorAll('.yc-tour-active').forEach(function(el){el.classList.remove('yc-tour-active');});
  },1450);
}
function present(){
  cancel();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var sections=Array.from(document.querySelectorAll('#yearComparePage .yc-view-nav [data-view]')).map(function(button){return button.dataset.view;});
  if(!sections.length)return;
  var index=0;running=true;
  function next(){
    if(!running||index>=sections.length){running=false;return;}
    var button=document.querySelector('#yearComparePage .yc-view-nav [data-view="'+sections[index++]+'"]');
    if(button)button.click();
    var view=document.getElementById('ycActiveView');
    var visual=view&&view.querySelector('.yc-chart,.yc-spotlight,.yc-find,.yc-card');
    if(visual)visual.scrollIntoView({behavior:'smooth',block:'center'});
    stepTimer=setTimeout(function(){
      if(!running)return;
      replay();
      sweepToEnd(view);
      stepTimer=setTimeout(next,1550);
    },260);
  }
  next();
}
function mount(){
  var nav=document.querySelector('#yearComparePage .yc-view-nav');
  if(!nav||nav.querySelector('[data-tour]'))return;
  var b=document.createElement('button');b.className='primary';b.dataset.tour='play';b.textContent='▶ Play presentation';nav.appendChild(b);
}
document.addEventListener('click',function(e){var b=e.target.closest('[data-tour="play"]');if(b){e.preventDefault();present();}},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape')cancel();});
window.AxiomYearPresentation={mount:mount,stop:cancel};
mount();
})();
