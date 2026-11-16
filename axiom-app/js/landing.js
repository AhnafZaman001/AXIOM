const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
setTimeout(()=>q('#ld').classList.add('gone'),1500);
const rm=!window.gsap||!window.ScrollTrigger||matchMedia('(prefers-reduced-motion:reduce)').matches||matchMedia('(max-width:640px)').matches;
if(rm)document.documentElement.classList.add('rm');
if(window.gsap && window.ScrollTrigger){
  gsap.registerPlugin(ScrollTrigger);
  if(!rm && matchMedia('(hover:hover) and (pointer:fine)').matches){
    document.documentElement.classList.add('fine');
    const mx=gsap.quickTo('#cur','x',{duration:.25}),my=gsap.quickTo('#cur','y',{duration:.25});
    addEventListener('pointermove',e=>{mx(e.clientX);my(e.clientY)});
    addEventListener('pointerover',e=>document.body.classList.toggle('hov',!!e.target.closest('a,button,.dt,.tc')));
  }
  if(!rm){
    document.documentElement.classList.add("motion-ready");
    const bt=qa('.beat'),n=bt.length;
    gsap.set(bt,{autoAlpha:0});gsap.set(bt[0],{autoAlpha:1});
    const tl=gsap.timeline({defaults:{ease:'none'},scrollTrigger:{trigger:'#story',start:'top top',end:'+='+n*80+'%',pin:true,scrub:.6}});
    bt.forEach((b,i)=>{
      if(i)tl.fromTo(b,{autoAlpha:0,y:60,scale:.96},{autoAlpha:1,y:0,scale:1,duration:.6},i);
      if(i<n-1)tl.to(b,{autoAlpha:0,y:-60,duration:.5},i+.85);
    });
    tl.to('.cue',{autoAlpha:0,duration:.3},0)
      .to('.stars',{y:'-22%',duration:n},0)
      .to('.rock',{y:i=>-(180+i*140),rotation:i=>i%2?40:-40,duration:n},0)
      .to('.pod',{scale:1.9,xPercent:-90,y:-80,duration:n},0)
      .to('.crystal',{y:i=>-(120+i*90),rotation:180,duration:n},0);
    addEventListener('pointermove',e=>gsap.to('#mp',{x:(e.clientX/innerWidth-.5)*-30,y:(e.clientY/innerHeight-.5)*-20,duration:1}));
    gsap.set('.cards article',{autoAlpha:0,y:40});
    ScrollTrigger.batch('.cards article',{start:'top 90%',once:true,onEnter:b=>gsap.to(b,{autoAlpha:1,y:0,stagger:.12})});
  }
}
qa('a[href^="#"]').forEach(a=>a.onclick=e=>{const target=q(a.getAttribute('href'));if(target){e.preventDefault();target.scrollIntoView({behavior:rm?'auto':'smooth'})}});

/* Compass: click to stop the needle and pick a world */
(()=>{
  const nd=q('#needle'),ch=qa('.chip');let a=-75,dr=1,run=true;
  const go=i=>q('#w'+(i+1)).scrollIntoView({behavior:'smooth'});
  let visible=false,frame=0;
  function tick(){frame=0;if(!visible||document.hidden)return;if(run&&!rm){a+=dr*1.5;if(Math.abs(a)>=75)dr*=-1;nd.style.transform='rotate('+a+'deg)'}if(run&&!rm)frame=requestAnimationFrame(tick)}
  function resume(){if(visible&&!frame&&!document.hidden)tick()}
  if('IntersectionObserver' in window){new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;resume()}).observe(q('#dial'))}else{visible=true;resume()}
  document.addEventListener('visibilitychange',resume);
  q('#dial').onclick=()=>{
    if(!run){run=true;ch.forEach(c=>c.classList.remove('on'));resume();return}
    run=false;const i=a<-25?0:a>25?2:1;ch[i].classList.add('on');setTimeout(()=>go(i),900);
  };
  ch.forEach((c,i)=>c.onclick=()=>go(i));
  q('#skip').onclick=()=>go(0);
})();

/* World 1: find the highlighted student with a spotlight */
(()=>{
  const g=q('.g1'),st=g.querySelector('.st');
  function set(){
    qa('.g1 .dt').forEach(d=>d.remove());
    const t=Math.floor(Math.random()*44);
    for(let i=0;i<44;i++){
      const d=document.createElement('i');d.className='dt'+(i==t?' tg':'');
      d.style.left=(4+Math.random()*90)+'%';d.style.top=(18+Math.random()*62)+'%';
      d.onclick=()=>{
        if(i==t){st.textContent='FOUND THEM. Early spotting changes everything.';st.className='st ok';setTimeout(set,2400)}
        else{st.textContent='NOT QUITE. Keep looking.';st.className='st no'}
      };
      g.prepend(d);
    }
    st.textContent='';st.className='st';
  }
  g.addEventListener('pointermove',e=>{const r=g.getBoundingClientRect();g.style.setProperty('--x',e.clientX-r.left+'px');g.style.setProperty('--y',e.clientY-r.top+'px')});
  set();
})();

/* World 2: move the shield, protect the crystal */
(()=>{
  const g=q('.g2'),c=g.querySelector('canvas'),x=c.getContext('2d'),st=g.querySelector('.st');
  let W,H,px=0,bl=[],hp=3,sc=0,run=0,last=0,sp=0;
  const fit=()=>{W=c.width=g.clientWidth;H=c.height=g.clientHeight;px=W/2};
  fit();addEventListener('resize',fit);
  const mv=e=>{const r=c.getBoundingClientRect();px=(e.clientX-r.left)/r.width*W};
  g.addEventListener('pointermove',mv);
  g.addEventListener('pointerdown',e=>{mv(e);if(!run)start()});
  function start(){hp=3;sc=0;bl=[];sp=0;run=1;st.textContent='';st.className='st';last=performance.now();requestAnimationFrame(loop)}
  function end(ok){run=0;st.textContent=ok?'SUCCESS. Every learner protected! Tap to replay.':'FAIL. Tap to try again.';st.className='st '+(ok?'ok':'no')}
  function loop(t){
    if(!run)return;
    const dt=Math.min(t-last,50)/16;last=t;sp-=dt;
    if(sp<=0){bl.push({x:20+Math.random()*(W-40),y:-10,v:1.6+Math.random()*1.4+sc*.05});sp=34-Math.min(sc,14)}
    x.clearRect(0,0,W,H);
    x.fillStyle='#CFF37A';x.beginPath();x.moveTo(W/2,H-46);x.lineTo(W/2+16,H-28);x.lineTo(W/2,H-10);x.lineTo(W/2-16,H-28);x.fill();
    const sy=H-78;x.fillStyle='#8B5CF6';x.fillRect(px-38,sy,76,8);
    bl=bl.filter(b=>{
      b.y+=b.v*dt;
      if(b.y>sy-10&&b.y<sy+10&&Math.abs(b.x-px)<44){sc++;return false}
      if(b.y>H-40){hp--;return false}
      x.fillStyle='#F49AC2';x.fillRect(b.x-7,b.y-7,14,14);return true;
    });
    x.fillStyle='#F4F1FB';x.font='12px monospace';x.fillText('LIVES '+hp+'   BLOCKED '+sc+'/15',10,H-12);
    if(hp<=0)end(false);else if(sc>=15)end(true);else requestAnimationFrame(loop);
  }
})();

/* World 3: spot the declining trend */
(()=>{
  const g=q('.g3'),tr=g.querySelector('.trio'),st=g.querySelector('.st');let r=0;
  function round(){
    tr.innerHTML='';const bad=Math.floor(Math.random()*3);
    for(let i=0;i<3;i++){
      const s=i==bad?-1:(Math.random()<.5?1:.3),d=[];let v=50;
      for(let k=0;k<7;k++){v+=s*(3+Math.random()*4)+(Math.random()-.5)*4;d.push(v)}
      const mn=Math.min(...d),mx=Math.max(...d);
      const pts=d.map((y,k)=>(k*16+4)+','+(52-(y-mn)/(mx-mn||1)*44)).join(' ');
      const b=document.createElement('button');b.className='tc';
      b.innerHTML='<svg viewBox="0 0 100 56"><polyline points="'+pts+'" fill="none" stroke="currentColor" stroke-width="3"/></svg><span>Student '+'ABC'[i]+'</span>';
      b.onclick=()=>{
        if(i==bad){
          r++;
          if(r==3){r=0;round();st.textContent='SUCCESS. You spotted them all!';st.className='st ok'}
          else{round();st.textContent='CORRECT. '+r+'/3';st.className='st ok'}
        }else{r=0;round();st.textContent='NOT QUITE. Look at the trend.';st.className='st no'}
      };
      tr.appendChild(b);
    }
  }
  round();
})();
