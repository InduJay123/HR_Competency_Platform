import fs from 'node:fs';
let html=fs.readFileSync('dist/index.html','utf8');
html=html.replace('<link rel="stylesheet" href="styles.css">','<link rel="preload" href="assets/Allura-Regular.ttf" as="font" type="font/ttf" crossorigin>\n  <link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="hero.css">');
const a=html.indexOf('    <section class="hero"');
const b=html.indexOf('<section class="clients',a);
html=html.slice(0,a)+`    <section class="hero editorial-hero" aria-labelledby="hero-title">
      <div class="hero-edition"><span>THE WORK. THE PERSON. THE LEGACY.</span><span>BRADLEY EMERSON / SRI LANKA</span></div>
      <h1 id="hero-title" class="hero-name"><span>Bradley</span> <span>Emerson<span class="name-dot">.</span></span></h1>
      <div class="hero-orbit" aria-hidden="true"><span></span></div>
      <div class="portrait-scene"><img class="editorial-portrait" src="assets/bradley-cutout.png" alt="Bradley Emerson, in a navy suit; AI-assisted cutout of his supplied portrait" width="1024" height="1536" fetchpriority="high"></div>
      <div class="hero-manifesto"><span class="hero-overline">GO FURTHER THAN SUCCESS.</span><h2>Build people.<br>Change perspectives.<br><em>Leave a legacy.</em></h2><p>Corporate trainer.<br>Executive coach. Author.</p><a class="circle-cta" href="#contact"><span>Book a<br>conversation</span><i aria-hidden="true">↗</i></a></div>
      <div class="hero-explorer"><p class="hero-overline">A DIFFERENT WAY FORWARD</p><div class="hero-lenses" role="group" aria-label="Explore Bradley’s work"><button data-lens="0" class="active" aria-pressed="true"><span>01</span>Leadership<i>↗</i></button><button data-lens="1" aria-pressed="false"><span>02</span>Mindset<i>↗</i></button><button data-lens="2" aria-pressed="false"><span>03</span>Stewardship<i>↗</i></button></div><div class="lens-detail" aria-live="polite"><p id="lens-copy">Help leaders see their potential—and turn it into meaningful contribution.</p><a id="lens-link" href="#expertise">Explore the practice ↗</a></div></div>
      <div class="hero-signoff"><span class="handwritten">Bradley Emerson</span><span>THE PERSON BEHIND BEYOND THE FINISH LINE</span></div>
      <div class="hero-baseline"><a href="#platform" class="hero-product-link"><span class="live-dot"></span>BEYOND THE FINISH LINE<span class="product-descriptor">The stewardship platform</span><i>↗</i></a><div class="hero-tools"><button class="hero-motion" type="button">Pause motion Ⅱ</button><button class="replay-intro" type="button">Replay introduction ↺</button></div><a class="scroll-invitation" href="#bradley">SCROLL TO DISCOVER <span>↓</span></a></div>
    </section>
`+html.slice(b);
html=html.replace('<script src="app.js"','<script src="app.js"');
html=html.replace('</body>','<div class="signature-intro" id="signature-intro" role="dialog" aria-modal="true" aria-label="Bradley Emerson introduction" hidden><div class="intro-brand">BEYOND THE FINISH LINE<span>BY BRADLEY EMERSON</span></div><div class="signature-stage"><span class="signature-name">Bradley Emerson</span><svg viewBox="0 0 600 80" aria-hidden="true"><path d="M35 54 C160 15 350 15 560 34 M350 27 C365 25 411 50 393 58"/></svg><p>EVERY LASTING CONTRIBUTION STARTS WITH A PERSON.</p></div><div class="intro-bottom"><span>A NEW PERSPECTIVE AWAITS</span><button type="button" class="skip-intro">Skip introduction ↗</button></div></div><script src="hero.js"></script></body>');
fs.writeFileSync('dist/index.html',html);
