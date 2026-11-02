/* Short visual replay for the current Year Comparison view. */
(function(){
'use strict';
var animations=[],endTimer=null;
function cancel(){
  clearTimeout(endTimer);
  animations.forEach(function(a){a.cancel();});animations=[];
  document.body.classList.remove('yc-presenting');
  document.querySelectorAll('.yc-tour-active').forEach(function(el){el.classList.remove('yc-tour-active');});
}
function play(node,frames,duration,delay){
  animations.push(node.animate(frames,{duration:duration,delay:delay||0,easing:'cubic-bezier(.18,.8,.22,1)',fill:'none'}));
}
function replay(){
  cancel();
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
  endTimer=setTimeout(cancel,1900);
}
function mount(){
  var nav=document.querySelector('#yearComparePage .yc-view-nav');
  if(!nav||nav.querySelector('[data-tour]'))return;
  var b=document.createElement('button');b.className='primary';b.dataset.tour='play';b.textContent='▶ Replay visuals';nav.appendChild(b);
}
document.addEventListener('click',function(e){var b=e.target.closest('[data-tour="play"]');if(b){e.preventDefault();replay();}},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape')cancel();});
window.AxiomYearPresentation={mount:mount,stop:cancel};
mount();
})();
