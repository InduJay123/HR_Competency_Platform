(() => {
  const hero=document.querySelector('.editorial-hero');
  const intro=document.querySelector('#signature-intro');
  const skip=document.querySelector('.skip-intro');
  const replay=document.querySelector('.replay-intro');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const shell=[document.querySelector('.header'),document.querySelector('main'),document.querySelector('footer')];
  let exitTimer,hideTimer,returnFocus;
  function finishIntro(){
    clearTimeout(exitTimer);
    if(intro.hidden)return;
    intro.classList.add('intro-exiting');
    hero.classList.remove('hero-enter');
    requestAnimationFrame(()=>hero.classList.add('hero-enter'));
    shell.forEach(el=>{if(el)el.inert=false;});
    hideTimer=setTimeout(()=>{intro.hidden=true;intro.classList.remove('intro-exiting');if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});},reduced.matches?0:800);
  }
  function showIntro(manual=false){
    if(reduced.matches){hero.classList.add('hero-enter');return;}
    clearTimeout(exitTimer);clearTimeout(hideTimer);
    returnFocus=manual?replay:document.querySelector('.brand');
    intro.classList.remove('intro-exiting');intro.hidden=false;
    shell.forEach(el=>{if(el)el.inert=true;});
    skip.focus({preventScroll:true});
    exitTimer=setTimeout(finishIntro,2400);
  }
  skip.addEventListener('click',finishIntro);
  intro.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finishIntro();}if(e.key==='Tab'){e.preventDefault();skip.focus();}});
  replay?.addEventListener('click',()=>showIntro(true));
  let seen=false;try{seen=sessionStorage.getItem('btfl-signature-intro')==='seen';sessionStorage.setItem('btfl-signature-intro','seen');}catch{}
  if(!seen)showIntro();else hero.classList.add('hero-enter');
  reduced.addEventListener('change',e=>{if(e.matches)finishIntro();});

  const lensData=[
    ['Help leaders see their potential—and turn it into meaningful contribution.','Explore the practice ↗','#expertise'],
    ['A different perspective can change what comes next. Explore Bradley’s four books.','Explore the books ↗','#perspectives'],
    ['Connect work, evidence and development. AI assists the conversation. People decide.','Discover the platform ↗','#platform']
  ];
  document.querySelectorAll('[data-lens]').forEach(button=>button.addEventListener('click',()=>{
    const [copy]=lensData[Number(button.dataset.lens)];
    document.querySelector('#lens-copy').textContent=copy;

    document.querySelectorAll('[data-lens]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
    if(!reduced.matches&&!document.documentElement.classList.contains('motion-paused'))document.querySelector('.lens-detail').animate([{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'ease-out'});
  }));
})();

