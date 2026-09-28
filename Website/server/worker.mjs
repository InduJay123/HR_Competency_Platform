const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const seed={id:'inner-game',title:'From Leadership to Stewardship: The Inner Game',description:'A retreat-like engagement. A deep, inward-bound journey into leadership and stewardship.',host:'With thanks to Chamath Munasinghe for initiating the engagement.',date:'',status:'published',createdAt:'2026-01-01T00:00:00Z',photos:[{url:'/assets/training-group.png',alt:'The people — programme group photograph'},{url:'/assets/training-reflection.png',alt:'The reflection — participants writing at the retreat'},{url:'/assets/training-conversation.png',alt:'The conversation — facilitated learning'}]};
function owner(req,env){return !!env.GALLERY_ADMIN_EMAIL && req.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.GALLERY_ADMIN_EMAIL.toLowerCase();}
function sameOrigin(req){return req.headers.get('Origin')===new URL(req.url).origin;}
function clean(value,max){return typeof value==='string'?value.trim().slice(0,max):'';}
async function record(bucket,id){const object=await bucket.get('posts/'+id+'.json');return object?JSON.parse(await object.text()):id===seed.id?seed:null;}
async function list(bucket,admin){let cursor,posts=[];do{const page=await bucket.list({prefix:'posts/',cursor,limit:100});const batch=await Promise.all(page.objects.map(async o=>{const r=await bucket.get(o.key);return r?JSON.parse(await r.text()):null;}));posts.push(...batch.filter(Boolean));cursor=page.truncated?page.cursor:undefined;}while(cursor);if(!posts.some(p=>p.id===seed.id))posts.push(seed);return posts.filter(p=>admin||p.status==='published').sort((a,b)=>(b.date||b.createdAt).localeCompare(a.date||a.createdAt));}
function imageType(bytes){if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'image/png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';return null;}
export default {async fetch(req,env){const url=new URL(req.url),p=url.pathname;try{
  if(p==='/api/session')return json({editor:owner(req,env),emailEnabled:!!(env.RESEND_API_KEY&&env.CONTACT_FROM),recipient:'bradley@thebusinessathletes.com'});
  if(p==='/api/gallery'&&req.method==='GET'){if(!env.BUCKET)return json({posts:[seed],unavailable:true});return json({posts:await list(env.BUCKET,owner(req,env)&&url.searchParams.has('studio'))});}
  if(p==='/api/gallery'&&req.method==='POST'){
    if(!owner(req,env))return json({error:'Sign in with the website owner account to update the gallery.'},403);
    if(!sameOrigin(req))return json({error:'Please submit from this website.'},403);
    if(!env.BUCKET)return json({error:'Gallery storage is unavailable. Your changes have not been saved.'},503);
    if(Number(req.headers.get('content-length'))>42*1024*1024)return json({error:'Keep each update under 40 MB.'},413);
    const form=await req.formData();const requested=clean(form.get('id'),80);if(requested&&!/^[a-zA-Z0-9-]+$/.test(requested))return json({error:'Invalid update.'},400);
    const previous=requested?await record(env.BUCKET,requested):null;if(requested&&!previous)return json({error:'This update could not be found.'},404);
    const title=clean(form.get('title'),160),description=clean(form.get('description'),1800),host=clean(form.get('host'),180),date=clean(form.get('date'),10),status=clean(form.get('status'),20);
    if(!title||!description||!['draft','published','archived'].includes(status)||(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date)))return json({error:'Add a title, description and valid publication details.'},400);
    const files=form.getAll('photos').filter(f=>typeof f!=='string'&&f.size>0);if(files.length>12||files.reduce((a,f)=>a+f.size,0)>40*1024*1024)return json({error:'Upload up to 12 photos, totalling no more than 40 MB.'},400);
    const uploads=[];for(const f of files){if(f.size>10*1024*1024)return json({error:'Each image must be 10 MB or smaller.'},400);const bytes=new Uint8Array(await f.arrayBuffer()),type=imageType(bytes);if(!type)return json({error:'Use JPG, PNG or WebP photographs.'},400);uploads.push({bytes,type});}
    const id=requested||crypto.randomUUID();const photos=[...(previous?.photos||[])];if(!photos.length&&!uploads.length)return json({error:'Add at least one photograph.'},400);
    for(const [i,u] of uploads.entries()){const key='media/'+id+'/'+crypto.randomUUID();await env.BUCKET.put(key,u.bytes,{httpMetadata:{contentType:u.type}});photos.push({url:'/api/'+key,alt:title+' — photograph '+(photos.length+1)});}
    const post={id,title,description,host,date,status,photos,createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
    await env.BUCKET.put('posts/'+id+'.json',JSON.stringify(post),{httpMetadata:{contentType:'application/json'}});return json({post},201);
  }
  if(p.startsWith('/api/media/')&&req.method==='GET'){const parts=p.split('/');if(parts.length!==5||!parts.slice(3).every(v=>/^[a-zA-Z0-9-]+$/.test(v)))return new Response('Not found',{status:404});const post=await record(env.BUCKET,parts[3]);if(!post||(post.status!=='published'&&!owner(req,env)))return new Response('Not found',{status:404});const file=await env.BUCKET.get(p.slice(5));if(!file)return new Response('Not found',{status:404});return new Response(file.body,{headers:{'Content-Type':file.httpMetadata?.contentType||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-cache'}});}
  if(p==='/api/contact'&&req.method==='POST'){
    if(!sameOrigin(req))return json({error:'Please submit from this website.'},403);
    if(!env.RESEND_API_KEY||!env.CONTACT_FROM)return json({error:'Direct delivery is not connected yet. Please use the email option below.'},503);
    if(Number(req.headers.get('content-length'))>16000)return json({error:'Please shorten your message.'},413);
    const data=await req.json();if(data.website)return json({error:'Please try again.'},400);
    const name=clean(data.name,100),email=clean(data.email,180),company=clean(data.company,160),message=clean(data.message,5000),interest=clean(data.interest,100);
    if(!name||!/^\S+@\S+\.\S+$/.test(email)||/[\r\n]/.test(email)||message.length<10)return json({error:'Please provide your name, a valid email and a message of at least 10 characters.'},400);
    if(env.BUCKET){const ip=req.headers.get('cf-connecting-ip')||email;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))).map(v=>v.toString(16).padStart(2,'0')).join('');const key='rate/'+hash;const prior=await env.BUCKET.get(key);if(prior&&Date.now()-Number(await prior.text())<60000)return json({error:'Please wait a minute before sending another enquiry.'},429);await env.BUCKET.put(key,String(Date.now()));}
    const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.CONTACT_FROM,to:['bradley@thebusinessathletes.com'],reply_to:email,subject:'Website enquiry: '+interest,text:`Name: ${name}\nEmail: ${email}\nOrganisation: ${company}\nInterest: ${interest}\n\n${message}`})});
    if(!result.ok)return json({error:'Your message could not be sent. Please try again or email Bradley directly.'},502);return json({sent:true});
  }
  if(p.startsWith('/api/'))return json({error:'Not found'},404);
  if(p==='/studio'||p==='/studio/'){
    if(!req.headers.get('oai-authenticated-user-email'))return Response.redirect(url.origin+'/signin-with-chatgpt?return_to=%2Fstudio',302);
    if(!owner(req,env))return new Response('This gallery studio is available to the website owner only.',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    return new Response(STUDIO_HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}});
  }
  if(p==='/'||p==='/index.html')return new Response(HOME_HTML,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  return env.ASSETS.fetch(req);
}catch(error){console.error('Website request failed',p,error?.message);return json({error:'Something went wrong. Please try again; your unsaved details are still in the form.'},503);}}};
