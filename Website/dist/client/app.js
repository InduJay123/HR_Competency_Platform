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
// Add approved screen asset paths here when they are ready, in journey order.
const platformScreens=[null,null,null,null];
function updatePlatformScreen(index){
  const labels=['Work','Reflect','Review','Grow'],source=platformScreens[index];
  const frame=document.querySelector('.screen-composition'),image=document.querySelector('#platform-screen'),placeholder=document.querySelector('.screen-placeholder'),caption=document.querySelector('.screen-caption');
  frame.disabled=!source;image.hidden=!source;placeholder.hidden=!!source;caption.hidden=!source;
  document.querySelector('.screen-placeholder-label').textContent=labels[index];
  frame.setAttribute('aria-label',source?'Expand '+labels[index]+' platform screen':labels[index]+' screen preview coming soon');
  if(source){image.src=source;image.alt=labels[index]+' screen in Beyond the Finish Line';caption.textContent=labels[index]+' · Expand ↗';}else{image.removeAttribute('src');image.alt='';}
}
updatePlatformScreen(0);
function showStep(index) {
  const item=journey[index];
  document.querySelector('#stage-kicker').textContent=item.kicker;
  document.querySelector('#stage-title').textContent=item.title;
  document.querySelector('#stage-description').textContent=item.description;
  document.querySelector('#stage-note').textContent=item.note;
  document.querySelectorAll('#stage-tags span').forEach((tag,i)=>tag.textContent=item.tags[i]);
  steps.forEach((step,i)=>{step.classList.toggle('is-active',i===index);step.setAttribute('aria-pressed',String(i===index));});
  stage.dataset.scene=String(index);
  updatePlatformScreen(index);
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
const problemAnswer=document.querySelector('.problem-answer');
let problemAnimations=[];
function stopProblemAnimations(){problemAnimations.forEach(animation=>animation.cancel());problemAnimations=[];}
reduceMotion.addEventListener('change',stopProblemAnimations);
document.querySelectorAll('[data-problem]').forEach(button=>button.addEventListener('click',()=>{
  stopProblemAnimations();
  if(!reduceMotion.matches){
    problemAnimations.push(button.animate([
      {transform:'translateY(0) scale(1)'},
      {transform:'translateY(-4px) scale(1.025)',offset:.45},
      {transform:'translateY(0) scale(1)'}
    ],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'}));
    problemAnimations.push(problemAnswer.animate([
      {opacity:.55,transform:'translateY(18px) scale(.97)'},
      {opacity:1,transform:'translateY(-3px) scale(1.004)',offset:.7},
      {opacity:1,transform:'translateY(0) scale(1)'}
    ],{duration:520,easing:'cubic-bezier(.22,1,.36,1)'}));
    [...problemAnswer.children].forEach((child,index)=>problemAnimations.push(child.animate([
      {opacity:0,transform:'translateY(9px)'},
      {opacity:1,transform:'translateY(0)'}
    ],{duration:350,delay:70+index*45,easing:'ease-out',fill:'backwards'})));
  }
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
let gapAnimations=[];
function stopGapAnimations(){gapAnimations.forEach(animation=>animation.cancel());gapAnimations=[];}
reduceMotion.addEventListener('change',stopGapAnimations);
document.querySelectorAll('[data-gap]').forEach(button=>button.addEventListener('click',()=>{
  stopGapAnimations();
  if(!reduceMotion.matches){
    gapAnimations.push(button.animate([
      {transform:'scale(1)'},
      {transform:'translateY(-3px) scale(1.08)',offset:.45},
      {transform:'scale(1)'}
    ],{duration:380,easing:'cubic-bezier(.22,1,.36,1)'}));
    gapAnimations.push(document.querySelector('#gap-description').animate([
      {opacity:0,transform:'translateY(10px)'},
      {opacity:1,transform:'translateY(0)'}
    ],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'}));
  }
  document.querySelector('#gap-description').textContent=gaps[Number(button.dataset.gap)];
  document.querySelectorAll('[data-gap]').forEach(other=>{const active=other===button;other.classList.toggle('selected',active);other.setAttribute('aria-pressed',String(active));});
}));
