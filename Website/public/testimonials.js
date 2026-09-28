// Replace the sample entries below with approved client testimonials.
// Set sample:false only after replacing the quote, name and role with real content.
(() => {
  const testimonials = [
    { quote: 'He helps you really discover your potential, purpose', name: 'Ashani Jayasinghe', role: 'CEO, GIS Solutions', label: 'A leader’s perspective', source: 'https://thebusinessathletes.com/about-us/', sample: false },
    { quote: 'A fresh perspective on how we lead, listen and bring out the best in our people.', name: 'Client name', role: 'Role · Organisation', label: 'Leadership & growth', sample: true },
    { quote: 'The conversations gave our team space to reflect, reconnect and agree on a clearer way forward.', name: 'Client name', role: 'Role · Organisation', label: 'Team coaching', sample: true },
    { quote: 'A thoughtful reminder that meaningful progress starts with understanding ourselves and each other.', name: 'Client name', role: 'Role · Organisation', label: 'Purpose & perspective', sample: true }
  ];
  const section=document.querySelector('.testimonials');
  if(!section)return;
  const track=section.querySelector('.testimonials-track'),group=section.querySelector('.testimonials-group');
  const toggle=section.querySelector('.testimonials-toggle');
  function element(tag,className,text){const el=document.createElement(tag);el.className=className;el.textContent=text;return el;}
  group.replaceChildren();
  testimonials.forEach(item=>{
    const card=element('article','testimonial-card','');
    const label=element('p','testimonial-type',item.label);
    if(item.sample)label.append(element('span','sample-badge','SAMPLE'));
    const person=element('div','testimonial-person','');
    person.append(element('strong','',item.name),element('span','',item.role));
    card.append(label,element('blockquote','', '“'+item.quote+'”'),person);
    if(item.sample)card.append(element('p','testimonial-sample-note','Placeholder testimonial — to be replaced.'));
    else if(item.source){const link=element('a','','Read the full testimonial ↗');link.href=item.source;link.target='_blank';link.rel='noopener';card.append(link);}
    group.append(card);
  });
  const clone=group.cloneNode(true);clone.setAttribute('aria-hidden','true');clone.inert=true;
  clone.querySelectorAll('a').forEach(a=>a.tabIndex=-1);track.append(clone);
  section.classList.add('testimonials-ready');toggle.hidden=false;
  toggle.addEventListener('click',()=>{const paused=section.classList.toggle('testimonials-paused');toggle.setAttribute('aria-pressed',String(paused));toggle.textContent=paused?'Resume movement ▷':'Pause movement Ⅱ';});
  new IntersectionObserver(entries=>{section.classList.toggle('testimonials-offscreen',!entries[0].isIntersecting);},{threshold:0}).observe(section);
})();
