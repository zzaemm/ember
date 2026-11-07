'use strict';
/* AgniCal: static client. Reads data/meta.json, data/grid.bin and data/validation.json. */
const Y0 = 2001, NY = 25, YN = Y0 + NY - 1, W = 52, NW = NY * W, VIIRS_Y = 2012, FEW = 3;
const CITIES = [['Thiruvananthapuram',8.52,76.94],['Kochi',9.97,76.28],['Kozhikode',11.25,75.78],['Bengaluru',12.97,77.59],['Chennai',13.08,80.27],['Hyderabad',17.39,78.49],['Mumbai',19.08,72.88],['Nagpur',21.15,79.09],['Bhopal',23.26,77.41],['Kolkata',22.57,88.36],['Bhubaneswar',20.30,85.82],['Delhi',28.61,77.21],['Amritsar',31.63,74.87],['Dehradun',30.32,78.03],['Guwahati',26.14,91.74],['Imphal',24.82,93.94],['Jaipur',26.91,75.79],['Ahmedabad',23.02,72.57]];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const $ = id => document.getElementById(id);
const S = { mode:'h', year:YN, mapWeek:null, zoomed:false, compare:'punjab_haryana', cache:new Map() };
let M, V, C, cellSum, nCells, aoiSet, stats, cmpStats;

/* ---------- helpers ---------- */
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const binDate = b => { const d = new Date(Date.UTC(2001,0,1+7*((b%W+W)%W))); return d.getUTCDate()+' '+MON[d.getUTCMonth()]; };
const binEnd = b => { const bb=(b%W+W)%W; const d = new Date(Date.UTC(2001,0,bb===51?365:7*bb+7)); return d.getUTCDate()+' '+MON[d.getUTCMonth()]; };
const fmt = x => x>=1e6 ? (x/1e6).toFixed(1)+' M' : x>=1e4 ? Math.round(x/1e3)+' k' : x>=100 ? Math.round(x).toLocaleString('en-IN') : x>=10 ? x.toFixed(0) : x>0 ? x.toFixed(1) : '0';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const quant = (a,q) => { if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y), i=(s.length-1)*q, l=Math.floor(i), h=Math.ceil(i); return s[l]+(s[h]-s[l])*(i-l); };
const median = a => quant(a,.5);
const areaOf = cells => { let t=0; for(const c of cells) t += Math.pow(111.2*M.grid.res,2)*Math.cos(C.lat[c]*Math.PI/180); return t; };
function svg(tag, attrs, parent){ const e=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const k in attrs) e.setAttribute(k,attrs[k]); if(parent) parent.appendChild(e); return e; }
const tip = $('tip');
function showTip(ev, html){ tip.innerHTML=html; tip.style.display='block'; const r=tip.getBoundingClientRect(); let x=ev.clientX+14, y=ev.clientY+14; if(x+r.width>innerWidth-8) x=ev.clientX-r.width-12; if(y+r.height>innerHeight-8) y=ev.clientY-r.height-12; tip.style.left=Math.max(4,x)+'px'; tip.style.top=Math.max(4,y)+'px'; }
const hideTip = () => { tip.style.display='none'; };
function criticalWindow(p, share){ let tot=0; for(const x of p) tot+=x; if(tot<=0) return null; for(let len=1; len<=W; len++){ let best=-1,bi=0,s=0; for(let j=0;j<len;j++) s+=p[j]; for(let i=0;i<W;i++){ if(s>best){best=s;bi=i;} s+=p[(i+len)%W]-p[i]; } if(best>=share*tot-1e-9) return {start:bi,len,share:best/tot}; } return {start:0,len:W,share:1}; }

/* ---------- data ---------- */
async function load(){
  const [m,v,buf] = await Promise.all([fetch('data/meta.json').then(r=>{if(!r.ok)throw 0;return r.json();}), fetch('data/validation.json').then(r=>r.json()), fetch('data/grid.txt').then(r=>r.text()).then(async t=>{ const s=atob(t.trim()), u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); })]);
  M=m; V=v; const n=m.nRows; C={lat:m.cells.lat,lon:m.cells.lon,off:m.cells.offset}; nCells=C.lat.length;
  const col = i => new Uint16Array(buf, 4*n + i*2*n, n);
  S.col = {frp:new Uint32Array(buf, 0, n), week:col(0), m:col(1), v:col(2), p:col(3), h:col(4)};
  cellSum=new Float32Array(nCells);
  for(let c=0;c<nCells;c++){ let t=0; for(let r=C.off[c];r<C.off[c+1];r++) t+=S.col.h[r]; cellSum[c]=t/10; }
}
function aggregate(cells){
  const o={m:new Float64Array(NW),v:new Float64Array(NW),p:new Float64Array(NW),h:new Float64Array(NW),frp:new Float64Array(NW)}, c=S.col;
  for(const id of cells) for(let r=C.off[id], e=C.off[id+1]; r<e; r++){ const w=c.week[r]; o.m[w]+=c.m[r]; o.v[w]+=c.v[r]; o.p[w]+=c.p[r]/10; o.h[w]+=c.h[r]/10; o.frp[w]+=c.frp[r]; }
  return o;
}
function compute(cells,name){
  const a=aggregate(cells), clim=new Float64Array(W);
  for(let i=0;i<NW;i++) clim[i%W]+=a.h[i]/NY;
  const season=criticalWindow(clim,.8), core=criticalWindow(clim,.5);
  let peak=0; for(let b=1;b<W;b++) if(clim[b]>clim[peak]) peak=b;
  const area=areaOf(cells);
  const annual=[]; for(let y=0;y<NY;y++){ let m=0,v=0,h=0; for(let b=0;b<W;b++){ const i=y*W+b; m+=a.m[i]; v+=a.v[i]; h+=a.h[i]; } annual.push({y:Y0+y,m,v,h}); }
  return {name,cells,...a,clim,season,core,peak,area,annual,total:annual.reduce((s,r)=>s+r.h,0)};
}
/* Compare a week with the same part of the year in all other years. */
function pool(st,y,b){ const out=[]; for(let yy=0;yy<NY;yy++){ if(yy===y-Y0) continue; for(const d of [-1,0,1]){ const bb=(b+d+W)%W, src=M.source[yy*W+bb]; if(src!==4) out.push(st.h[yy*W+bb]); } } return out; }
function classify(st,y,b){
  const val=st.h[(y-Y0)*W+b], p=pool(st,y,b), p10=quant(p,.1), p50=quant(p,.5), p90=quant(p,.9), mx=Math.max(0,...p);
  if(val<FEW && p90<FEW) return {cls:'few',val,p10,p50,p90,label:'Too few to say'};
  // Before VIIRS, a corrected value resting on one or two real MODIS detections cannot support a judgement.
  if(y<VIIRS_Y && val>0 && st.m[(y-Y0)*W+b]<FEW) return {cls:'few',val,p10,p50,p90,label:'Too few MODIS detections to say'};
  if(val>mx && val>=FEW) return {cls:'record',val,p10,p50,p90,label:'Highest on record for this time of year'};
  if(val>p90 && val>=FEW) return {cls:'unusual',val,p10,p50,p90,label:'Unusual: above what 9 of 10 other years showed'};
  if(val>quant(p,.75)) return {cls:'above',val,p10,p50,p90,label:'Above normal'};
  if(val<p10 && p50>=FEW) return {cls:'below',val,p10,p50,p90,label:'Below normal'};
  return {cls:'normal',val,p10,p50,p90,label:'Within the normal range'};
}
function seasonYears(st){
  if(!st.season) return {rows:[]};
  // Measure only the main season plus 4 weeks each side, so a separate second season cannot move the start.
  const {start,len}=st.season, a=(start-4+W)%W, span=Math.min(W,len+8), rows=[];
  const measure=(ser,begin)=>{ let tot=0; for(let i=0;i<span;i++) tot+=ser[begin+i]; if(tot<30) return null; let c=0,on=null,end=null,pk=0,pv=-1; for(let i=0;i<span;i++){ const x=ser[begin+i]; c+=x; if(on===null&&c>=.1*tot) on=i; if(end===null&&c>=.9*tot) end=i; if(x>pv){pv=x;pk=i;} } return {on,end,pk,tot}; };
  for(let Y=Y0;Y<=YN;Y++){
    const begin=(Y-Y0)*W+a;
    if(begin+span>NW) continue;
    const r=measure(st.h,begin); if(!r) continue;
    const m=measure(st.m,begin);
    rows.push({Y,...r,onM:m?m.on:null});
  }
  return {a,span,rows};
}
function shiftVerdict(rows){
  const none={text:'Too few detections to judge a shift in timing.',short:'Too few to judge'};
  if(rows.length<12) return none;
  const pick=(k,lo,hi)=>rows.filter(r=>r.Y>=lo&&r.Y<=hi&&r[k]!==null).map(r=>r[k]);
  const e=pick('on',2003,2011), l=pick('on',2017,2025), em=pick('onM',2003,2011), lm=pick('onM',2017,2025);
  if(e.length<5||l.length<5) return none;
  const d=median(l)-median(e), dm=em.length>=5&&lm.length>=5?median(lm)-median(em):null;
  const dir=d<0?'earlier':'later', abs=Math.abs(d), sgn=x=>(x>0?'+':'')+x.toFixed(1);
  const agree=dm!==null&&Math.abs(dm)>=2&&Math.sign(dm)===Math.sign(d);
  if(abs>=2&&agree) return {d,dm,short:'Possibly '+abs.toFixed(0)+' weeks '+dir,text:`Possible shift: the season’s start (10% of detections reached) is about ${abs.toFixed(0)} weeks ${dir} in 2017–2025 than in 2003–2011. MODIS alone agrees (${sgn(dm)} weeks). Check this against local knowledge, because later burning in the day or smoke can also move it.`};
  if(abs>=2) return {d,dm,short:'Not confirmed',text:`The joined record suggests a ${abs.toFixed(0)}-week move ${dir}, but MODIS alone does not confirm it (${dm===null?'too few detections':sgn(dm)+' weeks'}), so we do not call this a shift.`};
  return {d,dm,short:'No clear shift',text:`The season’s start moved less than 2 weeks between 2003–2011 and 2017–2025 (${sgn(d)} weeks; MODIS alone ${dm===null?'n/a':sgn(dm)}), so we do not call this a shift.`};
}
const series = (st,mode) => { if(mode==='frp') return st.frp; if(mode==='raw'){ const o=new Float64Array(NW); for(let i=0;i<NW;i++) o[i]= i<(VIIRS_Y-Y0)*W ? st.m[i] : st.v[i]; return o; } return st.h; };

/* ---------- AOI ---------- */
function setAOI(cells,name,id){
  S.cells=cells; S.name=name; S.id=id||null; aoiSet=new Set(cells);
  stats = id && S.cache.has(id) ? S.cache.get(id) : compute(cells,name);
  if(id) S.cache.set(id,stats);
  if(id){ try{ history.replaceState(null,'','#'+id); }catch(e){} }
  renderAll();
}
function regionStats(id){ if(S.cache.has(id)) return S.cache.get(id); const r=M.regions.find(x=>x.id===id); const st=compute(r.cells,r.name); S.cache.set(id,st); return st; }

/* ---------- map ---------- */
const VB0={latMin:6,latMax:38,lonMin:67,lonMax:98.5};
function viewBounds(){ if(!S.zoomed||!S.cells||!S.cells.length) return VB0; let a=90,b=-90,c=180,d=-180; for(const i of S.cells){a=Math.min(a,C.lat[i]);b=Math.max(b,C.lat[i]);c=Math.min(c,C.lon[i]);d=Math.max(d,C.lon[i]);} const pad=Math.max(.6,(b-a)*.25,(d-c)*.25); return {latMin:a-pad,latMax:b+pad,lonMin:c-pad,lonMax:d+pad}; }
function mapProj(cv){ const b=viewBounds(), w=cv.clientWidth, h=cv.clientHeight, cx=Math.cos((b.latMin+b.latMax)/2*Math.PI/180), sx=w/((b.lonMax-b.lonMin)*cx), sy=h/(b.latMax-b.latMin), s=Math.min(sx,sy), ox=(w-(b.lonMax-b.lonMin)*cx*s)/2, oy=(h-(b.latMax-b.latMin)*s)/2;
  return {x:lon=>ox+(lon-b.lonMin)*cx*s, y:lat=>oy+(b.latMax-lat)*s, ilon:x=>(x-ox)/(cx*s)+b.lonMin, ilat:y=>b.latMax-(y-oy)/s, cw:M.grid.res*cx*s, ch:M.grid.res*s, b}; }
function mapValues(){ if(S.mapWeek===null) return cellSum; const o=new Float32Array(nCells), c=S.col; for(let id=0;id<nCells;id++) for(let r=C.off[id];r<C.off[id+1];r++) if(c.week[r]===S.mapWeek){ o[id]=c.h[r]/10; break; } return o; }
function ramp(){ return [css('--s1'),css('--s2'),css('--s3'),css('--s4'),css('--s5'),css('--s6')]; }
function drawMap(){
  const cv=$('map'), dpr=devicePixelRatio||1, w=cv.clientWidth, h=cv.clientHeight; cv.width=w*dpr; cv.height=h*dpr;
  const g=cv.getContext('2d'); g.scale(dpr,dpr); g.fillStyle=css('--empty'); g.fillRect(0,0,w,h);
  const P=mapProj(cv), vals=mapValues(), rp=ramp(); let mx=0; for(const x of vals) if(x>mx) mx=x;
  // graticule
  g.strokeStyle=css('--line'); g.lineWidth=1; g.fillStyle=css('--ink3'); g.font='11px '+css('--mono');
  const step=(P.b.latMax-P.b.latMin)>12?5:1;
  for(let la=Math.ceil(P.b.latMin/step)*step; la<=P.b.latMax; la+=step){ const y=P.y(la); g.beginPath(); g.moveTo(0,y); g.lineTo(w,y); g.stroke(); g.fillText(la+'°N',3,y-3); }
  for(let lo=Math.ceil(P.b.lonMin/step)*step; lo<=P.b.lonMax; lo+=step){ const x=P.x(lo); g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke(); g.fillText(lo+'°E',x+3,h-4); }
  const lmx=Math.log1p(mx||1);
  for(let i=0;i<nCells;i++){ const v=vals[i]; if(v<=0) continue; const t=Math.log1p(v)/lmx, k=Math.min(5,Math.floor(t*6)); g.fillStyle=rp[k]; g.fillRect(P.x(C.lon[i]-M.grid.res/2),P.y(C.lat[i]+M.grid.res/2),P.cw+.5,P.ch+.5); }
  // AOI outline along cell edges
  if(S.cells&&S.cells.length<nCells){ const key=(a,o)=>Math.round((a-M.grid.lat0)/M.grid.res-.5)*10000+Math.round((o-M.grid.lon0)/M.grid.res-.5), set=new Set(S.cells.map(i=>key(C.lat[i],C.lon[i]))); g.strokeStyle=css('--ink'); g.lineWidth=2; g.beginPath();
    for(const i of S.cells){ const la=C.lat[i],lo=C.lon[i],r=M.grid.res,x0=P.x(lo-r/2),x1=P.x(lo+r/2),y0=P.y(la+r/2),y1=P.y(la-r/2); if(!set.has(key(la+r,lo))){g.moveTo(x0,y0);g.lineTo(x1,y0);} if(!set.has(key(la-r,lo))){g.moveTo(x0,y1);g.lineTo(x1,y1);} if(!set.has(key(la,lo-r))){g.moveTo(x0,y0);g.lineTo(x0,y1);} if(!set.has(key(la,lo+r))){g.moveTo(x1,y0);g.lineTo(x1,y1);} } g.stroke(); }
  // labels
  g.font='600 12px '+css('--body');
  for(const [n,la,lo] of CITIES){ if(w<520&&!S.zoomed&&(n==='Bhopal'||n==='Bengaluru'||n==='Kozhikode')) continue; if(la<P.b.latMin||la>P.b.latMax||lo<P.b.lonMin||lo>P.b.lonMax) continue; const x=P.x(lo),y=P.y(la); g.fillStyle=css('--panel'); g.lineWidth=3; g.strokeStyle=css('--panel'); g.strokeText(n,x+5,y+4); g.fillStyle=css('--ink'); g.fillText(n,x+5,y+4); g.beginPath(); g.arc(x,y,2.5,0,6.3); g.fill(); }
  if(S.drag){ g.strokeStyle=css('--ink'); g.setLineDash([5,3]); g.lineWidth=1.5; g.strokeRect(S.drag.x0,S.drag.y0,S.drag.x1-S.drag.x0,S.drag.y1-S.drag.y0); g.setLineDash([]); }
  const yr=S.mapWeek===null?null:Y0+Math.floor(S.mapWeek/W), b=S.mapWeek===null?null:S.mapWeek%W;
  $('mapcap').innerHTML = S.mapWeek===null ? 'Colour shows total corrected detections per grid cell, 2001–2025, on a log scale.' : `Showing detections for <b>${binDate(b)}–${binEnd(b)} ${yr}</b>. <button id="mapall" type="button">Show all years</button>`;
  const ma=$('mapall'); if(ma) ma.onclick=()=>{S.mapWeek=null;drawMap();};
}
function initMap(){
  const cv=$('map'), pos=e=>{const r=cv.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
  cv.addEventListener('pointerdown',e=>{ const [x,y]=pos(e); S.drag={x0:x,y0:y,x1:x,y1:y}; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove',e=>{ const [x,y]=pos(e); if(S.drag){S.drag.x1=x;S.drag.y1=y;drawMap();return;} const P=mapProj(cv), id=nearest(P.ilat(y),P.ilon(x)); if(id>=0){ const v=mapValues()[id]; showTip(e,`<b>${C.lat[id].toFixed(2)}°N, ${C.lon[id].toFixed(2)}°E</b>${fmt(v)} corrected detections`);} else hideTip(); });
  cv.addEventListener('pointerleave',hideTip);
  cv.addEventListener('pointerup',e=>{ if(!S.drag) return; const d=S.drag; S.drag=null; const P=mapProj(cv), tiny=Math.abs(d.x1-d.x0)<4&&Math.abs(d.y1-d.y0)<4; let cells=[],name;
    if(tiny){ const id=nearest(P.ilat(d.y0),P.ilon(d.x0)); if(id<0){drawMap();return;} cells=[id]; name=`Grid cell ${C.lat[id].toFixed(2)}°N, ${C.lon[id].toFixed(2)}°E`; }
    else { const la0=Math.min(P.ilat(d.y0),P.ilat(d.y1)),la1=Math.max(P.ilat(d.y0),P.ilat(d.y1)),lo0=Math.min(P.ilon(d.x0),P.ilon(d.x1)),lo1=Math.max(P.ilon(d.x0),P.ilon(d.x1)); for(let i=0;i<nCells;i++) if(C.lat[i]>=la0&&C.lat[i]<=la1&&C.lon[i]>=lo0&&C.lon[i]<=lo1) cells.push(i); if(!cells.length){drawMap();return;} name=`Custom area ${la0.toFixed(1)}–${la1.toFixed(1)}°N, ${lo0.toFixed(1)}–${lo1.toFixed(1)}°E`; }
    $('region').value=''; setAOI(cells,name,null); });
}
function nearest(lat,lon){ let best=-1,bd=M.grid.res*.75; for(let i=0;i<nCells;i++){ const d=Math.max(Math.abs(C.lat[i]-lat),Math.abs(C.lon[i]-lon)); if(d<bd){bd=d;best=i;} } return best; }

/* ---------- calendar ---------- */
const CAL={l:92,t:50,rh:17};
function colorFor(v,mx){ if(v<=0) return css('--empty'); const t=Math.log1p(v)/Math.log1p(mx); return ramp()[Math.min(5,Math.floor(t*6))]; }
function drawCal(){
  const cv=$('cal'), dpr=devicePixelRatio||1, w=cv.clientWidth, rows=NY, H=CAL.t+rows*CAL.rh+8; cv.style.height=H+'px'; cv.width=w*dpr; cv.height=H*dpr;
  const g=cv.getContext('2d'); g.scale(dpr,dpr); g.clearRect(0,0,w,H);
  const cw=(w-CAL.l)/W, mode=S.mode, ser=mode==='anom'?stats.h:series(stats,mode); let mx=1; for(const x of ser) if(x>mx) mx=x; S.calMax=mx;
  const few=css('--few'), empty=css('--empty'), map={few:css('--few'),below:css('--below'),normal:css('--normal'),above:css('--above'),unusual:css('--unusual'),record:css('--record')};
  for(let y=0;y<rows;y++){
    const yr=Y0+y, top=CAL.t+y*CAL.rh;
    for(let b=0;b<W;b++){
      const i=y*W+b, x=CAL.l+b*cw, src=M.source[i]; let color;
      if(src===4||(mode==='raw'&&yr<VIIRS_Y&&false)){ color=null; }
      else if(mode==='anom'){ const c=classify(stats,yr,b); color=c.val<=0&&c.cls!=='below'?empty:map[c.cls]; }
      else { const v=ser[i]; color= v<=0?empty:(mode!=='frp'&&v<FEW?few:colorFor(v,mx)); }
      if(color===null){ g.fillStyle=empty; g.fillRect(x,top,cw-1,CAL.rh-1); g.strokeStyle=css('--ink3'); g.lineWidth=1; g.beginPath(); g.moveTo(x,top+CAL.rh-1); g.lineTo(x+cw-1,top); g.stroke(); }
      else { g.fillStyle=color; g.fillRect(x,top,cw-1,CAL.rh-1); }
      if(mode==='anom'){ const c=classify(stats,yr,b); if(c.cls==='record'||c.cls==='unusual'){ g.fillStyle=c.cls==='record'?css('--panel'):css('--ink'); if(cw>6){ g.beginPath(); g.arc(x+cw/2-.5,top+CAL.rh/2-.5,1.7,0,6.3); g.fill(); } } }
    }
    g.fillStyle=yr===S.year?css('--accent'):css('--ink2'); g.font=(yr===S.year?'600 ':'')+'12px '+css('--mono'); g.textAlign='right'; g.fillText(yr,CAL.l-6,top+CAL.rh-5); g.textAlign='left';
    if(yr===S.year){ g.strokeStyle=css('--accent'); g.lineWidth=2; g.strokeRect(CAL.l-1,top-1,W*cw+1,CAL.rh+1); }
  }
  // month ticks
  g.fillStyle=css('--ink2'); g.font='12px '+css('--mono');
  for(let m=0;m<12;m++){ const doy=Date.UTC(2001,m,1)-Date.UTC(2001,0,1), b=doy/864e5/7, x=CAL.l+b*cw; g.fillText(MON[m],x+2,CAL.t-5); g.strokeStyle=css('--line'); g.lineWidth=1; g.beginPath(); g.moveTo(x,CAL.t-16); g.lineTo(x,CAL.t-1); g.stroke(); }
  // critical and season brackets (circular)
  const span=(win,yy,color,lw,label)=>{ if(!win) return; const a=win.start, n=win.len; const seg=(s,e)=>{ g.strokeStyle=color; g.lineWidth=lw; g.beginPath(); g.moveTo(CAL.l+s*cw,yy); g.lineTo(CAL.l+e*cw-1,yy); g.stroke(); }; if(a+n<=W) seg(a,a+n); else { seg(a,W); seg(0,a+n-W); } if(label){ g.fillStyle=css('--ink'); g.font='600 12px '+css('--body'); const lx=Math.min(CAL.l+a*cw, w-g.measureText(label).width-4); g.fillText(label,lx,yy-4); } };
  span(stats.season,CAL.t-19,css('--ink3'),3,null);
  span(stats.core,CAL.t-19,css('--accent'),5,'Critical period');
  // seam
  const sy=CAL.t+(VIIRS_Y-Y0)*CAL.rh-.5; g.strokeStyle=css('--ink'); g.lineWidth=1.5; g.setLineDash([4,3]); g.beginPath(); g.moveTo(44,sy); g.lineTo(w,sy); g.stroke(); g.setLineDash([]);
  g.save(); g.fillStyle=css('--ink2'); g.font='11px '+css('--mono'); g.translate(14,CAL.t+(VIIRS_Y-Y0)*CAL.rh/2); g.rotate(-Math.PI/2); g.textAlign='center'; g.fillText(mode==='raw'?'MODIS raw':'MODIS, corrected',0,0); g.restore();
  g.save(); g.fillStyle=css('--ink2'); g.font='11px '+css('--mono'); g.translate(14,CAL.t+(VIIRS_Y-Y0)*CAL.rh+(YN-VIIRS_Y+1)*CAL.rh/2); g.rotate(-Math.PI/2); g.textAlign='center'; g.fillText('VIIRS',0,0); g.restore();
  // legend
  const leg=$('callegend');
  if(mode==='anom') leg.innerHTML=[['--below','Below normal'],['--normal','Normal range'],['--above','Above normal'],['--unusual','Unusual, with dot'],['--record','Record, with dot'],['--few','Too few to say']].map(([c,t])=>`<span><span class="sw" style="background:var(${c})"></span>${t}</span>`).join('')+noDataLeg();
  else { const steps=[0,1,2,3,4,5].map(i=>Math.expm1(Math.log1p(mx)*(i+1)/6)); leg.innerHTML=(mode==='frp'?'<span>MW per week</span>':`<span>Detections per week</span>`)+steps.map((v,i)=>`<span><span class="sw" style="background:var(--s${i+1})"></span>≤ ${fmt(v)}</span>`).join('')+(mode==='frp'?'':`<span><span class="sw" style="background:var(--few)"></span>Under ${FEW}</span>`)+noDataLeg(); }
  leg.innerHTML+=`<span><span class="ln" style="border-color:var(--accent);border-top-width:5px"></span>Critical period</span><span><span class="ln" style="border-color:var(--ink3);border-top-width:3px"></span>Fire season</span>`;
  $('calsub').textContent = {h:'Each row is a year, each column a week. All years are on one VIIRS-equivalent scale.',raw:'Before harmonizing: raw MODIS to 2011, raw VIIRS after. The jump at the dashed line comes mostly from the sensor change.',anom:'Each week compared with the same part of the year in all other years.',frp:'Fire radiative power, also corrected to a VIIRS-equivalent scale.'}[mode];
}
const noDataLeg = () => `<span><span class="sw" style="background:linear-gradient(135deg,var(--empty) 45%,var(--ink3) 45%,var(--ink3) 55%,var(--empty) 55%)"></span>No satellite data</span>`;
function initCal(){
  const cv=$('cal'), hit=e=>{ const r=cv.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top, cw=(cv.clientWidth-CAL.l)/W, b=Math.floor((x-CAL.l)/cw), yi=Math.floor((y-CAL.t)/CAL.rh); return (b<0||b>=W||yi<0||yi>=NY)?null:{b,yi}; };
  cv.addEventListener('pointermove',e=>{ const h=hit(e); if(!h){hideTip();return;} const i=h.yi*W+h.b, yr=Y0+h.yi, src=M.source[i], c=classify(stats,yr,h.b), raw=h.yi<(VIIRS_Y-Y0)*1 ? `MODIS raw ${fmt(stats.m[i])}` : `VIIRS raw ${fmt(stats.v[i])}, MODIS raw ${fmt(stats.m[i])}`;
    const sname=['VIIRS','MODIS Terra and Aqua, corrected','One MODIS platform, corrected','Partial coverage','No satellite data'][src];
    showTip(e, src===4?`<b>${binDate(h.b)}–${binEnd(h.b)} ${yr}</b>No satellite data this week. This is a gap, not a zero.`:`<b>${binDate(h.b)}–${binEnd(h.b)} ${yr}</b>${fmt(stats.h[i])} VIIRS-equivalent detections (${fmt(stats.h[i]/stats.area*1000)} per 1,000 km²)<br>${raw}<br>FRP ${fmt(stats.frp[i])} MW<br>Normal for this time: ${fmt(c.p10)}–${fmt(c.p90)}<br>${c.label}<br>Source: ${sname}`); });
  cv.addEventListener('pointerleave',hideTip);
  cv.addEventListener('click',e=>{ const h=hit(e); if(!h) return; S.year=Y0+h.yi; S.mapWeek=h.yi*W+h.b; $('year').value=S.year; renderAll(); });
}

/* ---------- facts ---------- */
function renderFacts(){
  const st=stats, now=new Date(), doy=Math.floor((Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-Date.UTC(now.getUTCFullYear(),0,1))/864e5), b=Math.min(51,Math.floor(doy/7));
  let next=0, tot=0; for(let i=0;i<W;i++) tot+=st.clim[i]; for(let i=0;i<4;i++) next+=st.clim[(b+i)%W];
  const inCore=st.core&&(((b-st.core.start+W)%W)<st.core.len);
  const until=st.core?(st.core.start-b+W)%W:null;
  const sum=st.annual[S.year-Y0], unusual=[]; for(let w=0;w<W;w++){ const c=classify(st,S.year,w); if(c.cls==='unusual'||c.cls==='record') unusual.push(w); }
  const fact=(k,v,n)=>`<div class="fact"><div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div></div>`;
  const yrs=seasonYears(st), sv=shiftVerdict(yrs.rows); S.shift=sv; S.readyB=b; S.next4=tot?next/tot*100:0;
  $('facts').innerHTML= !st.core||st.total<30 ? fact('This area','Too few detections',`${fmt(st.total)} in 25 years. Choose a larger area.`)+fact('Critical period','Too few to say','')+fact('Next 4 weeks','Too few to say','')+fact('Season shift','Too few to say','') :
    fact('Critical period',`${binDate(st.core.start)} – ${binEnd(st.core.start+st.core.len-1)}`,`The shortest run of weeks holding half of detections (${st.core.len} weeks). Be ready before it starts.`)+
    fact('Fire season',`${binDate(st.season.start)} – ${binEnd(st.season.start+st.season.len-1)}`,`Holds 80% of detections. Busiest week starts ${binDate(st.peak)}.`)+
    fact('Next 4 weeks',`${tot&&next/tot<.01?'Under 1%':(tot?next/tot*100:0).toFixed(0)+'%'} of a typical year`,inCore?'Today falls inside the critical period.':`Critical period starts in about ${until} weeks. Based on past years, not a forecast.`)+
    fact(`${S.year} in this area`,`${unusual.length} unusual ${unusual.length===1?'week':'weeks'}`,`${fmt(sum.h)} detections, ${fmt(sum.h/st.area*1000)} per 1,000 km². Season start: ${sv.short.toLowerCase()}.`);
  S.unusualWeeks=unusual;
}

/* ---------- charts ---------- */
function linePath(pts){ return 'M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L'); }
function axisY(root,mx,x0,x1,h,t,fmtv){ for(const f of [0,.5,1]){ const v=mx*f, y=t+(h-t)*(1-f); svg('line',{x1:x0,x2:x1,y1:y,y2:y,stroke:'var(--line)','stroke-width':1},root); const tx=svg('text',{x:x0-6,y:y+4,'text-anchor':'end'},root); tx.textContent=fmtv(v); } }
function monthAxis(root,x,yb){ for(let m=0;m<12;m+=2){ const b=(Date.UTC(2001,m,1)-Date.UTC(2001,0,1))/864e5/7; const t=svg('text',{x:x(b),y:yb,'text-anchor':'start'},root); t.textContent=MON[m]; } }
function chartYear(){
  const box=$('yrchart'); box.innerHTML=''; const Wd=640,H=230,L=52,R=10,T=10,B=26, root=svg('svg',{viewBox:`0 0 ${Wd} ${H}`,role:'img','aria-label':`Weekly detections in ${S.year} compared with the normal range`},box);
  $('yrh').textContent=`${S.year} against the normal range`;
  const cl=[]; let mx=FEW; for(let b=0;b<W;b++){ const c=classify(stats,S.year,b); cl.push(c); mx=Math.max(mx,c.val,c.p90); }
  const x=b=>L+b/(W-1)*(Wd-L-R), y=v=>T+(H-T-B)*(1-v/mx);
  axisY(root,mx,L,Wd-R,H-B,T,fmt); monthAxis(root,x,H-8);
  svg('path',{d:linePath(cl.map((c,b)=>[x(b),y(c.p90)]))+'L'+cl.map((c,b)=>[x(W-1-b),y(cl[W-1-b].p10)].map(n=>n.toFixed(1)).join(',')).join('L')+'Z',fill:'var(--band)',stroke:'none'},root);
  svg('path',{d:linePath(cl.map((c,b)=>[x(b),y(c.p50)])),fill:'none',stroke:'var(--ink3)','stroke-width':1.5,'stroke-dasharray':'4 3'},root);
  svg('path',{d:linePath(cl.map((c,b)=>[x(b),y(c.val)])),fill:'none',stroke:'var(--a)','stroke-width':2},root);
  cl.forEach((c,b)=>{ if(c.cls==='unusual'||c.cls==='record') svg('circle',{cx:x(b),cy:y(c.val),r:4.5,fill:'var(--a)',stroke:'var(--panel)','stroke-width':2},root); });
  cl.forEach((c,b)=>{ const r=svg('rect',{x:x(b)-6,y:T,width:12,height:H-T-B,fill:'transparent'},root); r.addEventListener('pointermove',e=>showTip(e,`<b>${binDate(b)}–${binEnd(b)} ${S.year}</b>${fmt(c.val)} detections<br>Normal: ${fmt(c.p10)}–${fmt(c.p90)}, median ${fmt(c.p50)}<br>${c.label}`)); r.addEventListener('pointerleave',hideTip); });
  $('yrleg').innerHTML=`<span><span class="ln" style="border-color:var(--a)"></span>${S.year}</span><span><span class="ln" style="border-color:var(--ink3);border-top-style:dashed"></span>Median of other years</span><span><span class="sw" style="background:var(--band)"></span>Normal range</span><span><span class="sw" style="background:var(--a);border-radius:50%"></span>Unusual week</span>`;
}
function chartShift(){
  const box=$('shiftchart'); box.innerHTML=''; const ys=seasonYears(stats), rows=ys.rows; $('shiftsub').textContent=S.shift?S.shift.text:'';
  if(rows.length<5){ box.innerHTML='<p class="sub">Too few detections in this area.</p>'; $('shiftleg').innerHTML=''; return; }
  const Wd=640,H=230,L=58,R=10,T=10,B=24, root=svg('svg',{viewBox:`0 0 ${Wd} ${H}`,role:'img','aria-label':'Season start, peak and end for each year'},box);
  const lo=Math.max(0,Math.min(...rows.map(r=>r.on))-1), hi=Math.min(ys.span-1,Math.max(...rows.map(r=>r.end))+1), x=Y=>L+(Y-Y0)/(YN-Y0)*(Wd-L-R-8)+4, y=o=>T+(H-T-B)*(1-(o-lo)/Math.max(1,hi-lo));
  for(let k=0;k<4;k++){ const o=Math.round(lo+(hi-lo)*k/3), yy=y(o); svg('line',{x1:L,x2:Wd-R,y1:yy,y2:yy,stroke:'var(--line)'},root); const t=svg('text',{x:L-6,y:yy+4,'text-anchor':'end'},root); t.textContent=binDate(ys.a+o); }
  for(let Y=2005;Y<=YN;Y+=5){ const t=svg('text',{x:x(Y),y:H-6,'text-anchor':'middle'},root); t.textContent=Y; }
  const sx=x(VIIRS_Y-.5); svg('line',{x1:sx,x2:sx,y1:T,y2:H-B,stroke:'var(--ink3)','stroke-dasharray':'4 3'},root);
  const mOn=median(rows.map(r=>r.on)); svg('line',{x1:L,x2:Wd-R,y1:y(mOn),y2:y(mOn),stroke:'var(--b)','stroke-width':1.5,'stroke-dasharray':'2 3'},root);
  rows.forEach(r=>{ const cx=x(r.Y); svg('line',{x1:cx,x2:cx,y1:y(r.on),y2:y(r.end),stroke:'var(--band)','stroke-width':8,'stroke-linecap':'round'},root); svg('circle',{cx,cy:y(r.on),r:4,fill:'var(--b)',stroke:'var(--panel)','stroke-width':1.5},root); svg('circle',{cx,cy:y(r.pk),r:4,fill:'var(--a)',stroke:'var(--panel)','stroke-width':1.5},root); const h=svg('rect',{x:cx-9,y:T,width:18,height:H-T-B,fill:'transparent'},root); h.addEventListener('pointermove',e=>showTip(e,`<b>Season of ${r.Y}</b>Start ${binDate(ys.a+r.on)}<br>Peak ${binDate(ys.a+r.pk)}<br>End ${binDate(ys.a+r.end)}<br>${fmt(r.tot)} detections`)); h.addEventListener('pointerleave',hideTip); });
  $('shiftleg').innerHTML=`<span><span class="sw" style="background:var(--b);border-radius:50%"></span>Start (10% reached)</span><span><span class="sw" style="background:var(--a);border-radius:50%"></span>Busiest week</span><span><span class="sw" style="background:var(--band)"></span>10% to 90% of detections</span><span><span class="ln" style="border-color:var(--b);border-top-style:dotted"></span>Median start</span><span><span class="ln" style="border-color:var(--ink3);border-top-style:dashed"></span>VIIRS begins</span>`;
}
function chartCompare(){
  const box=$('cmpchart'); box.innerHTML=''; cmpStats=regionStats(S.compare); const Wd=640,H=220,L=44,R=10,T=10,B=26, root=svg('svg',{viewBox:`0 0 ${Wd} ${H}`,role:'img','aria-label':'Seasonal share of detections in two areas'},box);
  const sh=st=>{ const t=st.clim.reduce((a,b)=>a+b,0)||1; return [...st.clim].map(v=>v/t*100); }; const a=sh(stats), b=sh(cmpStats), mx=Math.max(1,...a,...b), x=i=>L+i/(W-1)*(Wd-L-R), y=v=>T+(H-T-B)*(1-v/mx);
  axisY(root,mx,L,Wd-R,H-B,T,v=>v.toFixed(0)+'%'); monthAxis(root,x,H-8);
  svg('path',{d:linePath(a.map((v,i)=>[x(i),y(v)])),fill:'none',stroke:'var(--a)','stroke-width':2},root);
  svg('path',{d:linePath(b.map((v,i)=>[x(i),y(v)])),fill:'none',stroke:'var(--b)','stroke-width':2,'stroke-dasharray':'7 3'},root);
  a.forEach((v,i)=>{ const r=svg('rect',{x:x(i)-6,y:T,width:12,height:H-T-B,fill:'transparent'},root); r.addEventListener('pointermove',e=>showTip(e,`<b>Week of ${binDate(i)}</b>${esc(stats.name)}: ${v.toFixed(1)}% of a typical year<br>${esc(cmpStats.name)}: ${b[i].toFixed(1)}%`)); r.addEventListener('pointerleave',hideTip); });
  $('cmpleg').innerHTML=`<span><span class="ln" style="border-color:var(--a)"></span>${esc(stats.name)}</span><span><span class="ln" style="border-color:var(--b);border-top-style:dashed"></span>${esc(cmpStats.name)}</span>`;
}
function chartSeam(){
  const box=$('seamchart'); box.innerHTML=''; const Wd=640,H=220,L=52,R=10,T=10,B=24, root=svg('svg',{viewBox:`0 0 ${Wd} ${H}`,role:'img','aria-label':'Yearly raw MODIS, raw VIIRS and harmonized detections'},box), an=stats.annual; let mx=1; an.forEach(r=>mx=Math.max(mx,r.m,r.v,r.h));
  const x=Y=>L+(Y-Y0)/(YN-Y0)*(Wd-L-R), y=v=>T+(H-T-B)*(1-v/mx); axisY(root,mx,L,Wd-R,H-B,T,fmt);
  for(let Y=2005;Y<=YN;Y+=5){ const t=svg('text',{x:x(Y),y:H-6,'text-anchor':'middle'},root); t.textContent=Y; }
  svg('path',{d:linePath(an.map(r=>[x(r.y),y(r.h)])),fill:'none',stroke:'var(--a)','stroke-width':3},root);
  svg('path',{d:linePath(an.map(r=>[x(r.y),y(r.m)])),fill:'none',stroke:'var(--b)','stroke-width':2,'stroke-dasharray':'7 3'},root);
  const vs=an.filter(r=>r.y>=VIIRS_Y); svg('path',{d:linePath(vs.map(r=>[x(r.y),y(r.v)])),fill:'none',stroke:'var(--c)','stroke-width':1.5,'stroke-dasharray':'2 3'},root);
  an.forEach(r=>{ const h=svg('rect',{x:x(r.y)-11,y:T,width:22,height:H-T-B,fill:'transparent'},root); h.addEventListener('pointermove',e=>showTip(e,`<b>${r.y}</b>Harmonized ${fmt(r.h)}<br>MODIS raw ${fmt(r.m)}<br>${r.y>=VIIRS_Y?'VIIRS raw '+fmt(r.v):'VIIRS not yet flying'}`)); h.addEventListener('pointerleave',hideTip); });
  const pre=an.filter(r=>r.y>=2007&&r.y<VIIRS_Y).reduce((s,r)=>s+r.m,0)/5, post=an.filter(r=>r.y>=VIIRS_Y&&r.y<2017).reduce((s,r)=>s+r.v,0)/5;
  $('seamsub').textContent= pre>0? `In this area, simply joining the two records makes 2012–2016 look ${(post/pre).toFixed(1)} times busier than 2007–2011. Most of that jump comes from the change of sensor, because VIIRS sees smaller fires.` : 'Too few MODIS detections in this area to compare.';
  $('seamleg').innerHTML=`<span><span class="ln" style="border-color:var(--a);border-top-width:3px"></span>Harmonized</span><span><span class="ln" style="border-color:var(--b);border-top-style:dashed"></span>MODIS raw</span><span><span class="ln" style="border-color:var(--c);border-top-style:dotted"></span>VIIRS raw</span>`;
}
function renderUnusual(){
  // Rank by detections above the normal ceiling, and leave out the weaker single-platform weeks.
  const out=[]; for(let y=Y0;y<=YN;y++) for(let b=0;b<W;b++){ const src=M.source[(y-Y0)*W+b]; if(src===4||src===2) continue; const c=classify(stats,y,b); if(c.cls==='unusual'||c.cls==='record') out.push({y,b,c,excess:c.val-c.p90}); }
  out.sort((a,b)=>b.excess-a.excess); const top=out.slice(0,12);
  const item=o=>`<li><span>${binDate(o.b)} ${o.y}</span><span class="mono">${fmt(o.c.val)} vs usual ${fmt(o.c.p50)}</span></li>`;
  const h=Math.ceil(top.length/2); $('unusual').innerHTML= top.length? `<ul class="list">${top.slice(0,h).map(item).join('')}</ul><ul class="list">${top.slice(h).map(item).join('')}</ul>` : '<p class="sub">No week stands out, or this area has too few detections.</p>';
}
function renderTrust(){
  let tv=0; for(const c of S.cells) tv+=M.cells.trainV[c];
  const p=[],v=[]; let sp=0,sv=0,ae=0; const i0=(2020-Y0)*W; for(let i=i0;i<NW;i++){ if(M.source[i]!==0||(stats.p[i]<=0&&stats.v[i]<=0)) continue; p.push(Math.log1p(stats.p[i])); v.push(Math.log1p(stats.v[i])); sp+=stats.p[i]; sv+=stats.v[i]; ae+=Math.abs(stats.p[i]-stats.v[i]); }
  if(p.length<3){ $('trust').innerHTML='<div class="row" style="margin-bottom:6px"><span class="pill">Low confidence</span></div><p class="sub" style="margin:0">This area has too few detections to test the correction. Choose a larger area.</p>'; return; }
  const nmae=sv?ae/sv:9;
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length, mp=mean(p), mv=mean(v); let n=0,dp=0,dv=0; for(let i=0;i<p.length;i++){ n+=(p[i]-mp)*(v[i]-mv); dp+=(p[i]-mp)**2; dv+=(v[i]-mv)**2; } const r=dp&&dv?n/Math.sqrt(dp*dv):0, bias=sv?sp/sv:0;
  const grade= tv<200||sv<100 ? ['Low','Few detections were available to learn from. Read this area for broad timing only.'] : (Math.abs(bias-1)<.25&&r>=.85&&nmae<.35) ? ['High','Corrected MODIS closely tracks real VIIRS in the test years.'] : (Math.abs(bias-1)<.4&&r>=.7&&nmae<.7) ? ['Moderate','Seasonal timing holds up. Before 2012, treat individual weeks and exact totals with caution.'] : ['Low','Corrected MODIS tracks VIIRS weakly here week by week. Before 2012, read this area for broad seasonal timing only.'];
  $('trust').innerHTML=`<div class="row" style="margin-bottom:6px"><span class="pill">${grade[0]} confidence</span></div><p class="sub" style="margin:0 0 8px">${grade[1]}</p><ul class="list"><li><span>Corrected MODIS ÷ real VIIRS, 2020–2025</span><span class="mono">${sv?bias.toFixed(2):'n/a'}</span></li><li><span>Typical weekly error, 2020–2025</span><span class="mono">${sv?Math.round(nmae*100)+'%':'n/a'}</span></li><li><span>Weekly correlation (log scale), 2020–2025</span><span class="mono">${sv?r.toFixed(2):'n/a'}</span></li><li><span>VIIRS detections used to learn the correction</span><span class="mono">${fmt(tv)}</span></li><li><span>Area covered</span><span class="mono">${fmt(stats.area)} km²</span></li></ul>`;
}
function renderProof(){
  const lv=V.levels; const rows=[['All India, week',lv.week.india],['Kerala, week',lv.week.kerala],['Punjab & Haryana, week',lv.week.punjab_haryana],['Grid cell, month',lv.cell_month.india]];
  const name=['no correction','single national ratio','national by month','AgniCal stratified'], lab={'no correction':'No correction','single national ratio':'One national ratio','national by month':'National ratio by month','AgniCal stratified':'AgniCal'};
  let h='<table class="tbl"><tr><th>Scale tested</th><th>Method</th><th>Total ÷ real VIIRS</th><th>Typical error (share of VIIRS)</th><th>Correlation (log)</th></tr>';
  rows.forEach(([t,d])=>name.forEach(n=>{ const m=d[n]; if(m) h+=`<tr class="${n.includes('AgniCal')?'best':''}"><td>${n===name[0]?t:''}</td><td style="text-align:left">${lab[n]}</td><td>${m.bias_ratio.toFixed(2)}</td><td>${Math.round(m.nmae*100)}%</td><td>${m.r_log.toFixed(2)}</td></tr>`; }));
  $('proof').innerHTML=h+'</table>';
  const A=V.agreement.india; $('proofsub').innerHTML=`The correction was learned from 2012–2019 only, then tested on 2020–2025. A total ratio near 1.00 and a lower error are better. Across India, joining the raw records makes 2012–2016 look ${A.step_raw} times busier than 2007–2011. After harmonizing, that step is ${A.step_harmonized}, close to the ${A.step_modis_only} that MODIS shows alone.`;
  $('method').innerHTML=`<ol><li><b>Clean.</b> Keep presumed vegetation fires (type 0), MODIS confidence of 30 or more, and VIIRS nominal or high confidence. Then remove ~2 km spots that show detections in the July–September monsoon in 4 or more years, which catches persistent heat sources such as coal fields and industrial plants. This removes ${V.persistent_mask.removed_share_pct}% of detections.</li><li><b>Fill single-platform days.</b> On days with only one MODIS satellite, including before Aqua began on ${V.aqua_first}, estimate two-satellite coverage from a factor learned in 2003–2011.</li><li><b>Learn the correction.</b> In 2012–2019, compute k = VIIRS ÷ MODIS for each 0.25° cell, month and day/night overpass. Cells with little data lean on the wider 1° and national values (shrinkage λ = ${V.lambda}).</li><li><b>Build one record.</b> Use VIIRS where it operated and corrected MODIS elsewhere, including VIIRS outages. A fire neither sensor saw stays invisible, and zeros stay zero.</li><li><b>Test it.</b> Measure against 2020–2025 VIIRS, which the correction never saw, and repeat leaving out each year of 2012–2019 in turn. The test years also check for MODIS orbit drift. Records before 2012 cannot be tested directly because VIIRS was not yet flying.</li><li><b>Build the calendar.</b> The critical period is the shortest run of weeks holding 50% of detections and the fire season holds 80%. A week is unusual when it exceeds the 90th percentile of the same three-week part of the year in all other years. Fewer than ${FEW} detections reads as too few to say.</li></ol><p><b>Known limits.</b> The correction uses fixed ratios, so it cannot recover yearly changes in fire size or burning time. Reports of Punjab burning moving later in the day could lower detections without less burning. In ${V.modis_blind.cellmonths_share_pct}% of active grid-cell months MODIS saw nothing while VIIRS did, and those months hold ${V.modis_blind.viirs_share_pct}% of VIIRS detections, so corrected MODIS cannot place those small fires correctly. One MODIS detection becomes several VIIRS-equivalent detections, so quiet weeks before 2012 look lumpier than quiet weeks after. The 2001 to mid-2002 record rests on Terra alone and is the least certain. MODIS product versions in the FIRMS archive also change over time. Reliability is lowest in small areas and quiet seasons. Grid cells are about 27 km, so small features blur. This release covers India; the same pipeline can process other FIRMS country files. Data: NASA FIRMS, MCD14ML and VNP14IMG, through ${YN}.</p>`;
}
function renderAll(){ renderFacts(); drawMap(); drawCal(); chartYear(); chartShift(); chartCompare(); chartSeam(); renderUnusual(); renderTrust(); }


/* ---------- export ---------- */
function brief(){
  const st=stats; if(!st.core) return `AgniCal: ${S.name}\nToo few detections for a readiness brief.`;
  const u=(S.unusualWeeks||[]).map(b=>binDate(b)).join(', ')||'none';
  return `AgniCal readiness brief: ${S.name}\nRecord: harmonized MODIS and VIIRS detections, ${Y0}–${YN}\nCritical period: ${binDate(st.core.start)} to ${binEnd(st.core.start+st.core.len-1)} (${st.core.len} weeks hold half of detections)\nFire season: ${binDate(st.season.start)} to ${binEnd(st.season.start+st.season.len-1)} (80% of detections)\nBusiest week starts: ${binDate(st.peak)}\nSeason timing: ${S.shift?S.shift.text:''}\nUnusual weeks in ${S.year}: ${u}\nLimits: past satellite detections, not a forecast or live alert. Satellites pass only at set times and miss small fires and fires under cloud, thick smoke or canopy. Some detections aren’t wildfires. No detection does not mean no fire.`;
}
function csv(){ let o='year,week_start,source,harmonized_detections,modis_raw,viirs_raw,frp_mw\n'; const names=['viirs','modis','modis_one_platform','partial','no_data']; for(let i=0;i<NW;i++){ const src=M.source[i]; o+=`${Y0+Math.floor(i/W)},${binDate(i%W)},${names[src]},${src===4?'':stats.h[i].toFixed(1)},${stats.m[i]},${stats.v[i]},${stats.frp[i]}\n`; } return o; }
async function copy(text,msg){ try{ await navigator.clipboard.writeText(text); $('copied').textContent=msg; }catch(e){ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); let ok=false; try{ ok=document.execCommand('copy'); }catch(_){} ta.remove(); $('copied').textContent= ok?msg:'Copying was blocked in this view.'; } setTimeout(()=>{$('copied').textContent='';},3500); }

/* ---------- boot ---------- */
function initControls(){
  try{ const q=new URLSearchParams(location.search).get('mode'); if(['h','anom','raw','frp'].includes(q)) S.mode=q; }catch(e){}
  const reg=$('region'), cmp=$('cmp'); const opts=M.regions.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');
  reg.innerHTML='<option value="">Custom area</option>'+opts; cmp.innerHTML=opts;
  reg.onchange=()=>{ if(!reg.value) return; const r=M.regions.find(x=>x.id===reg.value); setAOI(r.cells,r.name,r.id); };
  cmp.value=S.compare; cmp.onchange=()=>{S.compare=cmp.value;chartCompare();};
  const yr=$('year'); for(let y=YN;y>=Y0;y--) yr.add(new Option(y,y)); yr.value=S.year; yr.onchange=()=>{S.year=+yr.value;renderAll();};
  const modes=[['h','Harmonized'],['anom','Against normal'],['raw','Raw splice'],['frp','Fire power']]; const seg=$('modes');
  seg.innerHTML=modes.map(([k,l])=>`<button type="button" data-m="${k}" aria-pressed="${k===S.mode}">${l}</button>`).join('');
  seg.onclick=e=>{ const m=e.target.dataset&&e.target.dataset.m; if(!m) return; S.mode=m; [...seg.children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m)); drawCal(); };
  $('zoom').onclick=()=>{ S.zoomed=!S.zoomed; $('zoom').textContent=S.zoomed?'Show all India':'Zoom to area'; drawMap(); };
  $('copybrief').onclick=()=>copy(brief(),'Brief copied.'); $('copycsv').onclick=()=>copy(csv(),'Weekly data copied.');
  addEventListener('resize',()=>{ clearTimeout(S.rt); S.rt=setTimeout(()=>{drawMap();drawCal();},120); });
  const redraw=()=>{ if(stats){ drawMap(); drawCal(); } };
  if(matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change',redraw);
  new MutationObserver(redraw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  addEventListener('hashchange',()=>{ const id=location.hash.slice(1), r=M.regions.find(x=>x.id===id); if(r&&r.id!==S.id){ reg.value=r.id; setAOI(r.cells,r.name,r.id); } });
}
load().then(()=>{
  $('loading').hidden=true; $('app').hidden=false;
  initControls(); initMap(); initCal(); renderProof();
  const id=location.hash.slice(1), r=M.regions.find(x=>x.id===id)||M.regions.find(x=>x.id==='kerala');
  $('region').value=r.id; setAOI(r.cells,r.name,r.id);
}).catch(e=>{ console.error(e); $('loading').innerHTML='The hotspot data could not load. If you opened this file directly, start a local server in the <code>app</code> folder with <code>python -m http.server 8000</code>, then open <code>http://localhost:8000</code>.'; });
