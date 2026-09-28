(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const hero=document.querySelector('.editorial-hero'),title=document.querySelector('.hero-name');
  const portrait=document.querySelector('.portrait-scene');
  const first=title.querySelector('.name-first'),last=title.querySelector('.name-last');
  function fitName(){
    // Anchor both words to the ears in the supplied 1024px-wide portrait.
    const width=hero.clientWidth,pw=portrait.offsetWidth,center=width/2;
    const leftEar=center-pw*.088,rightEar=center+pw*.044;
    const inset=document.querySelector('.hero-edition').offsetLeft+32;
    title.style.fontSize='100px';
    const size=Math.min(270,100*(leftEar-inset)/first.offsetWidth,100*(width-inset-rightEar)/last.offsetWidth);
    title.style.fontSize=size+'px';
    title.style.setProperty('--first-edge',leftEar+'px');
    title.style.setProperty('--last-edge',rightEar+'px');
    title.style.top=(portrait.offsetTop+pw*.168-size*.17)+'px';
  }
  document.fonts.ready.then(fitName);addEventListener('resize',fitName);
  let queued=false;const library=document.querySelector('.library-art');
  function scrollEffects(){if(queued)return;queued=true;requestAnimationFrame(()=>{
    const r=hero.getBoundingClientRect();
    const progress=reduced.matches?0:Math.min(1,Math.max(0,-r.top/(r.height*.8)));
    hero.style.setProperty('--hero-progress',progress);
    const b=library.getBoundingClientRect();
    library.style.setProperty('--book-scroll',(!reduced.matches&&b.top<innerHeight&&b.bottom>0?innerHeight-b.top:0)+'px');
    queued=false;
  });}
  addEventListener('scroll',scrollEffects,{passive:true});
  reduced.addEventListener('change',scrollEffects);scrollEffects();
  const seed={id:'inner-game',title:'From Leadership to Stewardship: The Inner Game',description:'A retreat-like engagement. A deep, inward-bound journey into leadership and stewardship.',host:'With thanks to Chamath Munasinghe for initiating the engagement.',date:'',photos:[{url:'/assets/training-group.png',alt:'The people — programme group photograph'},{url:'/assets/training-reflection.png',alt:'The reflection — participants writing at the retreat'},{url:'/assets/training-conversation.png',alt:'The conversation — facilitated learning'}]};
  let posts=[seed],selected=0,photoIndex=0,photos=seed.photos,trigger=null;
  const dialog=document.querySelector('.gallery-dialog'),full=document.querySelector('#gallery-full'),caption=document.querySelector('#gallery-caption'),dialogTitle=document.querySelector('.gallery-dialog-top>span');
  const close=document.querySelector('.gallery-close'),prev=document.querySelector('.gallery-prev'),next=document.querySelector('.gallery-next');
  function displayPhoto(index){photoIndex=(index+photos.length)%photos.length;full.src=photos[photoIndex].url;full.alt=photos[photoIndex].alt;caption.textContent=(photoIndex+1)+' / '+photos.length+' — '+photos[photoIndex].alt;}
  function openPhotos(items,index,source,heading){trigger=source;photos=items;full.hidden=false;prev.hidden=next.hidden=items.length<2;dialogTitle.textContent=heading;displayPhoto(index);dialog.showModal();document.body.style.overflow='hidden';close.focus();}
  close.addEventListener('click',()=>dialog.close());prev.addEventListener('click',()=>displayPhoto(photoIndex-1));next.addEventListener('click',()=>displayPhoto(photoIndex+1));
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.close();return;}if(dialog.querySelector('iframe'))return;if(e.key==='ArrowLeft'){e.preventDefault();displayPhoto(photoIndex-1);}if(e.key==='ArrowRight'){e.preventDefault();displayPhoto(photoIndex+1);}});
  dialog.addEventListener('close',()=>{dialog.querySelector('iframe')?.remove();full.hidden=false;document.body.style.overflow='';trigger?.focus({preventScroll:true});});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  function renderPost(index){selected=(index+posts.length)%posts.length;const post=posts[selected];document.querySelector('#journal-title').textContent=post.title;document.querySelector('#journal-description').textContent=post.description;const host=document.querySelector('#journal-host');host.textContent=post.host||'A programme with Bradley Emerson.';if(post.id==='inner-game'){host.textContent='With thanks to ';const a=document.createElement('a');a.href='https://www.linkedin.com/in/chamath-munasinghe-21710351/';a.textContent='Chamath Munasinghe ↗';a.target='_blank';a.rel='noopener';host.append(a,' for initiating the engagement.');}
    document.querySelector('#journal-date').textContent=post.date?new Date(post.date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'FROM BRADLEY’S WORK JOURNAL';document.querySelector('#journal-count').textContent=String(selected+1).padStart(2,'0')+' / '+String(posts.length).padStart(2,'0');document.querySelector('#journal-prev').disabled=document.querySelector('#journal-next').disabled=posts.length<2;
    const reel=document.querySelector('#journal-reel');reel.replaceChildren();for(let repeat=0;repeat<2;repeat++){const set=document.createElement('div');set.className='reel-set';if(repeat)set.setAttribute('aria-hidden','true');post.photos.forEach((photo,i)=>{const button=document.createElement('button');button.className='journal-photo';button.type='button';button.setAttribute('aria-label','Open '+photo.alt);if(repeat)button.tabIndex=-1;const img=document.createElement('img');img.src=photo.url;img.alt=repeat?'':photo.alt;img.loading='lazy';const expand=document.createElement('span');expand.textContent='↗';expand.setAttribute('aria-hidden','true');button.append(img,expand);button.addEventListener('click',()=>openPhotos(post.photos,i,button,post.title));set.append(button);});reel.append(set);}reel.style.animationDuration=Math.max(24,post.photos.length*12)+'s';}
  function renderIndex(){const target=document.querySelector('#journal-index');target.replaceChildren();posts.forEach((post,i)=>{const button=document.createElement('button'),img=document.createElement('img'),name=document.createElement('strong'),meta=document.createElement('span');img.src=post.photos[0].url;img.alt='';img.loading='lazy';name.textContent=post.title;meta.textContent=(post.date?post.date+' · ':'')+post.photos.length+' photographs';button.append(img,name,meta);button.addEventListener('click',()=>{renderPost(i);document.querySelector('.work-journal').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});});target.append(button);});}
  document.querySelector('#journal-prev').addEventListener('click',()=>renderPost(selected-1));document.querySelector('#journal-next').addEventListener('click',()=>renderPost(selected+1));renderPost(0);renderIndex();
  fetch('/api/gallery').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{posts=data.posts;if(posts.length){renderPost(0);renderIndex();}else{document.querySelector('.work-journal').hidden=true;document.querySelector('#journal-index').textContent='New programmes will appear here soon.';}if(data.unavailable)document.querySelector('#journal-status').textContent='Showing the featured programme. Recent updates are temporarily unavailable.';}).catch(()=>{document.querySelector('#journal-status').textContent='Showing the featured programme. Recent updates are temporarily unavailable.';});
  const film=document.querySelector('.journal-film');new IntersectionObserver(entries=>{film.classList.toggle('offscreen',!entries[0].isIntersecting);},{threshold:0}).observe(film);
  document.querySelector('.screen-composition').addEventListener('click',e=>{const image=document.querySelector('#platform-screen');if(image.hidden||!image.getAttribute('src'))return;openPhotos([{url:image.src,alt:image.alt}],0,e.currentTarget,'BEYOND THE FINISH LINE · DEMO WORKSPACE');});
  document.querySelectorAll('[data-video]').forEach(button=>button.addEventListener('click',()=>{trigger=button;dialogTitle.textContent=button.dataset.title;full.hidden=true;prev.hidden=next.hidden=true;caption.textContent='Video hosted on YouTube';const frame=document.createElement('iframe');frame.className='video-frame';frame.title=button.dataset.title;frame.src='https://www.youtube-nocookie.com/embed/'+button.dataset.video+'?autoplay=1';frame.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';frame.allowFullscreen=true;full.after(frame);dialog.showModal();document.body.style.overflow='hidden';close.focus();}));
  const form=document.querySelector('#contact-form'),send=document.querySelector('#contact-submit'),status=document.querySelector('#contact-status');let direct=false;
  fetch('/api/session').then(r=>r.json()).then(s=>{direct=!!s.emailEnabled;if(direct){send.textContent='Send enquiry ↗';document.querySelector('#contact-help').textContent='Your enquiry will be emailed to Bradley. Your email address is used so he can reply.';}}).catch(()=>{});
  form.addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form));const email='mailto:bradley@thebusinessathletes.com?subject='+encodeURIComponent('Website enquiry: '+data.interest)+'&body='+encodeURIComponent(`Name: ${data.name}\nEmail: ${data.email}\nOrganisation: ${data.company}\n\n${data.message}`);const fallback=document.querySelector('#contact-fallback');fallback.href=email;fallback.hidden=false;if(!direct){location.href=email;status.textContent='Your email draft is ready. Send it from your email application to complete your enquiry.';return;}send.disabled=true;send.textContent='Sending…';status.textContent='';try{const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error);status.textContent='Your enquiry has been sent. Thank you for getting in touch.';form.reset();fallback.hidden=true;}catch(err){status.textContent=err.message||'Unable to send. Your message is still here; please use the email link.';}finally{send.disabled=false;send.textContent='Send enquiry ↗';}});
})();


// Run the experience count once, only when the statistic is in view.
(() => {
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.experience-counter').forEach(stat=>{
  const value=stat.firstChild,target=Number(stat.dataset.count);
  let frame=0,pop=null;
  function finish(){cancelAnimationFrame(frame);pop?.cancel();value.nodeValue=String(target);}
  const observer=new IntersectionObserver(entries=>{
    if(!entries.some(entry=>entry.isIntersecting))return;
    observer.disconnect();
    if(motion.matches)return;
    const start=performance.now(),duration=1400;
    function tick(now){
      const progress=Math.min(1,(now-start)/duration);
      value.nodeValue=String(Math.round(target*(1-Math.pow(1-progress,3))));
      if(progress<1){frame=requestAnimationFrame(tick);return;}
      pop=stat.animate([{transform:'scale(1)'},{transform:'scale(1.07)',offset:.45},{transform:'scale(1)'}],{duration:380,easing:'ease-out'});
    }
    frame=requestAnimationFrame(tick);
  },{threshold:.8});
  observer.observe(stat);
  motion.addEventListener('change',()=>{if(motion.matches){observer.disconnect();finish();}});
  });
})();
