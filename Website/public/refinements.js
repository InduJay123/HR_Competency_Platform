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
})();
