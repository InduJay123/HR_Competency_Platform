const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduceMotion.matches;
const root = document.documentElement;
const motionButton = document.querySelector('.motion-control');
const steps = [...document.querySelectorAll('.journey-step')];
const stage = document.querySelector('.platform-stage');
const journey = [
  { kicker:'01 / MEANINGFUL WORK', title:'Clarity starts\nwith the work.', description:'Connect each assignment to an expected outcome. Keep progress, blockers and evidence close to the work that matters.', tags:['Clear outcomes','Shared accountability'], note:'Make contribution visible.' },
  { kicker:'02 / HONEST REFLECTION', title:'Bring the story.\nBring the evidence.', description:'Reflect on what happened, what changed and what you learned. Give every review the context it deserves.', tags:['Employee reflection','Authorised evidence'], note:'Make room for reflection.' },
  { kicker:'03 / HUMAN JUDGEMENT', title:'AI assists.\nPeople decide.', description:'The appointed Head of HR validates sources and reviews AI insights. Human judgement shapes the final assessment.', tags:['HR validation','AI-assisted insight'], note:'Keep people at the centre.' },
  { kicker:'04 / LASTING DEVELOPMENT', title:'An insight is\nonly the beginning.', description:'Turn the conversation into commitments with an owner, support and a due date. Bring learning back into everyday work.', tags:['Agreed commitments','Ongoing development'], note:'Make the next step count.' }
];
function showStep(index) {
  const item=journey[index];
  document.querySelector('#stage-kicker').textContent=item.kicker;
  document.querySelector('#stage-title').textContent=item.title;
  document.querySelector('#stage-description').textContent=item.description;
  document.querySelector('#stage-note').textContent=item.note;
  document.querySelectorAll('#stage-tags span').forEach((tag,i)=>tag.textContent=item.tags[i]);
  steps.forEach((step,i)=>{step.classList.toggle('is-active',i===index);step.setAttribute('aria-pressed',String(i===index));});
  stage.dataset.scene=String(index);
  if(!reduceMotion.matches)document.querySelector('.platform-detail').animate([{opacity:.25,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:450,easing:'ease-out'});
}
steps.forEach((step,i)=>step.addEventListener('click',()=>showStep(i)));
function syncMotion(){paused=reduceMotion.matches;root.classList.toggle('motion-paused',paused);}
reduceMotion.addEventListener('change',syncMotion);syncMotion();

// Reveal once; keep content visible if JavaScript or observers are unavailable.
const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target);}}),{threshold:.08});
document.querySelectorAll('.reveal').forEach(element=>{element.classList.add('will-reveal');revealObserver.observe(element);});

const menuButton=document.querySelector('.menu-toggle');
const mobileNav=document.querySelector('#mobile-nav');
function closeMenu(){mobileNav.hidden=true;menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open navigation');}
menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')==='true';mobileNav.hidden=open;menuButton.setAttribute('aria-expanded',String(!open));menuButton.setAttribute('aria-label',open?'Open navigation':'Close navigation');});
mobileNav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!mobileNav.hidden){closeMenu();menuButton.focus();}});

const services=[...document.querySelectorAll('.service-list details')];
services.forEach(item=>item.addEventListener('toggle',()=>{if(item.open)services.forEach(other=>{if(other!==item)other.open=false;});}));

// A soft pointer-following light adds depth without moving the portrait or text.
const hero=document.querySelector('.hero');
hero.addEventListener('pointermove',event=>{if(paused||event.pointerType==='touch')return;const bounds=hero.getBoundingClientRect();hero.style.setProperty('--pointer-x',`${event.clientX-bounds.left}px`);hero.style.setProperty('--pointer-y',`${event.clientY-bounds.top}px`);});
hero.addEventListener('pointerleave',()=>{hero.style.removeProperty('--pointer-x');hero.style.removeProperty('--pointer-y');});

const problems=[
 ['See the contribution.\nUnderstand the person.','Use specific examples and qualitative assessment to explore current contribution and future potential. Give the employee’s perspective a place in the conversation.','A clearer basis for the next development decision.'],
 ['Diagnose the gap.\nChoose the right support.','Consider ability, motivation and opportunity before prescribing training. Explore role fit and management barriers too. The problem may be in the system around the person.','Support matched to the cause, rather than a standard response.'],
 ['Build capability\nthat stays.','Use the Legacy Tracker to discuss mentoring, shared knowledge and improvements that others can carry forward. Make space for contribution beyond individual output.','An organisation less dependent on knowledge held by one person.'],
 ['Agree the action.\nReturn to it.','Make three to five specific commitments with an owner, support and a timeline. Revisit them in a 90-day check-in instead of waiting for the next appraisal.','A review that leads into development and follow-through.']
];
document.querySelectorAll('[data-problem]').forEach(button=>button.addEventListener('click',()=>{
  const item=problems[Number(button.dataset.problem)];
  document.querySelector('#problem-title').textContent=item[0];
  document.querySelector('#problem-description').textContent=item[1];
  document.querySelector('#problem-result').textContent=item[2];
  document.querySelectorAll('[data-problem]').forEach(other=>{const active=other===button;other.classList.toggle('selected',active);other.setAttribute('aria-pressed',String(active));});
}));
const gaps=[
 'Is there a skill or knowledge gap? Consider coaching, structured learning or an adjustment to the role.',
 'Does the person know how, but feel disconnected from the work? Explore purpose, engagement and expectations before choosing a response.',
 'Are tools, access, resources or clear expectations missing? Remove the barrier and create the conditions for the person to contribute.',
 'Do the responsibilities fit this person’s strengths? Explore role design or a career conversation, rather than assuming more training is the answer.',
 'Could the way the work is managed be part of the problem? Reflect on leadership, seek other perspectives and consider support for the manager.'
];
document.querySelectorAll('[data-gap]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelector('#gap-description').textContent=gaps[Number(button.dataset.gap)];
  document.querySelectorAll('[data-gap]').forEach(other=>{const active=other===button;other.classList.toggle('selected',active);other.setAttribute('aria-pressed',String(active));});
}));
