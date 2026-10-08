/* Brutal Sounds — fonds Reels d'après les collages 2a / 2b / 2c (canvas, 1080×1920, animés).
   window.BrutalFonds.draw(ctx,t,S,A)
   S: {fond,dur,bpm,seed,grain,font,title,artist,safe}
   A: {photos:[Image],cover:Image,logo:Image,pulse:Float32Array} */
window.BrutalFonds=(function(){
const W=1080,H=1920,PAD=84,RATE=100;
/* charte Brutal Sounds */
const BRIQUE='#c8553d',KAKI='#5a6b3e',BEIGE='#e8d5b7',NOIR='#1a1a1a',PAPIER='#f0e6d2';
/* rôles hérités des collages, ramenés à la charte */
const OR=BRIQUE,CY=KAKI,PK=NOIR,JA=BEIGE,VE=KAKI,CR=BEIGE,RO=BRIQUE,NO=NOIR,BL=PAPIER,GB=KAKI,RG=NOIR;
/* marque Brutal Sounds, rendue en SVG (mêmes modules que reels-render.js) */
const RECTS=[[80,115,120,100],[45,60,55,65],[95,35,60,90],[150,75,55,50],[40,155,40,50],[200,140,40,55],[55,215,170,22]];
const HUBS=[[72,92,10],[125,60,10],[125,100,10],[177,100,10],[60,180,9],[220,167,9],[110,145,12],[170,145,12],[110,185,12],[170,185,12]];
function makeLogo(bg,hub){
  bg=bg||'#e8d5b7'; hub=hub||'#c8553d'; const mod='#1a1a1a';
  const r=RECTS.map(([x,y,w,h])=>`<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('');
  const c=HUBS.map(([x,y,rr])=>`<circle cx="${x}" cy="${y}" r="${rr}"/>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280" width="280" height="280"><circle cx="140" cy="140" r="140" fill="${bg}"/><g transform="translate(140,140) scale(0.76) translate(-140,-140)"><g fill="${mod}" stroke="${bg}" stroke-width="3" stroke-linejoin="miter">${r}</g><g fill="${hub}">${c}</g><rect x="40" y="237" width="200" height="6" fill="${mod}"/></g></svg>`;
  return new Promise(res=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>res(null);
    im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); });
}
let _logo=null; makeLogo().then(im=>{_logo=im;});
const _logos=new Map();
function logoFor(bg,hub){ const k=bg+'|'+hub; if(_logos.has(k))return _logos.get(k);
  _logos.set(k,null); makeLogo(bg,hub).then(im=>_logos.set(k,im)); return null; }

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const eOut=x=>1-Math.pow(1-x,3);
const eIO=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
const seg=(t,s,d)=>clamp((t-s)/Math.max(.0001,d),0,1);
const samp=(a,t)=>{if(!a||!a.length)return 0;return a[clamp(Math.round(t*RATE),0,a.length-1)];};
const rng32=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let r=Math.imul(s^s>>>15,1|s);r=r+Math.imul(r^r>>>7,61|r)^r;return((r^r>>>14)>>>0)/4294967296;};
const rad=d=>d*Math.PI/180;
/* le filtre couleur du générateur pilote les rôles d'aplat de chaque recette */
const PALS={
  '#1a1a1a':{dom:NOIR,  sec:BRIQUE,ter:KAKI,  pap:BEIGE},
  '#5a6b3e':{dom:KAKI,  sec:BEIGE, ter:BRIQUE,pap:BEIGE},
  '#c8553d':{dom:BRIQUE,sec:KAKI,  ter:NOIR,  pap:BEIGE},
  '#e8d5b7':{dom:BEIGE, sec:BRIQUE,ter:KAKI,  pap:PAPIER},
};
const pal=S=>PALS[((S.theme&&S.theme.bg)||'#c8553d').toLowerCase()]||PALS['#c8553d'];
const on=c=>(c===BEIGE||c===PAPIER)?NOIR:BEIGE;

/* ---------- photos : bake N&B contrasté une seule fois ---------- */
const _bake=new Map(); let _uid=0;
const bid=im=>im.__bid||(im.__bid=++_uid);
/* libère les photos cuites qui ne servent plus (keep = Set d'identifiants à garder) */
function flush(keep){ for(const [k,c] of _bake){ const id=+k.split('|')[0];
  if(!keep||!keep.has(id)){ c.width=c.height=0; _bake.delete(k); } } }
function bake(im,key,filter){
  const k=key+'|'+filter; if(_bake.has(k))return _bake.get(k);
  const s=1200/Math.max(im.width,1), c=document.createElement('canvas');
  c.width=Math.round(im.width*s); c.height=Math.round(im.height*s);
  const x=c.getContext('2d'); x.filter=filter; x.drawImage(im,0,0,c.width,c.height); x.filter='none';
  _bake.set(k,c); return c;
}
function photo(A,i,f){ const p=A.photos||[]; if(!p.length)return null;
  const j=((i%p.length)+p.length)%p.length; return p[j]?bake(p[j],bid(p[j]),f||'grayscale(1) contrast(1.4)'):null; }

let _g=null;
function grainTile(){ if(_g)return _g;
  const c=document.createElement('canvas'); c.width=c.height=220; const x=c.getContext('2d');
  const d=x.createImageData(220,220);
  for(let i=0;i<d.data.length;i+=4){const v=40+Math.random()*215;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}
  x.putImageData(d,0,0); _g=c; return c; }
/* grain : un seul remplissage par motif (au lieu de ~45 drawImage en fusion) */
const _gp=new WeakMap();
function grain(ctx,t,S){ if(!S.grain)return;
  let p=_gp.get(ctx); if(!p){ p=ctx.createPattern(grainTile(),'repeat'); _gp.set(ctx,p); }
  const k=Math.floor(t*24); p.setTransform(new DOMMatrix([1,0,0,1,-(k*67)%220,-(k*131)%220]));
  ctx.save(); ctx.globalAlpha=.07; ctx.globalCompositeOperation='overlay';
  ctx.fillStyle=p; ctx.fillRect(0,0,W,H); ctx.restore(); }

function cover(ctx,im,x,y,w,h,z,dx,dy){ if(!im)return;
  const b=Math.max(w/im.width,h/im.height)*(z||1),dw=im.width*b,dh=im.height*b;
  ctx.drawImage(im,x+(w-dw)/2+(dx||0),y+(h-dh)/2+(dy||0),dw,dh); }

/* bord déchiré */
function torn(ctx,x,y,w,h,amp,n,rnd,top,bot){
  ctx.beginPath(); const st=w/n;
  if(top){ ctx.moveTo(x,y+rnd()*amp); for(let i=1;i<=n;i++) ctx.lineTo(x+st*i,y+rnd()*amp); }
  else { ctx.moveTo(x,y); ctx.lineTo(x+w,y); }
  if(bot){ for(let i=n;i>=0;i--) ctx.lineTo(x+st*i,y+h-rnd()*amp); }
  else { ctx.lineTo(x+w,y+h); ctx.lineTo(x,y+h); }
  ctx.closePath();
}
/* découpe anguleuse en % de la boîte */
function poly(ctx,pts,x,y,w,h){ ctx.beginPath();
  pts.forEach((p,i)=>{const px=x+p[0]*w,py=y+p[1]*h; i?ctx.lineTo(px,py):ctx.moveTo(px,py);}); ctx.closePath(); }
/* couche photo en fusion */
function layer(ctx,im,x,y,w,h,mode,alpha,z,dx,dy){ if(!im)return;
  ctx.save(); ctx.globalCompositeOperation=mode; ctx.globalAlpha=alpha;
  cover(ctx,im,x,y,w,h,z,dx,dy); ctx.restore(); }
/* trame de hachures dans une boîte */
/* hachures pré-cuites une fois par réglage, puis posées en une seule opération de fusion */
const _hatch=new Map();
function hatchTile(w,h,color,angle,step,thick,s){
  const k=[w,h,color,angle,step,thick,s].join('|'); if(_hatch.has(k))return _hatch.get(k);
  const c=document.createElement('canvas'); c.width=Math.ceil(w*s); c.height=Math.ceil(h*s);
  const x=c.getContext('2d'); x.scale(s,s); x.fillStyle=color;
  x.translate(w/2,h/2); x.rotate(rad(angle||0));
  const R=Math.hypot(w,h); for(let i=-R;i<R;i+=step) x.fillRect(-R,i,R*2,thick);
  _hatch.set(k,c); return c; }
function hatch(ctx,x,y,w,h,color,angle,step,thick,mode,alpha){
  ctx.save(); ctx.globalCompositeOperation=mode||'overlay'; ctx.globalAlpha=alpha==null?1:alpha;
  /* tuile à l'échelle réelle du canvas : pas de réduction coûteuse à chaque image en aperçu */
  const s=Math.round(Math.hypot(ctx.getTransform().a,ctx.getTransform().b)*1000)/1000||1;
  ctx.drawImage(hatchTile(w,h,color,angle,step,thick,s),x,y,w,h); ctx.restore(); }
/* tirage encadré : la pochette posée comme une photo collée */
function print(ctx,im,x,y,w,h,rot,border,alpha,z){ if(!im)return;
  ctx.save(); ctx.globalAlpha=alpha==null?1:alpha;
  ctx.translate(x+w/2,y+h/2); ctx.rotate(rad(rot||0)); ctx.translate(-(x+w/2),-(y+h/2));
  ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=48; ctx.shadowOffsetY=24;
  ctx.fillStyle=BL; ctx.fillRect(x-border,y-border,w+border*2,h+border*2);
  ctx.shadowColor='transparent';
  ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); cover(ctx,im,x,y,w,h,z||1,0,0); ctx.restore();
  ctx.restore(); }

/* =========== A. SURIMPRESSION (2a) — dominante, aplat secondaire, couches en fusion =========== */
function fSurimpression(ctx,t,S,A){
  const D=S.dur,k=eIO(clamp(t/D,0,1)),pulse=samp(A.pulse,t),sd=S.seed||1,P=pal(S);
  ctx.fillStyle=P.dom; ctx.fillRect(0,0,W,H);
  layer(ctx,photo(A,0+sd,'grayscale(1) contrast(1.45)'),0,0,W,H,'multiply',.92,1.06+.08*k,0,lerp(-34,34,k));

  /* aplat secondaire, bord déchiré, descend au démarrage */
  const cp=eOut(seg(t,0,.75));
  ctx.save(); ctx.globalCompositeOperation='screen';
  torn(ctx,0,0,W,940*cp,32,10,rng32(sd*3+1),false,true);
  ctx.fillStyle=P.sec; ctx.fill(); ctx.restore();

  layer(ctx,photo(A,1+sd,'grayscale(1) contrast(1.3)'),-W*.08,H*.04,W*1.16,H*.70,'difference',.6,1.08,lerp(46,-46,k),0);

  /* découpe anguleuse en hard-light, à droite */
  ctx.save();
  poly(ctx,[[.38,0],[1,0],[1,1],[.52,1],[.60,.72],[.44,.48],[.55,.24]],W*.30,H*.22,W*.76,H*.66);
  ctx.clip(); layer(ctx,photo(A,2+sd,'grayscale(1) contrast(1.5)'),W*.30,H*.22,W*.76,H*.66,'hard-light',.85,1.04+.12*k,0,0);
  ctx.restore();

  layer(ctx,photo(A,3+sd,'grayscale(1) contrast(1.35)'),-W*.10,H*.52,W*.78,H*.52,'overlay',.9,1.05,lerp(-30,30,k),0);

  /* aplat rose qui monte */
  const rp=eOut(seg(t,.15,.8));
  ctx.save(); ctx.globalCompositeOperation='soft-light'; ctx.globalAlpha=.85;
  ctx.fillStyle=P.ter; ctx.fillRect(0,H-620*rp,W,620*rp); ctx.restore();

  /* trames qui glissent */
  hatch(ctx,0,1020,W,240,P.sec,48,16,3,'overlay',.8);
  hatch(ctx,56,860+lerp(0,-40,k),300,180,'rgba(0,0,0,.55)',0,22,2,'multiply',.7);

  /* pochette collée, léger balancement */
  print(ctx,A.cover,520,540,500,500,lerp(-5,-1.5,k)+pulse*.6,20,eOut(seg(t,.25,.7)),1.02+.04*k);

  /* accents au beat */
  const ta=eOut(seg(t,.5,.5));
  ctx.save(); ctx.globalAlpha=ta; ctx.fillStyle=P.ter;
  const ts=96+pulse*18; poly(ctx,[[.5,0],[1,1],[0,1]],840,H-208-ts*.9,ts,ts*.9); ctx.fill();
  ctx.fillStyle=P.pap; ctx.fillRect(120,H-234,64,64); ctx.restore();

  grain(ctx,t,S);
  return {tilt:true,plaque:P.pap,ink:on(P.pap),accent:P.sec,onAccent:on(P.sec),top:1180,pal:P};
}

/* =========== B. PHOTOMONTAGE (2b) — aplats rouge/jaune, cernes, découpes =========== */
function fPhotomontage(ctx,t,S,A){
  const D=S.dur,k=eIO(clamp(t/D,0,1)),pulse=samp(A.pulse,t),sd=S.seed||1,P=pal(S);
  ctx.fillStyle=P.pap; ctx.fillRect(0,0,W,H);

  /* aplats : rouge descend, bande jaune se déploie, bas jaune monte */
  const a1=eOut(seg(t,0,.5)),a2=eOut(seg(t,.12,.6)),a3=eOut(seg(t,.06,.6));
  ctx.fillStyle=P.dom; ctx.fillRect(0,0,W,520*a1);
  ctx.save(); poly(ctx,[[0,.08],[1,0],[1,.92],[0,1]],0,400,W*a2,300); ctx.fillStyle=P.sec; ctx.fill(); ctx.restore();
  ctx.fillStyle=P.sec; ctx.fillRect(0,H-520*a3,W,520*a3);

  /* carte dégradée : la pochette y est encastrée */
  const cp=eOut(seg(t,.2,.7));
  if(cp>0){ const cx=60,cy=430,cw=660,ch=700;
    ctx.save(); ctx.globalAlpha=cp;
    ctx.translate(cx+cw/2,cy+ch/2); ctx.scale(lerp(.94,1,cp),lerp(.94,1,cp)); ctx.translate(-(cx+cw/2),-(cy+ch/2));
    ctx.shadowColor='rgba(0,0,0,.28)'; ctx.shadowBlur=60; ctx.shadowOffsetY=24;
    const g=ctx.createLinearGradient(cx,cy,cx+cw*.4,cy+ch);
    g.addColorStop(0,P.ter); g.addColorStop(.55,'#9aa07a'); g.addColorStop(1,P.pap);
    ctx.fillStyle=g; ctx.fillRect(cx,cy,cw,ch); ctx.shadowColor='transparent';
    ctx.save(); ctx.beginPath(); ctx.rect(cx,cy+ch*.56,cw,ch*.44); ctx.clip();
    layer(ctx,photo(A,0+sd,'grayscale(1) contrast(1.6) brightness(.9)'),cx,cy+ch*.56,cw,ch*.44,'multiply',.9,1.04+.06*k,0,0);
    ctx.restore();
    if(A.cover){ ctx.save(); ctx.beginPath(); ctx.rect(cx+44,cy+44,cw-88,cw-88); ctx.clip();
      cover(ctx,A.cover,cx+44,cy+44,cw-88,cw-88,1.02+.04*k,0,0); ctx.restore();
      ctx.strokeStyle='rgba(20,20,22,.35)'; ctx.lineWidth=2; ctx.strokeRect(cx+45,cy+45,cw-90,cw-90); }
    ctx.restore(); }

  /* grande découpe photo, entre par la droite */
  const dp=eOut(seg(t,.1,.8));
  ctx.save(); ctx.globalAlpha=dp; ctx.translate(lerp(160,0,dp),0);
  poly(ctx,[[.30,0],[1,.06],[.96,.62],[1,1],[.44,.96],[.52,.70],[.26,.46],[.36,.22]],W-620,120,660,1420);
  ctx.clip(); cover(ctx,photo(A,1+sd,'grayscale(1) contrast(2.1) brightness(1.05)'),W-620,120,660,1420,1.04+.08*k,0,0);
  ctx.restore();

  /* cernes qui tournent lentement */
  const ring=(x,y,d,lw,col,rot,skx,sky,al)=>{
    ctx.save(); ctx.globalAlpha=al; ctx.translate(x+d/2,y+d/2);
    ctx.rotate(rad(rot)); ctx.transform(1,sky,skx,1,0,0);
    ctx.beginPath(); ctx.arc(0,0,(d-lw)/2,0,Math.PI*2);
    ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.stroke(); ctx.restore(); };
  ring(520,520,520,26,P.pap,lerp(-12,-2,k),-.10,0,eOut(seg(t,.3,.7))*.95);
  ring(610,700,380,14,P.ter,lerp(18,30,k),0,.14,eOut(seg(t,.42,.7))*.9);

  /* bandeau photo déchiré qui glisse */
  const bp=eOut(seg(t,.35,.7));
  ctx.save(); ctx.globalAlpha=bp;
  ctx.translate(-30+lerp(-60,20,k),980); ctx.rotate(rad(-1.6));
  torn(ctx,0,0,1140,170,18,9,rng32(sd*11),true,true); ctx.clip();
  cover(ctx,photo(A,2+sd,'grayscale(1) contrast(1.8)'),0,0,1140,170,1.1,0,0);
  ctx.restore();

  /* petite découpe + barre de couleurs */
  const sp=eOut(seg(t,.55,.5));
  ctx.save(); ctx.globalAlpha=sp;
  poly(ctx,[[.06,0],[1,.08],[.92,1],[0,.90]],70,H-390,300,300); ctx.clip();
  cover(ctx,photo(A,3+sd,'grayscale(1) contrast(1.5)'),70,H-390,300,300,1.05,0,0);
  ctx.restore();
  const bar=[P.ter,P.dom,P.pap,P.sec], bw=180*eOut(seg(t,.6,.6));
  bar.forEach((c,i)=>{ ctx.fillStyle=c; ctx.fillRect(W-260+i*45,H-186,Math.max(0,Math.min(45,bw-i*45)),36); });
  ctx.fillStyle=P.ter; ctx.globalAlpha=.5; ctx.fillRect(0,1120,W*eOut(seg(t,.7,.7)),2); ctx.globalAlpha=1;

  grain(ctx,t,S);
  return {tilt:false,plaque:P.pap,ink:on(P.pap),accent:P.dom,onAccent:on(P.dom),top:1180,pal:P};
}

/* =========== C. STRATES (2c) — cinq strates déchirées, une couleur par strate =========== */
function fStrates(ctx,t,S,A){
  const D=S.dur,k=eIO(clamp(t/D,0,1)),sd=S.seed||1,P=pal(S);
  ctx.fillStyle='#12120f'; ctx.fillRect(0,0,W,H);
  const strates=[
    {y:-20,h:460,rot:-1.2,col:P.ter, mode:'multiply',al:.85,f:'grayscale(1) contrast(1.4)'},
    {y:380,h:420,rot:.9,  col:P.dom, mode:'screen',  al:.8, f:'grayscale(1) contrast(1.5)'},
    {y:740,h:440,rot:-.6, col:P.pap, mode:'multiply',al:1,  f:'grayscale(1) contrast(1.3)'},
    {y:1120,h:460,rot:1.4,col:P.sec, mode:'multiply',al:.9, f:'grayscale(1) contrast(1.45)'},
    {y:1520,h:440,rot:-1, col:P.ter, mode:'multiply',al:.9, f:'grayscale(1) contrast(1.6)'},
  ];
  strates.forEach((b,i)=>{
    const dir=i%2?1:-1, sl=dir*(70+i*24)*k, ap=eOut(seg(t,.04+i*.09,.7));
    ctx.save(); ctx.globalAlpha=ap;
    ctx.translate(W/2,b.y+b.h/2); ctx.rotate(rad(b.rot)); ctx.translate(-W/2,-(b.y+b.h/2));
    ctx.translate(sl,(1-ap)*30*dir);
    torn(ctx,-70,b.y,W+140,b.h,26,9,rng32(sd*13+i*101),true,i<4); ctx.clip();
    cover(ctx,photo(A,i+sd,b.f),-70,b.y,W+140,b.h,1.14,-sl*1.5,0);
    ctx.globalCompositeOperation=b.mode; ctx.globalAlpha=ap*b.al; ctx.fillStyle=b.col;
    ctx.fillRect(-140,b.y-30,W+280,b.h+60);
    if(i===2){ ctx.globalCompositeOperation='screen'; ctx.globalAlpha=ap*.5; ctx.fillStyle=P.ter; ctx.fillRect(-140,b.y-30,W+280,b.h+60); }
    ctx.restore();
  });
  /* photo en difference qui traverse les strates */
  layer(ctx,photo(A,5+sd,'grayscale(1) contrast(1.2)'),300,620,480,680,'difference',.5,1.04,lerp(30,-30,k),0);
  /* pochette collée, en travers */
  print(ctx,A.cover,150,570,480,480,lerp(4,1.5,k),18,eOut(seg(t,.3,.7)),1.02+.04*k);
  hatch(ctx,0,0,W,H,'rgba(0,0,0,.35)',2,26,2,'overlay',1);
  grain(ctx,t,S);
  return {tilt:true,plaque:P.pap,ink:on(P.pap),accent:P.dom,onAccent:on(P.dom),top:1180,pal:P};
}

/* ================= habillage typo ================= */
function setD(ctx,s,f){ ctx.font=`${f.weight} ${s}px ${f.display}`; ctx.letterSpacing=f.ls||'0px'; }
function setM(ctx,s,f,ls){ ctx.font=`${s}px ${f.mono}`; ctx.letterSpacing=(ls==null?2:ls)+'px'; }
function fit(ctx,ls,maxW,maxH,start,lhf,f){ let s=start;
  while(s>28){ setD(ctx,s,f); if(!ls.some(l=>ctx.measureText(l).width>maxW)&&ls.length*s*lhf<=maxH)break; s-=4; }
  setD(ctx,s,f); return s; }

function overlay(ctx,t,S,A,M){
  const f=S.font;
  const tl=String(S.title||'').toUpperCase().split('\n').map(l=>l.trim()).filter(Boolean);
  const ts=fit(ctx,tl.length?tl:[''],812,330,132,1.0,f), lh=ts*1.02;

  /* pastille artiste */
  const label=String(S.artist||'').toUpperCase();
  const chipH=label?86:0, ph=ts*.96;
  /* bloc ancr\u00e9 par le bas : la derni\u00e8re ligne reste au-dessus de la zone s\u00fbre quel que soit le nombre de lignes */
  const blockH=chipH+Math.max(0,tl.length-1)*lh+(tl.length?ph:0);
  let y=Math.min(M.top,H-420-blockH-40);
  if(label){ const ap=eOut(seg(t,.3,.5));
    setM(ctx,32,f,5); const tw=ctx.measureText(label).width,bh=62;
    ctx.save(); ctx.globalAlpha=ap; ctx.translate(PAD+(1-ap)*-30,y);
    ctx.fillStyle=M.accent; ctx.fillRect(0,0,tw+44,bh);
    ctx.fillStyle=M.onAccent; ctx.textBaseline='middle'; ctx.fillText(label,22,bh/2+1);
    ctx.restore(); y+=bh+24; }

  /* titre : plaques collées (2a / 2c) ou à plat (2b) */
  const rots=[-2.5,1.5,-1,2];
  tl.forEach((l,i)=>{
    const p=eOut(seg(t,.46+i*.11,.55)); if(p<=0)return;
    setD(ctx,ts,f); const tw=ctx.measureText(l).width;
    const ly=y+i*lh;
    ctx.save(); ctx.globalAlpha=p;
    const px=PAD-14,pw=tw+52,ph=ts*.96;
    if(M.tilt){ ctx.translate(px+pw/2,ly+ph/2); ctx.rotate(rad(rots[i%4]*p)); ctx.translate(-(px+pw/2),-(ly+ph/2)); }
    else { ctx.translate((1-p)*-30,0); }
    ctx.shadowColor='rgba(0,0,0,.35)'; ctx.shadowBlur=20; ctx.shadowOffsetY=6;
    ctx.fillStyle=M.plaque; ctx.fillRect(px,ly,pw,ph); ctx.shadowColor='transparent';
    ctx.fillStyle=M.ink; ctx.textBaseline='middle'; ctx.fillText(l,PAD+12,ly+ph/2+ts*.04);
    ctx.restore();
  });

  /* marque : bandeau d'encre coll\u00e9 dans l'angle, bord bas d\u00e9chir\u00e9 comme les autres couches */
  const P=M.pal||PALS['#c8553d'];
  const ba=eOut(seg(t,0,.45)), s=92, gap=s*.26, ix=56, iy=42;
  setD(ctx,s*.5,f);
  const bw=Math.max(ctx.measureText('BRUTAL').width,ctx.measureText('SOUNDS').width);
  const bandW=ix+s+gap+bw+58, bandH=iy+s+38;
  ctx.save(); ctx.translate(0,(1-ba)*-bandH);
  torn(ctx,0,0,bandW,bandH,16,7,rng32((S.seed||1)*7+3),false,true);
  ctx.fillStyle=NO; ctx.fill();
  const lg=A.logo||logoFor(P.pap,P.dom)||_logo; if(lg) ctx.drawImage(lg,ix,iy,s,s);
  ctx.fillStyle=P.pap; ctx.textBaseline='top';
  ctx.fillText('BRUTAL',ix+s+gap,iy+2);
  ctx.fillText('SOUNDS',ix+s+gap,iy+2+s*.44);
  /* ti\u00e8ge de liaison : la bande mord sur la couche suivante */
  ctx.fillStyle=P.dom; ctx.fillRect(bandW-10,0,10,bandH*.62);
  ctx.restore();
}

function safeZone(ctx){
  ctx.save(); ctx.fillStyle='rgba(255,60,60,.14)';
  ctx.fillRect(0,0,W,220); ctx.fillRect(0,H-420,W,420);
  ctx.strokeStyle='rgba(255,90,90,.75)'; ctx.lineWidth=2; ctx.setLineDash([14,10]);
  ctx.beginPath(); ctx.moveTo(0,220); ctx.lineTo(W,220); ctx.moveTo(0,H-420); ctx.lineTo(W,H-420); ctx.stroke();
  ctx.restore(); }

const RECIPES={
  surimpression:{label:'2a — Surimpression',note:'couches en fusion, aplat secondaire qui descend',fn:fSurimpression},
  photomontage: {label:'2b — Photomontage', note:'aplats, cernes qui tournent, découpes',   fn:fPhotomontage},
  strates:      {label:'2c — Strates',      note:'cinq strates qui glissent',               fn:fStrates},
};

function draw(ctx,t,S,A){
  const D=S.dur||12; t=clamp(t,0,D);
  const rec=RECIPES[S.fond]||RECIPES.surimpression;
  ctx.save();
  const M=rec.fn(ctx,t,{...S,dur:D},A)||{mode:'plat',ink:NO,accent:RO,onAccent:CR,brandInk:CR,top:1500};
  ctx.restore();
  ctx.save(); overlay(ctx,t,{...S,dur:D},A,M); ctx.restore();
  if(S.safe) safeZone(ctx);
}
return {draw,RECIPES,makeLogo,flush,W,H};
})();
