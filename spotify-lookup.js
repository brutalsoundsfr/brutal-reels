/* Brutal Sounds — résolution artiste depuis un lien Spotify, sans clé API.
   1) MusicBrainz : correspondance exacte lien Spotify → enregistrement → artiste.
   2) iTunes + Deezer (JSONP) : candidats par titre, départagés en comparant
      la pochette du candidat à celle de Spotify (empreinte perceptuelle 8x8). */
window.BrutalLookup=(function(){
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const IMGPROXY=u=>'https://images.weserv.nl/?url='+encodeURIComponent(String(u).replace(/^https?:\/\//,''))+'&w=64&h=64&fit=cover';

async function getJSON(url,ms){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms||5000);
  try{ const r=await fetch(url,{signal:c.signal}); if(!r.ok) throw new Error(r.status); return await r.json(); }
  finally{ clearTimeout(t); }
}
function jsonp(url,ms){
  return new Promise((ok,no)=>{
    const cb='bl'+Math.random().toString(36).slice(2), s=document.createElement('script');
    const clean=()=>{ try{ delete window[cb]; }catch(e){ window[cb]=undefined; } s.remove(); clearTimeout(t); };
    const t=setTimeout(()=>{ clean(); no(new Error('timeout')); }, ms||5000);
    window[cb]=d=>{ clean(); ok(d); };
    s.onerror=()=>{ clean(); no(new Error('jsonp')); };
    s.src=url+(url.includes('?')?'&':'?')+'output=jsonp&callback='+cb;
    document.body.appendChild(s);
  });
}
const loadImg=src=>new Promise((ok,no)=>{ const im=new Image(); im.crossOrigin='anonymous';
  im.onload=()=>ok(im); im.onerror=no; im.src=src; setTimeout(()=>no(new Error('img')),7000); });
async function hashOf(src,proxy){
  const im=await loadImg(proxy?IMGPROXY(src):src);
  const c=document.createElement('canvas'); c.width=c.height=8;
  const x=c.getContext('2d'); x.drawImage(im,0,0,8,8);
  const d=x.getImageData(0,0,8,8).data, g=[];
  for(let i=0;i<64;i++) g.push(.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2]);
  const m=g.reduce((a,b)=>a+b,0)/64;
  return g.map(v=>v>m?1:0);
}
const ham=(a,b)=>a.reduce((s,v,i)=>s+(v!==b[i]?1:0),0);

async function musicbrainz(trackId){
  const j=await getJSON('https://musicbrainz.org/ws/2/url?resource='+encodeURIComponent('https://open.spotify.com/track/'+trackId)+'&inc=recording-rels&fmt=json',6000);
  const rel=(j.relations||[]).find(r=>r.recording);
  if(!rel) return null;
  const r2=await getJSON('https://musicbrainz.org/ws/2/recording/'+rel.recording.id+'?inc=artist-credits&fmt=json',6000);
  const artist=(r2['artist-credit']||[]).map(a=>(a.name||(a.artist&&a.artist.name)||'')+(a.joinphrase||'')).join('').trim();
  return artist?{ artist, track:r2.title||rel.recording.title, source:'MusicBrainz (lien exact)', confident:true }:null;
}

/* opts: { trackId, name, coverDataURL, log } */
async function resolve(opts){
  const log=opts.log||(()=>{});
  if(opts.trackId){ log('Correspondance MusicBrainz…');
    try{ const mb=await musicbrainz(opts.trackId); if(mb) return mb; }catch(e){} }
  const q=String(opts.name||'').replace(/\s*[\(\[].*?[\)\]]\s*/g,' ').trim();
  if(!q) return null;
  if(norm(q).length<3) return { tooShort:true, track:opts.name };
  log('Recherche du morceau…');
  const cands=[];
  const [itn,dzr]=await Promise.all([
    getJSON('https://itunes.apple.com/search?media=music&entity=song&limit=30&country=FR&term='+encodeURIComponent(q),6000).catch(()=>null),
    jsonp('https://api.deezer.com/search?q='+encodeURIComponent(q)+'&limit=30',6000).catch(()=>null),
  ]);
  if(itn) (itn.results||[]).forEach(r=>cands.push({ artist:r.artistName, track:r.trackName,
    art:r.artworkUrl100||'', hd:(r.artworkUrl100||'').replace(/\/\d+x\d+bb/,'/1000x1000bb'), source:'iTunes' }));
  if(dzr) (dzr.data||[]).forEach(r=>cands.push({ artist:r.artist&&r.artist.name, track:r.title,
    art:r.album&&r.album.cover_medium, hd:r.album&&(r.album.cover_xl||r.album.cover_big), source:'Deezer' }));
  const want=norm(q);
  const scored=cands.filter(c=>c.artist&&c.track).map(c=>{
    const n=norm(c.track);
    const tScore = n===want?1 : (n.includes(want)||want.includes(n))?.5 : 0;
    return { ...c, tScore };
  }).filter(c=>c.tScore>0).slice(0,14);
  if(!scored.length) return null;

  let ref=null;
  if(opts.coverDataURL){ log('Comparaison des pochettes…'); try{ ref=await hashOf(opts.coverDataURL,false); }catch(e){} }
  if(ref){
    const hashes=await Promise.all(scored.map(c=>c.art?hashOf(c.art,true).catch(()=>null):Promise.resolve(null)));
    scored.forEach((c,i)=>{ c.dist=hashes[i]?ham(ref,hashes[i]):99; });
  } else scored.forEach(c=>c.dist=99);

  scored.forEach(c=>{ c.score=c.tScore*2+(c.dist<=14?(14-c.dist)/14*4:0); });
  scored.sort((a,b)=>b.score-a.score);
  const best=scored[0];
  const exactTitles=scored.filter(c=>c.tScore===1);
  const sameArtist=exactTitles.length>0&&new Set(exactTitles.map(c=>norm(c.artist))).size===1;
  const artMatch=best.dist<=14;
  const confident = artMatch || (best.tScore===1 && sameArtist);
  const seen=new Set();
  const suggestions=scored.filter(c=>{ const k=norm(c.artist); if(seen.has(k)) return false; seen.add(k); return true; })
    .slice(0,3).map(c=>({ artist:c.artist, track:c.track, hd:c.hd, dist:c.dist, source:c.source }));
  return { artist:best.artist, track:best.track, hd:best.hd, confident, suggestions,
    source:best.source+(artMatch?' · pochette identique':'') };
}
return { resolve };
})();
