(function(){
  const hero = document.getElementById('welcomeHero');
  const button = document.getElementById('welcomeHeroEnter');
  const screen = document.getElementById('brandLaunch');
  const dashboard = document.querySelector('.wrap');
  if(!hero || !button || !screen) return;
  let started = false;
  function finish(){
    screen.hidden = true;
    hero.remove();
    if(dashboard) dashboard.inert = false;
    document.getElementById('homeBtn')?.focus({preventScroll:true});
  }
  try{
    if(sessionStorage.getItem('axiom.switching')){
      sessionStorage.removeItem('axiom.switching');
      finish();
      return;
    }
  }catch(e){}
  if(dashboard) dashboard.inert = true;
  button.addEventListener('click', ()=>{
    if(started) return;
    started = true;
    button.disabled = true;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
    screen.hidden = false;
    hero.inert = true;
    hero.setAttribute('aria-hidden','true');
    setTimeout(()=>{
      screen.classList.add('leaving');
      hero.style.display = 'none';
      setTimeout(finish, 200);
    }, 900);
  });
})();
