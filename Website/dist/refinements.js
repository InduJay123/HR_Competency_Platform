(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const header=document.querySelector('.header');
  let scheduled=false;
  addEventListener('scroll',()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{header.classList.toggle('is-scrolled',scrollY>45);scheduled=false;});},{passive:true});
  const books=[
    ['book-beyond.png','Beyond the\nFinish Line.','Goals, grit and what comes next.','THE BOOK BEHIND THE NAME','Beyond.','Beyond the Finish Line'],
    ['book-awaken.png','Awaken.','A different perspective starts with a moment of reflection. Explore Bradley’s book.','A DIFFERENT PERSPECTIVE','Awaken.','Awaken'],
    ['book-pearl-wise.png','PEARL-WISE.','A string of pearls, furnished with wisdom and experience.','WISDOM & EXPERIENCE','Wisdom.','PEARL-WISE'],
    ['book-crab.png','CRAB.','Explore the habits and ways of thinking that hold us back.','MINDSET & GROWTH','Mindset.','CRAB']
  ];
  document.querySelectorAll('[data-book]').forEach(button=>button.addEventListener('click',()=>{
    const index=Number(button.dataset.book),[file,title,description,theme,word,name]=books[index];
    const image=document.querySelector('#featured-cover');image.src='assets/'+file;image.alt=name+' book cover by Bradley Emerson';
    document.querySelector('#book-title').textContent=title;
    document.querySelector('#book-description').textContent=description;
    document.querySelector('#book-theme').textContent=theme;
    document.querySelector('.library-watermark').textContent=word;
    document.querySelector('.library-art').dataset.bookTone=String(index);
    document.querySelector('#book-count').textContent=`0${index+1} — 04`;
    document.querySelector('#book-enquiry').href='mailto:bradley@thebusinessathletes.com?subject='+encodeURIComponent(name+' book enquiry');
    document.querySelectorAll('[data-book]').forEach(item=>{item.classList.toggle('selected',item===button);item.setAttribute('aria-pressed',String(item===button));});
    if(!reduced.matches){document.querySelector('.featured-book').animate([{opacity:.1,translate:'0 12px'},{opacity:1,translate:'0 0'}],{duration:500,easing:'ease-out'});document.querySelector('.library-details').animate([{opacity:.2},{opacity:1}],{duration:400});}
  }));
  const photos=[['training-group.png','Participants gathered for a programme group photograph','01 / The people'],['training-reflection.png','Participants writing and reflecting around a conference table','02 / The reflection'],['training-conversation.png','A facilitated conversation during the programme','03 / The conversation']];
  const dialog=document.querySelector('.gallery-dialog');let photo=0,trigger=null;
  function showPhoto(index){photo=(index+photos.length)%photos.length;const [file,alt,caption]=photos[photo];const img=document.querySelector('#gallery-full');img.src='assets/'+file;img.alt=alt;document.querySelector('#gallery-caption').textContent=caption;}
  document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{trigger=button;showPhoto(Number(button.dataset.photo));dialog.showModal();document.body.style.overflow='hidden';document.querySelector('.gallery-close').focus();}));
  document.querySelector('.gallery-close').addEventListener('click',()=>dialog.close());
  document.querySelector('.gallery-prev').addEventListener('click',()=>showPhoto(photo-1));
  document.querySelector('.gallery-next').addEventListener('click',()=>showPhoto(photo+1));
  dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();showPhoto(photo-1);}if(e.key==='ArrowRight'){e.preventDefault();showPhoto(photo+1);}});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{document.body.style.overflow='';trigger?.focus({preventScroll:true});});
})();
