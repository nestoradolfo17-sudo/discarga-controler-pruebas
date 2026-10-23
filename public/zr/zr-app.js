(function(){
"use strict";
const FALLBACK = {"mes":"2026-09","titulo":"ZR Atanasio · Septiembre 2026","fuente":"2.ZrAtanasio_Septiembre_26.xlsx","sectores":[{"id":"s01","nombre":"Ciudad real, las Graditas","dias":{"3":700},"nota":"ok no se ha solicitado"},{"id":"s02","nombre":"Ciudad Real, \"La Corona\"","dias":{"3":1500,"17":1500},"nota":"ok"},{"id":"s03","nombre":"Guajitos","dias":{"4":1000,"11":1000,"18":1000,"25":1000},"nota":"ok"},{"id":"s04","nombre":"Col. Santa Fe, zona 13 (Juev alterno cada 15)","dias":{"2":6000,"16":6000},"nota":"ok"},{"id":"s05","nombre":"Zona 1 san Jose Pinula","dias":{"1":2000,"8":2000,"15":2000,"22":2000,"29":2000},"nota":""},{"id":"s06","nombre":"Col. Vazquez zona 21","dias":{"4":4000,"11":4000,"18":4000,"25":4000},"nota":""},{"id":"s07","nombre":"Cerro Gordo zona 21 ( 5 y 20)","dias":{"3":1000,"17":1000},"nota":""},{"id":"s08","nombre":"El Pajon, Santa catarina Pinula","dias":{"1":1500,"8":1500,"15":1500,"22":1500,"29":1500},"nota":""},{"id":"s09","nombre":"Santa Catarina Pinula, El Pueblito, Zona 10 y Zona 14","dias":{"1":4500,"8":4500,"15":4500,"22":4500,"29":4500},"nota":""},{"id":"s10","nombre":"Ciudad Vieja 1, Ciudad Vieja2, Santa Anita, Acatan, Lomas, Camposeco, San Gaspar, Monte sano, Santa Amelia, Mariscal Zavala,Hospital Militar, Zona 16 (5 y 20)","dias":{"3":4500,"17":4500},"nota":""},{"id":"s11","nombre":"San Cristóbal/Satelite","dias":{"3":1500,"17":1500},"nota":"5 y 20"},{"id":"s12","nombre":"Trebol/Roosevelt (5 Y20)","dias":{"3":800,"17":800},"nota":"5y20"},{"id":"s13","nombre":"Zona3/Zona 8","dias":{"1":2500,"8":2500,"15":2500,"22":2500,"29":2500},"nota":"Martes"},{"id":"s14","nombre":"Terminal zona 4 5 y 20","dias":{"3":1500,"17":1500},"nota":"Inicio del pago 20 oct 23"},{"id":"s15","nombre":"Piedra Parada","dias":{"3":1000,"17":1000},"nota":"Inicio  05 de junio del 2024"},{"id":"s16","nombre":"Zona 16, santa Rosita, Cayala y centros comerciales de la zona","dias":{"3":4000,"10":4000,"17":4000,"24":4000},"nota":""},{"id":"s17","nombre":"Colonia Los Tubos Zona 13 (mensual)","dias":{"3":1500},"nota":""},{"id":"s18","nombre":"Atanasio","dias":{"3":20000,"10":20000,"17":20000,"24":20000},"nota":""}]}
;
const WD = ["D","L","M","M","J","V","S"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const fmtQ = new Intl.NumberFormat("es-GT",{style:"currency",currency:"GTQ",minimumFractionDigits:2});
const q = v => fmtQ.format(v||0);
const $ = s => document.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2,"0");
const todayISO = (()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());})();
const mesLabel = m => { if(!m) return ""; const [y,mm]=m.split("-"); return MESES[+mm-1].replace(/^./,c=>c.toUpperCase())+" "+y; };
const daysIn = m => { const [y,mm]=m.split("-").map(Number); return new Date(y,mm,0).getDate(); };
const wdOf = (m,d) => { const [y,mm]=m.split("-").map(Number); return new Date(y,mm-1,d).getDay(); };
const round2 = n => Math.round(n*100)/100;

const S = { db:null, budgets:{}, pagos:[], mes:null, tab:"registro", editId:null, openSector:null, calDay:null, filtro:"", confirmDel:null, readOnly:false, imp:null, sols:[], cfg:{}, mailFor:null, confirmAnular:null, authOpen:false, delMes:null, delTxt:"", gastos:{}, vales:{}, reint:{}, manoEv:null, pil:[], pilImp:null, confirmPil:null, antRej:null, extRej:null, cargas:{}, seg:null, usuarios:[], claves:{}, owner:null };

/* ---------- derived ---------- */
function budget(){ return S.budgets[S.mes] || null; }
function corrKey(v){ const m=String(v||"").toUpperCase().match(/(\d+)(?:-(\d+))?/); return m? [+m[1], m[2]!==undefined? +m[2] : -1] : [1e9,0]; }
function cmpCorr(a,b){ const x=corrKey(a), y=corrKey(b); return x[0]-y[0] || x[1]-y[1] || String(a).localeCompare(String(b)); }
function sectores(){ const b=budget(); if(!b) return []; const l=b.sectores; return l.slice().sort((x,y)=>cmpCorr(baseCorr(x,l),baseCorr(y,l))); }
function secById(id){ return sectores().find(s=>s.id===id); }
/* Formato de correlativo: siempre inicia con "ZR-0" (ZR-001, ZR-002 … ZR-018) */
function fmtCorr(n){ return "ZR-"+String(n).padStart(3,"0"); }
function normCorr(v){ v=String(v||"").trim().toUpperCase(); if(!v) return ""; const m=v.match(/^(?:ZR-?)?0*(\d+)$/); if(m) return fmtCorr(+m[1]); return v.startsWith("ZR-")? v : "ZR-"+v; }
function baseCorr(s, list){ list=list||budget()?.sectores||[]; if(!s) return ""; if(s.corr) return normCorr(s.corr); const i=list.indexOf(s); return fmtCorr(i+1); }
function secLabel(s){ return baseCorr(s)+" · "+s.nombre; }
/* Correlativo por sector: el primer pago del mes lleva el correlativo base; los siguientes, subcorrelativos base-1, base-2… */
function nextCorr(sectorId, mes, excludeId){
  const bud=S.budgets[mes]; const list=bud?.sectores||sectores(); const s=list.find(x=>x.id===sectorId); const base=baseCorr(s,list);
  if(!base) return "";
  const prev=S.pagos.filter(p=>p.sectorId===sectorId && p.fechaRetiro?.slice(0,7)===mes && p.id!==excludeId);
  if(!prev.length) return base;
  let max=0; const re=new RegExp("^"+base.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"-(\\d+)$");
  for(const p of prev){ const m=String(p.correlativo||"").match(re); if(m) max=Math.max(max,+m[1]); }
  return base+"-"+(max+1);
}
function corrPreview(){
  const f=$("#fRetiro").value, sid=$("#fSector").value;
  if(!f||!sid){ $("#fCorr").value=""; return; }
  const mes=f.slice(0,7);
  if(S.editId){ const old=S.pagos.find(p=>p.id===S.editId); if(old && old.sectorId===sid && old.fechaRetiro.slice(0,7)===mes){ $("#fCorr").value=old.correlativo; return; } }
  $("#fCorr").value=nextCorr(sid,mes,S.editId);
}
function pagosMes(){ return S.pagos.filter(p=>p.fechaRetiro && p.fechaRetiro.slice(0,7)===S.mes); }
function dayOf(p){ return parseInt(p.fechaRetiro.slice(8,10),10); }
function paidMap(){ // sectorId -> day -> {sum, list}
  const m={};
  for(const p of pagosMes()){ const d=dayOf(p); (m[p.sectorId] ||= {}); (m[p.sectorId][d] ||= {sum:0,list:[]}); m[p.sectorId][d].sum=round2(m[p.sectorId][d].sum+ (+p.monto||0)); m[p.sectorId][d].list.push(p); }
  return m;
}
function statusFor(budgetAmt, paid, day, list){
  { const sid=list?.[0]?.sectorId; if(sid && reintOf(S.mes+"-"+pad(day),sid)) return {k:"info",t:"Reintegro ZR"}; }
  if(list && list.length && paid>0 && paid<budgetAmt-0.005 && list.every(p=>p.autorizacion)) return {k:"info",t:"Parcial autorizado"};
  const past = S.mes+"-"+pad(day) < todayISO;
  if(!budgetAmt && paid>0) return {k:"crit",t:"Sin presupuesto"};
  if(!budgetAmt) return {k:"neutral",t:"—"};
  if(!paid) return past ? {k:"crit",t:"Vencido sin registro"} : {k:"neutral",t:"Pendiente"};
  if(Math.abs(paid-budgetAmt)<0.005) return {k:"ok",t:"Coincide"};
  if(paid>budgetAmt) return {k:"crit",t:"Excede"};
  return {k:"warn",t:"Menor"};
}
function totals(){
  let pres=0,reg=0,prog=0,cub=0,venc=0;
  const pm=paidMap();
  for(const s of sectores()){
    for(const [d,v] of Object.entries(s.dias)){ pres+=v; prog++; const paid=pm[s.id]?.[d]?.sum||0; if(paid>0) cub++; else if(S.mes+"-"+pad(d)<todayISO) venc++; }
  }
  for(const p of pagosMes()) reg+=(+p.monto||0);
  const reint=round2(reintMes().reduce((a,r)=>a+(+r.monto||0),0));
  return {pres,reg:round2(reg),prog,cub,venc,reint};
}

/* ---------- render ---------- */
function renderMesSel(){
  const keys=Object.keys(S.budgets).sort().reverse();
  const sel=$("#mesSel");
  sel.innerHTML = keys.length? keys.map(k=>`<option value="${k}" ${k===S.mes?"selected":""}>${esc(mesLabel(k))}</option>`).join("") : `<option>Sin presupuesto</option>`;
}
function ringSVG(pct){
  const r=50, c=2*Math.PI*r, p=Math.max(0,Math.min(pct,100));
  return `<svg viewBox="0 0 118 118" width="118" height="118" aria-hidden="true"><circle cx="59" cy="59" r="${r}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="10"/>
   <circle cx="59" cy="59" r="${r}" fill="none" stroke="${pct>100.05?"#FF8A80":"#7FB0FF"}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c*p/100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 59 59)"/></svg>`;
}
function porEjecutarData(){
  const n=daysIn(S.mes), pm=paidMap(); const out=[];
  for(let d=1; d<=n; d++){ const past=(S.mes+"-"+pad(d))<todayISO; let ej=0,pe=0,ne=0,c=0,cEj=0,cPe=0,cNe=0;
    let ri=0;
    for(const s of sectores()){ const b=s.dias[d]||0, p=pm[s.id]?.[d]?.sum||0; if(b) c++; ej+=p; if(b) ri+=reintAmt(s.id,d); const r=round2(b-p-(b?reintAmt(s.id,d):0)); if(p>0) cEj++; if(r>0.005){ if(past){ ne+=r; cNe++; } else { pe+=r; cPe++; } } }
    out.push({d,past,ej:round2(ej),pe:round2(pe),ne:round2(ne),ri:round2(ri),c,cEj,cPe,cNe,q:round2(pe+ne)}); }
  return out;
}
function renderKpis(){
  const t=totals(); const diff=round2(t.pres-t.reg); const pct=t.pres? t.reg/t.pres*100:0;
  const data=porEjecutarData();
  const sum=k=>round2(data.reduce((a,x)=>a+x[k],0));
  const qEj=sum("ej"), qPe=sum("pe"), qNe=sum("ne"), nEj=sum("cEj"), nPe=sum("cPe"), nNe=sum("cNe"), nPend=nPe+nNe;
  const W=900,H=210,L=56,R=40,T=24,B=26, n=data.length||30, cw=(W-L-R)/n, bw=Math.max(5,Math.min(16,cw*0.6));
  const qMax=niceMax(Math.max(...data.map(x=>x.ej+x.pe+x.ne+x.ri),1)); const cMax=Math.max(2,Math.ceil(Math.max(...data.map(x=>x.c),1)/2)*2);
  const yq=v=>T+(H-T-B)*(1-v/qMax), yc=v=>T+(H-T-B)*(1-v/cMax), hq=v=>(H-T-B)*v/qMax;
  let g="";
  for(let i=0;i<=4;i++){ const v=qMax*i/4, y=yq(v); g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text x="${L-6}" y="${y+3}" text-anchor="end">${v>=1000?(v/1000).toLocaleString("es-GT",{maximumFractionDigits:1})+"k":v}</text><text x="${W-R+6}" y="${y+3}">${(cMax*i/4).toLocaleString("es-GT",{maximumFractionDigits:1})}</text>`; }
  g+=`<text x="${L-6}" y="${T-12}" text-anchor="end" style="font-weight:700">Q</text><text x="${W-R+6}" y="${T-12}" style="font-weight:700">pagos</text>`;
  const pts=[];
  data.forEach(x=>{ const cx=L+cw*(x.d-1)+cw/2, x0=cx-bw/2; let base=H-B;
    const segs=[["ej",x.ej],["ri",x.ri],["ne",x.ne],["pe",x.pe]].filter(s=>s[1]>0);
    segs.forEach(([k,v],i)=>{ const h=hq(v); const top=i===segs.length-1; const yTop=base-h;
      g+= top? `<path class="b-${k}" d="${barPath(x0,yTop,bw,h)}"/>` : `<rect class="b-${k}" x="${x0}" y="${yTop}" width="${bw}" height="${Math.max(h-1.5,0.5)}"/>`;
      base=yTop; });
    pts.push([cx,yc(x.c)]);
    if(x.d===1||x.d%2===1||x.d===n) g+=`<text x="${cx}" y="${H-B+14}" text-anchor="middle" style="${S.mes+"-"+pad(x.d)===todayISO?"fill:var(--accent);font-weight:700":""}">${x.d}</text>`;
  });
  g+=`<polyline class="ln" points="${pts.map(p=>p.join(",")).join(" ")}"/>`;
  data.forEach((x,i)=>{ if(x.c) g+=`<circle class="dot" cx="${pts[i][0]}" cy="${pts[i][1]}" r="3.5"/>`; });
  data.forEach(x=>{ g+=`<rect class="hit" x="${L+cw*(x.d-1)}" y="${T}" width="${cw}" height="${H-T-B}" data-tip="${esc(`<b>${x.d} de ${MESES[+S.mes.slice(5)-1]}</b><br>Ejecutado ${q(x.ej)} (${x.cEj})<br>Por ejecutar ${q(x.pe)} (${x.cPe})<br>No ejecutado ${q(x.ne)} (${x.cNe})${x.ri?`<br>Reintegrado ${q(x.ri)}`:""}<br>No. de pagos programados: ${x.c}`)}"/>`; });
  g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" style="stroke:var(--line-strong)"/>`;
  $("#kpis").innerHTML = `
    <div class="card hero">
      <div class="ring-wrap">${ringSVG(pct)}<div class="pct"><b>${pct.toFixed(0)}%</b><span>ejecutado</span></div></div>
      <div class="rows">
        <span class="eyebrow">Ejecución · ${esc(mesLabel(S.mes)||"—")}</span>
        <div><div class="big">${q(t.reg)}</div><div class="sub">registrado de ${q(t.pres)}</div></div>
        <div class="sub">${pagosMes().length} retiros ingresados${t.reint?` · reintegros ${q(t.reint)}`:""}</div>
      </div>
    </div>
    <div class="card pe-card">
      <div class="pe-head">
        <div><span class="eyebrow">Estado de pagos del mes</span>
          <div class="pe-nums" style="margin-top:6px"><span><b class="c-ej">${q(qEj)}</b><small class="muted">ejecutado · ${nEj} pagos</small></span><span><b class="c-pe">${q(qPe)}</b><small class="muted">por ejecutar · ${nPe} pagos</small></span><span><b class="c-ne">${q(qNe)}</b><small class="muted">no ejecutado · ${nNe} pagos</small></span>${sum("ri")?`<span><b style="color:var(--warn)">${q(sum("ri"))}</b><small class="muted">reintegrado</small></span>`:""}</div></div>
        <div class="legend"><span><i style="background:var(--ok)"></i>Pagos ejecutados</span><span><i style="background:var(--info)"></i>Por ejecutar (desde hoy)</span><span><i style="background:var(--crit)"></i>No ejecutados (vencidos)</span><span><i style="background:var(--warn)"></i>Reintegrados</span><span><i style="background:var(--ink);height:3px;border-radius:2px"></i>No. de pagos</span></div>
      </div>
      <div class="chart-scroll pe-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pagos ejecutados, por ejecutar y no ejecutados por día, con número de pagos">${g}</svg></div>
    </div>`;
  $("#subtitle").textContent = budget()? `${mesLabel(S.mes)} · ${budget().fuente||"presupuesto"}` : "Cargue un presupuesto para comenzar";
  $("#cntPagos").textContent = pagosMes().length;
}
const TITLES={registro:"Registrar pago",pagos:"Pagos registrados",sector:"Comparación por sector",diario:"Indicadores ZR",presupuesto:"Presupuestos mensuales",autorizaciones:"Autorizaciones de anticipos y pagos parciales",historial:"Historial",pilotos:"Pilotos",usuarios:"Usuarios y permisos"};
function secTotals(){
  const pm=paidMap();
  return sectores().map(s=>{ const pres=Object.values(s.dias).reduce((a,b)=>a+b,0); const reg=round2(Object.values(pm[s.id]||{}).reduce((a,v)=>a+v.sum,0)); return {s,pres,reg}; });
}
function renderSectorChart(){
  const rows=secTotals();
  if(!rows.length){ $("#chartSector").innerHTML=`<div class="empty-state">Sin presupuesto cargado.</div>`; return; }
  const max=Math.max(...rows.map(r=>Math.max(r.pres,r.reg)),1);
  $("#chartSector").innerHTML=rows.map(r=>{ const over=r.reg>r.pres+0.005; const pct=r.pres? r.reg/r.pres*100:0;
    const tip=`<b>${esc(r.s.nombre)}</b><br>Presupuesto ${q(r.pres)}<br>Registrado ${q(r.reg)}<br>${over?"Excede por "+q(r.reg-r.pres):"Pendiente "+q(r.pres-r.reg)}`;
    return `<div class="bar-row" data-tip="${esc(tip)}"><div class="nm"><span class="corr-badge">${esc(baseCorr(r.s))}</span>${esc(r.s.nombre)}</div>
      <div class="bar-track"><div class="bud" style="width:${r.pres/max*100}%"></div>${r.reg?`<div class="reg ${over?"crit":""}" style="width:${Math.max(r.reg/max*100,.8)}%"></div>`:""}</div>
      <div class="val"><b>${q(r.reg)}</b> <span class="muted">/ ${q(r.pres)}</span> · <span class="${over?"neg":""}">${pct.toFixed(0)}%</span></div></div>`; }).join("");
}
function niceMax(v){ if(v<=0) return 1000; const p=Math.pow(10,Math.floor(Math.log10(v))); const n=v/p; const m= n<=1?1: n<=2?2: n<=2.5?2.5: n<=5?5:10; return m*p; }
function renderDailyChart(){
  if(!budget()){ $("#chartDaily").innerHTML=""; return; }
  const n=daysIn(S.mes), pm=paidMap(); const data=[];
  for(let d=1; d<=n; d++){ let b=0,p=0,ri=0; for(const s of sectores()){ b+=s.dias[d]||0; p+=pm[s.id]?.[d]?.sum||0; ri+=s.dias[d]?reintAmt(s.id,d):0; } data.push({d,b,p,ri}); }
  const top=niceMax(Math.max(...data.map(x=>Math.max(x.b,x.p)),1));
  const W=960,H=240,L=58,R=10,T=12,B=30, cw=(W-L-R)/n, bw=Math.max(4,Math.min(12,(cw-6)/2));
  const y=v=>T+(H-T-B)*(1-v/top);
  let g="";
  for(let i=0;i<=4;i++){ const v=top*i/4, yy=y(v); g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text x="${L-8}" y="${yy+3}" text-anchor="end">${v>=1000? (v/1000).toLocaleString("es-GT",{maximumFractionDigits:1})+"k":v}</text>`; }
  const selD=indDay()||S.calDay;
  for(const x of data){
    const cx=L+cw*(x.d-1)+cw/2; const iso=S.mes+"-"+pad(x.d);
    if(x.d===selD) g+=`<rect class="sel" x="${L+cw*(x.d-1)+1}" y="${T}" width="${cw-2}" height="${H-T-B}" rx="4"/>`;
    if(x.b) g+=`<path class="b-bud" d="${barPath(cx-bw-1,y(x.b),bw,H-B-y(x.b))}"/>`;
    if(x.p) g+=`<path class="b-reg ${x.p>x.b+0.005?"crit":""}" d="${barPath(cx+1,y(x.p),bw,H-B-y(x.p))}"/>`;
    g+=`<text x="${cx}" y="${H-B+16}" text-anchor="middle" style="${iso===todayISO?"fill:var(--accent);font-weight:700":""}">${x.d}</text>`;
    const tip=`<b>${x.d} de ${MESES[+S.mes.slice(5)-1]}</b><br>Presupuesto ${q(x.b)}<br>Registrado ${q(x.p)}${x.ri?`<br>Reintegro ${q(x.ri)}`:""}${x.b||x.p?`<br>Diferencia ${q(round2(x.b-x.p-x.ri))}`:""}`;
    g+=`<rect class="hit" x="${L+cw*(x.d-1)}" y="${T}" width="${cw}" height="${H-T-B+20}" data-day="${x.d}" data-tip="${esc(tip)}"/>`;
  }
  g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" style="stroke:var(--line-strong)"/>`;
  $("#chartDaily").innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Presupuesto y registrado por día de ${esc(mesLabel(S.mes))}">${g}</svg>`;
  $("#chartDaily").querySelectorAll("[data-day]").forEach(r=>r.addEventListener("click",()=>{ S.calDay=+r.dataset.day; S.tab="registro"; renderTabs(); renderCal(); renderDailyChart(); window.scrollTo({top:0,behavior:"smooth"}); }));
}
function barPath(x,y0,w,h){ if(h<=0) return ""; const r=Math.min(3,h,w/2); return `M${x},${y0+h}V${y0+r}Q${x},${y0} ${x+r},${y0}H${x+w-r}Q${x+w},${y0} ${x+w},${y0+r}V${y0+h}Z`; }
function renderUpcoming(){
  const box=$("#upcoming"); if(!box) return; if(!budget()){ box.innerHTML=""; return; }
  const pm=paidMap(); const [yy,mm]=S.mes.split("-").map(Number); const out=[];
  const start=new Date(); start.setHours(0,0,0,0);
  for(let i=0;i<7;i++){ const dt=new Date(start); dt.setDate(start.getDate()+i); if(dt.getFullYear()!==yy||dt.getMonth()+1!==mm) continue; const d=dt.getDate();
    for(const s of sectores()){ const b=s.dias[d]; if(b && !(pm[s.id]?.[d]?.sum>0)) out.push({d,s,b,wd:dt.getDay()}); } }
  if(!out.length){ box.innerHTML=`<div class="empty-state" style="padding:14px">No hay pagos pendientes en los próximos 7 días de ${esc(mesLabel(S.mes))}.</div>`; return; }
  const WDL=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  box.innerHTML=out.slice(0,8).map(o=>`<div class="up-row"><div class="up-date"><b>${o.d}</b><span>${WDL[o.wd]}</span></div><div class="nm">${esc(o.s.nombre)}<small>Correlativo ${esc(baseCorr(o.s))}</small></div><div class="num" style="font-weight:600">${q(o.b)}</div></div>`).join("")+(out.length>8?`<div class="muted" style="font-size:12.5px">…y ${out.length-8} más</div>`:"");
}
function renderTabs(){
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected", b.dataset.tab===S.tab?"true":"false"));
  document.querySelectorAll("[data-panel]").forEach(p=>p.hidden = p.dataset.panel!==S.tab);
  $("#pageTitle").textContent=TITLES[S.tab]||"";
  document.body.dataset.tab=S.tab;
}
function renderForm(){
  const sel=$("#fSector"); const cur=sel.value;
  sel.innerHTML = `<option value="">Seleccione un sector…</option>` + sectores().map(s=>`<option value="${s.id}">${esc(secLabel(s))}</option>`).join("");
  if(cur && secById(cur)) sel.value=cur;
  $("#frmTitle").textContent = S.editId? "Editar registro ZR" : "Nuevo registro ZR";
  $("#btnSave").textContent = S.editId? "Guardar cambios" : "Guardar pago";
  $("#btnCancelEdit").hidden = !S.editId;
  renderHint();
  renderDayList();
}
/* El pago solo se puede guardar si el sector tiene pago programado en la fecha de retiro y el monto completa exactamente ese presupuesto */
function budgetMatch(){
  const f=$("#fRetiro").value, sid=$("#fSector").value, monto=parseFloat($("#fMonto").value);
  if(!f||!sid) return {ok:false,why:"Elija la fecha de retiro y el sector."};
  const bud=S.budgets[f.slice(0,7)]; if(!bud) return {ok:false,why:`No hay presupuesto cargado para ${mesLabel(f.slice(0,7))}.`};
  const s=bud.sectores.find(x=>x.id===sid); const d=parseInt(f.slice(8,10),10); const b=s?.dias?.[d]||0;
  if(!b) return {ok:false,why:`El sector no tiene pago programado el día ${d}.`};
  const already=round2(S.pagos.filter(p=>p.sectorId===sid && p.fechaRetiro===f && p.id!==S.editId).reduce((a,p)=>a+(+p.monto||0),0));
  if(already>=b-0.005) return {ok:false,why:`El presupuesto de este sector para el día ${d} ya está cubierto.`};
  if(isNaN(monto)||monto<=0) return {ok:false,why:"Ingrese el monto a pagar."};
  const rest=round2(b-already);
  if(monto>rest+0.005) return {ok:false,why:`El monto excede el presupuesto. Lo pendiente para el día ${d} es ${q(rest)}.`};
  if(Math.abs(monto-rest)>=0.005) return {ok:false,partial:true,rest,b,already,d,why:`Monto parcial: ${q(monto)} de ${q(rest)} pendientes. Requiere autorización de un administrador.`};
  return {ok:true};
}
function sectorTipo(s){ return s?.tipoPago==="mano"?"mano":"deposito"; }
const TIPO_TXT={deposito:"Depósito",mano:"Mano a mano"};
function setTipoFromSector(){
  const sid=$("#fSector").value, s=sid&&secById(sid);
  if(!s){ $("#tpDep").checked=false; $("#tpMano").checked=false; $("#tipoSrc").textContent="Se asigna según el sector"; return; }
  const t=sectorTipo(s); $("#tpDep").checked=t==="deposito"; $("#tpMano").checked=t==="mano";
  $("#tipoSrc").innerHTML=`Configurado para ${esc(baseCorr(s))} · <button type="button" class="link-btn" id="tipoCfg">cambiar</button>`;
  $("#tipoCfg").onclick=()=>{ S.tab="presupuesto"; renderTabs(); setTimeout(()=>$("#tipo-"+sid)?.scrollIntoView({block:"center",behavior:"smooth"}),60); };
}
function tipoPago(){ return $("#tpMano").checked?"mano":$("#tpDep").checked?"deposito":""; }
function bankMissing(){ const m=[]; const t=tipoPago(); if(!t) m.push("tipo de pago"); if(!$("#fRuta").value.trim()) m.push("no. de ruta"); if(!$("#fPiloto").value) m.push("piloto");
  if(t==="deposito" && !(typeof multiRuta==="function" && multiRuta())){ if(!$("#fBoleta").value.trim()) m.push("no. de boleta"); if(!$("#fBanco").value) m.push("banco"); }
  return m.concat(typeof multiMissing==="function"? multiMissing() : []); }
function applyTipo(){
  const t=tipoPago(), mano=t==="mano";
  ["#fBoleta","#fBanco"].forEach(id=>{ const el=$(id); el.disabled=mano; if(mano) el.value=""; });
  const ms=$("#manoState");
  if(!mano){ ms.hidden=true; S.manoEv=null; return; }
  ms.hidden=false; ms.className="mano-state"; ms.textContent="Boleta y banco no aplican. Al guardar se pedirá la fotografía de la entrega.";
}
let manoFileSel=null;
let evResolve=null;
function askEvidence(info){
  return new Promise(res=>{
    evResolve=res;
    $("#manoTitle").textContent= info.tipo==="mano"? "Comprobante del pago · mano a mano" : "Comprobante del pago · depósito";
    $("#manoSub").textContent= info.tipo==="mano"? "Agregue la fotografía de la entrega del efectivo." : "Agregue la imagen de la boleta de depósito.";
    $("#manoData").innerHTML=info.cells.map(([k,v])=>`<span><em>${k}</em><b>${esc(v)}</b></span>`).join("");
    manoFileSel=null; $("#manoFile").value=""; $("#manoPrev").hidden=true; $("#manoIco").style.display=""; $("#manoFileLbl").textContent="Pegue la imagen (Ctrl+V), arrástrela aquí o elija un archivo"; $("#manoErr").hidden=true; $("#manoOk").disabled=true;
    $("#manoBack").hidden=false; setTimeout(()=>$("#manoDrop").focus(),60);
  });
}
function setManoFile(f){
  $("#manoErr").hidden=true; manoFileSel=null; $("#manoOk").disabled=true;
  if(!f) return;
  if(!/^image\//.test(f.type) && !/\.(jpe?g|png|heic|webp|gif)$/i.test(f.name||"")){ $("#manoErr").textContent="El contenido debe ser una imagen (JPG o PNG)."; $("#manoErr").hidden=false; return; }
  if(f.size>20*1024*1024){ $("#manoErr").textContent="La imagen supera 20 MB."; $("#manoErr").hidden=false; return; }
  if(!f.name || f.name==="image.png"){ try{ f=new File([f],`comprobante_${Date.now()}.${(f.type.split("/")[1]||"png").replace("jpeg","jpg")}`,{type:f.type||"image/png"}); }catch(e){} }
  manoFileSel=f; $("#manoFileLbl").textContent=f.name||"Imagen pegada";
  try{ const im=$("#manoPrev"); im.src=URL.createObjectURL(f); im.hidden=false; $("#manoIco").style.display="none"; }catch(e){}
  $("#manoOk").disabled=S.readOnly;
}
function onManoFile(){ setManoFile($("#manoFile").files[0]); }
function closeEvidence(val){ $("#manoBack").hidden=true; const r=evResolve; evResolve=null; if(r) r(val); }
async function confirmMano(){
  if(!manoFileSel) return;
  const btn=$("#manoOk"); btn.disabled=true; btn.textContent="Cargando imagen…";
  try{
    const assets = window.claude?.use? await window.claude.use("assets") : null;
    let id=null;
    if(assets){ const tp=/^image\/(jpeg|png|gif|webp)$/.test(manoFileSel.type)? manoFileSel.type : (/\.png$/i.test(manoFileSel.name)?"image/png":"image/jpeg"); const r=await assets.upload(manoFileSel,{type:tp}); id=r.id; }
    else if(S.db){ throw {code:"not_granted"}; }
    closeEvidence({id, nombre:manoFileSel.name||"comprobante", cargado:new Date().toISOString()});
  }catch(ex){
    const c=ex?.code; $("#manoErr").textContent= c==="unsupported_type"||c==="invalid_request"?"Formato de imagen no admitido; use JPG o PNG.": c==="too_large"?"La imagen es demasiado grande.": c==="not_granted"?"No tiene permiso para cargar archivos en esta página (requiere acceso de edición).":"No se pudo cargar la imagen. Intente de nuevo."; $("#manoErr").hidden=false;
  }finally{ btn.disabled=!manoFileSel; btn.innerHTML=`<svg class="ico"><use href="#i-check"/></svg>Confirmar y guardar pago`; }
}
function renderSectorView(){
  const v=$("#fSectorView"), sid=$("#fSector").value, s=sid&&secById(sid);
  if(s){ v.classList.remove("empty"); v.innerHTML=`<span class="corr-badge">${esc(baseCorr(s))}</span>${esc(s.nombre)}`; }
  else { v.classList.add("empty"); v.textContent="Se asigna al seleccionar “Registrar ZR” en un pago programado"; }
}
function formMissing(){ const m=[]; if(!$("#fRetiro").value) m.push("fecha de retiro"); if(!$("#fRegistro").value) m.push("fecha de registro"); if(!$("#fSector").value) m.push("sector (use “Registrar ZR”)"); const mv=parseFloat($("#fMonto").value); if(!(mv>0)) m.push("monto"); return m.concat(bankMissing()); }
function updateSaveState(){
  renderSectorView();
  const m=budgetMatch(); const btn=$("#btnSave"), note=$("#saveNote"), ab=$("#btnAuth");
  const missAll=formMissing();
  btn.disabled = S.readOnly || !m.ok || S.saving || missAll.length>0;
  const partial=!!m.partial && !S.editId;
  ab.hidden=!partial; if(!partial){ S.authOpen=false; }
  const miss=bankMissing();
  ab.disabled = S.readOnly || S.saving || !!miss.length;
  let txt = S.readOnly? "Acceso de solo lectura." : (m.ok? (missAll.length? "Complete: "+missAll.join(", ")+"." : "") : m.why);
  if(!m.ok && !m.partial && !$("#fSector").value) txt="Seleccione “Registrar ZR” en un pago programado para cargar el sector.";
  if(partial && miss.length) txt+=` Complete ${miss.join(", ")} para solicitarla.`;
  if(m.partial && S.editId) txt="Al editar, el monto debe completar el presupuesto. Para un pago parcial genere una solicitud de autorización nueva.";
  note.textContent=txt; note.hidden=!txt;
  $("#authBox").hidden=!(partial && S.authOpen);
  note.classList.toggle("info", partial);
}
function renderHint(){ renderHintInner(); updateSaveState(); }
function renderHintInner(){
  const h=$("#hint"); const f=$("#fRetiro").value, sid=$("#fSector").value, monto=parseFloat($("#fMonto").value);
  if(!f || !sid){ h.hidden=true; return; }
  if(f.slice(0,7)!==S.mes){
    const b=S.budgets[f.slice(0,7)];
    h.hidden=false; h.className="hint warn";
    h.innerHTML = b? `La fecha de retiro es de <b>${esc(mesLabel(f.slice(0,7)))}</b>. Cambie el mes del presupuesto arriba para verlo en la comparación.` : `No hay presupuesto cargado para <b>${esc(mesLabel(f.slice(0,7)))}</b>. Cárguelo en “Presupuestos mensuales” para poder registrar pagos de ese mes.`;
    return;
  }
  const s=secById(sid); const d=parseInt(f.slice(8,10),10); const b=s?.dias[d]||0;
  const already=(paidMap()[sid]?.[d]?.list||[]).filter(p=>p.id!==S.editId);
  const alreadySum=already.reduce((a,p)=>a+(+p.monto||0),0);
  const prog=Object.keys(s.dias).map(Number).sort((a,b)=>a-b);
  let html="", cls="hint";
  if(b && alreadySum>=b-0.005){ cls+=" ok"; html=`<span>Presupuesto del día ${d}: <b>${q(b)}</b> · ya registrado completo.</span>`; }
  else if(!b){ cls+=" warn"; html=`<span>Este sector <strong>no tiene pago programado</strong> el día ${d}.</span><span class="muted">Fechas programadas: ${prog.map(x=>x).join(", ")||"ninguna"}</span>`; }
  else{
    html=`<span>Presupuesto del día ${d}: <b>${q(b)}</b>${alreadySum?` · ya registrado <b>${q(alreadySum)}</b>`:""}</span>`;
    if(!isNaN(monto)){
      const tot=round2(alreadySum+monto), df=round2(b-tot);
      if(Math.abs(df)<0.005){ cls+=" ok"; html+=`<span>El monto coincide con el presupuesto.</span>`; }
      else if(df<0){ cls+=" crit"; html+=`<span>Excede el presupuesto por <b>${q(-df)}</b>.</span>`; }
      else { cls+=" warn"; html+=`<span>Queda <b>${q(df)}</b> por debajo del presupuesto.</span>`; }
    } else { const rest=round2(b-alreadySum); html+=`<span><button type="button" class="btn small" id="useBudget" data-v="${rest}">Usar ${q(rest)}</button></span>`; }
  }
  h.className=cls; h.innerHTML=html; h.hidden=false;
  const ub=$("#useBudget"); if(ub) ub.onclick=()=>{ $("#fMonto").value=ub.dataset.v; renderHint(); };
}
function dayDetailHTML(d){
  const pm=paidMap(); const rows=[];
  for(const s of sectores()){ const b=s.dias[d]||0; const e=pm[s.id]?.[d]; if(b||e) rows.push({s,b,paid:e?.sum||0,list:e?.list||[]}); }
  if(!rows.length) return `<div class="empty-state">No hay pagos programados ni registrados este día.</div>`;
  let tb=0,tp=0; const fecha=S.mes+"-"+pad(d);
  const restOf=r=>round2(r.b-r.paid);
  const settledOf=r=>!!reintOf(fecha,r.s.id) || restOf(r)<=0.005;
  const rank=r=>{ if(!r.b) return 3; if(!settledOf(r)) return 0; return valeOf(fecha,r.s.id)?2:1; };
  rows.sort((a,b)=>rank(a)-rank(b));
  const body=rows.map(r=>{ tb+=r.b; tp+=r.paid; const st=statusFor(r.b,r.paid,d,r.list);
    const rnd=roundOf(fecha,r.s.id); const g=gastoOf(fecha,r.s.id,rnd); const rt=reintOf(fecha,r.s.id);
    const rest=restOf(r), partial=r.paid>0 && rest>0.005 && !rt, settled=settledOf(r);
    let acts="";
    if(r.b){
      const vg=valeOf(fecha,r.s.id); const lock=S.readOnly; let reBtn="";
      if(rt){
        acts+=`<button type="button" class="btn small step-btn off" disabled><svg class="ico"><use href="#i-doc"/></svg>1 · Solicitud de gasto</button>`;
        acts+=`<button type="button" class="btn small step-btn off" disabled><svg class="ico"><use href="#i-plus"/></svg>2 · Registrar ZR</button>`;
        reBtn=`<button type="button" class="btn small step-btn reint done" data-reint-pdf="${r.s.id}|${d}" title="Descargar boleta de reintegro"><svg class="ico"><use href="#i-check"/></svg>4 · Reintegro ${esc(rt.numero||"")} · Boleta PDF</button>`;
      } else {
        const lbl1= rnd>1? "Solicitud de gasto (diferencia)" : "Solicitud de gasto PDF";
        const s1= rest<=0.005? "done" : (g? "done":"now");
        acts+=`<button type="button" class="btn small step-btn ${s1}" data-gasto="${r.s.id}|${d}" ${(g||rest<=0.005||lock)?"disabled":""} title="${g?"Solicitud generada el "+esc(String(g.generado||"").slice(0,10)):"Solicitud de gasto ZR: pide ruta y piloto"}"><svg class="ico"><use href="#${(g||rest<=0.005)?"i-check":"i-doc"}"/></svg>1 · ${rest<=0.005||g?"Solicitud generada":lbl1}</button>`;
        const win=regWindow(g); const s2= rest<=0.005? "done" : (g&&win.ok? "now":"off");
        if(g && win.expired && rest>0.005 && !lock) acts+=`<button type="button" class="btn small step-btn warnb" data-extreq="${r.s.id}|${d}" title="${esc(win.why)}"><svg class="ico"><use href="#i-alert"/></svg>2 · Plazo vencido · Solicitar habilitación</button>`; else
        acts+=`<button type="button" class="btn small step-btn ${s2}" data-regzr="${r.s.id}|${d}" ${g&&win.ok&&rest>0.005&&!lock?"":"disabled"} title="${rest<=0.005?"Pago registrado":!g?"Genere primero la solicitud de gasto":win.ok?`Disponible ${win.hrs} h más (hasta ${pad(win.lim.getDate())}/${pad(win.lim.getMonth()+1)} ${pad(win.lim.getHours())}:${pad(win.lim.getMinutes())})`:esc(win.why)}"><svg class="ico"><use href="#${rest<=0.005?"i-check":"i-plus"}"/></svg>2 · ${rest<=0.005?"ZR registrada":(g&&win.extPend?"Habilitación pendiente":(g&&win.pend?"Esperando autorización":(g&&!win.ok?"Plazo vencido (48 h)":(rnd>1?"Registrar diferencia":"Registrar ZR"))))}${g&&win.ok&&rest>0.005?` <span class="win-h">${win.hrs} h</span>`:""}</button>`;
        const anyGasto=Object.entries(S.gastos).some(([k,gg])=>(k===fecha+"_"+r.s.id||k.startsWith(fecha+"_"+r.s.id+"_")) && !(gg.anticipo && gg.estadoAnticipo!=="autorizada"));
        const canRe= rest>0.005 && (r.paid>0 || anyGasto) && !lock;
        reBtn=`<button type="button" class="btn small step-btn reint ${canRe?"":"off"}" data-reint="${r.s.id}|${d}" ${canRe?"":"disabled"} title="${canRe?"Registrar la diferencia como reintegro (devolución por depósito)":rest<=0.005?"El sector ya está liquidado":"Se habilita cuando hay diferencia pendiente con solicitud de gasto generada o pago parcial"}"><svg class="ico"><use href="#i-wallet"/></svg>4 · Reintegro de ZR${canRe?` · ${q(rest)}`:""}</button>`;
      }
      acts+=`<button type="button" class="btn small step-btn ${vg?"done":(settled?"now":"off")}" data-vale="${r.s.id}|${d}" ${settled&&!vg&&!lock?"":"disabled"} title="${vg?"Vale generado el "+esc(String(vg.generado||"").slice(0,10)):settled?"Descargar vale de liquidación":"Se habilita cuando el sector queda liquidado"}"><svg class="ico"><use href="#${vg?"i-check":"i-doc"}"/></svg>3 · ${vg?"Vale generado":"Vale de liquidación"}</button>`;
      acts+=reBtn;
    }
    const gTxt = rt? `<small class="g-ok" style="color:var(--info)">Reintegro ${esc(rt.numero||"")} · ${q(rt.monto)} · recibo ${esc(rt.recibo||"")} (${esc(rt.banco||"")})</small>` : g? `<small class="g-ok" ${g.anticipo&&g.estadoAnticipo!=="autorizada"?'style="color:var(--warn)"':""}>${g.anticipo?(g.estadoAnticipo==="autorizada"?"Anticipo autorizado":"Anticipo pendiente de autorización"):"Solicitud de gasto"} ${esc(g.correlativo||"")} · ruta ${esc(g.ruta||"—")} · ${esc(g.piloto||"—")}</small>` : "";
    return `<div class="dr dr-${st.k}"><div class="dr-top"><div class="dr-name"><span class="corr-badge">${esc(baseCorr(r.s))}</span>${esc(r.s.nombre)}${r.list.length?`<small>Pago ${r.list.map(p=>esc(p.correlativo)).join(", ")}</small>`:""}${gTxt}</div><span class="pill ${st.k}">${st.t}</span></div>
      <div class="dr-nums">${r.b?`<span><em>Tipo de pago</em><b style="font-family:var(--body)">${TIPO_TXT[sectorTipo(r.s)]}</b></span>`:""}<span><em>Presupuesto</em><b>${r.b?q(r.b):"—"}</b></span><span><em>Registrado</em><b>${r.paid?q(r.paid):"—"}</b></span>${partial?`<span><em>Diferencia pendiente</em><b class="c-ne">${q(rest)}</b></span>`:""}${rt?`<span><em>Reintegro</em><b style="color:var(--info)">${q(rt.monto)}</b></span>`:""}</div>
      ${acts?`<div class="dr-acts">${acts}</div>`:""}</div>`; }).join("");
  const tr=round2(rows.reduce((a,r)=>a+(reintOf(fecha,r.s.id)?+reintOf(fecha,r.s.id).monto||0:0),0));
  const df=round2(tb-tp-tr);
  const nProg=rows.filter(r=>r.b).length;
  const nSinG=rows.filter(r=>r.b&&!reintOf(fecha,r.s.id)&&restOf(r)>0.005&&!gastoOf(fecha,r.s.id)).length, nReg=rows.filter(r=>r.b&&settledOf(r)&&!valeOf(fecha,r.s.id)).length;
  return `${nProg?`<div class="vale-bar"><span class="muted">${nProg} pago(s) programado(s)</span><div class="form-actions"><button type="button" class="btn small primary" data-gastos-dia="${d}" ${nSinG&&!S.readOnly?"":"disabled"}><svg class="ico"><use href="#i-doc"/></svg>Solicitudes de gasto del día${nSinG?` (${nSinG})`:""}</button><button type="button" class="btn small" data-vales-dia="${d}" ${nReg&&!S.readOnly?"":"disabled"}><svg class="ico"><use href="#i-doc"/></svg>Vales de liquidación del día${nReg?` (${nReg})`:""}</button></div></div>`:""}<div class="dlist">${body}</div><div class="dr-total"><span><em>Presupuesto del día</em><b>${q(tb)}</b></span><span><em>Registrado</em><b>${q(tp)}</b></span>${tr?`<span><em>Reintegros</em><b style="color:var(--info)">${q(tr)}</b></span>`:""}<span><em>Diferencia</em><b class="${df<0?"neg":""}">${q(df)}</b></span></div>`;
}
function renderDayList(){
  if(!budget()||!S.calDay){ $("#dayTitle").textContent="Detalle del día"; $("#dayList").innerHTML=`<div class="empty-state">Elija un día en el calendario.</div>`; return; }
  const d=S.calDay;
  $("#dayTitle").textContent=`${d} de ${MESES[+S.mes.slice(5)-1]} · ${["domingo","lunes","martes","miércoles","jueves","viernes","sábado"][wdOf(S.mes,d)]}`;
  $("#dayList").innerHTML=dayDetailHTML(d);
}
function renderSector(){
  const pm=paidMap(); let tp=0,tr=0,tprog=0,tcub=0,tri=0;
  const venc=[];
  const rows=sectores().map(s=>{
    const pres=Object.values(s.dias).reduce((a,b)=>a+b,0);
    const paidDays=pm[s.id]||{}; const reg=round2(Object.values(paidDays).reduce((a,v)=>a+v.sum,0));
    const prog=Object.keys(s.dias).length; const cub=Object.keys(s.dias).filter(d=>paidDays[d]?.sum>0).length;
    const rei=round2(Object.keys(s.dias).reduce((a,d)=>a+reintAmt(s.id,+d),0)); tri+=rei;
    Object.keys(s.dias).forEach(d=>{ if(!(paidDays[d]?.sum>0) && S.mes+"-"+pad(d)<todayISO) venc.push({s,d:+d,b:s.dias[d]}); });
    const extra=Object.keys(paidDays).filter(d=>!s.dias[d]).length;
    tp+=pres; tr+=reg; tprog+=prog; tcub+=cub;
    const diff=round2(pres-reg-rei);
    let st;
    if(reg===0) st={k:"neutral",t:"Sin registros"};
    else if(extra) st={k:"crit",t:"Pago fuera de fecha"};
    else if(diff<-0.005) st={k:"crit",t:"Excede"};
    else if(Math.abs(diff)<0.005) st={k:"ok",t:"Completo"};
    else st={k:"info",t:"En curso"};
    const open=S.openSector===s.id;
    const main=`<tr class="clickable" data-sec="${s.id}" aria-expanded="${open}"><td><div class="sector-name"><span class="corr-badge">${esc(baseCorr(s))}</span>${esc(s.nombre)}</div>${s.nota?`<div class="sector-note">${esc(s.nota)}</div>`:""}</td>
      <td class="r num">${q(pres)}</td><td class="r num">${q(reg)}</td><td class="r num" style="color:var(--info)">${rei?q(rei):"—"}</td><td class="r num ${diff<0?"neg":""}">${q(diff)}</td>
      <td class="r num">${pres?(reg/pres*100).toFixed(0):0}%</td><td class="r num">${cub}/${prog}</td><td><span class="pill ${st.k}">${st.t}</span></td></tr>`;
    let det="";
    if(open){
      const days=[...new Set([...Object.keys(s.dias),...Object.keys(paidDays)].map(Number))].sort((a,b)=>a-b);
      det=`<tr class="detail"><td colspan="8"><div class="chips">${days.map(d=>{const b=s.dias[d]||0,p=paidDays[d]?.sum||0,stt=statusFor(b,p,d,paidDays[d]?.list);
        return `<div class="chip ${stt.k==="neutral"?"":stt.k}"><span class="d">${d} ${MESES[+S.mes.slice(5)-1].slice(0,3)} · ${WD[wdOf(S.mes,d)]}</span><span class="num muted">Presup. ${b?q(b):"—"}</span><span class="num">Reg. ${p?q(p):"—"}</span>${reintAmt(s.id,d)?`<span class="num" style="color:var(--info)">Reint. ${q(reintAmt(s.id,d))}</span>`:""}<span class="pill ${stt.k}" style="justify-self:start;margin-top:3px">${stt.t}</span></div>`;}).join("")}</div></td></tr>`;
    }
    return main+det;
  }).join("");
  const tdiff=round2(tp-tr-tri);
  $("#tblSector").innerHTML = `<thead><tr><th>Sector</th><th class="r">Presupuesto</th><th class="r">Registrado</th><th class="r">Reintegro</th><th class="r">Diferencia</th><th class="r">%</th><th class="r">Pagos</th><th>Estado</th></tr></thead>
   <tbody>${rows||`<tr><td colspan="8" class="empty-state">Sin presupuesto cargado.</td></tr>`}</tbody>
   <tfoot><tr><td>Total</td><td class="r num">${q(tp)}</td><td class="r num">${q(tr)}</td><td class="r num" style="color:var(--info)">${tri?q(round2(tri)):"—"}</td><td class="r num ${tdiff<0?"neg":""}">${q(tdiff)}</td><td class="r num">${tp?(tr/tp*100).toFixed(0):0}%</td><td class="r num">${tcub}/${tprog}</td><td></td></tr></tfoot>`;
  venc.sort((a,b)=>a.d-b.d);
  $("#alerts").hidden=true; if(0)
  $("#alerts").innerHTML = venc.length? `<div class="alert-head"><svg class="ico"><use href="#i-alert"/></svg>${venc.length} pagos programados con fecha pasada y sin registro</div>` + venc.slice(0,8).map(v=>`<div class="alert-row"><span><strong>${v.d} de ${MESES[+S.mes.slice(5)-1]}</strong> · ${esc(v.s.nombre)}</span><span class="num">${q(v.b)}</span></div>`).join("") + (venc.length>8?`<div class="muted" style="font-size:12.5px">…y ${venc.length-8} más. Vea el calendario en Registrar pago.</div>`:"") : "";
  document.querySelectorAll("#tblSector tr.clickable").forEach(tr=>tr.onclick=()=>{ S.openSector = S.openSector===tr.dataset.sec? null : tr.dataset.sec; renderSector(); });
}
function renderCal(){
  if(!budget()){ $("#cal").innerHTML=""; return; }
  const n=daysIn(S.mes); const first=wdOf(S.mes,1); const pm=paidMap();
  const order=[1,2,3,4,5,6,0]; // L..D
  let html=order.map(i=>`<div class="wd">${["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][i]}</div>`).join("");
  const lead=(first+6)%7; for(let i=0;i<lead;i++) html+=`<div class="day empty" aria-hidden="true"></div>`;
  if(!S.calDay){ S.calDay = todayISO.slice(0,7)===S.mes? +todayISO.slice(8) : 1; }
  for(let d=1; d<=n; d++){
    let b=0,p=0,ri=0; for(const s of sectores()){ b+=s.dias[d]||0; p+=pm[s.id]?.[d]?.sum||0; ri+=s.dias[d]?reintAmt(s.id,d):0; }
    let k="none";
    if(b||p){
      let anyCrit=false,anyWarn=false,allOk=true,anyPaid=false,anyPend=false;
      for(const s of sectores()){ const bb=s.dias[d]||0, pp=pm[s.id]?.[d]?.sum||0; if(!bb&&!pp) continue; const st=statusFor(bb,pp,d,pm[s.id]?.[d]?.list);
        if(st.k==="crit") anyCrit=true; if(st.k==="warn") anyWarn=true; if(st.k!=="ok"&&st.k!=="info") allOk=false; if(pp) anyPaid=true; if(st.k==="neutral") anyPend=true; }
      k = anyCrit? "crit" : anyWarn? "warn" : allOk? "ok" : "pend";
    }
    const iso=S.mes+"-"+pad(d);
    html+=`<button type="button" class="day ${k} ${d===S.calDay?"sel":""} ${iso===todayISO?"today":""}" data-d="${d}" aria-label="Día ${d}"><span class="n">${d}</span>${b?`<span class="b">P ${Math.round(b).toLocaleString("es-GT")}</span>`:""}${p?`<span class="p">R ${Math.round(p).toLocaleString("es-GT")}</span>`:""}${ri?`<span class="p" style="color:var(--warn)">Ri ${Math.round(ri).toLocaleString("es-GT")}</span>`:""}</button>`;
  }
  $("#cal").innerHTML=html;
  $("#calTitle").textContent=`Calendario · ${mesLabel(S.mes)}`;
  document.querySelectorAll("#cal .day[data-d]").forEach(b=>b.onclick=()=>{ S.calDay=+b.dataset.d; renderCal(); renderDailyChart(); if(innerWidth<1100) $("#dayList").scrollIntoView({block:"start",behavior:"smooth"}); });
  renderDayList();
}
function renderReintTable(){
  const t=$("#tblReint"); if(!t) return;
  const list=reintMes().filter(r=>!S.filtro||r.sectorId===S.filtro).sort((a,b)=>cmpCorr(a.corrSector,b.corrSector)||String(a.fecha).localeCompare(String(b.fecha)));
  if(!list.length){ t.innerHTML=`<tbody><tr><td class="empty-state">Sin reintegros en ${esc(mesLabel(S.mes))}.</td></tr></tbody>`; return; }
  const fd=x=>x?x.split("-").reverse().join("/"):"—"; let tot=0;
  t.innerHTML=`<thead><tr><th>No.</th><th>Fecha prog.</th><th>Sector</th><th>Pagos ejecutados</th><th class="r">Presup.</th><th class="r">Ejecutado</th><th class="r">Reintegro</th><th>Recibo · banco</th><th>Evidencia</th><th></th></tr></thead><tbody>${list.map(r=>{ tot+=(+r.monto||0); const d=+r.fecha.slice(8,10);
    return `<tr><td class="num"><b>${esc(r.numero)}</b><div class="sub-l">${fd(r.fechaRegistro)}</div></td><td class="num">${fd(r.fecha)}</td><td><div class="sector-name"><span class="corr-badge">${esc(r.corrSector||"")}</span>${esc(r.sectorNombre)}</div></td><td class="num" style="font-size:12px">${(r.pagos||[]).map(p=>esc(p.correlativo)).join(", ")||"—"}</td><td class="r num">${q(r.presupuesto)}</td><td class="r num">${q(r.ejecutado)}</td><td class="r num" style="color:var(--info);font-weight:700">${q(r.monto)}<div class="sub-l" style="font-family:var(--body);font-weight:400">${r.tipoMonto==="total"?"Total del día":"Diferencia"}</div></td><td class="num">${esc(r.recibo)}<div class="sub-l" style="font-family:var(--body)">${esc(r.banco)}</div></td><td>${r.evidencia?.id?`<a href="/_blob/${esc(r.evidencia.id)}" target="_blank" rel="noopener">Ver boleta</a>`:"—"}</td><td style="white-space:nowrap"><button class="btn small" type="button" data-reint-pdf="${esc(r.sectorId)}|${d}">Boleta PDF</button>${S.P?.admin&&!S.readOnly?` <button class="btn small ghost danger-ghost icon-only" type="button" data-rdel="${esc(r.fecha+"_"+r.sectorId)}" title="Eliminar reintegro" aria-label="Eliminar reintegro ${esc(r.numero)}"><svg class="ico"><use href="#i-trash"/></svg></button>`:""}</td></tr>`; }).join("")}</tbody>
   <tfoot><tr><td colspan="6">Total · ${list.length} reintegro(s)</td><td class="r num">${q(round2(tot))}</td><td colspan="3"></td></tr></tfoot>`;
  t.querySelectorAll("[data-rdel]").forEach(b=>b.onclick=async()=>{ const id=b.dataset.rdel; const r=S.reint[id]; if(!r) return; if(!(await askAdminPass(`Eliminar el reintegro ${r.numero||""} de ${r.sectorNombre||""} (${q(+r.monto)}).`))) return;
    try{ if(S.db) await S.db.doc("reintegros/"+id).delete(); delete S.reint[id]; toast("Reintegro eliminado"); logEvent("eliminacion",r.mes||r.fecha.slice(0,7),`Reintegro ${r.numero||""} eliminado · ${r.sectorNombre} · ${q(+r.monto)}`); safeRender(); }catch(e){ toast("No se pudo eliminar el reintegro"); } });
}
function renderPagos(){
  renderReintTable();
  const fs=$("#filtroSector"); fs.innerHTML=`<option value="">Todos los sectores</option>`+sectores().map(s=>`<option value="${s.id}" ${S.filtro===s.id?"selected":""}>${esc(secLabel(s))}</option>`).join("");
  const pm=paidMap();
  const list=pagosMes().filter(p=>!S.filtro||p.sectorId===S.filtro).sort((a,b)=> cmpCorr(a.correlativo,b.correlativo) || String(a.fechaRetiro).localeCompare(String(b.fechaRetiro)));
  if(!list.length){ $("#tblPagos").innerHTML=`<tbody><tr><td class="empty-state">No hay pagos registrados para ${esc(mesLabel(S.mes))}${S.filtro?" en este sector":""}. Use “Registrar pago”.</td></tr></tbody>`; return; }
  let tot=0; const seen=new Set(); let presTot=0;
  for(const p of list){ const k=p.sectorId+"|"+p.fechaRetiro; if(seen.has(k)) continue; seen.add(k); presTot+=secById(p.sectorId)?.dias[dayOf(p)]||0; }
  for(const r of reintMes().filter(r=>!S.filtro||r.sectorId===S.filtro)){ const k=r.sectorId+"|"+r.fecha; if(seen.has(k)) continue; seen.add(k); presTot+=+r.presupuesto||0; }
  presTot=round2(presTot);
  const reintTot=round2(reintMes().filter(r=>!S.filtro||r.sectorId===S.filtro).reduce((a,r)=>a+(+r.monto||0),0));
  const adm=!!S.P?.admin && !S.readOnly;
  const rows=list.map(p=>{ tot+=(+p.monto||0); const d=dayOf(p); const s=secById(p.sectorId); const b=s?.dias[d]||0; const agg=pm[p.sectorId]?.[d]?.sum||0; const st=statusFor(b,agg,d,pm[p.sectorId]?.[d]?.list);
    const conf=S.confirmDel===p.id;
    const fd=x=>x?x.split("-").reverse().join("/"):"—";
    return `<tr><td class="num">${fd(p.fechaRetiro)}<div class="sub-l">Reg. ${fd(p.fechaRegistro)}</div></td><td class="num">${esc(p.correlativo)}</td><td><div class="sector-name">${esc(s?.nombre||p.sectorNombre||"—")}</div></td><td class="num">${esc(p.ruta||"—")}<div class="sub-l" style="font-family:var(--body)">${esc(p.piloto||"—")}</div></td><td style="white-space:nowrap"><span class="pill ${p.tipoPago==="mano"?"warn":"info"}" style="${p.tipoPago||p.banco?"":"display:none"}">${esc((p.tipoPago==="mano"?"Mano a mano":p.tipoPago==="deposito"?"Depósito":(p.banco?"Depósito":"—")))}</span>${!p.tipoPago&&!p.banco?"—":""}${(p.evidencias?.length>1)?`<div class="auth-tag">${p.evidencias.map((e,i)=>e.id?`<a href="/_blob/${esc(e.id)}" target="_blank" rel="noopener">Foto ${i+1}</a>`:"").join(" · ")}</div>`:(p.evidenciaFoto?.id?`<div class="auth-tag"><a href="/_blob/${esc(p.evidenciaFoto.id)}" target="_blank" rel="noopener">Ver foto</a></div>`:"")}</td><td class="num">${esc(p.boleta||"—")}<div class="sub-l" style="font-family:var(--body)">${esc(p.banco||"—")}</div></td>
    <td class="r num">${q(+p.monto)}</td><td class="r num">${b?q(b):"—"}</td><td><span class="pill ${st.k}">${st.t}</span>${p.autorizacion?`<div class="auth-tag"><svg class="ico"><use href="#i-shield"/></svg>${esc(p.autorizacion.numero||"")}${p.autorizacion.evidenciaId?` · <a href="/_blob/${esc(p.autorizacion.evidenciaId)}" target="_blank" rel="noopener">PDF</a>`:""}</div>`:""}</td>${adm?`<td><button class="btn small ghost danger-ghost icon-only" type="button" data-pdelpago="${esc(p.id)}" title="Eliminar ${esc(p.correlativo)}" aria-label="Eliminar ${esc(p.correlativo)}"><svg class="ico"><use href="#i-trash"/></svg></button></td>`:""}
</tr>`;}).join("");
  $("#tblPagos").innerHTML=`<thead><tr><th>Retiro ·<br>registro</th><th>Correl.</th><th>Sector</th><th>Ruta ·<br>piloto</th><th>Motivo<br>de pago</th><th>Boleta ·<br>banco</th><th class="r">Monto<br>registrado</th><th class="r">Presup.<br>día</th><th>Estado</th>${adm?"<th></th>":""}</tr></thead><tbody>${rows}</tbody>
   <tfoot><tr><td colspan="6">Total · ${list.length} pago(s)</td><td class="r num">${q(tot)}</td><td class="r num">${q(presTot)}</td><td class="num ${presTot-tot-reintTot<0?"neg":""}" style="font-weight:600">${reintTot?`Reint. ${q(reintTot)}<br>`:""}Dif. ${q(round2(presTot-tot-reintTot))}</td>${adm?"<td></td>":""}</tr></tfoot>`;
  $("#tblPagos").querySelectorAll("[data-pdelpago]").forEach(b=>b.onclick=async()=>{ const p=S.pagos.find(x=>x.id===b.dataset.pdelpago); if(!p) return; if(await askAdminPass(`Eliminar el pago ${p.correlativo} de ${p.sectorNombre||""} (${q(+p.monto)}). Si ya tenía vale de liquidación, el vale se anula para volver a generarlo.`)) delPago(p.id); });
  $("#tblPagos").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>startEdit(b.dataset.edit));
  $("#tblPagos").querySelectorAll("[data-ask]").forEach(b=>b.onclick=()=>{S.confirmDel=b.dataset.ask;renderPagos();});
  $("#tblPagos").querySelectorAll("[data-nodel]").forEach(b=>b.onclick=()=>{S.confirmDel=null;renderPagos();});
  $("#tblPagos").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>delPago(b.dataset.del));
}
function renderBud(){
  const b=budget(); if(!b){ $("#tblBud").innerHTML=""; return; }
  $("#budTitle").textContent=`Presupuesto · ${mesLabel(S.mes)}`; $("#budSrc").textContent=b.fuente||"";
  let t=0;
  $("#tblBud").innerHTML=`<thead><tr><th>Correlativo</th><th>Sector</th><th>Tipo de pago</th><th>Días de pago</th><th class="r">Monto por pago</th><th class="r">Total mes</th></tr></thead><tbody>${sectores().map(s=>{const ds=Object.keys(s.dias).map(Number).sort((a,c)=>a-c); const tot=ds.reduce((a,d)=>a+s.dias[d],0); t+=tot; const amts=[...new Set(ds.map(d=>s.dias[d]))];
    return `<tr><td><input type="text" class="num corr-in" style="width:104px!important" id="corr-${s.id}" data-sid="${s.id}" value="${esc(baseCorr(s))}" aria-label="Correlativo de ${esc(s.nombre)}" ${S.readOnly||!S.P?.admin?"disabled":""} title="${S.P?.admin?"":"Solo un administrador puede modificar"}"></td><td><div class="sector-name">${esc(s.nombre)}</div>${s.nota?`<div class="sector-note">${esc(s.nota)}</div>`:""}</td><td><select class="tipo-in" id="tipo-${s.id}" data-sid="${s.id}" aria-label="Tipo de pago de ${esc(s.nombre)}" ${S.readOnly||!S.P?.admin?"disabled":""} style="min-width:140px"><option value="deposito" ${sectorTipo(s)==="deposito"?"selected":""}>Depósito</option><option value="mano" ${sectorTipo(s)==="mano"?"selected":""}>Mano a mano</option></select></td><td class="num">${ds.join(", ")}</td><td class="r num">${amts.map(q).join(" / ")}</td><td class="r num">${q(tot)}</td></tr>`;}).join("")}</tbody><tfoot><tr><td colspan="5">Total</td><td class="r num">${q(t)}</td></tr></tfoot>`;
  document.querySelectorAll(".tipo-in").forEach(sel=>sel.onchange=()=>saveTipoSector(sel));
}
async function saveTipoSector(sel){
  const b=budget(); if(!b) return; const s=b.sectores.find(x=>x.id===sel.dataset.sid); if(!s) return;
  const doc=JSON.parse(JSON.stringify(b)); doc.sectores.forEach(x=>{ x.corr=baseCorr(x,doc.sectores); }); doc.sectores.find(x=>x.id===s.id).tipoPago=sel.value;
  try{ if(S.db) await S.db.doc("presupuestos/"+S.mes).set(doc); S.budgets[S.mes]=doc; toast(`${s.nombre}: pago por ${TIPO_TXT[sel.value]}`); safeRender(); if($("#fSector").value===s.id){ S.manoEv=null; setTipoFromSector(); applyTipo(); updateSaveState(); } }
  catch(e){ toast("No se pudo guardar el tipo de pago"); sel.value=sectorTipo(s); }
}
async function saveBaseCorr(inp){
  const b=budget(); if(!b) return; let val=inp.value.trim(); const s=b.sectores.find(x=>x.id===inp.dataset.sid); if(!s) return;
  if(!val){ inp.value=baseCorr(s); return; }
  val=normCorr(val); inp.value=val;
  if(b.sectores.some(x=>x.id!==s.id && baseCorr(x,b.sectores).toLowerCase()===val.toLowerCase())){ toast(`El correlativo ${val} ya lo tiene otro sector`); inp.value=baseCorr(s); return; }
  if(val===baseCorr(s)) return;
  const doc=JSON.parse(JSON.stringify(b)); doc.sectores.forEach((x,i)=>{ x.corr=baseCorr(x,doc.sectores); }); doc.sectores.find(x=>x.id===s.id).corr=val;
  try{ if(S.db) await S.db.doc("presupuestos/"+S.mes).set(doc); else S.budgets[S.mes]=doc; toast(`Correlativo de ${s.nombre} actualizado a ${val}`); renderAll(); }
  catch(e){ toast("No se pudo guardar el correlativo"); inp.value=baseCorr(s); }
}
function renderAll(){ renderMesSel(); renderKpis(); renderTabs(); renderForm(); corrPreview(); renderSector(); renderSectorChart(); renderCal(); renderDailyChart(); renderUpcoming(); renderPagos(); renderBud(); renderMeses(); renderAut(); renderPilotos(); renderIndicadores(); try{ renderHistorial(); }catch(e){ console.warn(e); } applyPerms();
  document.querySelectorAll(".corr-in").forEach(i=>i.onchange=()=>saveBaseCorr(i)); }

/* ---------- actions ---------- */
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600); }
function resetForm(){ S.editId=null; S.authOpen=false; $("#fSector").value=""; S.manoEv=null; setTipoFromSector(); applyTipo(); $("#fCorr").value=""; $("#fMonto").value=""; $("#fRuta").value=""; $("#fPiloto").value=""; $("#fBoleta").value=""; $("#fBanco").value=""; $("#frmErr").hidden=true; $("#fRegistro").value=todayISO; renderForm(); try{ resetMulti(); }catch(e){} }
function startEdit(id){
  const p=S.pagos.find(x=>x.id===id); if(!p) return;
  S.editId=id; $("#fRetiro").value=p.fechaRetiro; $("#fRegistro").value=p.fechaRegistro; $("#fCorr").value=p.correlativo; $("#fMonto").value=p.monto; $("#fRuta").value=p.ruta||""; renderPilotoSelect(p.piloto||""); $("#fPiloto").value=p.piloto||""; $("#fBoleta").value=p.boleta||""; $("#fBanco").value=p.banco||"";
  if(p.fechaRetiro.slice(0,7)!==S.mes && S.budgets[p.fechaRetiro.slice(0,7)]) S.mes=p.fechaRetiro.slice(0,7);
  S.tab="registro"; renderAll(); $("#fSector").value=p.sectorId; renderHint(); corrPreview(); $("#fMonto").focus();
}
async function savePago(e){
  e.preventDefault();
  const err=$("#frmErr"); err.hidden=true;
  const rec={ fechaRetiro:$("#fRetiro").value, fechaRegistro:$("#fRegistro").value, correlativo:"", sectorId:$("#fSector").value, monto:round2(parseFloat($("#fMonto").value)), ruta:$("#fRuta").value.trim(), piloto:$("#fPiloto").value, boleta:$("#fBoleta").value.trim(), banco:$("#fBanco").value, tipoPago:tipoPago() };
  if(rec.tipoPago==="mano"){ rec.boleta=""; rec.banco=""; }
  const MI=multiInfo();
  if(MI.multi){ rec.rutas=MI.rutas.map(r=>({ruta:r.ruta,piloto:r.piloto,monto:r.monto,boleta:r.boleta,banco:r.banco})); rec.ruta=MI.rutas.map(r=>r.ruta).join(" / "); rec.piloto=[...new Set(MI.rutas.map(r=>r.piloto))].join(" / "); if(rec.tipoPago==="mano"){ rec.boleta=""; rec.banco=""; } }
  if(rec.tipoPago==="deposito" && MI.deps){ rec.depositos=MI.deps.map(d=>({boleta:d.boleta,banco:d.banco,monto:d.monto})); rec.boleta=MI.deps.map(d=>d.boleta).join(", "); rec.banco=[...new Set(MI.deps.map(d=>d.banco))].join(", "); }
  if(rec.fechaRegistro!==todayISO){ rec.fechaRegistro=todayISO; $("#fRegistro").value=todayISO; }
  { const g=gastoOf(rec.fechaRetiro,rec.sectorId); const w=regWindow(g); if(!w.ok){ err.textContent=w.why; err.hidden=false; return; } }
  const miss=[]; if(!rec.fechaRetiro) miss.push("fecha de retiro"); if(!rec.fechaRegistro) miss.push("fecha de registro"); if(!rec.sectorId) miss.push("sector"); if(!(rec.monto>0)) miss.push("monto mayor a cero"); miss.push(...bankMissing());
  if(!miss.length && rec.tipoPago==="deposito"){
    const mine=rec.depositos||[{boleta:rec.boleta,banco:rec.banco}]; const key=d=>d.banco+"|"+String(d.boleta||"").toLowerCase();
    const seen=new Set(); for(const d of mine){ if(seen.has(key(d))){ err.textContent=`La boleta ${d.boleta} de ${d.banco} está repetida en este registro.`; err.hidden=false; return; } seen.add(key(d)); }
    for(const p of S.pagos){ if(p.id===S.editId) continue; const theirs=p.depositos||[{boleta:p.boleta,banco:p.banco}];
      const hit=mine.find(d=>theirs.some(t=>key(t)===key(d))); if(hit){ err.textContent=`La boleta ${hit.boleta} de ${hit.banco} ya está registrada en el pago ${p.correlativo} (${p.fechaRetiro}).`; err.hidden=false; return; } } }
  if(miss.length){ err.textContent="Falta: "+miss.join(", ")+"."; err.hidden=false; return; }
  { const mes=rec.fechaRetiro.slice(0,7); const old=S.editId&&S.pagos.find(p=>p.id===S.editId);
    rec.correlativo = (old && old.sectorId===rec.sectorId && old.fechaRetiro.slice(0,7)===mes)? old.correlativo : nextCorr(rec.sectorId, mes, S.editId);
    const dup=S.pagos.find(p=>p.id!==S.editId && p.fechaRetiro?.slice(0,7)===mes && String(p.correlativo).toLowerCase()===rec.correlativo.toLowerCase());
    if(!rec.correlativo || dup){ err.textContent="No se pudo asignar un correlativo único para este sector. Revise los correlativos en la pestaña Presupuesto."; err.hidden=false; return; } }
  const bud=S.budgets[rec.fechaRetiro.slice(0,7)]; const sec=(bud?.sectores||sectores()).find(s=>s.id===rec.sectorId);
  rec.sectorNombre=sec?.nombre||""; rec.mes=rec.fechaRetiro.slice(0,7);
  const bm=budgetMatch(); if(!bm.ok){ err.textContent=bm.why; err.hidden=false; return; }
  { const s0=secById(rec.sectorId); const base=[["Sector",`${baseCorr(s0)} · ${rec.sectorNombre}`],["Correlativo",rec.correlativo],["Fecha de retiro",rec.fechaRetiro.split("-").reverse().join("/")],["No. de ruta",rec.ruta],["Piloto",rec.piloto],["Tipo de pago",TIPO_TXT[rec.tipoPago]]];
    if(rec.rutas){ const evs=[]; for(let i=0;i<rec.rutas.length;i++){ const r=rec.rutas[i];
        const ev=await askEvidence({tipo:rec.tipoPago, cells:[["Sector",`${baseCorr(s0)} · ${rec.sectorNombre}`],["Correlativo",rec.correlativo],["Fecha de retiro",rec.fechaRetiro.split("-").reverse().join("/")],["Ruta",`${r.ruta} (${i+1} de ${rec.rutas.length})`],["Piloto",r.piloto],["Tipo de pago",TIPO_TXT[rec.tipoPago]],...(rec.tipoPago==="deposito"?[["Boleta · banco",`${r.boleta} · ${r.banco}`]]:[]),["Monto de la ruta",q(r.monto)],["Monto total",q(rec.monto)]]});
        if(!ev){ toast(`Pago no guardado: falta la imagen de la ruta ${r.ruta}`); return; } evs.push({...ev,ruta:r.ruta,boleta:r.boleta||"",banco:r.banco||""}); rec.rutas[i].evidencia=ev; if(rec.depositos?.[i]) rec.depositos[i].evidencia=ev; }
      rec.evidencias=evs; rec.evidenciaFoto=evs[0]; }
    else if(rec.depositos){ const evs=[]; for(let i=0;i<rec.depositos.length;i++){ const d=rec.depositos[i];
        const ev=await askEvidence({tipo:"deposito", cells:[...base,["Depósito",`${i+1} de ${rec.depositos.length}`],["Boleta · banco",`${d.boleta} · ${d.banco}`],["Monto del depósito",q(d.monto)],["Monto total",q(rec.monto)]]});
        if(!ev){ toast(`Pago no guardado: falta la imagen del depósito ${i+1}`); return; } evs.push({...ev,boleta:d.boleta,banco:d.banco}); rec.depositos[i].evidencia=ev; }
      rec.evidencias=evs; rec.evidenciaFoto=evs[0]; }
    else { const ev=await askEvidence({tipo:rec.tipoPago, cells:[...base,["Monto",q(rec.monto)],...(rec.tipoPago==="deposito"?[["Boleta · banco",`${rec.boleta} · ${rec.banco}`]]:[])]});
      if(!ev){ toast("Pago no guardado: falta la imagen del comprobante"); return; } rec.evidenciaFoto=ev; } }
  const btn=$("#btnSave"); S.saving=true; btn.disabled=true;
  try{
    if(S.db){
      if(S.editId){ const old=S.pagos.find(p=>p.id===S.editId); await S.db.doc("pagos/"+S.editId).set({...rec, creado:old?.creado||new Date().toISOString(), modificado:new Date().toISOString()}); }
      else await S.db.collection("pagos").add({...rec, creado:new Date().toISOString()});
    } else {
      if(S.editId){ const i=S.pagos.findIndex(p=>p.id===S.editId); S.pagos[i]={...S.pagos[i],...rec}; }
      else S.pagos.push({...rec,id:"local"+Date.now(),creado:new Date().toISOString()});
    }
    toast(S.editId? "Cambios guardados" : `Pago ${rec.correlativo} guardado`);
    logEvent("pago",rec.mes,`Pago ${rec.correlativo} registrado · ${rec.sectorNombre} · ${q(rec.monto)} · ${TIPO_TXT[rec.tipoPago]||""}${rec.rutas?` · ${rec.rutas.length} rutas (${rec.rutas.map(r=>r.ruta).join(", ")})`:rec.ruta?` · ruta ${rec.ruta}`:""}${rec.boleta?` · boleta ${rec.boleta} ${rec.banco}`:""}`);
    resetForm(); renderAll();
  }catch(ex){
    if(ex?.code==="invalid_argument"){ S.readOnly=true; err.textContent="Su acceso a esta página es de solo lectura; no puede registrar pagos."; }
    else if(ex?.code==="quota_exceeded"){ err.textContent="Se alcanzó el límite de registros guardados. Elimine pagos antiguos para continuar."; }
    else err.textContent="No se pudo guardar. Revise su conexión e intente de nuevo.";
    err.hidden=false;
  }finally{ S.saving=false; updateSaveState(); }
}
async function delPago(id){
  if(!S.P?.admin) return;
  const p=S.pagos.find(x=>x.id===id); const vid=p? p.fechaRetiro+"_"+p.sectorId : null;
  try{ if(S.db){ await S.db.doc("pagos/"+id).delete(); if(vid&&S.vales[vid]) await S.db.doc("vales/"+vid).delete(); }
    S.pagos=S.pagos.filter(x=>x.id!==id); if(vid) delete S.vales[vid]; S.confirmDel=null; toast("Pago eliminado"); if(p) logEvent("eliminacion",p.fechaRetiro.slice(0,7),`Pago ${p.correlativo} eliminado · ${p.sectorNombre} · ${q(+p.monto)}`); renderAll(); }
  catch(ex){ S.confirmDel=null; toast("No se pudo eliminar el pago"); renderPagos(); }
}

/* ---------- import ---------- */
function parseWorkbook(wb){
  for(const name of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});
    let h=-1,tc=-1;
    for(let r=0;r<rows.length && h<0;r++) for(let c=0;c<(rows[r]||[]).length;c++){ if(typeof rows[r][c]==="string" && rows[r][c].trim().toLowerCase()==="territorio"){h=r;tc=c;break;} }
    if(h<1) continue;
    // Días: la secuencia 1,2,3… más larga en la fila de arriba de "Territorio" (o en la misma fila)
    const dayNum=v=>{ if(typeof v==="number"){ if(v>=1&&v<=31&&Number.isInteger(v)) return v; if(v>30000&&v<80000){ const d=new Date(Math.round((v-25569)*864e5)); return d.getUTCDate(); } return null; } if(typeof v==="string"&&/^\s*\d{1,2}\s*$/.test(v)){ const n=+v; return n>=1&&n<=31?n:null; } if(v instanceof Date) return v.getDate(); return null; };
    const findRun=row=>{ let best=[]; for(let c=tc+1;c<(row||[]).length;c++){ if(dayNum(row[c])!==1) continue; const run=[{c,d:1}]; for(let k=c+1;k<row.length;k++){ const n=dayNum(row[k]); if(n===run[run.length-1].d+1) run.push({c:k,d:n}); else break; } if(run.length>best.length) best=run; } return best; };
    let dayCols=findRun(rows[h-1]); if(dayCols.length<28){ const alt=findRun(rows[h]); if(alt.length>dayCols.length) dayCols=alt; } if(h>=2&&dayCols.length<28){ const alt=findRun(rows[h-2]); if(alt.length>dayCols.length) dayCols=alt; }
    if(dayCols.length<28) continue;
    // Tipo de pago: columna D ("Cl") — la columna entre Territorio y el día 1, o encabezada como tipo/pago
    const hdr=rows[h]||[]; let tipoCol=-1;
    for(let c=tc+1;c<dayCols[0].c;c++){ const t=String(hdr[c]??"").trim().toLowerCase(); if(/^(cl|tipo|tipo de pago|forma de pago|pago)$/.test(t)){ tipoCol=c; break; } }
    if(tipoCol<0 && dayCols[0].c>tc+1) tipoCol=tc+1;
    // Leyenda sobre el encabezado: etiqueta en "Territorio" y código en la columna de tipo (ej. Depósito 2 / Mano a mano 1)
    // Solo se lee el valor de la columna D en cada fila de sector ("Deposito" / "Mano a Mano"). No se usa la leyenda de C1/C2.
    const tipoOf=v=>{ if(v==null||String(v).trim()==="") return null; const t=pilKey(v); if(/mano/.test(t)||t==="m"||t==="mm") return "mano"; if(/dep/.test(t)||t==="d") return "deposito"; return null; };
    const tipoHdr=tipoCol>=0? String(rows[h]?.[tipoCol]??"").trim() : "";
    const secs=[];
    for(let r=h+1;r<rows.length;r++){
      const nm=rows[r]?.[tc]; if(nm==null || String(nm).trim()==="") { if(secs.length) break; else continue; }
      const nms=String(nm).replace(/\s+/g," ").trim(); if(/^(rentas|plan|diferencia|total)/i.test(nms)) break;
      const dias={}; for(const {c,d} of dayCols){ const v=rows[r][c]; if(typeof v==="number" && v) dias[d]=v; }
      const nota=rows[r][0]!=null? String(rows[r][0]).replace(/\s+/g," ").trim():"";
      const tv=tipoCol>=0? rows[r][tipoCol] : null; const tp=tipoOf(tv);
      secs.push({id:"s"+pad(secs.length+1),nombre:nms,dias,nota, ...(tp?{tipoPago:tp}:{}), tipoCodigo: tv==null?"":String(tv).trim()});
    }
    if(secs.length){ secs.meta={tipoCol, tipoHdr}; return secs; }
  }
  return null;
}
const normName = n => String(n||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
function mesFromName(name){
  const m=name.match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*[_\s.-]*(\d{2,4})/i);
  if(!m) return "";
  const idx=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"].indexOf(m[1].slice(0,3).toLowerCase()); let y=+m[2]; if(y<100) y+=2000;
  return y+"-"+pad(idx+1);
}
/* Reusa id y correlativo de cada sector del mes cargado más reciente (por nombre), para que los correlativos sigan iguales mes a mes */
function alignSectors(secs, mes){
  const prevKey=Object.keys(S.budgets).filter(k=>k!==mes).sort().reverse().find(k=>k<mes) || Object.keys(S.budgets).filter(k=>k!==mes).sort().pop();
  const same=S.budgets[mes]; const ref=same||S.budgets[prevKey];
  const refList=ref?.sectores||[];
  const byName=new Map(refList.map((x,i)=>[normName(x.nombre),{id:x.id,corr:baseCorr(x,refList),tipoPago:x.tipoPago}]));
  const usedIds=new Set(), usedCorr=new Set();
  const out=secs.map(x=>({...x}));
  out.forEach(x=>{ const m=byName.get(normName(x.nombre)); if(m && !usedIds.has(m.id)){ x.id=m.id; x.corr=m.corr; if(!x.tipoPago && m.tipoPago) x.tipoPago=m.tipoPago; x.previo=true; usedIds.add(m.id); usedCorr.add(m.corr); } });
  let nid=1, nc=1;
  for(const x of out){ if(x.previo) continue;
    while(usedIds.has("s"+pad(nid)) || refList.some(r=>r.id==="s"+pad(nid))) nid++; x.id="s"+pad(nid); usedIds.add(x.id);
    while(usedCorr.has(fmtCorr(nc)) || refList.some((r)=>baseCorr(r,refList)===fmtCorr(nc))) nc++; x.corr=fmtCorr(nc); usedCorr.add(x.corr); x.nuevo=!!refList.length; }
  const dropped=refList.filter(r=>!out.some(x=>x.id===r.id));
  out.forEach(x=>{ delete x.previo; });
  return {secs:out, refMes: same? mes : prevKey, dropped};
}
function renderImpPreview(){
  const pv=$("#impPreview"), er=$("#impErr");
  if(!S.imp){ pv.hidden=true; $("#btnImp").disabled=true; $("#btnImpCancel").hidden=true; return; }
  const mes=$("#impMes").value;
  const valid=/^\d{4}-\d{2}$/.test(mes);
  const al= valid? alignSectors(S.imp.raw, mes) : {secs:S.imp.raw, dropped:[]};
  S.imp.secs=al.secs;
  const tot=al.secs.reduce((a,x)=>a+Object.values(x.dias).reduce((p,c)=>p+c,0),0);
  const prog=al.secs.reduce((a,x)=>a+Object.keys(x.dias).length,0);
  const warns=[];
  if(!valid) warns.push("Indique el mes al que corresponde el presupuesto.");
  if(valid){
    const maxDay=Math.max(0,...al.secs.flatMap(x=>Object.keys(x.dias).map(Number)));
    if(maxDay>daysIn(mes)) warns.push(`Hay montos en el día ${maxDay}, pero ${mesLabel(mes)} tiene ${daysIn(mes)} días. Revise que el mes sea el correcto.`);
    if(S.budgets[mes]){ const n=S.pagos.filter(p=>p.fechaRetiro?.slice(0,7)===mes).length; warns.push(`Ya existe un presupuesto de ${mesLabel(mes)}; se reemplazará.${n?` Los ${n} pagos registrados se conservan y se volverán a comparar.`:""}`); }
    if(al.dropped.length && S.budgets[mes]) warns.push(`Estos sectores ya no vienen en el archivo: ${al.dropped.map(d=>d.nombre).join(", ")}.`);
  }
  const nuevos=al.secs.filter(x=>x.nuevo).length;
  const md=S.imp.meta||{}; const colL=md.tipoCol>=0? String.fromCharCode(65+md.tipoCol):"—";
  const nMano=al.secs.filter(x=>x.tipoPago==="mano").length, nDep=al.secs.filter(x=>x.tipoPago!=="mano").length, nSin=al.secs.filter(x=>!x.tipoCodigo).length;
  const nBad=al.secs.filter(x=>x.tipoCodigo&&!x.tipoArchivoOk).length;
  const tipoHint=`<div class="hint ${nSin?"warn":""}"><span>Tipo de pago (columna ${colL}${md.tipoHdr?` · “${esc(md.tipoHdr)}”`:""}): <b>${nDep}</b> depósito · <b>${nMano}</b> mano a mano${nSin?` · <b>${nSin}</b> sin dato (se usa la configuración anterior o Depósito)`:""}</span><span class="muted">Se lee el texto de cada sector en la columna D: “Deposito” o “Mano a Mano”.</span></div>`;
  pv.innerHTML=`<div class="hint ok"><span><b>${al.secs.length}</b> sectores · <b>${prog}</b> pagos programados · total <b>${q(tot)}</b>${valid?` · ${esc(mesLabel(mes))}`:""}</span>${nuevos?`<span>${nuevos} sector(es) nuevo(s) respecto al mes anterior; se les asignó correlativo nuevo.</span>`:""}</div>
    ${tipoHint}${warns.map(w=>`<div class="hint warn">${esc(w)}</div>`).join("")}
    <div class="tbl-wrap" style="max-height:320px;overflow:auto"><table><thead><tr><th>Corr.</th><th>Sector</th><th>Tipo de pago</th><th>Días</th><th class="r">Total</th></tr></thead><tbody>${al.secs.map(x=>{const ds=Object.keys(x.dias).map(Number).sort((a,c)=>a-c);return `<tr><td class="num">${esc(x.corr)}${x.nuevo?` <span class="pill info">nuevo</span>`:""}</td><td>${esc(x.nombre)}</td><td style="white-space:nowrap"><span class="pill ${x.tipoPago==="mano"?"warn":"info"}">${x.tipoPago==="mano"?"Mano a mano":"Depósito"}</span>${x.tipoCodigo?` <span class="muted num" style="font-size:11px">(${esc(x.tipoCodigo)})</span>`:""}</td><td class="num">${ds.join(", ")||"—"}</td><td class="r num">${q(ds.reduce((a,d)=>a+x.dias[d],0))}</td></tr>`;}).join("")}</tbody></table></div>`;
  pv.hidden=false; $("#btnImpCancel").hidden=false;
  $("#btnImp").disabled=S.readOnly || !valid;
  $("#btnImp").textContent = valid && S.budgets[mes]? `Reemplazar presupuesto de ${mesLabel(mes)}` : "Guardar presupuesto";
}
function readImpFile(f){
  const er=$("#impErr"); er.hidden=true; S.imp=null; renderImpPreview();
  if(!f) return;
  $("#impFileName").textContent=f.name;
  if(!/\.xls[xm]?$/i.test(f.name)){ er.textContent="El archivo debe ser de Excel (.xlsx)."; er.hidden=false; return; }
  const mm=mesFromName(f.name); if(mm) $("#impMes").value=mm;
  if(typeof XLSX==="undefined"){ er.textContent="No se pudo cargar el lector de Excel. Recargue la página."; er.hidden=false; return; }
  const rd=new FileReader();
  rd.onload=()=>{ try{ const wb=XLSX.read(new Uint8Array(rd.result),{type:"array"}); const secs=parseWorkbook(wb);
      if(secs && secs.every(x=>Object.keys(x.dias).length<=1) && secs.reduce((a,x)=>a+Object.values(x.dias).reduce((p,c)=>p+c,0),0)<secs.length*10){ er.textContent="El archivo no tiene montos por día reconocibles. Revise que la fila de arriba de “Territorio” tenga los días 1 al 31."; er.hidden=false; return; }
      if(!secs){ er.textContent="No encontré la tabla de presupuesto. El archivo debe tener una columna “Territorio” con los días 1–31 en la fila de arriba, igual que el archivo original."; er.hidden=false; return; }
      S.imp={raw:secs,fuente:f.name,meta:secs.meta||{}}; renderImpPreview();
    }catch(ex){ er.textContent="No se pudo leer el archivo. Verifique que sea un Excel válido."; er.hidden=false; } };
  rd.readAsArrayBuffer(f);
}
function onImpFile(){ readImpFile($("#impFile").files[0]); }
function cancelImp(){ S.imp=null; $("#impFile").value=""; $("#impFileName").textContent="Archivo .xlsx"; $("#impErr").hidden=true; renderImpPreview(); }
async function saveImp(){
  const mes=$("#impMes").value, er=$("#impErr"); er.hidden=true;
  if(!S.imp) return; if(cargaLock("presupuesto")){ er.textContent="La carga de presupuesto de este mes ya se realizó. Solo un administrador puede volver a cargar."; er.hidden=false; return; }
  if(!/^\d{4}-\d{2}$/.test(mes)){ er.textContent="Indique el mes al que corresponde el presupuesto."; er.hidden=false; return; }
  const secs=alignSectors(S.imp.raw, mes).secs.map(x=>{ const y={...x}; delete y.nuevo; return y; });
  const doc={mes, titulo:brand()+" · "+mesLabel(mes), fuente:S.imp.fuente, sectores:secs, cargado:new Date().toISOString()};
  const btn=$("#btnImp"); btn.disabled=true;
  try{ if(S.db) await S.db.doc("presupuestos/"+mes).set(doc); else S.budgets[mes]=doc;
    S.budgets[mes]=doc; S.mes=mes; S.calDay=null; cancelImp(); markCarga("presupuesto",mes); toast(`Presupuesto de ${mesLabel(mes)} guardado`); logEvent("config",mes,`Presupuesto cargado · ${doc.fuente||""} · ${secs.length} sectores · ${q(secs.reduce((a,x)=>a+Object.values(x.dias).reduce((p,c)=>p+c,0),0))}`); renderAll();
  }catch(ex){ er.textContent= ex?.code==="invalid_argument"? "No tiene permiso para cargar presupuestos." : "No se pudo guardar el presupuesto. Intente de nuevo."; er.hidden=false; btn.disabled=false; }
}
function mesData(k){
  const pagos=S.pagos.filter(p=>p.fechaRetiro?.slice(0,7)===k);
  const sols=S.sols.filter(x=>x.fechaRetiro?.slice(0,7)===k);
  const gastos=Object.entries(S.gastos).filter(([id,g])=>(g.mes||g.fecha||id).slice(0,7)===k).map(([id])=>id);
  const vales=Object.entries(S.vales).filter(([id,v])=>(v.mes||v.fecha||id).slice(0,7)===k).map(([id])=>id);
  const reints=Object.entries(S.reint).filter(([id,r])=>(r.mes||r.fecha||id).slice(0,7)===k).map(([id])=>id);
  const assets=[...pagos.map(p=>p.evidenciaFoto?.id), ...pagos.flatMap(p=>(p.evidencias||[]).map(e=>e.id)), ...Object.values(S.gastos).filter(g=>(g.mes||g.fecha||"").slice(0,7)===k).map(g=>g.evidenciaCBC?.id), ...sols.map(x=>x.evidencia?.id), ...sols.map(x=>x.evidenciaFoto?.id), ...reints.map(id=>S.reint[id]?.evidencia?.id)].filter(Boolean);
  return {pagos,sols,gastos,vales,reints,assets};
}
function delMesHTML(k){
  const d=mesData(k);
  return `<div class="del-box"><div class="del-head"><svg class="ico"><use href="#i-alert"/></svg><div><b>Eliminar ${esc(mesLabel(k))} y todo su historial</b><small>Esta acción no se puede deshacer. Los demás meses no se modifican.</small></div></div>
    <ul class="del-list"><li>Presupuesto del mes (${S.budgets[k].sectores.length} sectores)</li><li>${d.pagos.length} pago(s) registrado(s)</li><li>${d.gastos.length} solicitud(es) de gasto y ${d.vales.length} vale(s) de liquidación generados</li><li>${d.sols.length} solicitud(es) de autorización</li><li>${d.reints.length} reintegro(s) de ZR</li><li>${d.assets.length} archivo(s) de evidencia (PDF y fotografías)</li></ul>
    ${myClave()?.hash?`<div class="field" style="max-width:320px"><label for="delConfirmTxt">Contraseña de administrador</label><input type="password" class="pw-in" id="delConfirmTxt" autocomplete="current-password"></div>`:`<div class="hint warn">Registre primero su contraseña de administrador en <b>Usuarios y permisos</b>.</div>`}
    <div class="err" id="delMesErr" hidden></div>
    <div class="form-actions"><button class="btn danger-solid" type="button" id="delMesOk" disabled><svg class="ico"><use href="#i-trash"/></svg>Eliminar definitivamente</button><button class="btn ghost" type="button" id="delMesNo">Cancelar</button></div></div>`;
}
async function deleteMes(k){
  if(!k||!S.budgets[k]||!S.P?.admin) return;
  const d=mesData(k); const btn=$("#delMesOk"); btn.disabled=true; btn.textContent="Eliminando…";
  try{
    await saveRespaldo(k);
    logEvent("eliminacion",k,`Mes ${mesLabel(k)} eliminado: ${d.pagos.length} pagos, ${d.gastos.length} solicitudes, ${d.vales.length} vales, ${d.reints.length} reintegros. Se guardó un respaldo en Historial.`);
    if(S.db){
      const ops=[...d.pagos.map(p=>"pagos/"+p.id), ...d.sols.map(x=>"solicitudes/"+x.id), ...d.gastos.map(id=>"gastos/"+id), ...d.vales.map(id=>"vales/"+id), ...d.reints.map(id=>"reintegros/"+id)];
      for(const path of ops) await S.db.doc(path).delete();
      await S.db.doc("presupuestos/"+k).delete();
      if(d.assets.length){ try{ const as=await window.claude.use("assets"); if(as) for(const id of d.assets){ try{ await as.delete(id); }catch(e){} } }catch(e){} }
    }
    const pids=new Set(d.pagos.map(p=>p.id)), sids=new Set(d.sols.map(x=>x.id));
    S.pagos=S.pagos.filter(p=>!pids.has(p.id)); S.sols=S.sols.filter(x=>!sids.has(x.id));
    d.gastos.forEach(id=>delete S.gastos[id]); d.vales.forEach(id=>delete S.vales[id]); d.reints.forEach(id=>delete S.reint[id]); delete S.budgets[k];
    S.delMes=null; if(S.mes===k){ S.mes=null; S.calDay=null; } pickMes(); safeRender();
    toast(`${mesLabel(k)} eliminado · el respaldo queda en Historial`);
  }catch(ex){
    const e=$("#delMesErr"); if(e){ e.textContent= ex?.code==="invalid_argument"? "No tiene permiso para eliminar datos de esta página." : "No se pudo completar la eliminación. Intente de nuevo; lo ya borrado no se recupera."; e.hidden=false; }
    btn.disabled=false; btn.textContent="Eliminar definitivamente";
  }
}
function renderMeses(){
  const keys=Object.keys(S.budgets).sort().reverse();
  $("#cntMeses").textContent=keys.length;
  if(!keys.length){ $("#tblMeses").innerHTML=`<tbody><tr><td class="empty-state">Aún no hay presupuestos cargados.</td></tr></tbody>`; return; }
  $("#tblMeses").innerHTML=`<thead><tr><th>Mes</th><th class="r">Presupuesto</th><th class="r">Registrado</th></tr></thead><tbody>${keys.map(k=>{const b=S.budgets[k]; const t=b.sectores.reduce((a,x)=>a+Object.values(x.dias).reduce((p,c)=>p+c,0),0); const r=round2(S.pagos.filter(p=>p.fechaRetiro?.slice(0,7)===k).reduce((a,p)=>a+(+p.monto||0),0));
    return `<tr class="${k===S.mes?"current":""}"><td><div class="sector-name">${esc(mesLabel(k))}</div><div class="sector-note">${esc(b.fuente||"")} · ${b.sectores.length} sectores</div><div class="mes-acts">${k===S.mes?`<span class="pill ok">En uso</span>`:`<button class="btn small" data-vermes="${k}" type="button">Ver</button>`}${S.readOnly||!S.P?.admin?"":`<button class="btn small ghost danger-ghost" data-delmes="${k}" type="button" title="Eliminar ${esc(mesLabel(k))} y todo su historial"><svg class="ico"><use href="#i-trash"/></svg>Eliminar</button>`}</div></td><td class="r num">${q(t)}</td><td class="r num">${q(r)}</td></tr>
    ${S.delMes===k?`<tr class="del-row"><td colspan="3">${delMesHTML(k)}</td></tr>`:""}`;}).join("")}</tbody>`;
  document.querySelectorAll("[data-delmes]").forEach(b=>b.onclick=()=>{ S.delMes= S.delMes===b.dataset.delmes? null : b.dataset.delmes; S.delTxt=""; renderMeses(); });
  const dc=$("#delConfirmTxt"); if(dc){ dc.value=""; dc.oninput=()=>{ $("#delMesOk").disabled= !dc.value; }; setTimeout(()=>dc.focus(),30); }
  const ok=$("#delMesOk"); if(ok) ok.onclick=async()=>{ const e=$("#delMesErr"); e.hidden=true; if(!S.P?.admin){ e.textContent="Solo un administrador puede eliminar."; e.hidden=false; return; } if(!(await checkPw(dc?.value||""))){ e.textContent="Contraseña incorrecta."; e.hidden=false; return; } deleteMes(S.delMes); };
  const no=$("#delMesNo"); if(no) no.onclick=()=>{ S.delMes=null; renderMeses(); };
  document.querySelectorAll("[data-vermes]").forEach(b=>b.onclick=()=>{ S.mes=b.dataset.vermes; S.calDay=null; S.openSector=null; renderAll(); });
}

/* ---------- autorizaciones de pagos parciales ---------- */
const EST={pendiente:{k:"warn",t:"Pendiente de autorización"},autorizada:{k:"info",t:"Autorizada · falta registrar"},registrada:{k:"ok",t:"Registrada"},rechazada:{k:"crit",t:"Rechazada"},anulada:{k:"neutral",t:"Anulada"}};
const isEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
function mergeSols(list){ const m=new Map(S.sols.map(x=>[x.id,x])); for(const x of list) m.set(x.id,{...(m.get(x.id)||{}),...x}); S.sols=[...m.values()]; }
async function refreshSols(){
  if(!S.db) return;
  try{ const snap=await S.db.collection("solicitudes").get(); S.sols=snap.docs.map(d=>({id:d.id,...d.data()})); safeRender(); }
  catch(e){ console.warn("solicitudes", e); }
}
function safeRender(){ try{ renderAll(); }catch(e){ console.error("render",e); } }
function nextSolNum(){ let mx=0; for(const x of S.sols){ const m=String(x.numero||"").match(/(\d+)$/); if(m) mx=Math.max(mx,+m[1]); } return "SA-"+String(mx+1).padStart(4,"0"); }
function secOf(mes,sid){ return (S.budgets[mes]?.sectores||[]).find(x=>x.id===sid); }
function remainingFor(sid,fecha){ const s=secOf(fecha.slice(0,7),sid); const b=s?.dias?.[parseInt(fecha.slice(8,10),10)]||0; const already=round2(S.pagos.filter(p=>p.sectorId===sid&&p.fechaRetiro===fecha).reduce((a,p)=>a+(+p.monto||0),0)); return {b,already,rest:round2(b-already)}; }
function openAuth(){
  S.authOpen=true; $("#authErr").hidden=true; updateSaveState(); $("#aMotivo").focus();
}
async function sendAuth(){
  const er=$("#authErr"); er.hidden=true;
  const m=budgetMatch(); if(!m.partial){ er.textContent="El monto ya no es parcial; revise el formulario."; er.hidden=false; return; }
  const miss=bankMissing(); if(miss.length){ er.textContent="Complete "+miss.join(", ")+"."; er.hidden=false; return; }
  const motivo=$("#aMotivo").value.trim();
  if(!motivo){ er.textContent="Indique el motivo del pago parcial."; er.hidden=false; return; }
  const f=$("#fRetiro").value, sid=$("#fSector").value, boleta=$("#fBoleta").value.trim(), banco=$("#fBanco").value;
  const tp=tipoPago();
  const dupB= tp==="deposito" && (S.pagos.find(p=>p.banco===banco && String(p.boleta||"").toLowerCase()===boleta.toLowerCase()) || S.sols.find(x=>x.estado!=="anulada"&&x.estado!=="rechazada"&&x.estado!=="registrada"&&x.banco===banco&&String(x.boleta).toLowerCase()===boleta.toLowerCase()));
  if(dupB){ er.textContent=`La boleta ${boleta} de ${banco} ya está en uso (${dupB.correlativo||dupB.numero}).`; er.hidden=false; return; }
  const s=secOf(f.slice(0,7),sid);
  await refreshSols();
  const doc={numero:nextSolNum(), estado:"pendiente", fechaRetiro:f, fechaRegistro:$("#fRegistro").value||todayISO, sectorId:sid, sectorNombre:s?.nombre||"", mes:f.slice(0,7),
    presupuesto:m.b, yaRegistrado:m.already, montoSolicitado:round2(parseFloat($("#fMonto").value)), ruta:$("#fRuta").value.trim(), piloto:$("#fPiloto").value, boleta, banco, tipoPago:tp, evidenciaFoto:null,
    motivo, solicitanteId:S.me?.id||"", solicitanteNombre:S.me?.name||"", creado:new Date().toISOString()};
  const btn=$("#btnAuthSend"); btn.disabled=true;
  try{
    let id;
    if(S.db){ const ref=await S.db.collection("solicitudes").add(doc); id=ref.id; mergeSols([{...doc,id}]); }
    else { id="sol"+Date.now(); S.sols.push({...doc,id}); }
    S.authOpen=false; $("#aMotivo").value="";
    resetForm(); S.tab="autorizaciones"; $("#autFiltro").value="activas"; renderAll();
    refreshSols();
    toast(`Solicitud ${doc.numero} generada · pendiente de autorización del administrador`);
    logEvent("autorizacion",doc.mes,`Solicitud de pago parcial ${doc.numero} · ${doc.sectorNombre} · ${q(doc.montoSolicitado)} de ${q(doc.presupuesto)} · motivo: ${doc.motivo}`);
    window.scrollTo({top:0,behavior:"smooth"});
  }catch(ex){ er.textContent= ex?.code==="invalid_argument"? "No tiene permiso para generar solicitudes." : "No se pudo generar la solicitud. Intente de nuevo."; er.hidden=false; }
  finally{ btn.disabled=false; }
}
function renderMail(){ const b=$("#mailBox"); if(b) b.hidden=true; }
function renderAut(){
  const pend=S.sols.filter(x=>x.estado==="pendiente"||x.estado==="autorizada").length + Object.values(S.gastos).filter(g=>g.anticipo&&g.estadoAnticipo==="pendiente").length + Object.values(S.gastos).filter(g=>g.ext?.estado==="pendiente").length;
  $("#cntAut").textContent=pend;
  renderAnticipos(); renderExtensiones();
  renderMail();
  const filt=$("#autFiltro").value;
  const order={pendiente:0,autorizada:1,registrada:2,anulada:3};
  const list=S.sols.filter(x=>filt==="todas"||x.estado==="pendiente"||x.estado==="autorizada").sort((a,b)=>(order[a.estado]-order[b.estado])||String(b.creado).localeCompare(String(a.creado)));
  if(!list.length){ $("#autList").innerHTML=`<div class="empty-state">No hay solicitudes ${filt==="todas"?"":"pendientes"}. Se generan desde “Registrar pago” cuando el monto es parcial.</div>`; return; }
  $("#autList").innerHTML=list.map(x=>{
    const e=EST[x.estado]||EST.pendiente; const s=secOf(x.fechaRetiro.slice(0,7),x.sectorId);
    const st1="done", st2= x.estado==="pendiente"?"now":(x.estado==="anulada"?"":x.estado==="rechazada"?"rej":"done"), st3= x.estado==="autorizada"?"now":(x.estado==="registrada"?"done":"");
    const rem=remainingFor(x.sectorId,x.fechaRetiro);
    let act="";
    if(x.estado==="pendiente"){
      act= S.P?.admin && !S.readOnly
        ? (S.rejFor===x.id
          ? `<div class="field" style="flex:1;min-width:240px"><label for="rj-${x.id}">Motivo del rechazo</label><input type="text" id="rj-${x.id}" autocomplete="off" placeholder="Opcional"></div><button class="btn no-solid" type="button" data-rej-ok="${x.id}">Confirmar rechazo</button><button class="btn ghost" type="button" data-rej-no="1">Volver</button>`
          : `<button class="btn ok-solid" type="button" data-aprob="${x.id}"><svg class="ico"><use href="#i-check"/></svg>Autorizado</button><button class="btn no-solid" type="button" data-rej="${x.id}"><svg class="ico"><use href="#i-alert"/></svg>Rechazado</button>`)
        : `<span class="pill warn">En espera de autorización del administrador</span>
        ${S.confirmAnular===x.id?`<button class="btn small danger" type="button" data-anular-ok="${x.id}">Confirmar anulación</button><button class="btn small ghost" type="button" data-anular-no="1">No</button>`:`<button class="btn small ghost" type="button" data-anular="${x.id}">Anular</button>`}`;
      if(S.P?.admin && !S.readOnly && S.rejFor!==x.id) act+= S.confirmAnular===x.id?` <button class="btn small danger" type="button" data-anular-ok="${x.id}">Confirmar anulación</button><button class="btn small ghost" type="button" data-anular-no="1">No</button>`:` <button class="btn small ghost" type="button" data-anular="${x.id}">Anular</button>`;
    } else if(x.estado==="autorizada"){
      const def=Math.min(x.montoSolicitado, rem.rest);
      act=`<div class="field" style="min-width:180px"><label for="am-${x.id}">Monto a pagar (Q)</label><input type="number" id="am-${x.id}" min="0" step="0.01" value="${def>0?def:""}" inputmode="decimal"></div>
        <button class="btn primary" type="button" data-reg="${x.id}"><svg class="ico"><use href="#i-check"/></svg>Guardar registro</button>
        <span class="muted" style="font-size:12.5px">Pendiente del día: <b class="num">${q(rem.rest)}</b></span>`;
    }
    const fdt=t=>{ if(!t) return ""; const d=new Date(t); return isNaN(d)?"":`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const dec= x.estado==="rechazada"? `<div class="hint warn" style="margin-top:10px"><span><b>Rechazada</b> por ${esc(x.decididoNombre||"administrador")} · ${esc(fdt(x.decidido))}${x.motivoRechazo?` · Motivo: ${esc(x.motivoRechazo)}`:""}</span></div>`
      : x.decidido? `<div class="evid"><svg class="ico"><use href="#i-check"/></svg><span>Autorizada por <b>${esc(x.decididoNombre||"administrador")}</b> <span class="muted">· ${esc(fdt(x.decidido))}</span></span></div>` : "";
    const evid=dec+(x.evidencia? `<div class="evid"><svg class="ico"><use href="#i-check"/></svg><span>Autorización cargada: <a href="/_blob/${esc(x.evidencia.id)}" target="_blank" rel="noopener">${esc(x.evidencia.nombre||"PDF")}</a> <span class="muted">· ${esc((x.evidencia.cargado||"").slice(0,10))}</span></span></div>`:"");
    return `<article class="sol ${x.estado}">
      <div class="sol-head"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="no">${esc(x.numero)}</span><span class="pill ${e.k}">${e.t}</span></div>
        <div class="sol-steps"><span class="step ${st1}"><i>1</i>Solicitud</span><span class="step ${st2==="rej"?"":st2}"><i>2</i>${st2==="rej"?"Rechazada":"Autorización"}</span><span class="step ${st3}"><i>3</i>Registro</span></div></div>
      <div class="sol-body">
        <div class="sol-grid">
          <span><em>Sector</em><b>${s?`<span class="corr-badge">${esc(baseCorr(s,S.budgets[x.fechaRetiro.slice(0,7)].sectores))}</span>`:""}${esc(x.sectorNombre)}</b></span>
          <span><em>Fecha de retiro</em><b class="num">${esc(x.fechaRetiro)}</b></span>
          <span><em>Presupuesto del día</em><b class="num">${q(x.presupuesto)}</b></span>
          <span><em>Ya registrado</em><b class="num">${q(x.yaRegistrado||0)}</b></span>
          <span><em>Monto solicitado</em><b class="num">${q(x.montoSolicitado)}</b></span>
          <span><em>Diferencia</em><b class="num" style="color:var(--warn)">${q(round2((x.presupuesto||0)-(x.yaRegistrado||0)-(x.montoSolicitado||0)))}</b></span>
          <span><em>Ruta · Piloto</em><b>${esc(x.ruta)} · ${esc(x.piloto||"—")}</b></span>
          <span><em>Tipo · Boleta · Banco</em><b>${x.tipoPago==="mano"?"Mano a mano":`Depósito · ${esc(x.boleta)} · ${esc(x.banco)}`}</b></span>
          <span><em>Solicitado por</em><b>${esc(x.solicitanteNombre||x.jefeNombre||"—")} <span class="muted num" style="font-weight:400">${esc(fdt(x.creado))}</span></b></span>
          <span style="grid-column:1/-1"><em>Motivo</em><b style="font-weight:400">${esc(x.motivo)}</b></span>
          ${x.estado==="registrada"?`<span><em>Registrado</em><b class="num">${esc(x.correlativo||"")} · ${q(x.montoRegistrado)}</b></span>`:""}
        </div>
        ${evid}
        ${act?`<div class="sol-actions">${act}</div>`:""}
        <div class="err" id="se-${x.id}" hidden></div>
      </div></article>`;
  }).join("");
  const L=$("#autList");
  L.querySelectorAll("[data-aprob]").forEach(b=>b.onclick=()=>decideSol(b.dataset.aprob,true));
  L.querySelectorAll("[data-rej]").forEach(b=>b.onclick=()=>{ S.rejFor=b.dataset.rej; renderAut(); setTimeout(()=>$("#rj-"+S.rejFor)?.focus(),30); });
  L.querySelectorAll("[data-rej-no]").forEach(b=>b.onclick=()=>{ S.rejFor=null; renderAut(); });
  L.querySelectorAll("[data-rej-ok]").forEach(b=>b.onclick=()=>decideSol(b.dataset.rejOk,false,($("#rj-"+b.dataset.rejOk)?.value||"").trim()));
  L.querySelectorAll("[data-anular]").forEach(b=>b.onclick=()=>{ S.confirmAnular=b.dataset.anular; renderAut(); });
  L.querySelectorAll("[data-anular-no]").forEach(b=>b.onclick=()=>{ S.confirmAnular=null; renderAut(); });
  L.querySelectorAll("[data-anular-ok]").forEach(b=>b.onclick=()=>updSol(b.dataset.anularOk,{estado:"anulada",anulado:new Date().toISOString()},"Solicitud anulada"));
  L.querySelectorAll("[data-reg]").forEach(b=>b.onclick=()=>regFromSol(b.dataset.reg));
}
async function decideSol(id,ok,motivo){
  if(!S.P?.admin){ solErr(id,"Solo un administrador puede autorizar o rechazar."); return; }
  const x=S.sols.find(y=>y.id===id); if(!x||x.estado!=="pendiente") return;
  if(!(await askAdminPass(`${ok?"Autorizar":"Rechazar"} la solicitud ${x.numero} · ${x.sectorNombre} · ${q(x.montoSolicitado)}.`,{title:ok?"Confirmar autorización":"Confirmar rechazo",ok:ok?"Autorizar":"Rechazar",cls:ok?"ok-solid":"no-solid"}))) return;
  const patch={estado: ok?"autorizada":"rechazada", decidido:new Date().toISOString(), decididoId:S.me?.id||"", decididoNombre:S.me?.name||"Administrador"};
  if(!ok) patch.motivoRechazo=motivo||"";
  S.rejFor=null;
  if(await updSol(id,patch, ok?`Solicitud ${x.numero} autorizada`:`Solicitud ${x.numero} rechazada`)) logEvent("autorizacion",x.mes||x.fechaRetiro.slice(0,7),`Pago parcial ${x.numero} ${ok?"autorizado":"rechazado"} · ${x.sectorNombre} · ${q(x.montoSolicitado)}${!ok&&motivo?` · motivo: ${motivo}`:""}`);
}
function solErr(id,msg){ const e=$("#se-"+id); if(e){ e.textContent=msg; e.hidden=false; } }
async function updSol(id,patch,msg){
  try{ if(S.db) await S.db.doc("solicitudes/"+id).update(patch);
    { const i=S.sols.findIndex(x=>x.id===id); if(i>=0) S.sols[i]={...S.sols[i],...patch}; }
    if(S.db) refreshSols();
    S.confirmAnular=null; if(msg) toast(msg); renderAll(); return true;
  }catch(ex){ solErr(id, ex?.code==="invalid_argument"?"No tiene permiso para modificar esta solicitud.":"No se pudo guardar el cambio. Intente de nuevo."); return false; }
}
async function uploadEvid(id,file){
  if(!file) return;
  if(!(file.type==="application/pdf" || /\.pdf$/i.test(file.name))){ solErr(id,"El archivo debe ser PDF."); return; }
  if(file.size>20*1024*1024){ solErr(id,"El PDF supera 20 MB. Reduzca su tamaño e intente de nuevo."); return; }
  const assets = window.claude?.use? await window.claude.use("assets") : null;
  if(!assets){ solErr(id,"Esta vista no permite cargar archivos. Pida al propietario acceso de edición a la página."); return; }
  toast("Cargando PDF…");
  try{
    const r=await assets.upload(file,{type:"application/pdf"});
    await updSol(id,{estado:"autorizada",evidencia:{id:r.id,nombre:file.name,bytes:r.sizeBytes,cargado:new Date().toISOString()}},"Autorización cargada. Ingrese el monto y guarde el registro.");
  }catch(ex){
    const c=ex?.code;
    solErr(id, c==="too_large"?"El PDF es demasiado grande.": c==="unsupported_type"||c==="invalid_request"?"El archivo no es un PDF válido.": c==="quota_or_state"?"Se alcanzó el límite de archivos de la página.": c==="not_granted"?"No tiene permiso para cargar archivos.":"No se pudo cargar el PDF. Intente de nuevo.");
  }
}
async function regFromSol(id){
  const x=S.sols.find(y=>y.id===id); if(!x) return;
  const inp=$("#am-"+id); const monto=round2(parseFloat(inp?.value));
  const rem=remainingFor(x.sectorId,x.fechaRetiro);
  if(x.estado!=="autorizada"){ solErr(id,"La solicitud debe estar autorizada por un administrador."); return; }
  if(!(monto>0)){ solErr(id,"Ingrese el monto a pagar."); return; }
  if(rem.b<=0){ solErr(id,"No hay presupuesto para este sector en esa fecha."); return; }
  if(monto>rem.rest+0.005){ solErr(id,`El monto excede lo pendiente del día (${q(rem.rest)}).`); return; }
  const dup=x.tipoPago!=="mano" && S.pagos.find(p=>p.banco===x.banco && String(p.boleta||"").toLowerCase()===String(x.boleta).toLowerCase());
  if(dup){ solErr(id,`La boleta ${x.boleta} de ${x.banco} ya está registrada en ${dup.correlativo}.`); return; }
  const mes=x.fechaRetiro.slice(0,7);
  const ev=await askEvidence({tipo:x.tipoPago||"deposito", cells:[["Sector",x.sectorNombre],["Autorización",x.numero],["Fecha de retiro",x.fechaRetiro.split("-").reverse().join("/")],["Monto",q(monto)],["No. de ruta",x.ruta||"—"],["Piloto",x.piloto||"—"],["Tipo de pago",TIPO_TXT[x.tipoPago||"deposito"]]]});
  if(!ev){ solErr(id,"Registro no guardado: falta la imagen del comprobante."); return; }
  x.evidenciaFoto=ev;
  const rec={fechaRetiro:x.fechaRetiro, fechaRegistro:todayISO, correlativo:nextCorr(x.sectorId,mes), sectorId:x.sectorId, sectorNombre:x.sectorNombre, mes,
    monto, ruta:x.ruta, piloto:x.piloto||"", boleta:x.boleta, banco:x.banco, tipoPago:x.tipoPago||"deposito", evidenciaFoto:x.evidenciaFoto||null, parcial: monto<rem.rest-0.005,
    autorizacion:{solicitudId:id, numero:x.numero, evidenciaId:x.evidencia?.id||null, autorizadoId:x.decididoId||"", autorizadoNombre:x.decididoNombre||"", autorizado:x.decidido||""}, creado:new Date().toISOString()};
  try{
    let pid;
    if(S.db){ const ref=await S.db.collection("pagos").add(rec); pid=ref.id; if(!S.pagos.some(p=>p.id===pid)) S.pagos.push({...rec,id:pid}); } else { pid="local"+Date.now(); S.pagos.push({...rec,id:pid}); }
    await updSol(id,{estado:"registrada",pagoId:pid,montoRegistrado:monto,correlativo:rec.correlativo,registrado:new Date().toISOString()},`Pago ${rec.correlativo} registrado con autorización ${x.numero}`);
  }catch(ex){ solErr(id, ex?.code==="invalid_argument"?"No tiene permiso para registrar pagos.":"No se pudo guardar el registro. Intente de nuevo."); }
}

/* ---------- vales de liquidación (PDF generado en la página, sin librerías) ---------- */
const HW={F1:[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,761,222,556,333,1000,556,556,333,1000,667,333,1000,761,611,761,761,222,222,333,333,350,556,1000,333,1000,500,333,944,761,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],F2:[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,761,278,556,500,1000,556,556,333,1000,667,333,1000,761,611,761,761,278,278,500,500,350,556,1000,333,1000,556,333,944,761,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]};
function toWin(str){ let o=""; for(const ch of String(str??"")){ const c=ch.codePointAt(0); if(c>=32&&c<=126) o+=ch; else if(c>=160&&c<=255) o+=String.fromCharCode(c); else if(c===8212||c===8211) o+="-"; else if(c===8230) o+="..."; else if(c===183) o+=String.fromCharCode(183); else if(c===8220||c===8221) o+='"'; else o+="?"; } return o; }
function tw(str,size,font){ const w=HW[font||"F1"]; let t=0; for(const ch of toWin(str)){ const c=ch.charCodeAt(0); t+= (c>=32&&c<=255)? w[c-32] : 556; } return t*size/1000; }
function wrap(str,size,font,max){ const words=String(str||"").split(/\s+/); const lines=[]; let cur=""; for(const w of words){ const t=cur?cur+" "+w:w; if(tw(t,size,font)<=max||!cur) cur=t; else { lines.push(cur); cur=w; } } if(cur) lines.push(cur); return lines; }
function MiniPDF(){
  const PW=612, PH=792; const pages=[]; let cur=null;
  const hex=c=>{ const n=parseInt(c.slice(1),16); return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255].map(v=>v.toFixed(3)).join(" "); };
  const esc=t=>toWin(t).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
  const api={
    W:PW,H:PH,
    page(){ cur=[]; pages.push(cur); return api; },
    text(x,y,str,o={}){ const size=o.size||10, font=o.bold?"F2":"F1"; let xx=x; const w=tw(str,size,font); if(o.align==="right") xx=x-w; else if(o.align==="center") xx=x-w/2;
      cur.push(`BT ${hex(o.color||"#16201D")} rg /${font} ${size} Tf ${xx.toFixed(2)} ${(PH-y).toFixed(2)} Td (${esc(str)}) Tj ET`); return w; },
    line(x1,y1,x2,y2,o={}){ cur.push(`q ${hex(o.color||"#16201D")} RG ${o.w||0.8} w ${o.dash?"[3 3] 0 d":""} ${x1.toFixed(2)} ${(PH-y1).toFixed(2)} m ${x2.toFixed(2)} ${(PH-y2).toFixed(2)} l S Q`); },
    rect(x,y,w,h,o={}){ let op=""; if(o.fill) op+=`${hex(o.fill)} rg `; if(o.stroke) op+=`${hex(o.stroke)} RG ${o.w||0.8} w `; cur.push(`q ${op}${x.toFixed(2)} ${(PH-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${o.fill&&o.stroke?"B":o.fill?"f":"S"} Q`); },
    output(){
      const objs=[]; const add=s=>{ objs.push(s); return objs.length; };
      const f1=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
      const f2=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
      const pagesId=objs.length+1; objs.push(null);
      const kids=[];
      for(const p of pages){ const content=p.join("\n"); const cid=add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
        kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`)); }
      objs[pagesId-1]=`<< /Type /Pages /Kids [${kids.map(k=>k+" 0 R").join(" ")}] /Count ${kids.length} >>`;
      const cat=add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
      const info=add(`<< /Title (${esc("Vales de liquidacion ZR")}) /Producer (Control ZR) >>`);
      let out="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; const offs=[];
      objs.forEach((o,i)=>{ offs.push(out.length); out+=`${i+1} 0 obj\n${o}\nendobj\n`; });
      const xref=out.length;
      out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offs.map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("");
      out+=`trailer\n<< /Size ${objs.length+1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
      const bytes=new Uint8Array(out.length); for(let i=0;i<out.length;i++) bytes[i]=out.charCodeAt(i)&255; return bytes;
    }
  };
  return api;
}
function numLetras(n){
  const U=["","UN","DOS","TRES","CUATRO","CINCO","SEIS","SIETE","OCHO","NUEVE","DIEZ","ONCE","DOCE","TRECE","CATORCE","QUINCE","DIECISÉIS","DIECISIETE","DIECIOCHO","DIECINUEVE","VEINTE","VEINTIÚN","VEINTIDÓS","VEINTITRÉS","VEINTICUATRO","VEINTICINCO","VEINTISÉIS","VEINTISIETE","VEINTIOCHO","VEINTINUEVE"];
  const D=["","","","TREINTA","CUARENTA","CINCUENTA","SESENTA","SETENTA","OCHENTA","NOVENTA"];
  const C=["","CIENTO","DOSCIENTOS","TRESCIENTOS","CUATROCIENTOS","QUINIENTOS","SEISCIENTOS","SETECIENTOS","OCHOCIENTOS","NOVECIENTOS"];
  const cien=x=>{ if(x===0) return ""; if(x===100) return "CIEN"; const c=Math.floor(x/100), r=x%100; let t=C[c]; if(r){ t+=(t?" ":"")+(r<30?U[r]:D[Math.floor(r/10)]+(r%10?" Y "+U[r%10]:"")); } return t; };
  const ent=Math.floor(n), cts=Math.round((n-ent)*100);
  let t=""; const mill=Math.floor(ent/1e6), mil=Math.floor(ent%1e6/1000), r=ent%1000;
  if(mill) t+= (mill===1?"UN MILLÓN":cien(mill)+" MILLONES")+" ";
  if(mil) t+= (mil===1?"MIL":cien(mil)+" MIL")+" ";
  if(r) t+=cien(r);
  t=t.trim()||"CERO";
  return `${t} QUETZALES CON ${String(cts).padStart(2,"0")}/100`;
}
function valeData(sid,d){
  const mes=S.mes, bud=S.budgets[mes], s=bud?.sectores.find(x=>x.id===sid); if(!s) return null;
  const fecha=mes+"-"+pad(d); const b=s.dias[d]||0;
  const pagos=S.pagos.filter(p=>p.sectorId===sid&&p.fechaRetiro===fecha).sort((a,c)=>String(a.correlativo).localeCompare(String(c.correlativo)));
  const reg=round2(pagos.reduce((a,p)=>a+(+p.monto||0),0));
  const st=statusFor(b,reg,d,pagos);
  return {s,d,fecha,b,pagos,reg,st,corr:baseCorr(s,bud.sectores),next:nextCorr(sid,mes),rt:reintOf(fecha,sid)};
}
function drawVale(pdf,v,top){
  const L=36,R=pdf.W-36,Wd=R-L; const dk="#0B2925", mu="#5B6863", ln="#B3C0BA", ac="#0E6B5C";
  const WDL=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const fmtD=iso=>{ if(!iso) return ""; const [y,m,dd]=iso.split("-"); return `${dd}/${m}/${y}`; };
  let y=top+30;
  pdf.rect(L,y,Wd,34,{fill:dk});
  pdf.text(L+12,y+15,"VALE DE LIQUIDACIÓN",{size:13,bold:true,color:"#FFFFFF"});
  pdf.text(L+12,y+27,"ZONAS ROJAS · "+brand().toUpperCase(),{size:8,color:"#9CC4B9"});
  const no = v.pagos.length? v.pagos.map(p=>p.correlativo).join(" / ") : v.next;
  pdf.text(R-12,y+14,"No.",{size:8,color:"#9CC4B9",align:"right"});
  pdf.text(R-12,y+27,no,{size:12,bold:true,color:"#FFFFFF",align:"right"});
  y+=46;
  // fila de datos
  const [yy,mm,ddd]=v.fecha.split("-").map(Number); const wd=WDL[new Date(yy,mm-1,ddd).getDay()];
  const cell=(x,w,label,val,opt={})=>{ pdf.text(x,y,label.toUpperCase(),{size:6.5,bold:true,color:mu}); const lines=wrap(val,opt.size||10,opt.bold?"F2":"F1",w-6).slice(0,opt.max||1); lines.forEach((t,i)=>pdf.text(x,y+12+i*11.5,t,{size:opt.size||10,bold:opt.bold})); return lines.length; };
  const nl=cell(L,Wd*0.62,"Sector",v.corr+" · "+v.s.nombre,{bold:true,max:2});
  cell(L+Wd*0.64,Wd*0.36,"Fecha programada",`${fmtD(v.fecha)} (${wd})`);
  y+=16+nl*11.5;
  if(v.rutaLbl){ pdf.rect(L,y-8,Wd,14,{fill:"#E8EFFE"}); pdf.text(L+6,y+2,v.rutaLbl,{size:8,bold:true,color:"#1E3A5F"}); y+=12; }
  pdf.line(L,y,R,y,{color:ln,w:0.5}); y+=12;
  // detalle de pagos
  const cols=[["Correlativo",L,0],["Fecha retiro",L+84,0],["Fecha registro",L+160,0],["Ruta",L+240,0],["Boleta",L+300,0],["Banco",L+375,0],["Monto",R,1]];
  pdf.rect(L,y-8,Wd,14,{fill:"#EEF3F1"});
  cols.forEach(([t,x,r])=>pdf.text(r?x-4:x+4,y+2,t.toUpperCase(),{size:6.5,bold:true,color:mu,align:r?"right":"left"}));
  y+=16;
  const rows=v.pagos.length? v.pagos.slice(0,3) : [null];
  for(const p of rows){
    if(p){ const vals=[p.correlativo,fmtD(p.fechaRetiro),fmtD(p.fechaRegistro),p.ruta||"—",p.boleta||"—",p.banco||"—",q(+p.monto)];
      cols.forEach(([t,x,r],i)=>{ let val=String(vals[i]); if(i===5 && p.tipoPago==="mano") val="Mano a mano"; else if(i===5) val=wrap(val,9,"F1",R-78-x).slice(0,1)[0]+(tw(val,9,"F1")>R-78-x?"…":""); else if((i===3||i===4) && cols[i+1]){ const mw=cols[i+1][1]-x-10; if(tw(val,9,"F1")>mw){ while(val.length>1&&tw(val+"…",9,"F1")>mw) val=val.slice(0,-1); val+="…"; } } pdf.text(r?x-4:x+4,y,val,{size:9,bold:i===6,align:r?"right":"left"}); });
      y+=11; pdf.text(L+4,y,`Piloto: ${p.piloto||"—"}   ·   Motivo de pago: ${(p.tipoPago==="mano"?"Mano a mano":p.tipoPago==="deposito"?"Depósito":(p.banco?"Depósito":"—"))}${p.evidenciaFoto?"   ·   Evidencia fotográfica: "+(p.evidenciaFoto.nombre||"sí"):""}`,{size:7.5,color:"#5B6863"});
      const fitL=t=>{ const mw=R-L-8; if(tw(t,7.5,"F1")<=mw) return t; while(t.length>1&&tw(t+"…",7.5,"F1")>mw) t=t.slice(0,-1); return t+"…"; };
      if(p.rutas?.length>1){ y+=11; pdf.text(L+4,y,fitL("Rutas: "+p.rutas.map(r=>`${r.ruta} (${r.piloto}) ${q(r.monto)}`).join("; ")),{size:7.5,color:"#5B6863"}); }
      if(p.depositos?.length>1){ y+=11; pdf.text(L+4,y,fitL("Depósitos: "+p.depositos.map(d=>`${d.boleta} ${d.banco} ${q(d.monto)}`).join("; ")),{size:7.5,color:"#5B6863"}); }
      if(p.autorizacion){ y+=11; pdf.text(L+4,y,`Pago parcial autorizado · ${p.autorizacion.numero||""} · ${p.autorizacion.autorizadoNombre||p.autorizacion.jefeNombre||""}`,{size:7.5,color:"#2B5D91"}); }
    } else {
      pdf.text(L+4,y+13,"Piloto: ________________________________",{size:7.5,color:"#5B6863"}); pdf.text(L+4,y,v.next,{size:9}); [L+84,L+160,L+240,L+300,L+375].forEach((x,i)=>pdf.line(x+4,y+2,x+(i===4?95:62),y+2,{color:ln,w:0.5})); pdf.line(R-70,y+2,R-4,y+2,{color:ln,w:0.5});
    }
    y+=15;
  }
  if(v.pagos.length>3){ pdf.text(L+4,y,`… y ${v.pagos.length-3} pago(s) más`,{size:7.5,color:mu}); y+=12; }
  y+=2;
  // montos
  const rtA=v.rt?(+v.rt.monto||0):0; const bw=(Wd-16)/3; const monto=v.pagos.length? v.reg : v.b; const dif=round2(v.b-v.reg-rtA);
  if(v.rt){ pdf.rect(L,y-2,Wd,16,{fill:"#DDF0FA"}); pdf.text(L+6,y+9,`Reintegro ZR ${v.rt.numero}: ${q(rtA)} · recibo ${v.rt.recibo} · ${v.rt.banco} · ${String(v.rt.fechaRegistro||"").split("-").reverse().join("/")}`,{size:8,bold:true,color:"#0B4F8A"}); y+=20; }
  [["Presupuesto programado",q(v.b),dk],["Monto liquidado",v.pagos.length?q(v.reg):"Q ____________",ac],[v.rt?"Diferencia (con reintegro)":"Diferencia",v.pagos.length?q(dif):"—",dif<0?"#B3261E":dk]].forEach(([l,val,c],i)=>{
    const x=L+i*(bw+8); pdf.rect(x,y,bw,36,{stroke:ln,w:0.7}); pdf.text(x+8,y+12,l.toUpperCase(),{size:6.5,bold:true,color:mu}); pdf.text(x+8,y+28,val,{size:12.5,bold:true,color:c}); });
  y+=48;
  pdf.text(L,y,"MONTO EN LETRAS",{size:6.5,bold:true,color:mu});
  wrap(numLetras(monto),8.5,"F2",Wd-80).slice(0,2).forEach((t,i)=>pdf.text(L+72,y+i*10,t,{size:8.5,bold:true}));
  y+=14;
  pdf.text(L,y,"ESTADO",{size:6.5,bold:true,color:mu}); pdf.text(L+72,y,v.st.t+(v.s.nota?`   ·   Observación: ${v.s.nota}`:""),{size:8.5});
  // observaciones
  y+=14; const fy=top+396-62; const oh=fy-26-y;
  if(oh>30){ pdf.rect(L,y,Wd,oh,{stroke:ln,w:0.6}); pdf.text(L+8,y+11,"OBSERVACIONES",{size:6.5,bold:true,color:mu}); for(let ly=y+26; ly<y+oh-4; ly+=14) pdf.line(L+8,ly,R-8,ly,{color:"#DCE3DF",w:0.5}); }
  // firmas
  const sw=(Wd-60)/2;
  [["Liquidación CBC",L,""],["Coordinador de liquidación",L+sw+60,S.me?.name||""]].forEach(([t,x,nm])=>{
    if(nm) pdf.text(x+sw/2,fy-5,nm,{size:8.5,align:"center"});
    pdf.line(x,fy,x+sw,fy,{w:0.9});
    pdf.text(x+sw/2,fy+11,t,{size:9,bold:true,align:"center"});
    pdf.text(x,fy+24,"Nombre: ______________________________",{size:7.5,color:mu});
    pdf.text(x+sw,fy+24,"Fecha: ___/___/______",{size:7.5,color:mu,align:"right"});
  });
  const em=new Date(); pdf.text(R,top+396-10,`Emitido ${pad(em.getDate())}/${pad(em.getMonth()+1)}/${em.getFullYear()} ${pad(em.getHours())}:${pad(em.getMinutes())} · Control ${brand()}`,{size:6.5,color:mu,align:"right"});
}
function expandVales(list){
  const out=[];
  for(const v of list){
    const multi=v.pagos.filter(p=>p.rutas?.length>1);
    if(!multi.length){ out.push(v); continue; }
    const views=[];
    for(const p of multi){ p.rutas.forEach((r,i)=>views.push({...v, rt:null, b:r.monto, reg:r.monto, st:{t:"Coincide",k:"ok"},
      rutaLbl:`Ruta ${i+1} de ${p.rutas.length} · ${p.correlativo} · total del sector ${q(v.b)} · registrado ${q(v.reg)}`,
      pagos:[{...p, correlativo:`${p.correlativo}·R${i+1}`, ruta:r.ruta, piloto:r.piloto, boleta:r.boleta||"", banco:r.banco||"", monto:r.monto, rutas:null, depositos:null, evidenciaFoto:r.evidencia||null}]})); }
    const plain=v.pagos.filter(p=>!(p.rutas?.length>1));
    const multiSum=round2(multi.reduce((a,p)=>a+(+p.monto||0),0));
    if(plain.length) views.push({...v, pagos:plain, b:round2(v.b-multiSum), reg:round2(plain.reduce((a,p)=>a+(+p.monto||0),0))});
    else if(v.rt){ const last=views[views.length-1]; last.rt=v.rt; last.b=round2(last.b+(+v.rt.monto||0)); }
    out.push(...views);
  }
  return out;
}
function buildVales(list){
  const pdf=MiniPDF(); list=expandVales(list);
  list.forEach((v,i)=>{ if(i%2===0) pdf.page(); const top=(i%2)*396; drawVale(pdf,v,top);
    if(i%2===0){ pdf.line(24,396,pdf.W-24,396,{dash:true,color:"#9AA8A2",w:0.6}); pdf.text(pdf.W/2,392,"- - - cortar aquí - - -",{size:6.5,color:"#9AA8A2",align:"center"}); } });
  return pdf.output();
}
async function downloadVales(list,filename){
  list=list.filter(v=>v&&!valeOf(v.fecha,v.s.id));
  if(!list.length){ toast("Los vales de liquidación ya fueron generados"); return; }
  let bytes; try{ bytes=buildVales(list); }catch(e){ console.error(e); toast("No se pudo generar el PDF"); return; }
  try{ await markVales(list); }catch(e){ toast("No se pudo registrar el vale; intente de nuevo"); return; }
  const dl = window.claude?.use? await window.claude.use("downloads") : null;
  if(!dl){ S._lastPdf=bytes; toast("La descarga no está disponible en esta vista"); return; }
  try{ await dl.save({filename, data:new Blob([bytes],{type:"application/pdf"})}); }
  catch(ex){ if(ex?.code!=="declined") toast("No se pudo descargar el PDF"); }
}
function valesDia(d){ return sectores().filter(s=>s.dias[d]).map(s=>valeData(s.id,d)).filter(v=>v&&v.pagos.length&&!valeOf(v.fecha,v.s.id)); }
function valeOf(fecha,sid){ return S.vales[fecha+"_"+sid]||null; }
async function markVales(list){
  const now=new Date().toISOString();
  for(const v of list){ const id=v.fecha+"_"+v.s.id; const doc={fecha:v.fecha,sectorId:v.s.id,sectorNombre:v.s.nombre,mes:v.fecha.slice(0,7),correlativos:v.pagos.map(p=>p.correlativo),monto:v.reg,generado:now};
    S.vales[id]=doc; if(S.db) await S.db.doc("vales/"+id).set(doc); logEvent("vale",doc.mes,`Vale de liquidación ${doc.correlativos.join(", ")} · ${doc.sectorNombre} · ${q(doc.monto)}`); }
  safeRender();
}
document.addEventListener("click",e=>{
  const one=e.target.closest?.("[data-vale]"); if(one && !one.disabled){ const [sid,d]=one.dataset.vale.split("|"); const v=valeData(sid,+d); if(v) downloadVales([v],`Vale_de_liquidacion_ZR_${v.corr}_${v.fecha}.pdf`); return; }
  const all=e.target.closest?.("[data-vales-dia]"); if(all){ const d=+all.dataset.valesDia; downloadVales(valesDia(d),`Vales_de_liquidacion_ZR_${S.mes}-${pad(d)}.pdf`); }
});

/* ---------- solicitud de gasto ZR (paso 1) ---------- */
const VENTANA_H=48;
function regWindow(g){
  if(!g) return {ok:false,why:"Genere primero la solicitud de gasto."};
  if(g.anticipo && g.estadoAnticipo!=="autorizada") return {ok:false,pend:true,why:"Solicitud de anticipo pendiente: un administrador debe autorizarla con la evidencia del correo de CBC."};
  if(g.ext?.estado==="autorizada"){ const lim2=new Date(g.ext.autorizadoEn).getTime()+VENTANA_H*3600e3; if(Date.now()<=lim2) return {ok:true,lim:new Date(lim2),hrs:Math.max(0,Math.floor((lim2-Date.now())/3600e3)),habilitado:true}; }
  const t0=new Date((g.anticipo&&g.autorizadoEn)||g.generado||0).getTime(); const lim=t0+VENTANA_H*3600e3; const now=Date.now();
  if(now>lim && g.ext?.estado==="pendiente") return {ok:false,pend:true,extPend:true,why:"Habilitación solicitada: espere la autorización del administrador."};
  if(now>lim){ const d=new Date(lim); return {ok:false,expired:true,lim:d,why:`El plazo para registrar venció el ${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())} (48 h desde la solicitud). Solicite la habilitación al administrador o registre un reintegro.`}; }
  return {ok:true,lim:new Date(lim),hrs:Math.max(0,Math.floor((lim-now)/3600e3))};
}
function roundOf(fecha,sid){ return S.pagos.filter(p=>p.sectorId===sid&&p.fechaRetiro===fecha).length+1; }
function gastoId(fecha,sid,round){ round=round||roundOf(fecha,sid); return round>1? `${fecha}_${sid}_${round}` : `${fecha}_${sid}`; }
function gastoOf(fecha,sid,round){ const g=S.gastos[gastoId(fecha,sid,round)]; return g && !(g.anticipo && g.estadoAnticipo==="rechazada") ? g : null; }
function reintOf(fecha,sid){ return S.reint[fecha+"_"+sid]||null; }
function reintAmt(sid,d){ const r=reintOf(S.mes+"-"+pad(d),sid); return r? (+r.monto||0) : 0; }
function reintMes(k){ return Object.values(S.reint).filter(r=>(r.mes||r.fecha||"").slice(0,7)===(k||S.mes)); }
async function refreshGastos(){ if(!S.db) return; try{ const snap=await S.db.collection("gastos").get(); const m={}; snap.docs.forEach(d=>m[d.id]=d.data()); S.gastos=m; safeRender(); }catch(e){ console.warn("gastos",e); } }
function drawGasto(pdf,v,top,copia){
  const L=36,R=pdf.W-36,Wd=R-L; const mu="#5B6863", ln="#B3C0BA";
  const band= copia==="DSA"? "#0B2925" : "#1E3A5F"; const soft= copia==="DSA"? "#9CC4B9" : "#A9C2E0";
  const WDL=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const fmtD=iso=>{ const [y,m,dd]=iso.split("-"); return `${dd}/${m}/${y}`; };
  let y=top+28;
  pdf.rect(L,y,Wd,38,{fill:band});
  pdf.text(L+12,y+17,v.g?.anticipo?"SOLICITUD DE ANTICIPO ZR":"SOLICITUD DE GASTO ZR",{size:14,bold:true,color:"#FFFFFF"});
  pdf.text(L+12,y+30,"ZONAS ROJAS · "+brand().toUpperCase(),{size:7.5,color:soft});
  const lbl= copia==="DSA"? "COPIA: ENTREGA DSA" : "COPIA: LIQUIDACIÓN CBC";
  const lw=tw(lbl,8.5,"F2")+18; pdf.rect(R-12-lw,y+8,lw,22,{fill:"#FFFFFF"}); pdf.text(R-12-lw/2,y+22.5,lbl,{size:8.5,bold:true,color:band,align:"center"});
  y+=52;
  const [yy,mm,dd]=v.fecha.split("-").map(Number); const wd=WDL[new Date(yy,mm-1,dd).getDay()];
  const f=(x,w,label,val,o={})=>{ pdf.text(x,y,label.toUpperCase(),{size:6.5,bold:true,color:mu}); const ls=wrap(val,o.size||10,o.bold?"F2":"F1",w-6).slice(0,o.max||1); ls.forEach((t,i)=>pdf.text(x,y+12+i*11.5,t,{size:o.size||10,bold:o.bold})); return ls.length; };
  const nl=f(L,Wd*0.6,"Sector",v.corr+" · "+v.s.nombre,{bold:true,max:2});
  f(L+Wd*0.62,Wd*0.2,"Correlativo",v.g?.correlativo||v.next,{bold:true});
  f(L+Wd*0.82,Wd*0.18,"No. copia",copia==="DSA"?"1 de 2":"2 de 2");
  y+=18+nl*11.5;
  f(L,Wd*0.24,"Fecha programada",`${fmtD(v.fecha)} (${wd})`);
  const RT=v.g?.rutas||v.rutas||null;
  f(L+Wd*0.25,Wd*0.13,RT?.length>1?"Rutas":"No. de ruta",RT?.length>1?`${RT[0].ruta} +${RT.length-1}`:(v.g?.ruta||v.ruta||"—"),{bold:true});
  f(L+Wd*0.39,Wd*0.33,RT?.length>1?"Pilotos":"Piloto",RT?.length>1?`${RT[0].piloto}${RT.length>1?` +${RT.length-1}`:""}`:(v.g?.piloto||v.piloto||"—"),{bold:true});
  f(L+Wd*0.73,Wd*0.27,"Fecha de emisión",(()=>{const e=new Date(v.g?.generado||Date.now());return `${pad(e.getDate())}/${pad(e.getMonth()+1)}/${e.getFullYear()} ${pad(e.getHours())}:${pad(e.getMinutes())}`;})());
  y+=30;
  pdf.line(L,y,R,y,{color:ln,w:0.5}); y+=10;
  // monto
  const monto=v.monto;
  pdf.rect(L,y,Wd*0.38,46,{stroke:band,w:1.2});
  pdf.text(L+10,y+14,"MONTO SOLICITADO",{size:6.5,bold:true,color:mu});
  pdf.text(L+10,y+35,q(monto),{size:18,bold:true,color:band});
  pdf.text(L+Wd*0.38+14,y+14,"MONTO EN LETRAS",{size:6.5,bold:true,color:mu});
  wrap(numLetras(monto),9.5,"F2",Wd*0.62-20).slice(0,2).forEach((t,i)=>pdf.text(L+Wd*0.38+14,y+28+i*12,t,{size:9.5,bold:true}));
  y+=58;
  pdf.text(L,y,"CONCEPTO",{size:6.5,bold:true,color:mu});
  wrap(`${v.reg>0?"Diferencia de pago":"Pago"} programado de zonas rojas, sector ${v.s.nombre}, correspondiente al ${fmtD(v.fecha)}. Forma de pago: ${TIPO_TXT[sectorTipo(v.s)]}.${v.b!==monto&&!v.rutaLbl?` Presupuesto del día ${q(v.b)}; ya registrado ${q(v.reg)}.`:""}${RT?.length>1?` Monto distribuido en ${RT.length} rutas.`:""}${v.rutaLbl?` ${v.rutaLbl}.`:""}`,9,"F1",Wd-70).slice(0,2).forEach((t,i)=>pdf.text(L+62,y+i*11,t,{size:9}));
  y+=26;
  if(RT?.length>1){ pdf.text(L,y,"RUTAS",{size:6.5,bold:true,color:mu}); const ls=wrap(RT.map((r,k)=>`${k+1}) Ruta ${r.ruta} · ${r.piloto} · ${q(r.monto)}`).join("     "),8.5,"F1",Wd-70).slice(0,3); ls.forEach((t,k)=>pdf.text(L+62,y+k*10.5,t,{size:8.5})); y+=ls.length*10.5+6; }
  const com=v.g?.comentario||v.comentario||"";
  if(com){ pdf.text(L,y,"COMENTARIOS",{size:6.5,bold:true,color:mu}); const ls=wrap(com.replace(/\s+/g," "),8.5,"F1",Wd-70); const maxL=Math.max(1,Math.floor((top+396-84-y)/10.5)); ls.slice(0,maxL).forEach((t,i)=>pdf.text(L+62,y+i*10.5,(i===maxL-1&&ls.length>maxL)?t.slice(0,-3)+"…":t,{size:8.5})); }
  // firmas
  const fy=top+396-52; const sw=(Wd-40)/3;
  const vend=RT?.length>1? [...new Set(RT.map(r=>r.piloto))].join(" / ") : (v.g?.piloto||v.piloto||""), coord=v.g?.coordinadorNombre||S.me?.name||"";
  [["Vendedor de Pedido Programado",L,vend],["Coordinador de Liquidación",L+sw+20,coord],["Liquidación CBC",L+2*(sw+20),""]].forEach(([t,x,nm])=>{
    if(nm) pdf.text(x+sw/2,fy-4,nm,{size:8,align:"center"});
    pdf.line(x,fy,x+sw,fy,{w:0.9});
    pdf.text(x+sw/2,fy+11,t,{size:8.5,bold:true,align:"center"});
    pdf.text(x+sw/2,fy+23,"Firma y fecha: ___/___/______",{size:7,color:mu,align:"center"});
  });
  pdf.text(R,top+396-8,`${v.g?.anticipo?"Solicitud de anticipo ZR (requiere autorización)":"Solicitud de gasto ZR"} · ${copia==="DSA"?"Entrega DSA":"Liquidación CBC"} · Control ${brand()}`,{size:6.5,color:mu,align:"right"});
}
function expandGastos(list){
  const out=[];
  for(const v of list){ const RT=v.g?.rutas||v.rutas;
    if(!(RT?.length>1)){ out.push(v); continue; }
    RT.forEach((r,i)=>out.push({...v, monto:r.monto, ruta:r.ruta, piloto:r.piloto, rutas:null, g:{...(v.g||{}), rutas:null, ruta:r.ruta, piloto:r.piloto, correlativo:`${v.g?.correlativo||v.next}·R${i+1}`},
      rutaLbl:`Ruta ${i+1} de ${RT.length}; total del sector ${q(v.monto)}`})); }
  return out;
}
function buildGastos(list){
  const pdf=MiniPDF(); list=expandGastos(list);
  for(const v of list){ pdf.page(); drawGasto(pdf,v,0,"DSA"); pdf.line(24,396,pdf.W-24,396,{dash:true,color:"#9AA8A2",w:0.6}); pdf.text(pdf.W/2,392,"- - - cortar aquí - - -",{size:6.5,color:"#9AA8A2",align:"center"}); drawGasto(pdf,v,396,"CBC"); }
  return pdf.output();
}
function gastoData(sid,d){
  const v=valeData(sid,d); if(!v||!v.b) return null;
  v.g=gastoOf(v.fecha,sid); v.monto=round2(Math.max(v.b-v.reg,0))||v.b; return v;
}
async function genGastos(list,filename){
  list=list.filter(Boolean).filter(v=>!gastoOf(v.fecha,v.s.id));
  const antList=[];
  if(!list.length){ toast("Las solicitudes de gasto ya fueron generadas"); return; }
  // registrar la generación (correlativo reservado) antes de descargar, para habilitar "Registrar ZR"
  const now=new Date().toISOString(); const writes=[];
  for(const v of list){ const id=gastoId(v.fecha,v.s.id); const raw=S.gastos[id]; const prev= raw && raw.anticipo && raw.estadoAnticipo==="rechazada" ? null : raw;
    const ant= v.fecha!==todayISO;
    const extra= ant? {anticipo:true, estadoAnticipo:"pendiente", tipoAnticipo: v.fecha>todayISO?"anticipo":"fuera_fecha", solicitanteId:S.me?.id||"", solicitanteNombre:S.me?.name||"", solicitado:now, historial: raw&&!prev? [...(raw.historial||[]),{estado:"rechazada",por:raw.decididoNombre||"",fecha:raw.decididoEn||"",motivo:raw.motivoRechazo||""}] : (raw?.historial||[])} : {anticipo:false};
    if(ant) antList.push(v);
    const doc={...extra, fecha:v.fecha, sectorId:v.s.id, sectorNombre:v.s.nombre, mes:S.mes, monto:v.monto, ronda:roundOf(v.fecha,v.s.id), ruta:v.ruta||prev?.ruta||"", piloto:v.piloto||prev?.piloto||"", rutas:v.rutas||prev?.rutas||null, comentario:v.comentario??prev?.comentario??"", coordinadorId:S.me?.id||null, coordinadorNombre:S.me?.name||"", correlativo:prev?.correlativo||v.next, generado:prev?.generado||now, ultimaImpresion:now, veces:(prev?.veces||0)+1};
    S.gastos[id]=doc; v.g=doc; writes.push([id,doc]); }
  let bytes; try{ bytes=buildGastos(list); }catch(e){ console.error(e); toast("No se pudo generar el PDF"); return; }
  for(const [id,doc] of writes) logEvent("solicitud",doc.mes,`${doc.anticipo?"Solicitud de anticipo":"Solicitud de gasto"} ${doc.correlativo||""} · ${doc.sectorNombre} · ${q(doc.monto)} · programado ${doc.fecha.split("-").reverse().join("/")}${doc.rutas?.length>1?` · ${doc.rutas.length} rutas`:` · ruta ${doc.ruta}`}`);
  if(S.db){ try{ for(const [id,doc] of writes) await S.db.doc("gastos/"+id).set(doc); }catch(e){ toast("No se pudo guardar la solicitud; intente de nuevo"); return; } }
  safeRender();
  const dl = window.claude?.use? await window.claude.use("downloads") : null;
  if(!dl){ toast("Solicitud registrada. La descarga no está disponible en esta vista"); if(antList.length) showAnticipoMsg(antList); return; }
  try{ await dl.save({filename, data:new Blob([bytes],{type:"application/pdf"})}); if(!antList.length) toast(list.length>1?"Solicitudes generadas. Ya puede registrar cada ZR":"Solicitud generada. Ya puede registrar la ZR"); }
  catch(ex){ if(ex?.code!=="declined") toast("No se pudo descargar el PDF"); else toast("Solicitud registrada; descarga cancelada"); }
  if(antList.length) showAnticipoMsg(antList);
}
function openRegZR(sid,d){
  const fecha=S.mes+"-"+pad(d); const g=gastoOf(fecha,sid); if(!g){ toast("Genere primero la solicitud de gasto"); return; }
  if(reintOf(fecha,sid)){ toast("Este sector ya tiene un reintegro registrado"); return; }
  const rem=remainingFor(sid,fecha);
  if(rem.rest<=0.005){ toast("Este sector ya está liquidado para esa fecha"); return; }
  { const w=regWindow(g); if(!w.ok){ toast(w.why); return; } }
  S.editId=null; S.tab="registro"; S.calDay=d; renderTabs(); renderCal();
  $("#fRetiro").value=fecha; $("#fRegistro").value=todayISO; renderForm(); $("#fSector").value=sid;
  $("#fMonto").value= rem.rest>0? rem.rest : ""; $("#fRuta").value=g.ruta||""; renderPilotoSelect(g.piloto||""); $("#fPiloto").value=g.piloto||""; $("#fBoleta").value=""; $("#fBanco").value=""; S.manoEv=null; setTipoFromSector(); applyTipo();
  S.rutasM=(g.rutas?.length>1? g.rutas.map(r=>({ruta:r.ruta,piloto:r.piloto,boleta:"",banco:""})) : []); S.depsX=[]; S.rutasHide=false; $("#fMultiDep").checked=false; renderRutasBox();
  renderHint(); corrPreview(); renderDayList(); updateSaveState();
  $("#frm").scrollIntoView({block:"start",behavior:"smooth"});
  if(tipoPago()!=="mano") setTimeout(()=>$("#fBoleta").focus(),300);
  toast(tipoPago()==="mano"? "Ruta y piloto cargados de la solicitud · al guardar se pedirá la fotografía" : "Ruta y piloto cargados de la solicitud · complete boleta y banco");
}
document.addEventListener("click",e=>{
  const g=e.target.closest?.("[data-gasto]"); if(g && !g.disabled){ const [sid,d]=g.dataset.gasto.split("|"); const v=gastoData(sid,+d); openGastoModal([v],`Solicitud_de_gasto_ZR_${v?.corr}_${v?.fecha}.pdf`); return; }
  const ga=e.target.closest?.("[data-gastos-dia]"); if(ga && !ga.disabled){ const d=+ga.dataset.gastosDia; const f=S.mes+"-"+pad(d); openGastoModal(sectores().filter(s=>s.dias[d]&&!reintOf(f,s.id)).map(s=>gastoData(s.id,d)).filter(v=>v&&v.monto>0.005&&round2(v.b-v.reg)>0.005&&!gastoOf(v.fecha,v.s.id)),`Solicitudes_de_gasto_ZR_${S.mes}-${pad(d)}.pdf`); return; }
  const ri=e.target.closest?.("[data-reint]"); if(ri && !ri.disabled){ const [sid,d]=ri.dataset.reint.split("|"); openReint(sid,+d); return; }
  const rp=e.target.closest?.("[data-reint-pdf]"); if(rp){ const [sid,d]=rp.dataset.reintPdf.split("|"); const r=reintOf(S.mes+"-"+pad(+d),sid); if(r) downloadReintPdf(r); return; }
  const r=e.target.closest?.("[data-regzr]"); if(r && !r.disabled){ const [sid,d]=r.dataset.regzr.split("|"); openRegZR(sid,+d); }
});

/* ---------- pilotos ---------- */
/* DISCARGA: primero los pilotos de la agencia de ZR en uso */
function pilotos(){ const ag=window.__zrAgencia; return (S.pil||[]).slice().sort((a,b)=>((a.agencia===ag?0:1)-(b.agencia===ag?0:1))||a.nombre.localeCompare(b.nombre,"es")); }
function renderPilotoSelect(keep){
  const sel=$("#fPiloto"); const cur=keep!==undefined?keep:sel.value; const list=pilotos();
  let html=`<option value="">${list.length?"Seleccione un piloto…":"No hay pilotos en Personal"}</option>`+list.map(p=>`<option value="${esc(p.nombre)}">${esc(p.nombre)}${p.codigo?" · "+esc(p.codigo):""}</option>`).join("");
  if(cur && !list.some(p=>p.nombre===cur)) html+=`<option value="${esc(cur)}">${esc(cur)}</option>`;
  sel.innerHTML=html; sel.value=cur||"";
}
function renderPilotos(){
  $("#cntPil").textContent=(S.pil||[]).length;
  renderPilotoSelect();
  const list=pilotos();
  $("#tblPil").innerHTML= list.length? `<thead><tr><th>Piloto</th><th>Código / licencia</th><th>Teléfono</th><th class="r">Retiros del mes</th><th></th></tr></thead><tbody>${list.map(p=>{ const n=pagosMes().filter(x=>x.piloto===p.nombre).length;
    return `<tr><td><b>${esc(p.nombre)}</b></td><td class="num">${esc(p.codigo||"—")}</td><td class="num">${esc(p.telefono||"—")}</td><td class="r num">${n}</td><td class="r">${S.readOnly||!S.P?.admin?"":`<button class="btn small ghost danger-ghost" data-pdel="${esc(p.id)}"><svg class="ico"><use href="#i-trash"/></svg>Eliminar</button>`}</td></tr>`; }).join("")}</tbody>`
    : `<tbody><tr><td class="empty-state">No hay pilotos (conductores) activos en Personal para sus agencias.</td></tr></tbody>`;
  const T=$("#tblPil");
  T.querySelectorAll("[data-pdel]").forEach(b=>b.onclick=async()=>{ const p=(S.pil||[]).find(x=>x.id===b.dataset.pdel); if(!p) return; if(await askAdminPass(`Eliminar al piloto ${p.nombre}.`)) savePil((S.pil||[]).filter(x=>x.id!==p.id),"Piloto eliminado"); });
  T.querySelectorAll("[data-pdel-no]").forEach(b=>b.onclick=()=>{ S.confirmPil=null; renderPilotos(); });
  T.querySelectorAll("[data-pdel-ok]").forEach(b=>b.onclick=()=>{ S.confirmPil=null; savePil((S.pil||[]).filter(x=>x.id!==b.dataset.pdelOk),"Piloto quitado"); });
}
async function savePil(list,msg){
  const prev=S.pil; S.pil=list;
  try{ if(S.db) await S.db.doc("config/pilotos").set({lista:list, actualizado:new Date().toISOString()}); if(msg) toast(msg); safeRender(); return true; }
  catch(e){ S.pil=prev; toast(e?.code==="invalid_argument"?"No tiene permiso para modificar pilotos":"No se pudo guardar la lista de pilotos"); safeRender(); return false; }
}
const pilKey=n=>String(n||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
function mergePil(base,add){ const m=new Map(base.map(p=>[pilKey(p.nombre),p])); for(const p of add){ const k=pilKey(p.nombre); if(!k) continue; m.set(k,{...(m.get(k)||{}),...p,id:m.get(k)?.id||("p"+Math.random().toString(36).slice(2,10))}); } return [...m.values()]; }
function parsePilotRows(rows){
  let h=-1, ci={};
  for(let r=0;r<Math.min(rows.length,15)&&h<0;r++){ (rows[r]||[]).forEach((v,c)=>{ const k=pilKey(v); if(/^(piloto|nombre|nombre del piloto|nombre completo|pilotos)$/.test(k)&&ci.n===undefined){ ci.n=c; h=r; } }); }
  if(h<0){ // sin encabezado: primera columna con texto
    ci.n=0; h=-1; }
  const hdr=h>=0? rows[h]:[]; hdr.forEach((v,c)=>{ const k=pilKey(v); if(/codigo|licencia|carnet|dpi/.test(k)) ci.c??=c; if(/telefono|celular|tel/.test(k)) ci.t??=c; });
  const out=[];
  for(let r=h+1;r<rows.length;r++){ const row=rows[r]||[]; const nom=String(row[ci.n]??"").replace(/\s+/g," ").trim(); if(!nom||/^\d+([.,]\d+)?$/.test(nom)) continue;
    out.push({nombre:nom, codigo:ci.c!==undefined?String(row[ci.c]??"").trim():"", telefono:ci.t!==undefined?String(row[ci.t]??"").trim():""}); }
  return out;
}
function readPilFile(f){
  const er=$("#pilErr"); er.hidden=true; $("#pilPreview").hidden=true; $("#pilImpActs").hidden=true; S.pilImp=null;
  if(!f) return; $("#pilFileName").textContent=f.name;
  const rd=new FileReader();
  rd.onload=()=>{ try{
      let rows;
      if(/\.csv$/i.test(f.name)){ const txt=new TextDecoder().decode(new Uint8Array(rd.result)); const sep=(txt.split("\n")[0].match(/;/g)||[]).length>(txt.split("\n")[0].match(/,/g)||[]).length?";":","; rows=txt.split(/\r?\n/).map(l=>l.split(sep).map(x=>x.replace(/^"|"$/g,""))); }
      else { if(typeof XLSX==="undefined") throw new Error("xlsx"); const wb=XLSX.read(new Uint8Array(rd.result),{type:"array"}); rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:""}); }
      const list=parsePilotRows(rows);
      if(!list.length){ er.textContent="No encontré nombres de pilotos. Use una columna con el encabezado “Piloto” o “Nombre”."; er.hidden=false; return; }
      S.pilImp=list; const nuevos=list.filter(p=>!(S.pil||[]).some(x=>pilKey(x.nombre)===pilKey(p.nombre))).length;
      $("#pilPreview").innerHTML=`<span><b>${list.length}</b> pilotos en el archivo · <b>${nuevos}</b> nuevos</span><span class="muted">${list.slice(0,5).map(p=>esc(p.nombre)).join(", ")}${list.length>5?"…":""}</span>`;
      $("#pilPreview").hidden=false; $("#pilImpActs").hidden=S.readOnly;
    }catch(e){ er.textContent= e?.message==="xlsx"? "No se pudo cargar el lector de Excel. Use CSV o recargue la página." : "No se pudo leer el archivo."; er.hidden=false; } };
  rd.readAsArrayBuffer(f);
}
function cancelPil(){ S.pilImp=null; $("#pilFile").value=""; $("#pilFileName").textContent="Archivo .xlsx o .csv"; $("#pilPreview").hidden=true; $("#pilImpActs").hidden=true; }
async function addOnePil(){
  const nom=$("#pNom").value.replace(/\s+/g," ").trim(); if(!nom){ toast("Ingrese el nombre del piloto"); return; }
  if((S.pil||[]).some(p=>pilKey(p.nombre)===pilKey(nom))){ toast("Ese piloto ya está en la lista"); return; }
  if(await savePil(mergePil(S.pil||[],[{nombre:nom,codigo:$("#pCod").value.trim(),telefono:$("#pTel").value.trim()}]),`Piloto ${nom} agregado`)){ $("#pNom").value=""; $("#pCod").value=""; $("#pTel").value=""; }
}
function goPilotos(){ S.tab="pilotos"; renderTabs(); window.scrollTo({top:0,behavior:"smooth"}); }

/* ---------- descarga de toda la data del mes ---------- */
async function downloadDataMes(){
  if(typeof XLSX==="undefined"){ toast("No se pudo cargar el generador de Excel. Recargue la página."); return; }
  if(!budget()){ toast("No hay presupuesto para este mes"); return; }
  const wb=XLSX.utils.book_new(); const pm=paidMap();
  const ret=[["Fecha retiro","Fecha registro","Correlativo","Correlativo sector","Sector","No. ruta","Piloto","Motivo de pago","No. boleta","Banco","Monto registrado","Presupuesto del día","Estado","Parcial autorizado","No. autorización","Autorizado por","Creado","Evidencia foto"]];
  for(const p of pagosMes().sort((a,b)=>cmpCorr(a.correlativo,b.correlativo)||String(a.fechaRetiro).localeCompare(String(b.fechaRetiro)))){ const s=secById(p.sectorId), d=dayOf(p), b=s?.dias[d]||0;
    ret.push([p.fechaRetiro,p.fechaRegistro,p.correlativo,s?baseCorr(s):"",s?.nombre||p.sectorNombre||"",p.ruta||"",p.piloto||"",(p.tipoPago==="mano"?"Mano a mano":p.tipoPago==="deposito"?"Depósito":(p.banco?"Depósito":"—")),p.boleta||"",p.banco||"",+p.monto||0,b,statusFor(b,pm[p.sectorId]?.[d]?.sum||0,d,pm[p.sectorId]?.[d]?.list).t,p.autorizacion?"Sí":"No",p.autorizacion?.numero||"",p.autorizacion?.autorizadoNombre||p.autorizacion?.jefeNombre||"",String(p.creado||"").replace("T"," ").slice(0,16),p.evidenciaFoto?(p.evidenciaFoto.nombre||"Sí"):""]); }
  const tRet=ret.slice(1).reduce((a,r)=>a+r[10],0); const seen=new Set(); let tPres=0; for(const p of pagosMes()){ const k=p.sectorId+"|"+p.fechaRetiro; if(!seen.has(k)){ seen.add(k); tPres+=secById(p.sectorId)?.dias[dayOf(p)]||0; } }
  ret.push([]); ret.push(["TOTAL","","","","","","","","","",round2(tRet),round2(tPres)]);
  const ws1=XLSX.utils.aoa_to_sheet(ret); ws1["!cols"]=[10,10,11,10,40,9,24,14,12,20,14,14,18,10,12,22,16,20].map(w=>({wch:w})); XLSX.utils.book_append_sheet(wb,ws1,"Retiros");
  const prog=[["Fecha","Correlativo sector","Sector","Presupuesto","Registrado","Reintegro","Por ejecutar","Estado","Solicitudes de gasto (ruta · piloto)"]];
  for(let d=1; d<=daysIn(S.mes); d++) for(const s of sectores()){ const b=s.dias[d]||0; if(!b) continue; const p=pm[s.id]?.[d]?.sum||0; const f=S.mes+"-"+pad(d); const ri=reintAmt(s.id,d);
    const gs=Object.entries(S.gastos).filter(([id])=>id===f+"_"+s.id||id.startsWith(f+"_"+s.id+"_")).map(([,g])=>`${g.correlativo||""} ruta ${g.ruta||"—"} · ${g.piloto||"—"}`).join(" | ");
    prog.push([f,baseCorr(s),s.nombre,b,p,ri,round2(Math.max(b-p-ri,0)),statusFor(b,p,d,pm[s.id]?.[d]?.list).t,gs]); }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(prog),"Programado");
  const sol=[["No.","Estado","Fecha retiro","Sector","Presupuesto","Monto solicitado","Ruta","Piloto","Motivo de pago","Boleta","Banco","Solicitado por","Autorizado / rechazado por","Fecha de decisión","Motivo","Motivo de rechazo","Pago registrado","Monto registrado"]];
  for(const x of S.sols.filter(x=>x.fechaRetiro?.slice(0,7)===S.mes)) sol.push([x.numero,x.estado,x.fechaRetiro,x.sectorNombre,x.presupuesto,x.montoSolicitado,x.ruta,x.piloto||"",x.tipoPago==="mano"?"Mano a mano":"Depósito",x.boleta,x.banco,x.solicitanteNombre||"",x.decididoNombre||x.jefeNombre||"",String(x.decidido||"").replace("T"," ").slice(0,16),x.motivo,x.motivoRechazo||"",x.correlativo||"",x.montoRegistrado||""]);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sol),"Autorizaciones");
  const rei=[["No. reintegro","Fecha programada","Fecha de reintegro","Correlativo sector","Sector","Pagos ejecutados","Presupuesto","Ejecutado","Tipo de reintegro","Monto reintegrado","No. de recibo","Banco","Evidencia","Observaciones"]];
  for(const r of reintMes().sort((a,b)=>cmpCorr(a.corrSector,b.corrSector))) rei.push([r.numero,r.fecha,r.fechaRegistro,r.corrSector||"",r.sectorNombre,(r.pagos||[]).map(p=>p.correlativo).join(", "),r.presupuesto,r.ejecutado,r.tipoMonto==="total"?"Total del día":"Diferencia",r.monto,r.recibo,r.banco,r.evidencia?.nombre||"",r.observaciones||""]);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rei),"Reintegros");
  const sec=[["Correlativo","Sector","Días de pago","Presupuesto mes","Registrado","Reintegro","Por ejecutar"]];
  for(const s of sectores()){ const pres=Object.values(s.dias).reduce((a,b)=>a+b,0); const reg=round2(Object.values(pm[s.id]||{}).reduce((a,v)=>a+v.sum,0)); const ri=round2(Object.keys(s.dias).reduce((a,d)=>a+reintAmt(s.id,+d),0)); sec.push([baseCorr(s),s.nombre,Object.keys(s.dias).join(", "),pres,reg,ri,round2(pres-reg-ri)]); }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sec),"Por sector");
  const data=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  const dl=await (window.claude?.use? window.claude.use("downloads") : null);
  if(!dl){ toast("La descarga no está disponible en esta vista"); return; }
  try{ await dl.save({filename:`Data_ZR_${S.mes}.xlsx`, data:new Blob([data])}); }
  catch(ex){ if(ex?.code!=="declined") toast("No se pudo generar la descarga"); }
}

/* ---------- recordatorio de pagos pendientes ---------- */
function pendientesPorRegistrar(){
  const out={}; if(!budget()) return {total:0,dias:[]};
  const pm=paidMap();
  for(let d=1; d<=daysIn(S.mes); d++){ const f=S.mes+"-"+pad(d); if(f>todayISO) break;
    for(const s of sectores()){ const b=s.dias[d]; if(!b) continue; const p=pm[s.id]?.[d]?.sum||0; const rest=round2(b-p-reintAmt(s.id,d)); if(rest<=0.005) continue; (out[d] ||= {d,items:[],q:0}); out[d].items.push(s); out[d].q+=rest; } }
  const dias=Object.values(out); return {total:dias.reduce((a,x)=>a+x.items.length,0), dias};
}
function showReminder(){
  const r=pendientesPorRegistrar();
  if(!r.total){ $("#remBack").hidden=true; return; }
  const WDL=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"]; const mesN=MESES[+S.mes.slice(5)-1];
  $("#remSub").textContent=`${mesLabel(S.mes)} · hasta hoy ${todayISO.split("-").reverse().join("/")}`;
  $("#remBody").innerHTML=`<div style="display:flex;gap:12px;align-items:baseline"><span class="modal-big">${r.total}</span><span>pago(s) programado(s) pendiente(s) de registrar en <b>${r.dias.length}</b> día(s):</span></div>
    <div class="pend-days">${r.dias.map(x=>`<div class="pend-day"><div class="up-date"><b>${x.d}</b><span>${WDL[wdOf(S.mes,x.d)]}</span></div><div><b>${x.d} de ${mesN}</b> · ${x.items.length} pago(s)<small>${x.items.map(s=>esc(baseCorr(s))).join(", ")}</small></div><div style="display:grid;justify-items:end;gap:4px"><span class="num" style="font-weight:600">${q(x.q)}</span><button class="btn small" type="button" data-remday="${x.d}">Ver día</button></div></div>`).join("")}</div>`;
  $("#remBack").hidden=false;
  $("#remBody").querySelectorAll("[data-remday]").forEach(b=>b.onclick=()=>goDay(+b.dataset.remday));
  $("#remGo").onclick=()=>goDay(r.dias[0].d);
  setTimeout(()=>$("#remClose").focus(),50);
}
function goDay(d){ $("#remBack").hidden=true; S.calDay=d; S.tab="registro"; renderTabs(); renderCal(); setTimeout(()=>$("#dayList").scrollIntoView({block:"start",behavior:"smooth"}),50); }
let remTimer=null, remShown=false;
function scheduleReminder(){ if(remShown) return; clearTimeout(remTimer); remTimer=setTimeout(()=>{ remShown=true; showReminder(); },1500); }

/* ---------- indicadores ZR ---------- */
function comboChart(cats, opt={}){
  // cats: [{label, bar, line, tip, cur}]
  const n=cats.length; if(!n) return `<div class="empty-state">Sin datos.</div>`;
  const W=Math.max(900,n*(opt.long?64:56)), H=opt.long?360:260, L=60, R=16, T=18, B=opt.long?130:opt.rot?54:30, cw=(W-L-R)/n, bw=Math.max(10,Math.min(46,cw*0.6));
  const top=niceMax(Math.max(...cats.map(c=>Math.max(c.bar,c.line)),1)); const y=v=>T+(H-T-B)*(1-v/top);
  let g="";
  for(let i=0;i<=4;i++){ const v=top*i/4, yy=y(v); g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text x="${L-6}" y="${yy+3}" text-anchor="end">${v>=1000?(v/1000).toLocaleString("es-GT",{maximumFractionDigits:1})+"k":v}</text>`; }
  const pts=[];
  cats.forEach((c,i)=>{ const cx=L+cw*i+cw/2;
    if(c.bar) g+=`<path class="bb ${c.cur?"cur":""}" d="${barPath(cx-bw/2,y(c.bar),bw,H-B-y(c.bar))}"/>`;
    pts.push([cx,y(c.line)]);
    g+= opt.rot? `<text x="${cx}" y="${H-B+12}" text-anchor="end" transform="rotate(-${opt.long?55:40} ${cx} ${H-B+12})">${esc(c.label)}</text>` : `<text x="${cx}" y="${H-B+16}" text-anchor="middle" style="${c.cur?"fill:var(--ink);font-weight:700":""}">${esc(c.label)}</text>`;
  });
  g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" style="stroke:var(--line-strong)"/>`;
  g+=`<polyline class="ln" points="${pts.map(p=>p.join(",")).join(" ")}"/>`;
  cats.forEach((c,i)=>{ g+=`<circle class="dot ${c.line>c.bar+0.005?"over":""}" cx="${pts[i][0]}" cy="${pts[i][1]}" r="4"/>`; if(opt.vals && c.line>0) g+=`<text class="vlab" x="${pts[i][0]}" y="${pts[i][1]-9}" text-anchor="middle">${c.line>=1000?(c.line/1000).toLocaleString("es-GT",{maximumFractionDigits:1})+"k":c.line}</text>`; });
  cats.forEach((c,i)=>{ g+=`<rect class="hit" x="${L+cw*i}" y="${T}" width="${cw}" height="${H-T-B}" data-tip="${esc(c.tip)}"/>`; });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria||"")}">${g}</svg>`;
}
function dualChart(cats,opt={}){
  // cats: [{label, bar (monto), line (conteo), tip}] · eje izquierdo monto, eje derecho conteo
  const n=cats.length; if(!n) return `<div class="empty-state">Sin datos.</div>`;
  const long=cats.some(c=>String(c.label).length>8);
  const W=Math.max(900,n*(long?70:60)), H=long?340:280, L=60, R=44, T=34, B=long?110:34, cw=(W-L-R)/n, bw=Math.max(12,Math.min(44,cw*0.55));
  const topA=niceMax(Math.max(...cats.map(c=>c.bar),1)); const topB=Math.max(1,Math.ceil(Math.max(...cats.map(c=>c.line),1)*1.25));
  const ya=v=>T+(H-T-B)*(1-v/topA), yb=v=>T+(H-T-B)*(1-v/topB);
  const kf=v=>v>=1000?(v/1000).toLocaleString("es-GT",{maximumFractionDigits:1})+"k":String(Math.round(v));
  let g="";
  for(let i=0;i<=4;i++){ const v=topA*i/4, yy=ya(v); g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text x="${L-6}" y="${yy+3}" text-anchor="end">${kf(v)}</text><text x="${W-R+6}" y="${yy+3}" text-anchor="start">${(topB*i/4)%1?"":topB*i/4}</text>`; }
  g+=`<text x="${W-R+6}" y="${T-18}" text-anchor="start" style="font-weight:700">reg.</text><text x="${L-6}" y="${T-18}" text-anchor="end" style="font-weight:700">Q</text>`;
  const pts=[];
  cats.forEach((c,i)=>{ const cx=L+cw*i+cw/2;
    if(c.bar) g+=`<path class="dbar ${opt.warn?"warn":""}" d="${barPath(cx-bw/2,ya(c.bar),bw,H-B-ya(c.bar))}"/><text class="vlab" x="${cx}" y="${ya(c.bar)-5}" text-anchor="middle">${kf(c.bar)}</text>`;
    pts.push([cx,yb(c.line)]);
    g+= long? `<text x="${cx}" y="${H-B+12}" text-anchor="end" transform="rotate(-50 ${cx} ${H-B+12})">${esc(c.label)}</text>` : `<text x="${cx}" y="${H-B+16}" text-anchor="middle">${esc(c.label)}</text>`;
  });
  g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" style="stroke:var(--line-strong)"/>`;
  g+=`<polyline class="dln" points="${pts.map(p=>p.join(",")).join(" ")}"/>`;
  cats.forEach((c,i)=>{ g+=`<circle class="ddot" cx="${pts[i][0]}" cy="${pts[i][1]}" r="4.5"/><text class="nlab" x="${pts[i][0]+9}" y="${pts[i][1]-7}">${c.line} reg.</text>`; });
  cats.forEach((c,i)=>{ g+=`<rect class="hit" x="${L+cw*i}" y="${T}" width="${cw}" height="${H-T-B}" data-tip="${esc(c.tip)}"/>`; });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria||"")}">${g}</svg>`;
}
function reintSec(sid){ return round2(reintMes().filter(r=>r.sectorId===sid).reduce((a,r)=>a+(+r.monto||0),0)); }
function renderReintChart(){
  const box=$("#chartReint"); if(!box) return;
  const alc=$("#reintAlc").value; let src=alc==="todo"? Object.values(S.reint) : reintMes(); const dd=indDay(); if(dd && alc!=="todo") src=src.filter(r=>r.fecha===S.mes+"-"+pad(dd));
  const m=new Map();
  for(const r of src){ const k=r.corrSector||r.sectorId; const e=m.get(k)||{corr:k,nombre:r.sectorNombre,monto:0,n:0,list:[]}; e.monto+=(+r.monto||0); e.n++; e.list.push(r); m.set(k,e); }
  const rs=[...m.values()].sort((a,b)=>cmpCorr(a.corr,b.corr)); const tot=round2(rs.reduce((a,x)=>a+x.monto,0)); const n=rs.reduce((a,x)=>a+x.n,0);
  const presTot=alc==="todo"? Object.values(S.budgets).reduce((a,b)=>a+b.sectores.reduce((p,x)=>p+Object.values(x.dias).reduce((u,v)=>u+v,0),0),0) : dd? sectores().reduce((a,s)=>a+(s.dias[dd]||0),0) : totals().pres;
  $("#reintSum").innerHTML=`<span><b style="color:var(--warn)">${q(tot)}</b><small class="muted">total reintegrado</small></span><span><b>${n}</b><small class="muted">reintegros</small></span><span><b>${rs.length}</b><small class="muted">sectores</small></span><span><b>${presTot?(tot/presTot*100).toFixed(1):0}%</b><small class="muted">del presupuesto</small></span>`;
  if(!rs.length){ box.innerHTML=`<div class="empty-state">Aún no hay reintegros registrados${alc==="todo"?"":dd?` el ${dd} de ${MESES[+S.mes.slice(5)-1]}`:" en "+esc(mesLabel(S.mes))}.</div>`; return; }
  box.innerHTML=dualChart(rs.map(r=>({label:shortN(r.nombre,20), bar:round2(r.monto), line:r.n, tip:`<b>${esc(r.corr)} · ${esc(r.nombre)}</b><br>${r.n} reintegro(s) · ${q(r.monto)} · ${tot?(r.monto/tot*100).toFixed(0):0}%<br>${r.list.map(x=>`${esc(x.numero)} · ${x.fecha.split("-").reverse().join("/")} · ${q(x.monto)} · recibo ${esc(x.recibo)}`).join("<br>")}`})),{warn:true,aria:"Reintegros por sector: monto y número de reintegros"});
}
function indDay(){ const v=$("#indDia")?.value; return v? +v : 0; }
function renderIndDiaSel(){
  const sel=$("#indDia"); if(!sel) return; const cur=sel.value; const b=budget();
  if(!b){ sel.innerHTML=`<option value="">Todo el mes</option>`; return; }
  const WDL=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"]; const n=daysIn(S.mes); let o=`<option value="">Todo el mes</option>`;
  for(let d=1;d<=n;d++){ o+=`<option value="${d}">${d} - ${WDL[wdOf(S.mes,d)]}</option>`; }
  sel.innerHTML=o; if(cur && +cur<=n) sel.value=cur;
  const d=indDay(); $("#indDiaTxt").textContent= d? `Mostrando el ${d} de ${MESES[+S.mes.slice(5)-1]}: sectores, rutas y reintegros de ese día. La gráfica mensual no cambia.` : "Mostrando todo el mes. Elija un día para ver sectores, rutas y reintegros de ese día.";
}
const shortN=(t,n)=>{ t=String(t||""); return t.length>n? t.slice(0,n-1).trim()+"…" : t; };
function renderIndicadores(){
  renderIndDiaSel();
  renderReintChart();
  if(!$("#chartMes")) return;
  const MESC=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const keys=Object.keys(S.budgets).sort();
  const regMes=k=>round2(S.pagos.filter(p=>p.fechaRetiro?.slice(0,7)===k).reduce((a,p)=>a+(+p.monto||0),0));
  const cm=keys.map(k=>{ const pres=S.budgets[k].sectores.reduce((a,x)=>a+Object.values(x.dias).reduce((p,c)=>p+c,0),0); const reg=regMes(k);
    return {label:`${MESC[+k.slice(5)-1]} ${k.slice(2,4)}`, bar:pres, line:reg, cur:k===S.mes, tip:`<b>${mesLabel(k)}</b><br>Presupuesto ${q(pres)}<br>Total gastado ${q(reg)}<br>Reintegros ${q(reintMes(k).reduce((a,r)=>a+(+r.monto||0),0))}<br>Ejecución ${pres?(reg/pres*100).toFixed(1):0}%`}; });
  $("#chartMes").innerHTML=comboChart(cm,{vals:true,aria:"Presupuesto y total gastado por mes"});
  const dd=indDay(); const pmI=paidMap();
  const st= dd? sectores().map(s=>({s,pres:s.dias[dd]||0,reg:round2(pmI[s.id]?.[dd]?.sum||0)})).filter(r=>r.pres||r.reg) : secTotals();
  $("#secChartTitle").textContent=`Presupuesto vs. total gastado por sector · ${dd?`${dd} de ${MESES[+S.mes.slice(5)-1]}`:mesLabel(S.mes)}`;
  $("#secChartSub").textContent= dd? `${st.length} sector(es) con pago programado o registrado ese día` : "Mes seleccionado · pase el cursor para ver el detalle";
  $("#chartSec").innerHTML= !st.length? `<div class="empty-state">No hay pagos programados ni registrados ese día.</div>` : comboChart(st.map(r=>({label:shortN(r.s.nombre,22), bar:r.pres, line:r.reg, tip:`<b>${esc(baseCorr(r.s))} · ${esc(r.s.nombre)}</b><br>Presupuesto ${q(r.pres)}<br>Total gastado ${q(r.reg)}${reintSec(r.s.id)?`<br>Reintegro ${q(reintSec(r.s.id))}`:""}<br>${r.reg>r.pres+0.005?"Excede por "+q(r.reg-r.pres):"Pendiente "+q(round2(r.pres-r.reg-reintSec(r.s.id)))}`})),{rot:true,long:true,aria:"Presupuesto y total gastado por sector"});
  // rutas
  const alc=$("#rutaAlc").value; let src=alc==="todo"? S.pagos : pagosMes(); if(dd && alc!=="todo") src=src.filter(p=>p.fechaRetiro===S.mes+"-"+pad(dd));
  const m=new Map();
  for(const p of src){ const parts=p.rutas?.length? p.rutas : [{ruta:p.ruta,piloto:p.piloto,monto:+p.monto||0}];
    for(const rr of parts){ const k=String(rr.ruta||"").trim()||"Sin ruta"; const e=m.get(k)||{ruta:k,monto:0,n:0,sec:new Set(),pil:new Set()}; e.monto+=(+rr.monto||0); e.n++; e.sec.add(p.sectorNombre||secById(p.sectorId)?.nombre||""); if(rr.piloto) e.pil.add(rr.piloto); m.set(k,e); } }
  const rs=[...m.values()].sort((a,b)=>b.monto-a.monto); const tot=round2(rs.reduce((a,x)=>a+x.monto,0)); const nReg=rs.reduce((a,x)=>a+x.n,0);
  $("#rutaSum").innerHTML=`<span><b>${rs.filter(r=>r.ruta!=="Sin ruta").length}</b><small class="muted">rutas impactadas</small></span><span><b>${nReg}</b><small class="muted">registros</small></span><span><b>${q(tot)}</b><small class="muted">monto total</small></span>`;
  if(!rs.length){ $("#chartRutas").innerHTML=`<div class="empty-state">Aún no hay registros con ruta ${alc==="todo"?"":dd?`el ${dd} de ${MESES[+S.mes.slice(5)-1]}`:"en "+esc(mesLabel(S.mes))}.</div>`; return; }
  $("#chartRutas").innerHTML=dualChart(rs.map(r=>({label:r.ruta, bar:round2(r.monto), line:r.n, tip:`<b>Ruta ${esc(r.ruta)}</b><br>${r.n} registro(s) · ${q(r.monto)} · ${tot?(r.monto/tot*100).toFixed(0):0}%<br>Sectores: ${esc([...r.sec].filter(Boolean).join(", "))}${r.pil.size?`<br>Pilotos: ${esc([...r.pil].join(", "))}`:""}`})),{aria:"Rutas impactadas: monto y número de registros"});
}

/* ---------- datos de la solicitud de gasto (ruta y piloto) ---------- */
let gastoPend=null;
function openGastoModal(list,filename){
  list=(list||[]).filter(Boolean);
  if(!list.length){ toast("No hay solicitudes de gasto pendientes"); return; }
  if(!pilotos().length){ toast("No hay pilotos (conductores) en Personal de DISCARGA CONTROLER para sus agencias"); return; }
  gastoPend={list,filename};
  const opts=`<option value="">Seleccione…</option>`+pilotos().map(p=>`<option value="${esc(p.nombre)}">${esc(p.nombre)}${p.codigo?" · "+esc(p.codigo):""}</option>`).join("");
  $("#gmSub").textContent= list.length>1? `${list.length} sectores · ${list[0].fecha.split("-").reverse().join("/")}` : `${list[0].corr} · ${list[0].s.nombre}`;
  $("#gmBody").innerHTML=list.map((v,i)=>`<div class="gm-row"><div class="gm-name"><span class="corr-badge">${esc(v.corr)}</span>${esc(v.s.nombre)}<small>${v.reg>0?"Diferencia":"Monto"} ${q(v.monto)} · ${TIPO_TXT[sectorTipo(v.s)]}</small></div>
    <div class="field"><label for="gmR${i}">No. de ruta</label><input type="text" id="gmR${i}" autocomplete="off" placeholder="Ej. 102205"></div>
    <div class="field"><label for="gmP${i}">Piloto (vendedor de pedido programado)</label><select id="gmP${i}">${opts}</select></div>
    <div class="gm-rutas"><div id="gmX${i}" style="display:grid;gap:6px"></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" class="link-btn" data-gmadd="${i}">+ Agregar ruta</button><span class="gm-split" id="gmS${i}"></span></div></div>
    <div class="gm-com"><span class="lbl">¿Agregar comentarios?</span><div class="seg-toggle sm" role="radiogroup" aria-label="Agregar comentarios"><label><input type="radio" name="gmC${i}" value="no" checked data-gmc="${i}"><span>No</span></label><label><input type="radio" name="gmC${i}" value="si" data-gmc="${i}"><span>Sí</span></label></div>
      <textarea id="gmT${i}" rows="3" placeholder="Escriba el comentario" hidden></textarea></div></div>`).join("")
    + (list.length>1? `<button type="button" class="link-btn" id="gmCopy" style="justify-self:start">Copiar ruta y piloto del primero a todos</button>`:"");
  $("#gmErr").hidden=true; $("#gmBack").hidden=false;
  document.querySelectorAll("[data-gmc]").forEach(r=>r.onchange=()=>{ const t=$("#gmT"+r.dataset.gmc); t.hidden=r.value!=="si"||!r.checked; if(!t.hidden) t.focus(); });
  gmX=list.map(()=>[]); list.forEach((v,i)=>renderGmX(i));
  document.querySelectorAll("[data-gmadd]").forEach(b=>b.onclick=()=>{ const i=+b.dataset.gmadd; gmX[i].push({ruta:"",piloto:""}); renderGmX(i); setTimeout(()=>document.querySelector(`[data-gxr="${i}|${gmX[i].length-1}"]`)?.focus(),20); });
  const cp=$("#gmCopy"); if(cp) cp.onclick=()=>{ list.forEach((v,i)=>{ if(i){ $("#gmR"+i).value=$("#gmR0").value; $("#gmP"+i).value=$("#gmP0").value; } }); };
  setTimeout(()=>$("#gmR0")?.focus(),50);
}
let gmX=[];
function renderGmX(i){
  const v=gastoPend?.list?.[i]; if(!v) return; const box=$("#gmX"+i);
  box.innerHTML=gmX[i].map((r,k)=>`<div class="gm-x"><input type="text" data-gxr="${i}|${k}" value="${esc(r.ruta)}" placeholder="No. de ruta ${k+2}" autocomplete="off" aria-label="Ruta ${k+2}"><select data-gxp="${i}|${k}" aria-label="Piloto ruta ${k+2}">${pilOpts(r.piloto)}</select><span class="gm-split" data-gxa="${i}|${k}"></span><button type="button" class="btn small ghost danger-ghost icon-only" data-gxdel="${i}|${k}" aria-label="Quitar ruta ${k+2}">×</button></div>`).join("");
  box.querySelectorAll("[data-gxr]").forEach(el=>el.oninput=()=>{ const [a,b]=el.dataset.gxr.split("|").map(Number); gmX[a][b].ruta=el.value.trim(); });
  box.querySelectorAll("[data-gxp]").forEach(el=>el.onchange=()=>{ const [a,b]=el.dataset.gxp.split("|").map(Number); gmX[a][b].piloto=el.value; });
  box.querySelectorAll("[data-gxdel]").forEach(el=>el.onclick=()=>{ const [a,b]=el.dataset.gxdel.split("|").map(Number); gmX[a].splice(b,1); renderGmX(a); });
  const n=gmX[i].length+1; const sp=splitAmt(v.monto,n);
  $("#gmS"+i).textContent= n>1? `${n} rutas · ${q(v.monto)} ÷ ${n} = ${q(sp[1])} c/u${sp[0]!==sp[1]?` (ruta 1: ${q(sp[0])})`:""}` : "Si el retiro se reparte en varias rutas, agréguelas aquí";
  box.querySelectorAll("[data-gxa]").forEach(el=>{ const k=+el.dataset.gxa.split("|")[1]; el.textContent=q(sp[k+1]); });
}
async function confirmGastoModal(){
  if(!gastoPend) return; const {list,filename}=gastoPend; const miss=[];
  const cm=[];
  list.forEach((v,i)=>{ v.ruta=$("#gmR"+i).value.trim(); v.piloto=$("#gmP"+i).value; if(!v.ruta||!v.piloto) miss.push(v.corr);
    const xs=(gmX[i]||[]); if(xs.some(r=>!r.ruta||!r.piloto)) miss.push(v.corr+" (rutas adicionales)");
    const all=[{ruta:v.ruta,piloto:v.piloto},...xs]; const sp=splitAmt(v.monto,all.length); v.rutas= all.length>1? all.map((r,k)=>({ruta:r.ruta,piloto:r.piloto,monto:sp[k]})) : null;
    const si=document.querySelector(`input[name="gmC${i}"][value="si"]`)?.checked; v.comentario= si? $("#gmT"+i).value.trim() : ""; if(si && !v.comentario) cm.push(v.corr); });
  if(!miss.length && cm.length){ $("#gmErr").textContent=`Escriba el comentario de: ${cm.join(", ")} (o marque No).`; $("#gmErr").hidden=false; return; }
  if(miss.length){ $("#gmErr").textContent=`Complete ruta y piloto de: ${miss.join(", ")}.`; $("#gmErr").hidden=false; return; }
  $("#gmBack").hidden=true; gastoPend=null;
  await genGastos(list,filename);
}

/* ---------- solicitudes de anticipo ZR (fuera de fecha) ---------- */
function showAnticipoMsg(list){
  $("#amList").innerHTML=list.map(v=>`<div><span class="corr-badge">${esc(v.corr)}</span> ${esc(v.s.nombre)} · programado ${esc(v.fecha.split("-").reverse().join("/"))} · ${q(v.monto)}</div>`).join("");
  $("#amBack").hidden=false; setTimeout(()=>$("#amOk").focus(),30);
}
function antRows(){ return Object.entries(S.gastos).filter(([id,g])=>g.anticipo).map(([id,g])=>({id,g})); }
function renderAnticipos(){
  const box=$("#antCard"); if(!box) return;
  const filt=$("#autFiltro")?.value||"activas";
  const order={pendiente:0,autorizada:1,rechazada:2};
  const list=antRows().filter(x=>filt==="todas"||x.g.estadoAnticipo==="pendiente").sort((a,b)=>(order[a.g.estadoAnticipo]-order[b.g.estadoAnticipo])||String(b.g.solicitado||b.g.generado).localeCompare(String(a.g.solicitado||a.g.generado)));
  const nP=antRows().filter(x=>x.g.estadoAnticipo==="pendiente").length;
  const fdt=t=>{ if(!t) return ""; const d=new Date(t); return isNaN(d)?"":`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const head=`<div class="card-head"><div><h2>Solicitudes de anticipo ZR ${nP?`<span class="pill warn" style="margin-left:6px">${nP} pendiente(s)</span>`:""}</h2><p>Solicitudes de gasto generadas en un día distinto al programado. Solo un administrador las autoriza, con la evidencia del correo autorizado por CBC.</p></div></div>`;
  if(!list.length){ box.innerHTML=head+`<div class="empty-state">No hay solicitudes de anticipo ${filt==="todas"?"":"pendientes"}.</div>`; return; }
  const EA={pendiente:["warn","Pendiente de autorización"],autorizada:["ok","Autorizada"],rechazada:["crit","Rechazada"]};
  box.innerHTML=head+`<div class="ant-list">${list.map(({id,g})=>{ const e=EA[g.estadoAnticipo]||EA.pendiente; const s=secOf(g.fecha.slice(0,7),g.sectorId); const corr=s?baseCorr(s,S.budgets[g.fecha.slice(0,7)].sectores):"";
    let act="";
    if(g.estadoAnticipo==="pendiente"){
      act= S.P?.admin&&!S.readOnly ? (S.antRej===id
          ? `<div class="field" style="flex:1;min-width:220px"><label for="arj-${id}">Motivo del rechazo</label><input type="text" id="arj-${id}" autocomplete="off" placeholder="Opcional"></div><button class="btn no-solid" type="button" data-antrej-ok="${esc(id)}">Confirmar rechazo</button><button class="btn ghost" type="button" data-antrej-no="1">Volver</button>`
          : `<button class="btn ok-solid" type="button" data-antok="${esc(id)}"><svg class="ico"><use href="#i-check"/></svg>Autorizar con evidencia CBC</button><button class="btn no-solid" type="button" data-antrej="${esc(id)}"><svg class="ico"><use href="#i-alert"/></svg>Rechazar</button>`)
        : `<span class="pill warn">En espera de autorización del administrador</span>`;
    }
    const dec= g.estadoAnticipo==="autorizada"? `<div class="evid"><svg class="ico"><use href="#i-check"/></svg><span>Autorizada por <b>${esc(g.autorizadoNombre||"administrador")}</b> · ${esc(fdt(g.autorizadoEn))}${g.evidenciaCBC?.id?` · <a href="/_blob/${esc(g.evidenciaCBC.id)}" target="_blank" rel="noopener">Ver correo CBC</a>`:""} · Registro disponible 48 h</span></div>`
      : g.estadoAnticipo==="rechazada"? `<div class="hint warn"><span><b>Rechazada</b> por ${esc(g.decididoNombre||"administrador")} · ${esc(fdt(g.decididoEn))}${g.motivoRechazo?` · Motivo: ${esc(g.motivoRechazo)}`:""}. Puede generarse una nueva solicitud.</span></div>` : "";
    return `<article class="ant-item ${g.estadoAnticipo==="pendiente"?"pend":""}">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${corr?`<span class="corr-badge">${esc(corr)}</span>`:""}<b>${esc(g.sectorNombre||s?.nombre||"")}</b><span class="pill info">${g.tipoAnticipo==="fuera_fecha"?"Fuera de fecha":"Anticipo"}</span></div><span class="pill ${e[0]}">${e[1]}</span></div>
      <div class="ant-grid">
        <span><em>Fecha programada</em><b class="num">${esc(g.fecha.split("-").reverse().join("/"))}</b></span>
        <span><em>Solicitada</em><b class="num">${esc(fdt(g.solicitado||g.generado))}</b></span>
        <span><em>Monto</em><b class="num">${q(g.monto)}</b></span>
        <span><em>Correlativo</em><b class="num">${esc(g.correlativo||"")}</b></span>
        <span><em>Ruta · Piloto</em><b>${esc(g.ruta||"—")} · ${esc(g.piloto||"—")}</b></span>
        <span><em>Solicitado por</em><b>${esc(g.solicitanteNombre||g.coordinadorNombre||"—")}</b></span>
        ${g.comentario?`<span style="grid-column:1/-1"><em>Comentario</em><b style="font-weight:400">${esc(g.comentario)}</b></span>`:""}
      </div>${dec}
      ${act?`<div class="sol-actions">${act}</div>`:""}<div class="err" id="ae-${esc(id)}" hidden></div></article>`; }).join("")}</div>`;
  box.querySelectorAll("[data-antok]").forEach(b=>b.onclick=()=>openAntAuth(b.dataset.antok));
  box.querySelectorAll("[data-antrej]").forEach(b=>b.onclick=()=>{ S.antRej=b.dataset.antrej; renderAnticipos(); setTimeout(()=>$("#arj-"+CSS.escape(S.antRej))?.focus(),30); });
  box.querySelectorAll("[data-antrej-no]").forEach(b=>b.onclick=()=>{ S.antRej=null; renderAnticipos(); });
  box.querySelectorAll("[data-antrej-ok]").forEach(b=>b.onclick=()=>rejectAnt(b.dataset.antrejOk,($("#arj-"+CSS.escape(b.dataset.antrejOk))?.value||"").trim()));
}
let avCtx=null, avFileSel=null;
function openAntAuth(id){
  if(!S.P?.admin){ toast("Solo un administrador puede autorizar anticipos"); return; }
  const g=S.gastos[id]; if(!g||g.estadoAnticipo!=="pendiente") return;
  avCtx={id,g}; avFileSel=null; $("#avFile").value=""; $("#avPrev").hidden=true; $("#avIco").style.display=""; $("#avLbl").textContent="Pegue la captura del correo (Ctrl+V), arrástrela aquí o elija el archivo";
  $("#avData").innerHTML=[["Sector",g.sectorNombre],["Fecha programada",g.fecha.split("-").reverse().join("/")],["Monto",q(g.monto)],["Ruta · Piloto",`${g.ruta||"—"} · ${g.piloto||"—"}`],["Solicitado por",g.solicitanteNombre||"—"],["Correlativo",g.correlativo||""]].map(([k,v])=>`<span><em>${k}</em><b>${esc(v)}</b></span>`).join("");
  $("#avErr").hidden=true; $("#avOk").disabled=true; $("#avBack").hidden=false; setTimeout(()=>$("#avDrop").focus(),30);
}
function setAvFile(f){
  $("#avErr").hidden=true; avFileSel=null; $("#avOk").disabled=true; if(!f) return;
  const isPdf=f.type==="application/pdf"||/\.pdf$/i.test(f.name||""); const isImg=/^image\//.test(f.type)||/\.(jpe?g|png|webp|gif)$/i.test(f.name||"");
  if(!isPdf&&!isImg){ $("#avErr").textContent="La evidencia debe ser una imagen o un PDF del correo."; $("#avErr").hidden=false; return; }
  if(f.size>20*1024*1024){ $("#avErr").textContent="El archivo supera 20 MB."; $("#avErr").hidden=false; return; }
  if(isImg&&(!f.name||f.name==="image.png")){ try{ f=new File([f],`correo_cbc_${Date.now()}.${(f.type.split("/")[1]||"png").replace("jpeg","jpg")}`,{type:f.type||"image/png"}); }catch(e){} }
  avFileSel=f; $("#avLbl").textContent=f.name||"Evidencia pegada";
  if(isImg){ try{ const im=$("#avPrev"); im.src=URL.createObjectURL(f); im.hidden=false; $("#avIco").style.display="none"; }catch(e){} } else { $("#avPrev").hidden=true; $("#avIco").style.display=""; }
  $("#avOk").disabled=S.readOnly;
}
async function confirmAntAuth(){
  if(!avCtx||!avFileSel) return; const {id,g}=avCtx; const er=$("#avErr");
  $("#avBack").hidden=true;
  if(!(await askAdminPass(`Autorizar la solicitud de anticipo ${g.correlativo||""} · ${g.sectorNombre} · ${q(g.monto)}.`,{title:"Confirmar autorización de anticipo",ok:"Autorizar",cls:"ok-solid"}))){ $("#avBack").hidden=false; return; }
  const assets = window.claude?.use? await window.claude.use("assets") : null;
  if(!assets){ $("#avBack").hidden=false; er.textContent="Esta vista no permite cargar archivos."; er.hidden=false; return; }
  toast("Cargando evidencia…");
  try{
    const r=await assets.upload(avFileSel);
    const patch={estadoAnticipo:"autorizada", autorizadoEn:new Date().toISOString(), autorizadoId:S.me?.id||"", autorizadoNombre:S.me?.name||"Administrador", evidenciaCBC:{id:r.id,nombre:avFileSel.name||"evidencia",tipo:avFileSel.type||"",cargado:new Date().toISOString()}};
    if(S.db) await S.db.doc("gastos/"+id).update(patch);
    S.gastos[id]={...S.gastos[id],...patch}; avCtx=null; toast(`Anticipo ${g.correlativo||""} autorizado · el registro queda disponible 48 h`); logEvent("autorizacion",g.mes||g.fecha.slice(0,7),`Anticipo ${g.correlativo||""} autorizado con evidencia CBC · ${g.sectorNombre} · ${q(g.monto)}`); safeRender();
  }catch(ex){ $("#avBack").hidden=false; const c=ex?.code; er.textContent= c==="too_large"?"El archivo es demasiado grande.": c==="not_granted"||c==="invalid_argument"?"No tiene permiso para autorizar.":"No se pudo guardar la autorización. Intente de nuevo."; er.hidden=false; }
}
async function rejectAnt(id,motivo){
  const g=S.gastos[id]; if(!g) return;
  if(!(await askAdminPass(`Rechazar la solicitud de anticipo ${g.correlativo||""} · ${g.sectorNombre} · ${q(g.monto)}.`,{title:"Confirmar rechazo de anticipo",ok:"Rechazar",cls:"no-solid"}))) return;
  const patch={estadoAnticipo:"rechazada", decididoEn:new Date().toISOString(), decididoId:S.me?.id||"", decididoNombre:S.me?.name||"Administrador", motivoRechazo:motivo||""};
  try{ if(S.db) await S.db.doc("gastos/"+id).update(patch); S.gastos[id]={...S.gastos[id],...patch}; S.antRej=null; toast("Solicitud de anticipo rechazada"); logEvent("autorizacion",g.mes||g.fecha.slice(0,7),`Anticipo ${g.correlativo||""} rechazado · ${g.sectorNombre}${motivo?` · motivo: ${motivo}`:""}`); safeRender(); }
  catch(ex){ const e=$("#ae-"+CSS.escape(id)); if(e){ e.textContent="No se pudo guardar el rechazo. Intente de nuevo."; e.hidden=false; } }
}

/* ---------- presentación de resultados (PPTX) ---------- */
function loadPptxLib(){
  if(window.PptxGenJS) return Promise.resolve();
  const urls=[location.origin+"/zr/vendor/pptxgen.bundle.js"];
  return urls.reduce((pr,u)=>pr.catch(()=>new Promise((ok,ko)=>{ const sc=document.createElement("script"); sc.src=u; sc.onload=()=>window.PptxGenJS?ok():ko(); sc.onerror=ko; document.head.appendChild(sc); })), Promise.reject());
}
function mesResumen(){
  const t=totals(); const pm=paidMap(); const pct=t.pres? t.reg/t.pres*100 : 0;
  const pe=porEjecutarData(); const sumK=k=>round2(pe.reduce((a,x)=>a+x[k],0));
  const st={completo:0,parcial:0,reintegro:0,vencido:0,pendiente:0}; let qVenc=0;
  for(const s of sectores()) for(const [d,b] of Object.entries(s.dias)){ const paid=pm[s.id]?.[d]?.sum||0; const ri=reintAmt(s.id,+d); const past=S.mes+"-"+pad(d)<todayISO;
    if(paid+ri>=b-0.005) st[ri>0?"reintegro":"completo"]++; else if(paid>0) st.parcial++; else if(past){ st.vencido++; qVenc+=b; } else st.pendiente++; }
  const secs=secTotals().map(r=>({...r, rei:reintSec(r.s.id), dif:round2(r.pres-r.reg-reintSec(r.s.id))}));
  const rutasM=new Map(); for(const p of pagosMes()){ const parts=p.rutas?.length? p.rutas : [{ruta:p.ruta,monto:+p.monto||0}]; for(const r of parts){ const k=String(r.ruta||"").trim()||"Sin ruta"; const e=rutasM.get(k)||{ruta:k,monto:0,n:0}; e.monto+=(+r.monto||0); e.n++; rutasM.set(k,e); } }
  const rutas=[...rutasM.values()].sort((a,b)=>b.monto-a.monto);
  const sols=S.sols.filter(x=>(x.fechaRetiro||"").slice(0,7)===S.mes);
  const gast=Object.values(S.gastos).filter(g=>(g.mes||g.fecha||"").slice(0,7)===S.mes);
  return {t,pct,st,qVenc:round2(qVenc),qPe:sumK("pe"),qNe:sumK("ne"),secs,rutas,sols,ant:gast.filter(g=>g.anticipo),ext:gast.filter(g=>g.ext),reint:reintMes(),pagos:pagosMes().slice().sort((a,b)=>String(a.fechaRetiro).localeCompare(String(b.fechaRetiro))||cmpCorr(a.correlativo,b.correlativo))};
}
async function exportPptx(){
  if(!budget()){ toast("No hay presupuesto cargado para el mes"); return; }
  const btn=$("#btnPptx"); const old=btn.innerHTML; btn.disabled=true; btn.textContent="Preparando presentación…";
  try{
    await loadPptxLib();
    const R=mesResumen(); const t=R.t; const mesL=mesLabel(S.mes); const MESN=MESES[+S.mes.slice(5)-1];
    const NAVY="0A2357", BLUE="1D4ED8", ICE="EEF3FA", INK="1B2433", MUT="64748B", OK="0E8A5F", WARN="C2560C", CRIT="B91C1C", SKY="0EA5E9", LINE="D5DEEC";
    const pres=new PptxGenJS(); pres.layout="LAYOUT_WIDE"; pres.title=`Resultados ZR · ${mesL}`; pres.author=S.me?.name||"Control ZR"; pres.company=brand();
    const W=13.333, M=0.55; const FONT="Calibri";
    const fecha=new Date(); const fTxt=`${pad(fecha.getDate())}/${pad(fecha.getMonth()+1)}/${fecha.getFullYear()} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
    pres.defineSlideMaster({ title:"CONT", background:{color:"FFFFFF"}, objects:[ {text:{text:`${brand()} · Resultados ${mesL}`,options:{x:M,y:7.08,w:8,h:0.3,fontSize:9,color:MUT,fontFace:FONT}}} ], slideNumber:{x:W-1.0,y:7.08,w:0.5,h:0.3,fontSize:9,color:MUT,fontFace:FONT} });
    const title=(sl,tx,sub)=>{ sl.addText(tx,{x:M,y:0.3,w:W-2*M,h:0.7,fontSize:26,bold:true,color:NAVY,fontFace:FONT,margin:0}); if(sub) sl.addText(sub,{x:M,y:0.95,w:W-2*M,h:0.4,fontSize:13,color:MUT,fontFace:FONT,margin:0}); };
    const qf=v=>q(v); const kf=v=>"Q "+Math.round(v).toLocaleString("es-GT");
    const chartBase={ catAxisLabelFontFace:FONT, valAxisLabelFontFace:FONT, legendFontFace:FONT, dataLabelFontFace:FONT, catAxisLabelColor:MUT, valAxisLabelColor:MUT, catAxisLabelFontSize:9, valAxisLabelFontSize:9, valGridLine:{color:"E3E9F2",size:0.5}, catGridLine:{style:"none"}, showLegend:true, legendPos:"t", legendFontSize:10, valAxisLabelFormatCode:"#,##0" };

    // 1 · portada
    let sl=pres.addSlide(); sl.background={color:NAVY};
    sl.addText("INFORME DE RESULTADOS",{x:M,y:1.6,w:9,h:0.4,fontSize:14,bold:true,color:"7FB0FF",charSpacing:3,fontFace:FONT});
    sl.addText(`Pagos de zonas rojas · ${mesL}`,{x:M,y:2.1,w:11,h:1.2,fontSize:40,bold:true,color:"FFFFFF",fontFace:FONT});
    sl.addText(`${brand()} · Control de pagos ZR`,{x:M,y:3.3,w:11,h:0.5,fontSize:18,color:"CADCFC",fontFace:FONT});
    [["Presupuesto",qf(t.pres)],["Registrado",qf(t.reg)],["Ejecución",R.pct.toFixed(1)+"%"],["Reintegros",qf(t.reint)]].forEach(([l,v],i)=>{ const x=M+i*3.1; sl.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y:4.5,w:2.85,h:1.25,fill:{color:"13306E"},line:{color:"2A4A8C",width:1},rectRadius:0.08}); sl.addText([{text:l.toUpperCase(),options:{fontSize:10,color:"9FB7E8",bold:true,breakLine:true}},{text:v,options:{fontSize:20,bold:true,color:"FFFFFF"}}],{x:x+0.15,y:4.55,w:2.6,h:1.15,fontFace:FONT,valign:"middle",margin:0}); });
    sl.addText(`Generado el ${fTxt}${S.me?.name?` por ${S.me.name}`:""}`,{x:M,y:6.6,w:10,h:0.35,fontSize:11,color:"9FB7E8",fontFace:FONT});

    // 2 · resumen ejecutivo
    sl=pres.addSlide({masterName:"CONT"}); title(sl,"Resumen ejecutivo",`${mesL} · ${sectores().length} sectores · ${t.prog} pagos programados`);
    const kp=[["Presupuesto del mes",qf(t.pres),NAVY],["Total registrado",qf(t.reg),BLUE],["Ejecución",R.pct.toFixed(1)+"%",R.pct>=100?OK:BLUE],["Reintegros",qf(t.reint),WARN],["No ejecutado (vencido)",qf(R.qNe),CRIT],["Por ejecutar",qf(R.qPe),SKY]];
    kp.forEach(([l,v,c],i)=>{ const x=M+(i%2)*2.95, y=1.55+Math.floor(i/2)*1.7; sl.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w:2.75,h:1.5,fill:{color:ICE},line:{color:ICE,width:0},rectRadius:0.08}); sl.addText([{text:l,options:{fontSize:11,color:MUT,bold:true,breakLine:true}},{text:v,options:{fontSize:21,bold:true,color:c}}],{x:x+0.18,y,w:2.45,h:1.5,valign:"middle",fontFace:FONT,margin:0}); });
    const top=R.secs.slice().sort((a,b)=>b.reg-a.reg)[0]; const nComp=R.secs.filter(r=>r.pres>0&&Math.abs(r.dif)<0.005).length; const nSin=R.secs.filter(r=>r.reg===0&&r.pres>0).length;
    const parAut=R.sols.filter(x=>x.estado==="autorizada"||x.estado==="registrada").length, parRej=R.sols.filter(x=>x.estado==="rechazada").length;
    const bullets=[
      `Se ejecutó el ${R.pct.toFixed(1)}% del presupuesto: ${qf(t.reg)} de ${qf(t.pres)}${t.reint?`, más ${qf(t.reint)} reintegrados`:""}.`,
      `${R.st.completo+R.st.reintegro} de ${t.prog} pagos programados quedaron liquidados (${R.st.completo} completos y ${R.st.reintegro} con reintegro); ${R.st.parcial} parciales.`,
      R.st.vencido? `${R.st.vencido} pagos vencieron sin registro por ${qf(R.qVenc)}; requieren seguimiento.` : `No hay pagos vencidos sin registro a la fecha.`,
      R.st.pendiente? `Quedan ${R.st.pendiente} pagos por ejecutar en el mes por ${qf(R.qPe)}.` : `No quedan pagos pendientes por ejecutar en el mes.`,
      `${nComp} sectores completos y ${nSin} sin registros${top&&top.reg?`; el de mayor ejecución fue ${baseCorr(top.s)} ${top.s.nombre} (${qf(top.reg)})`:""}.`,
      `${R.rutas.filter(r=>r.ruta!=="Sin ruta").length} rutas impactadas${R.rutas[0]?`; la principal fue ${R.rutas[0].ruta} con ${qf(R.rutas[0].monto)}`:""}.`,
      `Autorizaciones: ${R.sols.length} pagos parciales (${parAut} autorizados, ${parRej} rechazados), ${R.ant.length} anticipos y ${R.ext.length} habilitaciones fuera de plazo.`
    ];
    sl.addText(bullets.map((b,i)=>({text:b,options:{bullet:true,breakLine:i<bullets.length-1}})),{x:6.6,y:1.55,w:6.2,h:5.1,fontSize:14,color:INK,fontFace:FONT,valign:"top",paraSpaceAfter:9,margin:0});

    // 3 · estado de pagos programados
    sl=pres.addSlide({masterName:"CONT"}); title(sl,"Estado de los pagos programados",`${t.prog} pagos programados en ${mesL}`);
    const stL=[["Completos",R.st.completo,OK],["Con reintegro",R.st.reintegro,SKY],["Parciales",R.st.parcial,WARN],["Vencidos sin registro",R.st.vencido,CRIT],["Por ejecutar",R.st.pendiente,"94A3B8"]].filter(x=>x[1]>0);
    if(stL.length) sl.addChart(pres.ChartType.doughnut,[{name:"Estado",labels:stL.map(x=>x[0]),values:stL.map(x=>x[1])}],{x:M,y:1.5,w:6.2,h:5.2,holeSize:55,chartColors:stL.map(x=>x[2]),showLegend:false,showPercent:true,showValue:false,dataLabelColor:"FFFFFF",dataLabelFontSize:11,dataLabelFontFace:FONT});
    stL.forEach(([l,v,c],i)=>{ const y=1.7+i*0.95; sl.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:7.4,y,w:0.35,h:0.35,fill:{color:c},line:{color:c,width:0},rectRadius:0.05}); sl.addText([{text:String(v),options:{bold:true,fontSize:20,color:INK}},{text:`  ${l}`,options:{fontSize:14,color:MUT}}],{x:7.9,y:y-0.12,w:5,h:0.6,fontFace:FONT,margin:0}); });

    // 4 · ejecución diaria
    const n=daysIn(S.mes), pm=paidMap(); const dl=[],db=[],dr=[];
    for(let d=1; d<=n; d++){ let b=0,p=0; for(const s of sectores()){ b+=s.dias[d]||0; p+=pm[s.id]?.[d]?.sum||0; } dl.push(String(d)); db.push(round2(b)); dr.push(round2(p)); }
    const diasPag=dr.filter(x=>x>0).length, diasProg=db.filter(x=>x>0).length;
    sl=pres.addSlide({masterName:"CONT"}); title(sl,"Presupuesto vs. registrado por día",`${diasPag} de ${diasProg} días programados tienen pagos registrados`);
    sl.addChart(pres.ChartType.bar,[{name:"Presupuesto",labels:dl,values:db},{name:"Registrado",labels:dl,values:dr}],{...chartBase,x:M,y:1.5,w:W-2*M,h:5.3,barDir:"col",barGrouping:"clustered",barGapWidthPct:40,chartColors:["C9D6EA",NAVY]});

    // 5 · por sector
    const secR=R.secs.filter(r=>r.pres||r.reg);
    sl=pres.addSlide({masterName:"CONT"}); title(sl,"Presupuesto vs. total gastado por sector",`${nComp} de ${secR.length} sectores completos en el mes`);
    sl.addChart(pres.ChartType.bar,[{name:"Presupuesto",labels:secR.map(r=>shortN(r.s.nombre,34)),values:secR.map(r=>round2(r.pres))},{name:"Registrado",labels:secR.map(r=>shortN(r.s.nombre,34)),values:secR.map(r=>round2(r.reg))}],{...chartBase,x:M,y:1.45,w:W-2*M,h:5.45,barDir:"bar",barGrouping:"clustered",barGapWidthPct:35,chartColors:["C9D6EA",BLUE],catAxisOrientation:"maxMin",catAxisLabelFontSize:8});

    // 6 · por mes
    const ks=Object.keys(S.budgets).sort(); const MESC=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const mL=ks.map(k=>`${MESC[+k.slice(5)-1]} ${k.slice(2,4)}`), mB=ks.map(k=>round2(S.budgets[k].sectores.reduce((a,x)=>a+Object.values(x.dias).reduce((p,c)=>p+c,0),0))), mR=ks.map(k=>round2(S.pagos.filter(p=>p.fechaRetiro?.slice(0,7)===k).reduce((a,p)=>a+(+p.monto||0),0)));
    sl=pres.addSlide({masterName:"CONT"}); title(sl,"Presupuesto vs. total gastado por mes",`${ks.length} mes(es) cargados`);
    sl.addChart(pres.ChartType.bar,[{name:"Presupuesto",labels:mL,values:mB},{name:"Total gastado",labels:mL,values:mR}],{...chartBase,x:M,y:1.5,w:W-2*M,h:5.3,barDir:"col",barGrouping:"clustered",barGapWidthPct:60,chartColors:["C9D6EA",NAVY],showValue:true,dataLabelFontSize:9,dataLabelFormatCode:"#,##0",dataLabelPosition:"outEnd"});

    // 7 · rutas y reintegros
    sl=pres.addSlide({masterName:"CONT"}); title(sl,"Rutas impactadas y reintegros",`${R.rutas.length} ruta(s) · ${R.reint.length} reintegro(s) por ${qf(t.reint)}`);
    const rt=R.rutas.slice(0,15);
    if(rt.length) sl.addChart(pres.ChartType.bar,[{name:"Monto registrado",labels:rt.map(r=>`${r.ruta} (${r.n})`),values:rt.map(r=>round2(r.monto))}],{...chartBase,showLegend:false,x:M,y:1.5,w:6.0,h:5.3,barDir:"bar",chartColors:[NAVY],catAxisOrientation:"maxMin",showValue:true,dataLabelFontSize:9,dataLabelFormatCode:"#,##0",showTitle:true,title:"Rutas: monto (no. de registros)",titleFontSize:12,titleColor:INK,titleFontFace:FONT});
    else sl.addText("Sin registros con ruta en el mes.",{x:M,y:3,w:6,h:0.5,fontSize:14,color:MUT,fontFace:FONT,align:"center"});
    const rm=new Map(); for(const r of R.reint){ const k=r.sectorNombre||""; rm.set(k,round2((rm.get(k)||0)+(+r.monto||0))); }
    if(rm.size) sl.addChart(pres.ChartType.bar,[{name:"Reintegrado",labels:[...rm.keys()].map(x=>shortN(x,30)),values:[...rm.values()]}],{...chartBase,showLegend:false,x:6.85,y:1.5,w:5.95,h:5.3,barDir:"bar",chartColors:[WARN],catAxisOrientation:"maxMin",showValue:true,dataLabelFontSize:9,dataLabelFormatCode:"#,##0",showTitle:true,title:"Reintegros por sector",titleFontSize:12,titleColor:INK,titleFontFace:FONT});
    else sl.addText("Sin reintegros en el mes.",{x:6.85,y:3,w:5.95,h:0.5,fontSize:14,color:MUT,fontFace:FONT,align:"center"});

    // tablas
    const hdr=(arr)=>arr.map(h=>({text:h,options:{bold:true,color:"FFFFFF",fill:{color:NAVY},fontSize:10}}));
    const tblOpt=(colW)=>({x:M,y:1.45,w:W-2*M,colW,fontSize:9.5,fontFace:FONT,color:INK,border:{type:"solid",pt:0.5,color:LINE},autoPage:true,autoPageRepeatHeader:true,autoPageHeaderRows:1,autoPageSlideStartY:1.45,margin:0.05,newSlideStartY:1.45,valign:"middle"});
    sl=pres.addSlide({masterName:"CONT"}); title(sl,"Detalle por sector",`Presupuesto, registrado, reintegros y diferencia · ${mesL}`);
    const tS=[hdr(["Correl.","Sector","Presupuesto","Registrado","Reintegro","Diferencia","Ejecución"]),...R.secs.map(r=>[baseCorr(r.s),r.s.nombre,{text:qf(r.pres),options:{align:"right"}},{text:qf(r.reg),options:{align:"right"}},{text:r.rei?qf(r.rei):"—",options:{align:"right"}},{text:qf(r.dif),options:{align:"right",color:r.dif<-0.005?CRIT:INK}},{text:r.pres?(r.reg/r.pres*100).toFixed(0)+"%":"—",options:{align:"right"}}]),
      [{text:"Total",options:{bold:true}},"",{text:qf(t.pres),options:{bold:true,align:"right"}},{text:qf(t.reg),options:{bold:true,align:"right"}},{text:qf(t.reint),options:{bold:true,align:"right"}},{text:qf(round2(t.pres-t.reg-t.reint)),options:{bold:true,align:"right"}},{text:R.pct.toFixed(0)+"%",options:{bold:true,align:"right"}}]];
    sl.addTable(tS,tblOpt([0.9,5.0,1.4,1.4,1.2,1.2,1.13]));
    sl=pres.addSlide({masterName:"CONT"}); title(sl,"Pagos registrados",`${R.pagos.length} pago(s) · ${qf(t.reg)}`);
    const fd=x=>x?x.split("-").reverse().join("/"):"";
    const tP=[hdr(["Fecha","Correl.","Sector","Ruta","Piloto","Boleta · banco","Tipo","Monto"]),...(R.pagos.length? R.pagos.map(p=>[fd(p.fechaRetiro),p.correlativo,shortN(p.sectorNombre,40),shortN(p.ruta||"—",22),shortN(p.piloto||"—",28),shortN(p.tipoPago==="mano"?"—":`${p.boleta||""} · ${p.banco||""}`,30),TIPO_TXT[p.tipoPago]||"",{text:qf(+p.monto),options:{align:"right"}}]) : [["Sin pagos registrados","","","","","","",""]])];
    sl.addTable(tP,tblOpt([0.95,0.95,3.2,1.2,1.75,1.85,1.0,1.33]));
    sl=pres.addSlide({masterName:"CONT"}); title(sl,"Reintegros y autorizaciones",`${R.reint.length} reintegro(s) · ${R.sols.length} pago(s) parcial(es) · ${R.ant.length} anticipo(s) · ${R.ext.length} habilitación(es)`);
    const EST={pendiente:"Pendiente",autorizada:"Autorizada",registrada:"Registrada",rechazada:"Rechazada",anulada:"Anulada"};
    const tA=[hdr(["Tipo","No. / correl.","Sector","Fecha","Monto","Estado","Detalle"]),
      ...R.reint.map(r=>["Reintegro",r.numero||"",shortN(r.sectorNombre,36),fd(r.fecha),{text:qf(+r.monto),options:{align:"right"}},"Registrado",`Recibo ${r.recibo||""} · ${r.banco||""}`]),
      ...R.sols.map(x=>["Pago parcial",x.numero||"",shortN(x.sectorNombre,36),fd(x.fechaRetiro),{text:qf(+x.montoSolicitado),options:{align:"right"}},EST[x.estado]||x.estado,shortN(x.motivo||"",50)]),
      ...R.ant.map(g=>["Anticipo",g.correlativo||"",shortN(g.sectorNombre,36),fd(g.fecha),{text:qf(+g.monto),options:{align:"right"}},EST[g.estadoAnticipo]||"",g.autorizadoNombre?`Autorizó ${g.autorizadoNombre}`:(g.motivoRechazo||"")]),
      ...R.ext.map(g=>["Fuera de plazo",g.correlativo||"",shortN(g.sectorNombre,36),fd(g.fecha),{text:qf(+g.monto),options:{align:"right"}},EST[g.ext.estado]||"",shortN(g.ext.motivo||"",50)])];
    if(tA.length===1) tA.push(["Sin reintegros ni autorizaciones en el mes","","","","","",""]);
    sl.addTable(tA,tblOpt([1.3,1.25,3.0,1.0,1.25,1.15,3.28]));

    // cierre
    sl=pres.addSlide(); sl.background={color:NAVY};
    sl.addText("Conclusiones y siguientes pasos",{x:M,y:0.8,w:12,h:0.8,fontSize:30,bold:true,color:"FFFFFF",fontFace:FONT});
    const nx=[R.st.vencido?`Dar seguimiento a ${R.st.vencido} pagos vencidos sin registro (${qf(R.qVenc)}).`:"Mantener el registro dentro de las 48 h de cada solicitud.",
      R.st.parcial?`Cerrar ${R.st.parcial} pagos parciales: registrar la diferencia o su reintegro.`:"Sin pagos parciales abiertos.",
      R.st.pendiente?`Ejecutar ${R.st.pendiente} pagos programados restantes (${qf(R.qPe)}).`:"El mes no tiene pagos pendientes por ejecutar.",
      "Generar los vales de liquidación pendientes y archivar las evidencias."];
    sl.addText(nx.map((b,i)=>({text:b,options:{bullet:true,breakLine:i<nx.length-1}})),{x:M,y:1.9,w:12,h:4.2,fontSize:18,color:"E6EEFB",fontFace:FONT,paraSpaceAfter:14,valign:"top"});
    sl.addText(`${brand()} · ${mesL} · ${fTxt}`,{x:M,y:6.7,w:12,h:0.35,fontSize:11,color:"9FB7E8",fontFace:FONT});

    const blob=await pres.write({outputType:"blob"});
    const dlc=await (window.claude?.use? window.claude.use("downloads") : null);
    if(!dlc){ toast("La descarga no está disponible en esta vista"); return; }
    await dlc.save({filename:`Resultados_ZR_${S.mes}.pptx`, data:blob});
    logEvent("config",S.mes,`Presentación de resultados de ${mesL} descargada`);
  }catch(ex){ if(ex?.code!=="declined"){ console.error(ex); toast("No se pudo generar la presentación. Revise su conexión a internet e intente de nuevo."); } }
  finally{ btn.disabled=false; btn.innerHTML=old; }
}

/* ---------- historial por mes ---------- */
S.bitacora=[]; S.respaldos={}; S.histMes=null;
const HTIPO={pago:["ok","Pago"],solicitud:["info","Solicitud"],autorizacion:["warn","Autorización"],vale:["ok","Vale"],reintegro:["info","Reintegro"],config:["neutral","Configuración"],eliminacion:["crit","Eliminación"]};
async function logEvent(tipo,mes,detalle){
  const ev={ts:new Date().toISOString(), tipo, mes:mes||S.mes||"", detalle:String(detalle||"").slice(0,600), usuarioId:S.me?.id||"", usuarioNombre:S.me?.name||""};
  try{ if(S.db){ const ref=await S.db.collection("bitacora").add(ev); if(!S.bitacora.some(x=>x.id===ref.id)) S.bitacora.push({...ev,id:ref.id}); } else S.bitacora.push({...ev,id:"l"+Date.now()}); }catch(e){}
  if(S.tab==="historial") renderHistorial(); else { const c=$("#cntHist"); if(c) c.textContent=histMeses().length; }
}
function mesTotals(k){
  const b=S.budgets[k]; const pres=b? b.sectores.reduce((a,x)=>a+Object.values(x.dias).reduce((p,c)=>p+c,0),0) : 0;
  const pagos=S.pagos.filter(p=>p.fechaRetiro?.slice(0,7)===k); const reint=Object.values(S.reint).filter(r=>(r.mes||r.fecha||"").slice(0,7)===k);
  return {pres, reg:round2(pagos.reduce((a,p)=>a+(+p.monto||0),0)), rei:round2(reint.reduce((a,r)=>a+(+r.monto||0),0)), nPagos:pagos.length, pagos, reint,
    nSol:Object.values(S.gastos).filter(g=>(g.mes||g.fecha||"").slice(0,7)===k).length, nVales:Object.values(S.vales).filter(v=>(v.mes||v.fecha||"").slice(0,7)===k).length};
}
function histMeses(){ const ks=new Set([...Object.keys(S.budgets),...Object.keys(S.respaldos),...S.bitacora.map(e=>e.mes).filter(Boolean)]); return [...ks].filter(k=>/^\d{4}-\d{2}$/.test(k)).sort().reverse(); }
async function saveRespaldo(k){
  const t=mesTotals(k); const b=S.budgets[k];
  const doc={mes:k, guardado:new Date().toISOString(), guardadoPor:S.me?.name||"", motivo:"Mes eliminado",
    presupuesto:{fuente:b?.fuente||"", sectores:b?.sectores?.length||0, total:t.pres},
    totales:{registrado:t.reg, reintegros:t.rei, pagos:t.nPagos, solicitudes:t.nSol, vales:t.nVales},
    pagos:t.pagos.map(p=>({correlativo:p.correlativo,fechaRetiro:p.fechaRetiro,fechaRegistro:p.fechaRegistro,sectorNombre:p.sectorNombre,monto:+p.monto||0,ruta:p.ruta||"",piloto:p.piloto||"",boleta:p.boleta||"",banco:p.banco||"",tipoPago:p.tipoPago||"",autorizacion:p.autorizacion?.numero||""})),
    reintegros:t.reint.map(r=>({numero:r.numero,fecha:r.fecha,sectorNombre:r.sectorNombre,monto:+r.monto||0,recibo:r.recibo||"",banco:r.banco||""}))};
  S.respaldos[k]=doc; if(S.db) await S.db.doc("historial_meses/"+k).set(doc);
}
function renderHistorial(){
  const T=$("#tblHist"); if(!T) return; const ks=histMeses(); $("#cntHist").textContent=ks.length;
  if(!S.histMes || !ks.includes(S.histMes)) S.histMes= ks.includes(S.mes)? S.mes : ks[0]||null;
  T.innerHTML= !ks.length? `<tbody><tr><td class="empty-state">Aún no hay historial.</td></tr></tbody>` : `<thead><tr><th>Mes</th><th>Estado</th><th class="r">Presupuesto</th><th class="r">Registrado</th><th class="r">Reintegros</th><th class="r">Pagos</th><th class="r">Movimientos</th><th></th></tr></thead><tbody>${ks.map(k=>{
    const live=!!S.budgets[k]; const rp=S.respaldos[k]; const t= live? mesTotals(k) : {pres:rp?.presupuesto?.total||0, reg:rp?.totales?.registrado||0, rei:rp?.totales?.reintegros||0, nPagos:rp?.totales?.pagos||0};
    const nEv=S.bitacora.filter(e=>e.mes===k).length;
    return `<tr class="${k===S.histMes?"sel":""}"><td><div class="sector-name">${esc(mesLabel(k))}</div></td><td>${live?`<span class="pill ok">Activo</span>`:`<span class="pill neutral">Respaldo${rp?.guardado?` · ${esc(fdLocal(rp.guardado))}`:""}</span>`}</td>
      <td class="r num">${q(t.pres)}</td><td class="r num">${q(t.reg)}</td><td class="r num">${t.rei?q(t.rei):"—"}</td><td class="r num">${t.nPagos}</td><td class="r num">${nEv}</td>
      <td style="white-space:nowrap"><button class="btn small" type="button" data-hver="${k}">Ver</button> <button class="btn small ghost" type="button" data-hxls="${k}"><svg class="ico"><use href="#i-download"/></svg>Excel</button>${S.P?.admin&&!S.readOnly?` <button class="btn small ghost danger-ghost icon-only" type="button" data-hdel="${k}" title="Borrar historial de ${esc(mesLabel(k))}" aria-label="Borrar historial de ${esc(mesLabel(k))}"><svg class="ico"><use href="#i-trash"/></svg></button>`:""}</td></tr>`; }).join("")}</tbody>`;
  T.querySelectorAll("[data-hver]").forEach(b=>b.onclick=()=>{ S.histMes=b.dataset.hver; renderHistorial(); });
  T.querySelectorAll("[data-hxls]").forEach(b=>b.onclick=()=>exportHist(b.dataset.hxls));
  T.querySelectorAll("[data-hdel]").forEach(b=>b.onclick=()=>delHist(b.dataset.hdel));
  // bitácora
  const k=S.histMes; const L=$("#histList");
  if(!k){ $("#histTitle").textContent="Bitácora"; L.innerHTML=`<div class="empty-state">Sin movimientos.</div>`; return; }
  const tipo=$("#histTipo").value, qq=normN($("#histQ").value);
  const evs=S.bitacora.filter(e=>e.mes===k && (!tipo||e.tipo===tipo) && (!qq||normN(e.detalle+" "+e.usuarioNombre).includes(qq))).sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
  $("#histTitle").textContent=`Bitácora · ${mesLabel(k)}`; $("#histSub").textContent=`${evs.length} movimiento(s)${S.budgets[k]?"":" · mes eliminado, se conserva el respaldo"}`;
  L.innerHTML= evs.length? evs.map(e=>{ const t=HTIPO[e.tipo]||["neutral",e.tipo]; return `<div class="hist-row"><span class="when">${esc(fdtL(e.ts))}</span><span><span class="pill ${t[0]}">${esc(t[1])}</span></span><span class="det">${esc(e.detalle)}</span><span class="who">${esc(e.usuarioNombre||"—")}</span></div>`; }).join("") : `<div class="empty-state">No hay movimientos ${tipo||qq?"con ese filtro":"registrados en este mes"}. Los movimientos se guardan desde esta versión en adelante.</div>`;
}
async function delHist(k){
  if(!(await askAdminPass(`Borrar el historial de ${mesLabel(k)}: ${S.bitacora.filter(e=>e.mes===k).length} movimiento(s)${S.respaldos[k]?" y el respaldo del mes":""}.${S.budgets[k]?" Los pagos y el presupuesto del mes NO se borran (eso se hace en Presupuestos mensuales).":""}`,{title:"Borrar historial del mes",ok:"Borrar historial"}))) return;
  try{ const evs=S.bitacora.filter(e=>e.mes===k);
    if(S.db){ for(const e of evs) await S.db.doc("bitacora/"+e.id).delete(); if(S.respaldos[k]) await S.db.doc("historial_meses/"+k).delete(); }
    S.bitacora=S.bitacora.filter(e=>e.mes!==k); delete S.respaldos[k]; toast(`Historial de ${mesLabel(k)} borrado`); renderHistorial();
  }catch(e){ toast("No se pudo borrar el historial"); }
}
async function exportHist(k){
  if(typeof XLSX==="undefined"){ toast("No se pudo cargar el generador de Excel"); return; }
  const wb=XLSX.utils.book_new(); const live=!!S.budgets[k]; const rp=S.respaldos[k];
  const t= live? mesTotals(k) : null;
  const res=[["Mes",mesLabel(k)],["Estado",live?"Activo":"Respaldo (mes eliminado)"],["Presupuesto",live?t.pres:rp?.presupuesto?.total||0],["Registrado",live?t.reg:rp?.totales?.registrado||0],["Reintegros",live?t.rei:rp?.totales?.reintegros||0],["Pagos",live?t.nPagos:rp?.totales?.pagos||0],["Generado",fdtL(new Date())],["Por",S.me?.name||""]];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(res),"Resumen");
  const bit=[["Fecha y hora","Tipo","Detalle","Usuario"],...S.bitacora.filter(e=>e.mes===k).sort((a,b)=>String(a.ts).localeCompare(String(b.ts))).map(e=>[fdtL(e.ts),(HTIPO[e.tipo]||[0,e.tipo])[1],e.detalle,e.usuarioNombre||""])];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(bit),"Bitácora");
  const pg=live? t.pagos.map(p=>({correlativo:p.correlativo,fechaRetiro:p.fechaRetiro,fechaRegistro:p.fechaRegistro,sectorNombre:p.sectorNombre,monto:+p.monto||0,ruta:p.ruta||"",piloto:p.piloto||"",boleta:p.boleta||"",banco:p.banco||"",tipoPago:p.tipoPago||"",autorizacion:p.autorizacion?.numero||""})) : (rp?.pagos||[]);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Correlativo","Fecha retiro","Fecha registro","Sector","Monto","Ruta","Piloto","Boleta","Banco","Tipo de pago","Autorización"],...pg.map(p=>[p.correlativo,p.fechaRetiro,p.fechaRegistro,p.sectorNombre,p.monto,p.ruta,p.piloto,p.boleta,p.banco,TIPO_TXT[p.tipoPago]||p.tipoPago,p.autorizacion])]),"Pagos");
  const rs=live? t.reint : (rp?.reintegros||[]);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["No.","Fecha","Sector","Monto","Recibo","Banco"],...rs.map(r=>[r.numero,r.fecha,r.sectorNombre,+r.monto||0,r.recibo,r.banco])]),"Reintegros");
  const data=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  const dl=await (window.claude?.use? window.claude.use("downloads") : null);
  if(!dl){ toast("La descarga no está disponible en esta vista"); return; }
  try{ await dl.save({filename:`Historial_ZR_${k}.xlsx`, data:new Blob([data])}); }catch(ex){ if(ex?.code!=="declined") toast("No se pudo generar la descarga"); }
}

/* ---------- habilitación de registro fuera de plazo (48 h) ---------- */
let exCtx=null;
function openExtReq(sid,d){
  const fecha=S.mes+"-"+pad(d); const id=gastoId(fecha,sid); const g=S.gastos[id]; if(!g) return;
  exCtx={id,g}; const w=regWindow(g);
  $("#exData").innerHTML=[["Sector",g.sectorNombre],["Fecha programada",fecha.split("-").reverse().join("/")],["Monto",q(g.monto)],["Ruta · Piloto",`${g.ruta||"—"} · ${g.piloto||"—"}`],["Solicitud generada",fdtL(g.generado)],["Plazo venció",w.lim?fdtL(w.lim):"—"]].map(([k,v])=>`<span><em>${k}</em><b>${esc(v)}</b></span>`).join("");
  $("#exMot").value=""; $("#exErr").hidden=true; $("#exBack").hidden=false; setTimeout(()=>$("#exMot").focus(),30);
}
function fdtL(t){ if(!t) return ""; const d=new Date(t); return isNaN(d)?"":`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
async function sendExtReq(){
  if(!exCtx) return; const mot=$("#exMot").value.trim(); const er=$("#exErr");
  if(!mot){ er.textContent="Escriba el motivo."; er.hidden=false; return; }
  const {id,g}=exCtx; const hist=[...(g.ext?.historial||[]), ...(g.ext&&g.ext.estado!=="pendiente"?[{estado:g.ext.estado,fecha:g.ext.decididoEn||g.ext.autorizadoEn||"",por:g.ext.decididoNombre||g.ext.autorizadoNombre||"",motivo:g.ext.motivo||""}]:[])];
  const ext={estado:"pendiente", solicitado:new Date().toISOString(), solicitanteId:S.me?.id||"", solicitanteNombre:S.me?.name||"", motivo:mot, historial:hist};
  try{ if(S.db) await S.db.doc("gastos/"+id).update({ext}); S.gastos[id]={...S.gastos[id],ext}; $("#exBack").hidden=true; exCtx=null; toast("Solicitud de habilitación enviada al administrador"); logEvent("autorizacion",g.mes||g.fecha.slice(0,7),`Habilitación fuera de plazo solicitada · ${g.correlativo||""} · ${g.sectorNombre} · motivo: ${mot}`); safeRender(); }
  catch(e){ er.textContent="No se pudo enviar la solicitud. Intente de nuevo."; er.hidden=false; }
}
function renderExtensiones(){
  const box=$("#extCard"); if(!box) return;
  const filt=$("#autFiltro")?.value||"activas";
  const all=Object.entries(S.gastos).filter(([id,g])=>g.ext).map(([id,g])=>({id,g}));
  const list=all.filter(x=>filt==="todas"||x.g.ext.estado==="pendiente").sort((a,b)=>String(b.g.ext.solicitado).localeCompare(String(a.g.ext.solicitado)));
  const nP=all.filter(x=>x.g.ext.estado==="pendiente").length;
  const head=`<div class="card-head"><div><h2>Habilitación de registro fuera de plazo ${nP?`<span class="pill warn" style="margin-left:6px">${nP} pendiente(s)</span>`:""}</h2><p>Registros ZR que no se hicieron dentro de las 48 h de la solicitud de gasto. Al autorizar, “Registrar ZR” se habilita por 48 h más.</p></div></div>`;
  if(!list.length){ box.innerHTML=head+`<div class="empty-state">No hay solicitudes de habilitación ${filt==="todas"?"":"pendientes"}.</div>`; return; }
  const EA={pendiente:["warn","Pendiente"],autorizada:["ok","Habilitada"],rechazada:["crit","Rechazada"]};
  box.innerHTML=head+`<div class="ant-list">${list.map(({id,g})=>{ const x=g.ext; const e=EA[x.estado]||EA.pendiente; const s=secOf(g.fecha.slice(0,7),g.sectorId); const corr=s?baseCorr(s,S.budgets[g.fecha.slice(0,7)].sectores):"";
    let act="";
    if(x.estado==="pendiente") act= S.P?.admin&&!S.readOnly ? (S.extRej===id
        ? `<div class="field" style="flex:1;min-width:220px"><label for="xrj-${esc(id)}">Motivo del rechazo</label><input type="text" id="xrj-${esc(id)}" autocomplete="off" placeholder="Opcional"></div><button class="btn no-solid" type="button" data-extrej-ok="${esc(id)}">Confirmar rechazo</button><button class="btn ghost" type="button" data-extrej-no="1">Volver</button>`
        : `<button class="btn ok-solid" type="button" data-extok="${esc(id)}"><svg class="ico"><use href="#i-check"/></svg>Habilitar registro (48 h)</button><button class="btn no-solid" type="button" data-extrej="${esc(id)}"><svg class="ico"><use href="#i-alert"/></svg>Rechazar</button>`)
      : `<span class="pill warn">En espera de autorización del administrador</span>`;
    const dec= x.estado==="autorizada"? `<div class="evid"><svg class="ico"><use href="#i-check"/></svg><span>Habilitada por <b>${esc(x.autorizadoNombre||"administrador")}</b> · ${esc(fdtL(x.autorizadoEn))} · disponible hasta ${esc(fdtL(new Date(new Date(x.autorizadoEn).getTime()+VENTANA_H*3600e3)))}</span></div>`
      : x.estado==="rechazada"? `<div class="hint warn"><span><b>Rechazada</b> por ${esc(x.decididoNombre||"administrador")} · ${esc(fdtL(x.decididoEn))}${x.motivoRechazo?` · Motivo: ${esc(x.motivoRechazo)}`:""}</span></div>` : "";
    return `<article class="ant-item ${x.estado==="pendiente"?"pend":""}">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${corr?`<span class="corr-badge">${esc(corr)}</span>`:""}<b>${esc(g.sectorNombre||"")}</b><span class="pill info">Fuera de plazo (48 h)</span></div><span class="pill ${e[0]}">${e[1]}</span></div>
      <div class="ant-grid">
        <span><em>Fecha programada</em><b class="num">${esc(g.fecha.split("-").reverse().join("/"))}</b></span>
        <span><em>Solicitud de gasto</em><b class="num">${esc(fdtL(g.autorizadoEn||g.generado))}</b></span>
        <span><em>Monto</em><b class="num">${q(g.monto)}</b></span>
        <span><em>Ruta · Piloto</em><b>${esc(g.ruta||"—")} · ${esc(g.piloto||"—")}</b></span>
        <span><em>Solicitado por</em><b>${esc(x.solicitanteNombre||"—")} <span class="muted num" style="font-weight:400">${esc(fdtL(x.solicitado))}</span></b></span>
        <span style="grid-column:1/-1"><em>Motivo</em><b style="font-weight:400">${esc(x.motivo||"")}</b></span>
      </div>${dec}${act?`<div class="sol-actions">${act}</div>`:""}<div class="err" id="xe-${esc(id)}" hidden></div></article>`; }).join("")}</div>`;
  box.querySelectorAll("[data-extok]").forEach(b=>b.onclick=()=>decideExt(b.dataset.extok,true));
  box.querySelectorAll("[data-extrej]").forEach(b=>b.onclick=()=>{ S.extRej=b.dataset.extrej; renderExtensiones(); });
  box.querySelectorAll("[data-extrej-no]").forEach(b=>b.onclick=()=>{ S.extRej=null; renderExtensiones(); });
  box.querySelectorAll("[data-extrej-ok]").forEach(b=>b.onclick=()=>decideExt(b.dataset.extrejOk,false,($("#xrj-"+CSS.escape(b.dataset.extrejOk))?.value||"").trim()));
}
async function decideExt(id,ok,motivo){
  const g=S.gastos[id]; if(!g?.ext||g.ext.estado!=="pendiente") return;
  if(!(await askAdminPass(`${ok?"Habilitar":"Rechazar"} el registro fuera de plazo de ${g.correlativo||""} · ${g.sectorNombre} · ${q(g.monto)}.`,{title:ok?"Confirmar habilitación":"Confirmar rechazo",ok:ok?"Habilitar":"Rechazar",cls:ok?"ok-solid":"no-solid"}))) return;
  const now=new Date().toISOString();
  const ext= ok? {...g.ext, estado:"autorizada", autorizadoEn:now, autorizadoId:S.me?.id||"", autorizadoNombre:S.me?.name||"Administrador"} : {...g.ext, estado:"rechazada", decididoEn:now, decididoId:S.me?.id||"", decididoNombre:S.me?.name||"Administrador", motivoRechazo:motivo||""};
  try{ if(S.db) await S.db.doc("gastos/"+id).update({ext}); S.gastos[id]={...S.gastos[id],ext}; S.extRej=null; toast(ok?"Registro habilitado por 48 h":"Habilitación rechazada"); logEvent("autorizacion",g.mes||g.fecha.slice(0,7),`Habilitación fuera de plazo ${ok?"autorizada (48 h)":"rechazada"} · ${g.correlativo||""} · ${g.sectorNombre}${!ok&&motivo?` · motivo: ${motivo}`:""}`); safeRender(); }
  catch(e){ const el=$("#xe-"+CSS.escape(id)); if(el){ el.textContent="No se pudo guardar. Intente de nuevo."; el.hidden=false; } }
}

/* ---------- varias rutas y varios depósitos en el registro ---------- */
S.rutasM=[]; S.depsX=[]; S.rutasHide=false;
function pilOpts(sel){ return `<option value="">Piloto…</option>`+pilotos().map(p=>`<option value="${esc(p.nombre)}" ${p.nombre===sel?"selected":""}>${esc(p.nombre)}</option>`).join(""); }
function bancoOpts(sel){ return [...$("#fBanco").options].map(o=>`<option value="${esc(o.value)}" ${o.value===sel?"selected":""}>${esc(o.textContent)}</option>`).join(""); }
function splitAmt(total,n){ const out=[]; const base=Math.floor(total/n*100)/100; for(let i=0;i<n;i++) out.push(base); out[0]=round2(total-base*(n-1)); return out; }
function multiRuta(){ return S.rutasM.length>1; }
function renderRutasBox(){
  const box=$("#rutasList"); if(!box) return; const multi=multiRuta(); const dep=tipoPago()==="deposito";
  $("#rutasBox").hidden=!multi;
  $("#fBoletaF").hidden=multi; $("#fBancoF").hidden=multi;
  if(!multi){ box.innerHTML=""; updateMultiSums(); renderDepsBox(); return; }
  $("#btnTogRutas").textContent=S.rutasHide?"Ver rutas":"Ocultar rutas"; $("#btnTogRutas").setAttribute("aria-expanded",String(!S.rutasHide)); box.hidden=S.rutasHide;
  box.innerHTML=S.rutasM.map((r,i)=>`<div class="mb-row${dep?" rb":""}"><span class="mb-n">${i+1}</span><span><b>${esc(r.ruta)}</b></span><span>${esc(r.piloto)}</span><span class="mb-lock" title="Ruta y piloto de la solicitud">🔒</span>${dep?`<input type="text" data-rbb="${i}" value="${esc(r.boleta||"")}" placeholder="No. de boleta" inputmode="numeric" autocomplete="off" aria-label="Boleta de la ruta ${esc(r.ruta)}"><select data-rbk="${i}" aria-label="Banco de la ruta ${esc(r.ruta)}">${bancoOpts(r.banco||"")}</select>`:""}<span class="mb-amt" id="rxa${i}"></span></div>`).join("");
  box.querySelectorAll("[data-rbb]").forEach(el=>el.oninput=()=>{ S.rutasM[+el.dataset.rbb].boleta=el.value.trim(); updateMultiSums(); updateSaveState(); });
  box.querySelectorAll("[data-rbk]").forEach(el=>el.onchange=()=>{ S.rutasM[+el.dataset.rbk].banco=el.value; updateMultiSums(); updateSaveState(); });
  renderDepsBox(); updateMultiSums();
}
function renderDepsBox(){
  const dep=tipoPago()==="deposito"; const allow=false; // opción de varios depósitos retirada
  $("#multiDepLbl").hidden=!allow; if(!allow){ $("#fMultiDep").checked=false; S.depsX=[]; }
  const on=allow && $("#fMultiDep").checked; $("#depsBox").hidden=!on;
  if(!on){ updateMultiSums(); return; }
  if(!S.depsX.length) addDep(true);
  $("#depsList").innerHTML=`<div class="mb-row dep"><span class="mb-n">1</span><span id="dx0b">${esc($("#fBoleta").value||"Boleta de arriba")}</span><span id="dx0k">${esc($("#fBanco").value||"Banco de arriba")}</span><span></span><span class="mb-amt" id="dxa0"></span></div>`
    + S.depsX.map((d,i)=>`<div class="mb-row dep"><span class="mb-n">${i+2}</span><input type="text" data-dxb="${i}" value="${esc(d.boleta)}" placeholder="No. de boleta" inputmode="numeric" autocomplete="off" aria-label="Boleta ${i+2}"><select data-dxk="${i}" aria-label="Banco ${i+2}">${bancoOpts(d.banco)}</select><button type="button" class="btn small ghost danger-ghost icon-only" data-dxdel="${i}" aria-label="Quitar depósito ${i+2}">×</button><input type="number" data-dxm="${i}" value="${d.monto||""}" min="0" step="0.01" inputmode="decimal" placeholder="Monto Q" aria-label="Monto depósito ${i+2}"></div>`).join("");
  const L=$("#depsList");
  L.querySelectorAll("[data-dxb]").forEach(el=>el.oninput=()=>{ S.depsX[+el.dataset.dxb].boleta=el.value.trim(); updateSaveState(); });
  L.querySelectorAll("[data-dxk]").forEach(el=>el.onchange=()=>{ S.depsX[+el.dataset.dxk].banco=el.value; updateSaveState(); });
  L.querySelectorAll("[data-dxm]").forEach(el=>el.oninput=()=>{ S.depsX[+el.dataset.dxm].monto=round2(parseFloat(el.value)||0); updateMultiSums(); updateSaveState(); });
  L.querySelectorAll("[data-dxdel]").forEach(el=>el.onclick=()=>{ S.depsX.splice(+el.dataset.dxdel,1); if(!S.depsX.length){ $("#fMultiDep").checked=false; } renderDepsBox(); updateSaveState(); });
  updateMultiSums();
}
function addDep(silent){ const tot=round2(parseFloat($("#fMonto").value)||0); const n=S.depsX.length+2; const sp=splitAmt(tot,n); S.depsX.push({boleta:"",banco:"",monto:0}); S.depsX.forEach((d,i)=>d.monto=sp[i+1]); if(!silent){ renderDepsBox(); updateSaveState(); } }
function multiInfo(){
  const tot=round2(parseFloat($("#fMonto").value)||0); const dep=tipoPago()==="deposito";
  if(multiRuta()){ const sp=splitAmt(tot,S.rutasM.length); const rutas=S.rutasM.map((r,i)=>({ruta:r.ruta,piloto:r.piloto,boleta:dep?(r.boleta||""):"",banco:dep?(r.banco||""):"",monto:sp[i]}));
    return {tot,rutas,multi:true,deps: dep? rutas.map(r=>({boleta:r.boleta,banco:r.banco,monto:r.monto,ruta:r.ruta})) : null}; }
  const rutas=[{ruta:$("#fRuta").value.trim(),piloto:$("#fPiloto").value,monto:tot}];
  const on=dep && $("#fMultiDep").checked && S.depsX.length;
  const extra=on? round2(S.depsX.reduce((a,d)=>a+(+d.monto||0),0)) : 0;
  const deps= on? [{boleta:$("#fBoleta").value.trim(),banco:$("#fBanco").value,monto:round2(tot-extra)},...S.depsX.map(d=>({...d}))] : null;
  return {tot,rutas,deps,multi:false};
}
function updateMultiSums(){
  const m=multiInfo(); if(!$("#rutasList")) return;
  if(m.multi){ m.rutas.forEach((r,i)=>{ const el=$("#rxa"+i); if(el) el.textContent=q(r.monto); });
    const done=m.deps? m.deps.filter(d=>d.boleta&&d.banco).length : m.rutas.length;
    $("#rutasSplit").textContent=`${m.rutas.length} rutas · ${q(m.tot)} ÷ ${m.rutas.length}${m.deps?` · boletas ${done}/${m.rutas.length}`:""}`; }
  if(m.deps && !m.multi){ const d0=$("#dxa0"); if(d0){ d0.textContent=q(m.deps[0].monto); d0.style.color= m.deps[0].monto<=0.005?"var(--crit)":""; } const b0=$("#dx0b"); if(b0) b0.textContent=$("#fBoleta").value||"Boleta de arriba"; const k0=$("#dx0k"); if(k0) k0.textContent=$("#fBanco").value||"Banco de arriba";
    $("#depsSum").textContent=`${m.deps.length} depósitos · total ${q(m.deps.reduce((a,d)=>a+d.monto,0))}`; }
}
function multiMissing(){
  const m=[]; const mi=multiInfo();
  if(mi.multi){ if(mi.deps) mi.deps.forEach((d,i)=>{ if(!d.boleta||!d.banco) m.push(`boleta y banco de la ruta ${mi.rutas[i].ruta}`); }); return m; }
  if(mi.deps){ mi.deps.slice(1).forEach((d,i)=>{ if(!d.boleta||!d.banco||!(d.monto>0)) m.push(`boleta, banco y monto del depósito ${i+2}`); }); if(mi.deps[0].monto<=0.005) m.push("montos de depósitos (la suma supera el monto a pagar)"); }
  return m;
}
function resetMulti(){ S.rutasM=[]; S.depsX=[]; S.rutasHide=false; $("#fMultiDep").checked=false; renderRutasBox(); }

/* ---------- sector nuevo (solo administradores) ---------- */
const WDN=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
function nsCalc(){
  const pago=$("#nsPago").value, frec=$("#nsFrec").value, monto=round2(parseFloat($("#nsMonto").value));
  const out={pago,frec,monto,mes:pago?pago.slice(0,7):"",dias:[]};
  if(!pago) return out;
  const [y,m,d]=pago.split("-").map(Number); const n=daysIn(out.mes);
  if(frec==="u") out.dias=[d];
  else if(frec!==""){ for(let k=d;k<=n;k++){ if(new Date(y,m-1,k).getDay()===+frec) out.dias.push(k); } }
  return out;
}
function nsNextCorr(mes){ const l=S.budgets[mes]?.sectores||[]; let mx=0; l.forEach((s,i)=>{ const k=corrKey(baseCorr(s,l))[0]; if(k<1e9) mx=Math.max(mx,k); }); return fmtCorr(mx+1); }
function nsRender(){
  const c=nsCalc(); const pv=$("#nsPrev");
  $("#nsCorr").value= c.mes&&S.budgets[c.mes]? nsNextCorr(c.mes) : "—";
  if(!c.pago){ pv.innerHTML=`<span class="muted">Indique la fecha de pago y la frecuencia para ver los días que se agregan al calendario.</span>`; return; }
  if(!S.budgets[c.mes]){ pv.innerHTML=`<span style="color:var(--crit)">No hay presupuesto cargado para ${esc(mesLabel(c.mes))}. Cárguelo primero.</span>`; return; }
  if(c.frec===""){ pv.innerHTML=`<span class="muted">Fecha de pago: ${esc(WDN[new Date(c.pago+"T12:00").getDay()])}. Elija la frecuencia (día de la semana).</span>`; return; }
  if(!c.dias.length){ pv.innerHTML=`<span style="color:var(--crit)">No hay ningún ${esc(WDN[+c.frec]||"")} desde la fecha de pago hasta fin de mes.</span>`; return; }
  const mesN=MESES[+c.mes.slice(5)-1];
  pv.innerHTML=`<span>Se programan <b>${c.dias.length}</b> pago(s) en ${esc(mesLabel(c.mes))}: <b>${c.dias.join(", ")}</b> de ${esc(mesN)}</span>${c.monto>0?`<span>Total del mes: <b>${q(round2(c.monto*c.dias.length))}</b></span>`:""}`;
}
function openNewSector(){
  if(!S.P?.admin){ toast("Solo un administrador puede registrar sectores nuevos"); return; }
  ["#nsRet","#nsPago","#nsNom","#nsMonto"].forEach(k=>$(k).value=""); $("#nsFrec").value=""; $("#nsTipo").value="deposito";
  const base=S.mes||todayISO.slice(0,7); const t= todayISO.slice(0,7)===base? todayISO : base+"-01"; $("#nsPago").value=t; $("#nsRet").value=t;
  $("#nsFrec").value=String(new Date(t+"T12:00").getDay());
  $("#nsErr").hidden=true; nsRender(); $("#nsBack").hidden=false; setTimeout(()=>$("#nsNom").focus(),30);
}
async function saveNewSector(){
  const er=$("#nsErr"); er.hidden=true; const fail=m=>{ er.textContent=m; er.hidden=false; };
  if(!S.P?.admin) return fail("Solo un administrador puede registrar sectores nuevos.");
  const ret=$("#nsRet").value, nom=$("#nsNom").value.trim(), tipo=$("#nsTipo").value; const c=nsCalc();
  if(!ret) return fail("Indique la fecha de retiro de efectivo.");
  if(!c.pago) return fail("Indique la fecha de pago.");
  if(nom.length<3) return fail("Escriba el nombre del sector.");
  if(!(c.monto>0)) return fail("Indique el monto a pagar.");
  if(c.frec==="") return fail("Elija la frecuencia de pago (día de la semana).");
  if(ret>c.pago) return fail("La fecha de retiro no puede ser posterior a la fecha de pago.");
  const bud=S.budgets[c.mes]; if(!bud) return fail(`No hay presupuesto cargado para ${mesLabel(c.mes)}. Cárguelo primero.`);
  if(!c.dias.length) return fail("La frecuencia elegida no deja ningún día de pago en el mes.");
  if(bud.sectores.some(x=>normN(x.nombre)===normN(nom))) return fail("Ya existe un sector con ese nombre en el mes.");
  const corr=nsNextCorr(c.mes); const dias={}; c.dias.forEach(d=>dias[d]=c.monto);
  const frecTxt= c.frec==="u"? "Una sola vez" : `Cada ${WDN[+c.frec].toLowerCase()}`;
  const sec={id:"n"+Date.now().toString(36), nombre:nom, dias, nota:`Sector agregado · ${frecTxt}`, corr, tipoPago:tipo, tipoArchivoOk:true,
    agregado:{por:S.me?.name||"", porId:S.me?.id||"", fecha:new Date().toISOString(), fechaRetiro:ret, fechaPago:c.pago, frecuencia:c.frec, frecuenciaTxt:frecTxt, monto:c.monto}};
  const doc={...bud, sectores:[...bud.sectores, sec], actualizado:new Date().toISOString()};
  const btn=$("#nsOk"); btn.disabled=true;
  try{ if(S.db) await S.db.doc("presupuestos/"+c.mes).set(doc); S.budgets[c.mes]=doc; $("#nsBack").hidden=true; safeRender();
    toast(`Sector ${corr} registrado y agregado al calendario`);
    logEvent("config",c.mes,`Sector nuevo ${corr} · ${nom} · ${q(c.monto)} · ${frecTxt} · días ${c.dias.join(", ")}`);
    openNotify(sec,c,ret,frecTxt);
  }catch(ex){ fail(ex?.code==="invalid_argument"?"No tiene permiso para modificar el presupuesto.":"No se pudo guardar. Intente de nuevo."); }
  finally{ btn.disabled=false; }
}
let nmList=[];
function openNotify(sec,c,ret,frecTxt){
  const fd=x=>x.split("-").reverse().join("/"); const mesN=MESES[+c.mes.slice(5)-1];
  nmList=[...new Set((S.cfg?.notifDest||[]).filter(isEmail))];
  $("#nmSubj").value=`Nuevo sector ZR registrado: ${sec.corr} · ${sec.nombre}`;
  $("#nmBody").value=`Buen día:

Se registró un sector nuevo en el control de zonas rojas (${brand()}).

Correlativo:              ${sec.corr}
Nombre del sector:        ${sec.nombre}
Fecha de retiro efectivo: ${fd(ret)}
Fecha de pago:            ${fd(c.pago)}
Monto a pagar:            ${q(c.monto)}
Frecuencia de pago:       ${frecTxt}
Tipo de pago:             ${TIPO_TXT[sec.tipoPago]}
Días programados:         ${c.dias.join(", ")} de ${mesN}
Total del mes:            ${q(round2(c.monto*c.dias.length))}
Registrado por:           ${S.me?.name||""}

Saludos.`;
  $("#nmTo").value=""; $("#nmErr").hidden=true; renderChips(); $("#nmBack").hidden=false; setTimeout(()=>$("#nmTo").focus(),30);
}
function renderChips(){
  $("#nmChips").innerHTML= nmList.length? nmList.map((m,i)=>`<span class="chip">${esc(m)}<button type="button" data-chipdel="${i}" aria-label="Quitar ${esc(m)}">×</button></span>`).join("") : `<span class="muted" style="font-size:12.5px">Sin destinatarios todavía.</span>`;
  $("#nmChips").querySelectorAll("[data-chipdel]").forEach(b=>b.onclick=()=>{ nmList.splice(+b.dataset.chipdel,1); renderChips(); });
  const href=`mailto:${nmList.join(",")}?subject=${encodeURIComponent($("#nmSubj").value)}&body=${encodeURIComponent($("#nmBody").value)}`;
  $("#nmOpen").setAttribute("href",href);
}
function addChip(){
  const parts=$("#nmTo").value.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean); if(!parts.length) return true;
  const bad=parts.filter(p=>!isEmail(p)); if(bad.length){ $("#nmErr").textContent=`Correo no válido: ${bad.join(", ")}`; $("#nmErr").hidden=false; return false; }
  $("#nmErr").hidden=true; parts.forEach(p=>{ if(!nmList.some(x=>x.toLowerCase()===p.toLowerCase())) nmList.push(p); }); $("#nmTo").value=""; renderChips(); return true;
}
async function saveNotifDest(){ const prev=S.cfg?.notifDest||[]; if(JSON.stringify(prev)===JSON.stringify(nmList)) return; S.cfg={...(S.cfg||{}),notifDest:[...nmList]}; try{ if(S.db) await S.db.doc("config/general").set(S.cfg); }catch(e){} }

/* ---------- reintegro de ZR ---------- */
let reintCtx=null, reintFile=null;
function openReint(sid,d){
  const fecha=S.mes+"-"+pad(d); const s=secById(sid); if(!s) return;
  if(reintOf(fecha,sid)){ toast("Este sector ya tiene reintegro"); return; }
  const b=s.dias[d]||0; const pagos=S.pagos.filter(p=>p.sectorId===sid&&p.fechaRetiro===fecha).sort((a,c)=>cmpCorr(a.correlativo,c.correlativo));
  const reg=round2(pagos.reduce((a,p)=>a+(+p.monto||0),0)); const monto=round2(b-reg);
  if(!(monto>0.005)){ toast("No hay diferencia pendiente para reintegrar"); return; }
  reintCtx={sid,d,fecha,s,b,reg,monto,pagos};
  const WDL=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  $("#reSub").textContent=`${baseCorr(s)} · ${s.nombre}`;
  $("#reData").innerHTML=[["Sector",`${baseCorr(s)} · ${s.nombre}`],["Fecha programada",`${fecha.split("-").reverse().join("/")} (${WDL[wdOf(S.mes,d)]})`],["Tipo de pago",TIPO_TXT[sectorTipo(s)]],["Presupuesto del día",q(b)],["Monto ejecutado",q(reg)],["Diferencia del día",q(monto)]].map(([k,v])=>`<span><em>${k}</em><b>${esc(v)}</b></span>`).join("")
    + `<span style="grid-column:1/-1"><em>Pagos registrados</em><b style="font-weight:500">${pagos.length?"":"Ninguno · se reintegra el monto completo retirado con la solicitud de gasto"}${pagos.map(p=>`${esc(p.correlativo)} · ${q(+p.monto)} · ruta ${esc(p.ruta||"—")} · ${esc(p.piloto||"—")}${p.autorizacion?` · aut. ${esc(p.autorizacion.numero||"")}`:""}`).join("<br>")}</b></span>`;
  $("#reTotal").checked=false; $("#reTotalAmt").textContent=q(b); reintCtx.dif=monto; updReintMonto();
  $("#reBanco").innerHTML=$("#fBanco").innerHTML; $("#reBanco").value="";
  $("#reRecibo").value=""; $("#reObs").value=""; reintFile=null; $("#reFile").value=""; $("#rePrev").hidden=true; $("#reIco").style.display=""; $("#reFileLbl").textContent="Cargar imagen de la boleta de depósito";
  $("#reErr").hidden=true; $("#reOk").disabled=S.readOnly; $("#reBack").hidden=false;
  setTimeout(()=>$("#reRecibo").focus(),50);
}
function updReintMonto(){
  const c=reintCtx; if(!c) return; const tot=$("#reTotal").checked;
  c.monto= tot? round2(c.b) : c.dif; c.tipoMonto= tot? "total":"diferencia";
  $("#reBig").textContent=q(c.monto);
  $("#reBigLbl").textContent= tot? `Monto total del día (presupuesto ${q(c.b)})` : `Diferencia del sector en el día (${q(c.b)} − ${q(c.reg)} ejecutado)`;
}
function onReintFile(){
  const f=$("#reFile").files[0]; $("#reErr").hidden=true; reintFile=null; if(!f) return;
  if(!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic)$/i.test(f.name)){ $("#reErr").textContent="La evidencia debe ser una imagen (JPG o PNG)."; $("#reErr").hidden=false; return; }
  if(f.size>20*1024*1024){ $("#reErr").textContent="La imagen supera 20 MB."; $("#reErr").hidden=false; return; }
  reintFile=f; $("#reFileLbl").textContent=f.name;
  try{ const im=$("#rePrev"); im.src=URL.createObjectURL(f); im.hidden=false; $("#reIco").style.display="none"; }catch(e){}
}
function nextReintNum(){ let mx=0; for(const r of Object.values(S.reint)){ const m=String(r.numero||"").match(/(\d+)$/); if(m) mx=Math.max(mx,+m[1]); } return "RZ-"+String(mx+1).padStart(4,"0"); }
async function saveReint(){
  const c=reintCtx; if(!c) return; const er=$("#reErr"); er.hidden=true;
  const recibo=$("#reRecibo").value.trim(), banco=$("#reBanco").value, obs=$("#reObs").value.trim();
  const miss=[]; if(!recibo) miss.push("no. de recibo"); if(!banco) miss.push("banco"); if(!reintFile) miss.push("imagen de la boleta de depósito");
  if(miss.length){ er.textContent="Falta: "+miss.join(", ")+"."; er.hidden=false; return; }
  const dupR=Object.values(S.reint).find(r=>r.banco===banco && String(r.recibo).toLowerCase()===recibo.toLowerCase()) || S.pagos.find(p=>p.banco===banco && String(p.boleta||"").toLowerCase()===recibo.toLowerCase());
  if(dupR){ er.textContent=`El recibo ${recibo} de ${banco} ya está registrado.`; er.hidden=false; return; }
  const btn=$("#reOk"); btn.disabled=true; btn.textContent="Guardando…";
  try{
    const assets = window.claude?.use? await window.claude.use("assets") : null;
    let evid=null;
    if(assets){ const tp=/^image\/(jpeg|png|gif|webp)$/.test(reintFile.type)? reintFile.type : (/\.png$/i.test(reintFile.name)?"image/png":"image/jpeg"); const up=await assets.upload(reintFile,{type:tp}); evid={id:up.id,nombre:reintFile.name}; }
    else if(S.db) throw {code:"not_granted"}; else evid={id:null,nombre:reintFile.name};
    const id=c.fecha+"_"+c.sid;
    const doc={numero:nextReintNum(), fecha:c.fecha, mes:c.fecha.slice(0,7), sectorId:c.sid, sectorNombre:c.s.nombre, corrSector:baseCorr(c.s), presupuesto:c.b, ejecutado:c.reg, monto:c.monto,
      tipoMonto:c.tipoMonto||"diferencia", diferencia:c.dif, pagos:c.pagos.map(p=>({correlativo:p.correlativo,monto:+p.monto,ruta:p.ruta||"",piloto:p.piloto||""})), recibo, banco, observaciones:obs, evidencia:evid, coordinadorId:S.me?.id||null, coordinadorNombre:S.me?.name||"", fechaRegistro:todayISO, creado:new Date().toISOString()};
    if(S.db) await S.db.doc("reintegros/"+id).set(doc);
    S.reint[id]=doc; $("#reBack").hidden=true; reintCtx=null; safeRender();
    toast(`Reintegro ${doc.numero} registrado`);
    logEvent("reintegro",doc.mes,`Reintegro ${doc.numero} · ${doc.sectorNombre} · ${q(doc.monto)} · recibo ${doc.recibo} ${doc.banco}`);
    await downloadReintPdf(doc);
  }catch(ex){
    const cd=ex?.code; er.textContent= cd==="not_granted"? "No tiene permiso para cargar archivos en esta página (requiere acceso de edición)." : cd==="invalid_argument"? "No tiene permiso para registrar reintegros." : "No se pudo guardar el reintegro. Intente de nuevo."; er.hidden=false;
  }finally{ btn.disabled=false; btn.innerHTML=`<svg class="ico"><use href="#i-check"/></svg>Registrar reintegro`; }
}
function drawReint(pdf,r,top,copia){
  const L=36,R=pdf.W-36,Wd=R-L; const mu="#5B6863", ln="#B3C0BA";
  const band= copia==="CBC"? "#00215C" : "#0B4F8A"; const soft="#B9C9EE";
  const fmtD=iso=>iso?iso.split("-").reverse().join("/"):"";
  let y=top+28;
  pdf.rect(L,y,Wd,38,{fill:band});
  pdf.text(L+12,y+17,"BOLETA DE REINTEGRO ZR",{size:14,bold:true,color:"#FFFFFF"});
  pdf.text(L+12,y+30,"ZONAS ROJAS · "+brand().toUpperCase(),{size:7.5,color:soft});
  pdf.text(R-12,y+14,"No.",{size:7.5,color:soft,align:"right"}); pdf.text(R-12,y+29,r.numero,{size:13,bold:true,color:"#FFFFFF",align:"right"});
  y+=52;
  const f=(x,w,label,val,o={})=>{ pdf.text(x,y,label.toUpperCase(),{size:6.5,bold:true,color:mu}); const ls=wrap(val,o.size||10,o.bold?"F2":"F1",w-6).slice(0,o.max||1); ls.forEach((t,i)=>pdf.text(x,y+12+i*11.5,t,{size:o.size||10,bold:o.bold})); return ls.length; };
  const nl=f(L,Wd*0.62,"Sector",`${r.corrSector||""} · ${r.sectorNombre}`,{bold:true,max:2});
  f(L+Wd*0.64,Wd*0.36,"Copia",copia==="CBC"?"Liquidación CBC":"Entrega DSA",{bold:true});
  y+=18+nl*11.5;
  f(L,Wd*0.24,"Fecha programada",fmtD(r.fecha)); f(L+Wd*0.25,Wd*0.24,"Fecha de reintegro",fmtD(r.fechaRegistro)); f(L+Wd*0.5,Wd*0.2,"No. de recibo",r.recibo,{bold:true}); f(L+Wd*0.71,Wd*0.29,"Banco",r.banco,{bold:true});
  y+=30; pdf.line(L,y,R,y,{color:ln,w:0.5}); y+=10;
  const bw=(Wd-16)/3;
  [["Presupuesto programado",q(r.presupuesto),"#0B1A33"],["Monto ejecutado",q(r.ejecutado),"#157347"],[r.tipoMonto==="total"?"Reintegrado (total del día)":"Reintegrado (diferencia)",q(r.monto),band]].forEach(([l,v,c],i)=>{ const x=L+i*(bw+8); pdf.rect(x,y,bw,38,{stroke:i===2?band:ln,w:i===2?1.3:0.7}); pdf.text(x+8,y+12,l.toUpperCase(),{size:6.5,bold:true,color:mu}); pdf.text(x+8,y+29,v,{size:13,bold:true,color:c}); });
  y+=50;
  pdf.text(L,y,"MONTO EN LETRAS",{size:6.5,bold:true,color:mu}); wrap(numLetras(r.monto),9,"F2",Wd-80).slice(0,2).forEach((t,i)=>pdf.text(L+76,y+i*11,t,{size:9,bold:true}));
  y+=16;
  pdf.text(L,y,"PAGOS EJECUTADOS",{size:6.5,bold:true,color:mu}); wrap((r.pagos||[]).map(p=>`${p.correlativo} ${q(p.monto)} (ruta ${p.ruta||"—"}, ${p.piloto||"—"})`).join("  ·  ")||"—",8.5,"F1",Wd-80).slice(0,2).forEach((t,i)=>pdf.text(L+76,y+i*10.5,t,{size:8.5}));
  y+=24;
  pdf.text(L,y,"EVIDENCIA",{size:6.5,bold:true,color:mu}); pdf.text(L+76,y,`Boleta de depósito adjunta en el sistema: ${r.evidencia?.nombre||"—"}`,{size:8.5});
  y+=14;
  pdf.text(L,y,"OBSERVACIONES",{size:6.5,bold:true,color:mu}); if(r.observaciones) wrap(r.observaciones,8.5,"F1",Wd-80).slice(0,2).forEach((t,i)=>pdf.text(L+76,y+i*10.5,t,{size:8.5}));
  for(let ly=y+14; ly<top+396-80; ly+=14) pdf.line(L,ly,R,ly,{color:"#DCE3DF",w:0.5});
  const fy=top+396-56; const sw=(Wd-60)/2;
  [["Liquidación CBC",L,""],["Coordinador de Liquidación",L+sw+60,r.coordinadorNombre||S.me?.name||""]].forEach(([t,x,nm])=>{ if(nm) pdf.text(x+sw/2,fy-4,nm,{size:8.5,align:"center"}); pdf.line(x,fy,x+sw,fy,{w:0.9}); pdf.text(x+sw/2,fy+11,t,{size:9,bold:true,align:"center"}); pdf.text(x,fy+24,"Nombre: ______________________________",{size:7.5,color:mu}); pdf.text(x+sw,fy+24,"Fecha: ___/___/______",{size:7.5,color:mu,align:"right"}); });
  pdf.text(R,top+396-8,`Boleta de reintegro ZR · ${copia==="CBC"?"Liquidación CBC":"Entrega DSA"} · Control ${brand()}`,{size:6.5,color:mu,align:"right"});
}
async function downloadReintPdf(r){
  let bytes; try{ const pdf=MiniPDF(); pdf.page(); drawReint(pdf,r,0,"DSA"); pdf.line(24,396,pdf.W-24,396,{dash:true,color:"#9AA8A2",w:0.6}); pdf.text(pdf.W/2,392,"- - - cortar aquí - - -",{size:6.5,color:"#9AA8A2",align:"center"}); drawReint(pdf,r,396,"CBC"); bytes=pdf.output(); }
  catch(e){ console.error(e); toast("No se pudo generar la boleta PDF"); return; }
  const dl = window.claude?.use? await window.claude.use("downloads") : null;
  if(!dl){ toast("La descarga no está disponible en esta vista"); return; }
  try{ await dl.save({filename:`Boleta_reintegro_${r.numero}_${r.corrSector||""}_${r.fecha}.pdf`, data:new Blob([bytes],{type:"application/pdf"})}); }
  catch(ex){ if(ex?.code!=="declined") toast("No se pudo descargar la boleta"); }
}

/* ---------- usuarios y permisos ---------- */
const ALLP={op:true,an:true,cfg:true,carga:true,admin:true};
function perms(){
  if(!S.userReady) return S.noUserCap? ALLP : {op:true,an:false,cfg:false,carga:false,admin:false};
  if(S.me?.owner) return ALLP;
  /* DISCARGA: quién entra a ZR y qué agencias ve se maneja en Usuarios de
     DISCARGA CONTROLER (permiso ZR y agencias). Dentro de ZR ya no hay lista
     de usuarios: quien entra ve todo menos las funciones de administrador
     (autorizar, eliminar), que son del administrador general o de la agencia. */
  return {op:true,an:true,cfg:true,carga:true,admin:false};
}
function applyPerms(){
  const P=perms(); S.P=P;
  document.querySelectorAll(".tab[data-grp]").forEach(b=>{ b.hidden=!P[b.dataset.grp]; });
  document.querySelectorAll("[data-grp-lbl]").forEach(l=>{ l.hidden=!P[l.dataset.grpLbl]; });
  /* DISCARGA: sin sección "Usuarios" (se usa Usuarios y permisos de DISCARGA CONTROLER). */
  const tUsr=$("#tab-usuarios"); if(tUsr) tUsr.hidden=true;
  document.body.classList.toggle("no-admin",!P.admin);
  document.body.classList.toggle("no-carga",!P.carga);
  const lp=cargaLock("pilotos"), lpr=cargaLock("presupuesto");
  document.body.classList.toggle("lock-pil",lp); document.body.classList.toggle("lock-pres",lpr);
  const lockMsg=(k,c)=>{ const x=S.cargas?.[curMes()]?.[k]; return `<span><b>Carga de ${c} de ${esc(mesLabel(curMes()))} realizada</b>${x?.ts?` el ${esc(fdLocal(x.ts))}`:""}${x?.por?` por ${esc(x.por)}`:""}. La opción queda bloqueada; solo un administrador puede volver a cargar este mes.</span>`; };
  const pl=$("#pilLock"); if(pl){ pl.hidden=!(lp&&P.carga); if(lp) pl.innerHTML=lockMsg("pilotos","pilotos"); }
  const pr=$("#presLock"); if(pr){ pr.hidden=!(lpr&&P.carga); if(lpr) pr.innerHTML=lockMsg("presupuesto","presupuesto"); }
  const bn=brand(); const bEl=$("#brandName"); if(bEl && bEl.textContent!==bn) bEl.textContent=bn; document.title="Control "+bn;
  const cur=document.querySelector(`.tab[data-tab="${S.tab}"]`);
  if(cur && cur.hidden){ const first=[...document.querySelectorAll(".tab[data-grp]")].find(b=>!b.hidden); if(first){ S.tab=first.dataset.tab; renderTabs(); } }
  if(S.me){ $("#meBadge").hidden=false; $("#meName").textContent=S.me.name||"Usuario"; $("#meAv").textContent=(S.me.name||"U").trim().charAt(0).toUpperCase();
    $("#meRole").textContent= P.admin? (S.me.owner?"Propietario · administrador":"Administrador") : [P.op&&"Operación",P.an&&"Análisis",P.cfg&&"Configuración",P.carga&&"Carga"].filter(Boolean).join(" · "); }
}
function fdLocal(t){ const d=new Date(t); return isNaN(d)?"":`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`; }
function curMes(){ return todayISO.slice(0,7); }
function myUsr(){ return findMe(S.usuarios||[]); }
/* DISCARGA: el módulo se llama solo "ZR" (la agencia se elige arriba, en DISCARGA). */
function brand(){ return "ZR"; }
function cargaLock(kind){ if(S.P?.admin) return false; return !!S.cargas?.[curMes()]?.[kind]; }
async function markCarga(kind,mesPres){
  const mk=curMes(); const prev=S.cargas||{};
  const rec={ts:new Date().toISOString(), por:S.me?.name||"", porId:S.me?.id||"", admin:!!S.P?.admin}; if(mesPres) rec.mes=mesPres;
  if(S.P?.admin) return; // las cargas del administrador no bloquean
  S.cargas={...prev,[mk]:{...(prev[mk]||{}),[kind]:rec}};
  try{ if(S.db) await S.db.doc("config/cargas").set(S.cargas); }catch(e){}
  applyPerms();
}
async function hashPw(pw,salt){ const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(salt+"|"+pw)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
/* DISCARGA: la contraseña es la de la cuenta de DISCARGA CONTROLER */
function myClave(){ return {hash:"discarga"}; }
async function checkPw(pw){ if(!pw) return false; return await window.__zrVerificar(pw); }
let pwRes=null;
function askAdminPass(txt,opt){
  opt=opt||{};
  if(!S.P?.admin){ toast(opt.deny||"Solo un administrador puede eliminar registros"); return Promise.resolve(false); }
  if(!myClave()?.hash){ toast("Registre primero su contraseña de administrador en Usuarios y permisos"); return Promise.resolve(false); }
  $("#pwTitle").textContent=opt.title||"Confirmar eliminación"; $("#pwAskOkT").textContent=opt.ok||"Eliminar";
  $("#pwAskOk").className="btn "+(opt.cls||"danger-solid");
  $("#pwSub").textContent=txt||""; $("#pwAsk").value=""; $("#pwAskErr").hidden=true; $("#pwBack").hidden=false; setTimeout(()=>$("#pwAsk").focus(),30);
  return new Promise(r=>{ pwRes=r; });
}
function closePw(v){ $("#pwBack").hidden=true; const r=pwRes; pwRes=null; if(r) r(v); }
async function confirmPw(){ const ok=await checkPw($("#pwAsk").value); if(!ok){ const e=$("#pwAskErr"); e.textContent="Contraseña incorrecta. Use su contraseña de administrador."; e.hidden=false; $("#pwAsk").select(); return; } closePw(true); }
function renderPwState(){}
function genPw(){ const A="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; const r=crypto.getRandomValues(new Uint8Array(10)); return [...r].map(x=>A[x%A.length]).join(""); }
let psCtx=null;
function openPwSet(id,nombre){
  if(!S.P?.admin){ toast("Solo un administrador puede asignar contraseñas"); return; }
  psCtx={id,nombre}; const self=id===S.me?.id; const has=!!S.claves?.[id]?.hash;
  $("#psTitle").textContent= has? `Restablecer contraseña` : `Asignar contraseña`;
  $("#psSub").textContent= self? "Su contraseña de administrador" : `Para ${nombre}`;
  $("#psCurF").hidden=!(self&&has);
  ["#psCur","#psNew","#psNew2"].forEach(k=>$(k).value=""); $("#psNew").type="password"; $("#psNew2").type="password"; $("#psEye").textContent="Mostrar";
  $("#psErr").hidden=true; $("#psBack").hidden=false; setTimeout(()=>($("#psCurF").hidden?$("#psNew"):$("#psCur")).focus(),30);
}
async function savePwSet(){
  const e=$("#psErr"); e.hidden=true; const fail=m=>{ e.textContent=m; e.hidden=false; };
  if(!psCtx) return; const {id}=psCtx; const self=id===S.me?.id; const prev=S.claves?.[id];
  if(self && prev?.hash){ const c=prev; let ok=false; try{ ok=(await hashPw($("#psCur").value,c.salt||""))===c.hash; }catch(x){} if(!ok) return fail("La contraseña actual no es correcta."); }
  const n1=$("#psNew").value, n2=$("#psNew2").value;
  if(n1.length<6) return fail("La nueva contraseña debe tener al menos 6 caracteres.");
  if(n1!==n2) return fail("Las contraseñas no coinciden.");
  const salt=[...crypto.getRandomValues(new Uint8Array(12))].map(x=>x.toString(16).padStart(2,"0")).join("");
  const rec={hash:await hashPw(n1,salt), salt, actualizado:new Date().toISOString(), por:S.me?.name||"", porId:S.me?.id||""};
  const next={...(S.claves||{}),[id]:rec};
  const btn=$("#psOk"); btn.disabled=true;
  try{ if(S.db) await S.db.doc("config/claves").set(next); S.claves=next; $("#psBack").hidden=true; psCtx=null; toast(prev?.hash?"Contraseña restablecida":"Contraseña asignada"); renderUsuarios(); }
  catch(ex){ fail(ex?.code==="invalid_argument"?"Solo los administradores con acceso de edición pueden asignar contraseñas.":"No se pudo guardar. Intente de nuevo."); }
  finally{ btn.disabled=false; }
}
async function delClave(id){
  const next={...(S.claves||{})}; if(!next[id]) return; delete next[id];
  try{ if(S.db) await S.db.doc("config/claves").set(next); S.claves=next; }catch(e){}
}
const AGENCIAS=["Villa Nueva","Barberena","Jutiapa","Jalapa","Progreso","Chiquimulilla","Atanasio","Naranjo","Xela","San Marcos","Tacana","Cuyotenango","Retalhuleu","Coatepeque","Coban","Salama","Polochic","Las Casas","Playa Grande","Escuintla","Cocales"].sort((a,b)=>a.localeCompare(b,"es"));
function agOptions(cur,blank){ const c=String(cur||""); const extra=c&&!AGENCIAS.includes(c)?[c]:[]; return (blank?`<option value="">${blank}</option>`:"")+[...AGENCIAS,...extra].map(a=>`<option value="${esc(a)}" ${a===c?"selected":""}>${esc(a)}</option>`).join(""); }
const normN=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
function ukey(u){ return u.id||u.key; }
function findMe(list){ if(!S.me) return null; return list.find(x=>x.id&&x.id===S.me.id) || list.find(x=>!x.id&&((x.nombre&&normN(x.nombre)===normN(S.me.name))||(x.correo&&S.me.email&&normN(x.correo)===normN(S.me.email)))) || null; }
const ACCS=[["op","Operación"],["an","Análisis"],["cfg","Configuración"],["carga","Carga de datos"]];
let usrProfiles={};
async function loadProfiles(ids){
  const need=ids.filter(id=>id&&!usrProfiles[id]); if(!need.length) return;
  try{ const u=await window.claude?.use?.("user"); if(u){ const ps=await u.profiles(need); Object.assign(usrProfiles,ps||{}); } }catch(e){}
}
function uName(id){ if(id&&id===S.me?.id&&S.me?.name) return S.me.name; const e=(S.usuarios||[]).find(x=>ukey(x)===id); const p=usrProfiles[id]; return p?.name||e?.nombre||e?.correo||(id===S.owner?.id?S.owner?.nombre:"")||"Usuario"; }
function pwCell(id,admin){ return `<span class="pw-st"><span class="muted" style="font-size:12px">La de su cuenta de DISCARGA CONTROLER</span></span>`; }
async function renderUsuarios(){
  const t=$("#tblUsr"); if(!t) return;
  const list=S.usuarios||[]; const ownerId=S.owner?.id||null;
  await loadProfiles([ownerId,...list.map(x=>x.id)].filter(Boolean));
  const admins=[]; if(ownerId) admins.push({id:ownerId,owner:true,agencia:(list.find(x=>x.id===ownerId)||{}).agencia||""});
  list.filter(x=>x.admin&&x.id!==ownerId).forEach(x=>admins.push({...x,id:ukey(x)}));
  const users=list.filter(x=>!x.admin&&x.id!==ownerId).map(x=>({...x,id:ukey(x),linked:!!x.id}));
  $("#cntUsr").textContent=list.filter(x=>x.id!==ownerId).length+(ownerId?1:0);
  const nAdmPw=admins.length; const nUsrPw=users.length;
  $("#usrStats").innerHTML=`<div class="usr-stat"><em>Total de personas</em><b>${admins.length+users.length}</b><small>con acceso registrado</small></div>
    <div class="usr-stat"><em>Administradores</em><b>${admins.length}</b><small>acceso total</small></div>
    <div class="usr-stat"><em>Usuarios</em><b>${users.length}</b><small>${nUsrPw} con contraseña</small></div>
    <div class="usr-stat ${nAdmPw<admins.length?"warn":"ok"}"><em>Contraseñas</em><b>${nAdmPw}/${admins.length}</b><small>${nAdmPw<admins.length?"administradores sin contraseña":"todas registradas"}</small></div>`;
  const ini=n=>esc((n||"U").trim().charAt(0).toUpperCase());
  const ag=a=>{ const v=String(a||"").trim(); return v?(/^zr\b/i.test(v)?v:"ZR "+v):"ZR Atanasio"; };
  $("#admGrid").innerHTML= admins.length? admins.map(a=>{ const n=uName(a.id); const me=a.id===S.me?.id;
    return `<div class="adm-card ${me?"me":""}">
      <div class="adm-top"><span class="av">${ini(n)}</span><div style="flex:1;min-width:0"><b>${esc(n)}${me?` <span class="pill info" style="margin-left:4px">Usted</span>`:""}</b><small>${a.owner?"Propietario · administrador":"Administrador"}${a.correo&&a.nombre?` · ${esc(a.correo)}`:""}</small></div>
        ${S.P?.admin&&!a.owner?`<button class="btn small ghost" type="button" data-uadm-off="${esc(a.id)}" title="Cambiar a usuario">Quitar admin</button>`:""}</div>
      <div class="adm-row"><em>Accesos</em><span class="acc-chips">${ACCS.map(([k,l])=>`<span class="acc on" style="cursor:default">${l}</span>`).join("")}<span class="acc on" style="cursor:default">Usuarios</span></span></div>
      <div class="adm-row"><em>Contraseña</em>${pwCell(a.id,true)}</div>
      <div class="adm-row"><em>Agencia</em><span style="display:flex;gap:6px;align-items:center"><select class="ag-sel" data-uag="${esc(a.id)}" ${S.P?.admin?"":"disabled"} aria-label="Agencia de ${esc(n)}">${agOptions(a.agencia,"Atanasio (predeterminada)")}</select><span class="muted" style="font-size:12px;white-space:nowrap">${esc(ag(a.agencia))}</span></span></div>
    </div>`; }).join("") : `<div class="muted" style="font-size:13px">El propietario aparecerá aquí cuando abra la página.</div>`;
  const f=($("#usrFiltro")?.value||"").trim().toLowerCase();
  const shown=users.filter(u=>!f||uName(u.id).toLowerCase().includes(f)||String(u.agencia||"").toLowerCase().includes(f));
  const dis=S.P?.admin?"":"disabled";
  t.innerHTML= !users.length? `<tbody><tr><td class="empty-state">Aún no hay usuarios. Use “Agregar usuario”.</td></tr></tbody>`
   : `<thead><tr><th>Usuario</th><th>Agencia</th><th>Rol</th><th>Accesos</th><th>Contraseña</th><th></th></tr></thead><tbody>${shown.map(u=>{ const n=uName(u.id);
    return `<tr><td><div class="adm-top"><span class="av u">${ini(n)}</span><div><b>${esc(n)}</b><small>${u.correo&&u.nombre?esc(u.correo)+" · ":""}${u.linked?`<span class="link-st" style="color:var(--ok)">Cuenta vinculada</span>`:`<span class="link-st" style="color:var(--warn)">Pendiente de vincular con su cuenta de DISCARGA CONTROLER</span>`}</small></div></div></td>
      <td><select class="ag-sel" data-uag="${esc(u.id)}" ${dis} aria-label="Agencia de ${esc(n)}">${agOptions(u.agencia,"Sin agencia")}</select></td>
      <td><select data-urol="${esc(u.id)}" ${dis} style="min-width:130px;padding:6px 9px" aria-label="Rol de ${esc(n)}"><option value="user" selected>Usuario</option><option value="admin">Administrador</option></select></td>
      <td><span class="acc-chips">${ACCS.map(([k,l])=>`<button type="button" class="acc ${u[k]?"on":""}" data-uk="${k}" data-uid="${esc(u.id)}" aria-pressed="${u[k]?"true":"false"}" ${dis}><i>${u[k]?"✓":"+"}</i>${l}</button>`).join("")}</span></td>
      <td>${pwCell(u.id,true)}</td>
      <td>${S.P?.admin?`<button class="btn small ghost danger-ghost icon-only" type="button" data-udel="${esc(u.id)}" title="Quitar usuario" aria-label="Quitar a ${esc(n)}"><svg class="ico"><use href="#i-trash"/></svg></button>`:""}</td></tr>`; }).join("")||`<tr><td colspan="6" class="empty-state">Sin coincidencias.</td></tr>`}</tbody>`;
  const P=document.querySelector('[data-panel="usuarios"]');
  P.querySelectorAll("[data-uk]").forEach(c=>c.onclick=()=>{ const k=c.dataset.uk; const l=(S.usuarios||[]).map(x=>ukey(x)===c.dataset.uid?{...x,[k]:!x[k]}:x); saveUsuarios(l); });
  P.querySelectorAll("[data-uag]").forEach(c=>c.onchange=()=>{ const v=c.value.trim(); const id=c.dataset.uag; let l=S.usuarios||[];
    l= l.some(x=>ukey(x)===id)? l.map(x=>ukey(x)===id?{...x,agencia:v}:x) : [...l,{id,op:true,an:true,cfg:true,carga:true,admin:true,agencia:v}];
    saveUsuarios(l, v?`Agencia asignada: ${ag(v)}`:"Agencia quitada"); });
  P.querySelectorAll("[data-urol]").forEach(c=>c.onchange=()=>{ if(c.value!=="admin") return; const l=(S.usuarios||[]).map(x=>ukey(x)===c.dataset.urol?{...x,admin:true}:x); saveUsuarios(l,`${uName(c.dataset.urol)} ahora es administrador`); });
  P.querySelectorAll("[data-uadm-off]").forEach(b=>b.onclick=async()=>{ const id=b.dataset.uadmOff; if(!(await askAdminPass(`Quitar el rol de administrador a ${uName(id)}. Conservará los accesos de usuario.`,{title:"Confirmar cambio de rol",ok:"Quitar administrador",cls:"primary"}))) return;
    const l=(S.usuarios||[]).map(x=>ukey(x)===id?{...x,admin:false,op:true}:x); saveUsuarios(l,"Rol cambiado a usuario"); });
  P.querySelectorAll("[data-pwset]").forEach(b=>b.onclick=()=>openPwSet(b.dataset.pwset,uName(b.dataset.pwset)));
  P.querySelectorAll("[data-udel]").forEach(b=>b.onclick=async()=>{ const id=b.dataset.udel; if(!(await askAdminPass(`Quitar a ${uName(id)} de la lista de usuarios.`,{title:"Quitar usuario",ok:"Quitar"}))) return; await delClave(id); saveUsuarios((S.usuarios||[]).filter(x=>ukey(x)!==id),"Usuario quitado"); });
}
async function saveUsuarios(list,msg){
  const prev=S.usuarios; S.usuarios=list;
  try{ if(S.db) await S.db.doc("config/usuarios").set({lista:list,owner:S.owner||null,actualizado:new Date().toISOString()}); if(msg) toast(msg); $("#usrErr").hidden=true; applyPerms(); renderUsuarios(); }
  catch(e){ S.usuarios=prev; const er=$("#usrErr"); er.textContent= e?.code==="invalid_argument"? "Solo los administradores con acceso de edición pueden modificar usuarios." : "No se pudo guardar. Intente de nuevo."; er.hidden=false; renderUsuarios(); }
}
async function syncOwner(){ if(!S.ownerDirty||!S.db||!S.usrLoaded) return; S.ownerDirty=false; try{ await S.db.doc("config/usuarios").set({lista:S.usuarios||[],owner:S.owner,actualizado:new Date().toISOString()}); }catch(e){} }
let usrT=null;
let uaCtx={rol:"user",id:null,acc:{op:true,an:false,cfg:true,carga:true}};
function openUserAdd(){
  if(!S.P?.admin){ toast("Solo un administrador puede agregar usuarios"); return; }
  uaCtx={rol:"user",id:null,acc:{op:true,an:false,cfg:true,carga:true}};
  $("#uaAg").innerHTML=`<option value="">Seleccione la agencia</option>`+agOptions("");
  ["#uaNom","#uaPw","#uaPw2"].forEach(k=>$(k).value=""); $("#uaPw").type=$("#uaPw2").type="password"; $("#uaEye").textContent="Mostrar";
  $("#uaSug").hidden=true; $("#uaErr").hidden=true; setUaLink(); renderUaRol(); $("#uaBack").hidden=false; setTimeout(()=>$("#uaAg").focus(),30);
}
function renderUaRol(){
  document.querySelectorAll("[data-uarol]").forEach(b=>{ const on=b.dataset.uarol===uaCtx.rol; b.classList.toggle("on",on); b.setAttribute("aria-checked",on?"true":"false"); });
  const adm=uaCtx.rol==="admin";
  $("#uaAcc").innerHTML=ACCS.map(([k,l])=>`<button type="button" class="acc ${adm||uaCtx.acc[k]?"on":""}" data-uaacc="${k}" ${adm?"disabled":""}><i>${adm||uaCtx.acc[k]?"✓":"+"}</i>${l}</button>`).join("")+(adm?`<span class="acc on" style="cursor:default">Usuarios</span>`:"");
  $("#uaAcc").querySelectorAll("[data-uaacc]").forEach(b=>b.onclick=()=>{ uaCtx.acc[b.dataset.uaacc]=!uaCtx.acc[b.dataset.uaacc]; renderUaRol(); });
}
function setUaLink(){ const el=$("#uaLink"); if(uaCtx.id){ el.innerHTML=`<span style="color:var(--ok)">✓ Cuenta vinculada</span>`; } else { el.textContent="Escriba el nombre y elija a la persona de la lista (usuarios de DISCARGA CONTROLER con acceso a ZR). Entra con su usuario y contraseña de DISCARGA CONTROLER."; } }
let uaT=null;
async function uaSearch(){
  const q0=$("#uaNom").value.trim(); const box=$("#uaSug");
  if(q0.length<2||q0.includes("@")){ box.hidden=true; return; }
  const u=await window.claude?.use?.("user"); if(!u?.search){ box.hidden=true; return; }
  let hits=[]; try{ hits=await u.search(q0); }catch(e){}
  const have=new Set([...(S.usuarios||[]).map(x=>x.id), S.owner?.id].filter(Boolean));
  hits=hits.filter(h=>!have.has(h.id)).slice(0,6);
  if(!hits.length){ box.hidden=true; return; }
  box.innerHTML=hits.map(h=>`<button type="button" data-uapick="${esc(h.id)}" data-uaname="${esc(h.name||"")}">${esc(h.name||"Sin nombre")}${h.email?`<small>${esc(h.email)}</small>`:""}</button>`).join("");
  box.hidden=false;
  box.querySelectorAll("[data-uapick]").forEach(b=>b.onclick=()=>{ uaCtx.id=b.dataset.uapick; $("#uaNom").value=b.dataset.uaname; box.hidden=true; setUaLink(); $("#uaOk").focus(); });
}
async function saveUserAdd(){
  const e=$("#uaErr"); e.hidden=true; const fail=m=>{ e.textContent=m; e.hidden=false; };
  if(!S.P?.admin) return fail("Solo un administrador puede agregar usuarios.");
  const agencia=$("#uaAg").value, raw=$("#uaNom").value.trim(), p1=$("#uaPw").value, p2=$("#uaPw2").value;
  if(!agencia) return fail("Seleccione la agencia.");
  if(raw.length<3) return fail("Escriba el nombre o correo del usuario.");
  const isMail=raw.includes("@"); if(isMail && !isEmail(raw)) return fail("El correo no es válido.");
  const list=S.usuarios||[];
  if(list.some(x=>(uaCtx.id&&x.id===uaCtx.id)||normN(x.nombre||"")===normN(raw)||(x.correo&&normN(x.correo)===normN(raw)))) return fail("Ese usuario ya está en la lista.");
  const adm=uaCtx.rol==="admin";
  const key= uaCtx.id || ("p_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6));
  const entry={ ...(uaCtx.id?{id:uaCtx.id}:{key}), nombre: isMail?"":raw, correo: isMail?raw:"", agencia, admin:adm,
    op:adm||!!uaCtx.acc.op, an:adm||!!uaCtx.acc.an, cfg:adm||!!uaCtx.acc.cfg, carga:adm||!!uaCtx.acc.carga, creado:new Date().toISOString(), creadoPor:S.me?.name||"" };
  const btn=$("#uaOk"); btn.disabled=true;
  try{
    $("#uaBack").hidden=true;
    await saveUsuarios([...list,entry], `${adm?"Administrador":"Usuario"} ${raw} agregado · ZR ${agencia}`);
  }catch(ex){ fail(ex?.code==="invalid_argument"?"Solo los administradores con acceso de edición pueden agregar usuarios.":"No se pudo guardar. Intente de nuevo."); }
  finally{ btn.disabled=false; }
}
async function linkPending(){
  // el administrador vincula automáticamente las cuentas pendientes cuando la persona ya abrió la página (por nombre)
  if(!S.P?.admin||!S.db) return;
  const pend=(S.usuarios||[]).filter(x=>!x.id&&x.nombre); if(!pend.length) return;
  const u=await window.claude?.use?.("user"); if(!u?.search) return;
  let changed=false; const claves={...(S.claves||{})}; const list=[...(S.usuarios||[])];
  for(const p of pend){ let hits=[]; try{ hits=await u.search(p.nombre); }catch(e){}
    const m=hits.filter(h=>normN(h.name)===normN(p.nombre)); if(m.length!==1) continue;
    if(list.some(x=>x.id===m[0].id)) continue;
    const i=list.indexOf(p); list[i]={...p,id:m[0].id}; delete list[i].key; if(claves[p.key]){ claves[m[0].id]=claves[p.key]; delete claves[p.key]; } changed=true; }
  if(changed){ try{ await saveUsuarios(list); }catch(e){} }
}
async function initUser(){
  const u = window.claude?.use? await window.claude.use("user") : null;
  if(!u){ S.noUserCap=true; S.userReady=false; applyPerms(); return; }
  let owner=false,id=null,name="",email=null;
  try{ owner=await u.isOwner(); }catch(e){}
  try{ id=await u.id(); }catch(e){}
  try{ name=(await u.name())||""; }catch(e){}
  try{ const me=await u.me(); name=name||me?.name||""; email=me?.email||null; id=id||me?.id||null; }catch(e){}
  S.me={id,name,email,owner}; S.userReady=true;
  if(owner && id && (S.owner?.id!==id || S.owner?.nombre!==name)){ S.owner={id,nombre:name}; S.ownerDirty=true; syncOwner(); }
  applyPerms(); renderUsuarios(); setTimeout(linkPending,1500);
}

/* ---------- export ---------- */
async function exportXlsx(){
  if(typeof XLSX==="undefined"||!budget()){ toast("No hay datos para exportar"); return; }
  const pm=paidMap(); const wb=XLSX.utils.book_new();
  const comp=[["Sector","Presupuesto","Registrado","Diferencia","% ejecución","Pagos cubiertos","Pagos programados"]];
  for(const s of sectores()){ const pres=Object.values(s.dias).reduce((a,b)=>a+b,0); const reg=Object.values(pm[s.id]||{}).reduce((a,v)=>a+v.sum,0); comp.push([s.nombre,pres,reg,round2(pres-reg),pres?round2(reg/pres*100):0,Object.keys(s.dias).filter(d=>pm[s.id]?.[d]?.sum>0).length,Object.keys(s.dias).length]); }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(comp),"Por sector");
  const diario=[["Día","Sector","Presupuesto","Registrado","Diferencia","Estado"]];
  for(let d=1; d<=daysIn(S.mes); d++) for(const s of sectores()){ const b=s.dias[d]||0,p=pm[s.id]?.[d]?.sum||0; if(b||p) diario.push([S.mes+"-"+pad(d),s.nombre,b,p,round2(b-p),statusFor(b,p,d,pm[s.id]?.[d]?.list).t]); }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(diario),"Diario");
  const pg=[["Fecha retiro","Fecha registro","Correlativo","Sector","No. ruta","Piloto","Motivo de pago","No. boleta","Banco","Monto registrado","Presupuesto del día"]];
  for(const p of pagosMes().sort((a,b)=>a.fechaRetiro.localeCompare(b.fechaRetiro))){ const s=secById(p.sectorId); pg.push([p.fechaRetiro,p.fechaRegistro,p.correlativo,s?.nombre||p.sectorNombre,p.ruta||"",p.piloto||"",(p.tipoPago==="mano"?"Mano a mano":p.tipoPago==="deposito"?"Depósito":(p.banco?"Depósito":"—")),p.boleta||"",p.banco||"",+p.monto,s?.dias[dayOf(p)]||0]); }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(pg),"Pagos");
  { const rei=[["No. reintegro","Fecha programada","Correlativo sector","Sector","Presupuesto","Ejecutado","Monto reintegrado","No. de recibo","Banco"]];
    for(const r of reintMes().sort((a,b)=>cmpCorr(a.corrSector,b.corrSector))) rei.push([r.numero,r.fecha,r.corrSector||"",r.sectorNombre,r.presupuesto,r.ejecutado,r.monto,r.recibo,r.banco]);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rei),"Reintegros"); }
  const data=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  const dl=await (window.claude?.use? window.claude.use("downloads") : null);
  if(!dl){ toast("La descarga no está disponible en esta vista"); return; }
  try{ await dl.save({filename:`Comparacion_ZR_${S.mes}.xlsx`, data:new Blob([data])}); }
  catch(ex){ if(ex?.code!=="declined") toast("No se pudo generar la descarga"); }
}

/* ---------- wiring ---------- */
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{ S.tab=b.dataset.tab; try{localStorage.setItem("zr.tab",S.tab);}catch(e){} renderTabs(); if(S.tab==="autorizaciones") refreshSols(); });
$("#mesSel").onchange=e=>{ S.mes=e.target.value; S.calDay=null; S.openSector=null; renderAll(); };
$("#frm").addEventListener("submit",savePago);
["#fRetiro","#fSector","#fMonto"].forEach(id=>$(id).addEventListener("input",()=>{ if(id==="#fRetiro"){ const m=$("#fRetiro").value.slice(0,7); if(m && m!==S.mes && S.budgets[m]){ S.mes=m; S.calDay=+$("#fRetiro").value.slice(8,10); renderAll(); return; } if(m===S.mes){ S.calDay=+$("#fRetiro").value.slice(8,10); renderCal(); } } renderHint(); corrPreview(); }));
$("#btnCancelEdit").onclick=resetForm;
$("#btnAuth").onclick=openAuth;
["#tpDep","#tpMano"].forEach(id=>$(id).addEventListener("change",()=>{ applyTipo(); updateSaveState(); }));
$("#manoFile").onchange=onManoFile;
$("#manoOk").onclick=confirmMano;
$("#manoCancel").onclick=()=>closeEvidence(null);
document.addEventListener("paste",e=>{ if($("#manoBack").hidden) return; const items=[...(e.clipboardData?.items||[])]; const it=items.find(i=>i.kind==="file"&&/^image\//.test(i.type)); if(it){ e.preventDefault(); setManoFile(it.getAsFile()); } else if((e.clipboardData?.files||[]).length){ e.preventDefault(); setManoFile(e.clipboardData.files[0]); } else { $("#manoErr").textContent="El portapapeles no contiene una imagen. Copie la imagen (no el enlace) e intente de nuevo."; $("#manoErr").hidden=false; } });
{ const dz=$("#manoDrop"); ["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("over");})); ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("over");})); dz.addEventListener("drop",e=>{ const f=e.dataTransfer?.files?.[0]; if(f) setManoFile(f); }); }
function applyTheme(t){ const r=document.documentElement; if(t==="light"||t==="dark") r.setAttribute("data-zr-theme",t); else r.removeAttribute("data-zr-theme");
  document.querySelectorAll("[data-theme-set]").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.themeSet===t))); try{ localStorage.setItem("zr.theme",t||"auto"); }catch(e){} }
document.querySelectorAll("[data-theme-set]").forEach(b=>b.onclick=()=>applyTheme(b.dataset.themeSet));
{ let t="light"; try{ t=localStorage.getItem("zr.theme")||"light"; }catch(e){} applyTheme(t==="dark"?"dark":"light"); }
$("#gmOk").onclick=confirmGastoModal; $("#gmCancel").onclick=()=>{ $("#gmBack").hidden=true; gastoPend=null; };
$("#reFile").onchange=onReintFile; $("#reTotal").onchange=updReintMonto; $("#reOk").onclick=saveReint; $("#reCancel").onclick=()=>{ $("#reBack").hidden=true; reintCtx=null; };
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ $("#gmBack").hidden=true; $("#reBack").hidden=true; } });
$("#btnUsrAdd").onclick=openUserAdd;
$("#btnNewSec").onclick=openNewSector;
$("#btnPptx").onclick=exportPptx;
$("#histTipo").onchange=renderHistorial; $("#histQ").addEventListener("input",renderHistorial);
$("#btnTogRutas").onclick=()=>{ S.rutasHide=!S.rutasHide; renderRutasBox(); };
$("#fMultiDep").onchange=()=>{ if(!$("#fMultiDep").checked) S.depsX=[]; renderDepsBox(); updateSaveState(); };
$("#btnAddDep").onclick=()=>addDep(false);
["#fMonto","#fBoleta","#fBanco"].forEach(k=>$(k).addEventListener("input",updateMultiSums));
["#tpDep","#tpMano"].forEach(k=>$(k).addEventListener("change",()=>{ renderRutasBox(); updateSaveState(); }));
$("#exNo").onclick=()=>{ $("#exBack").hidden=true; exCtx=null; }; $("#exOk").onclick=sendExtReq;
document.addEventListener("click",e=>{ const b=e.target.closest?.("[data-extreq]"); if(b&&!b.disabled){ const [sid,d]=b.dataset.extreq.split("|"); openExtReq(sid,+d); } }); $("#nsNo").onclick=()=>{ $("#nsBack").hidden=true; }; $("#nsOk").onclick=saveNewSector;
["#nsPago","#nsFrec","#nsMonto"].forEach(k=>$(k).addEventListener("input",nsRender));
$("#nsPago").addEventListener("change",()=>{ const v=$("#nsPago").value; if(v && $("#nsFrec").value!=="u") $("#nsFrec").value=String(new Date(v+"T12:00").getDay()); if(v && (!$("#nsRet").value || $("#nsRet").value>v)) $("#nsRet").value=v; nsRender(); });
$("#nmAdd").onclick=addChip; $("#nmTo").addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===","){ e.preventDefault(); addChip(); } });
["#nmSubj","#nmBody"].forEach(k=>$(k).addEventListener("input",renderChips));
$("#nmNo").onclick=()=>{ $("#nmBack").hidden=true; };
$("#nmOpen").addEventListener("click",e=>{ if(!addChip()){ e.preventDefault(); return; } if(!nmList.length){ e.preventDefault(); $("#nmErr").textContent="Agregue al menos un destinatario."; $("#nmErr").hidden=false; return; } renderChips(); saveNotifDest(); toast("Abriendo su aplicación de correo…"); });
$("#nmCopy").onclick=async()=>{ addChip(); const txt=`Para: ${nmList.join(", ")}\nAsunto: ${$("#nmSubj").value}\n\n${$("#nmBody").value}`; try{ await navigator.clipboard.writeText(txt); toast("Correo copiado"); }catch(e){ const t=$("#nmBody"); t.focus(); t.select(); toast("Seleccionado: presione Ctrl+C"); } saveNotifDest(); };
$("#amOk").onclick=()=>{ $("#amBack").hidden=true; };
$("#avNo").onclick=()=>{ $("#avBack").hidden=true; avCtx=null; }; $("#avOk").onclick=confirmAntAuth; $("#avFile").onchange=()=>setAvFile($("#avFile").files[0]);
{ const dz=$("#avDrop"); ["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("over");})); ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("over"); if(ev==="drop"&&e.dataTransfer?.files?.[0]) setAvFile(e.dataTransfer.files[0]);})); }
document.addEventListener("paste",e=>{ if($("#avBack").hidden) return; const it=[...(e.clipboardData?.items||[])].find(i=>i.kind==="file"&&(/^image\//.test(i.type)||i.type==="application/pdf")); if(it){ e.preventDefault(); setAvFile(it.getAsFile()); } });
$("#indDia").addEventListener("change",()=>{ renderIndicadores(); renderDailyChart(); });
$("#uaNo").onclick=()=>{ $("#uaBack").hidden=true; };
$("#uaOk").onclick=saveUserAdd;
document.querySelectorAll("[data-uarol]").forEach(b=>b.onclick=()=>{ uaCtx.rol=b.dataset.uarol; renderUaRol(); });
$("#uaNom").addEventListener("input",()=>{ uaCtx.id=null; setUaLink(); clearTimeout(uaT); uaT=setTimeout(uaSearch,300); });
$("#uaEye").onclick=()=>{ const sh=$("#uaPw").type==="password"; $("#uaPw").type=$("#uaPw2").type=sh?"text":"password"; $("#uaEye").textContent=sh?"Ocultar":"Mostrar"; };
$("#uaGen").onclick=()=>{ const p=genPw(); $("#uaPw").value=$("#uaPw2").value=p; $("#uaPw").type=$("#uaPw2").type="text"; $("#uaEye").textContent="Ocultar"; };
$("#usrFiltro").addEventListener("input",()=>renderUsuarios());
$("#psOk").onclick=savePwSet; $("#psNo").onclick=()=>{ $("#psBack").hidden=true; psCtx=null; };
$("#psEye").onclick=()=>{ const sh=$("#psNew").type==="password"; $("#psNew").type=$("#psNew2").type=sh?"text":"password"; $("#psEye").textContent=sh?"Ocultar":"Mostrar"; };
$("#psGen").onclick=()=>{ const p=genPw(); $("#psNew").value=$("#psNew2").value=p; $("#psNew").type=$("#psNew2").type="text"; $("#psEye").textContent="Ocultar"; };
$("#pwAskOk").onclick=confirmPw; $("#pwAskNo").onclick=()=>closePw(false);
$("#pwAsk").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); confirmPw(); } if(e.key==="Escape") closePw(false); });

$("#remClose").onclick=()=>{ $("#remBack").hidden=true; };
$("#remBack").addEventListener("click",e=>{ if(e.target.id==="remBack") $("#remBack").hidden=true; });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") $("#remBack").hidden=true; });
$("#btnGoPilotos").onclick=goPilotos; $("#btnGoPil").onclick=goPilotos;
$("#pilFile").onchange=()=>readPilFile($("#pilFile").files[0]);
$("#btnPilCancel").onclick=cancelPil;
$("#btnPilAdd").onclick=async()=>{ if(cargaLock("pilotos")){ cancelPil(); applyPerms(); return; } if(S.pilImp && await savePil(mergePil(S.pil||[],S.pilImp),`${S.pilImp.length} pilotos cargados`)){ cancelPil(); markCarga("pilotos"); } };
$("#btnPilReplace").onclick=async()=>{ if(cargaLock("pilotos")){ cancelPil(); applyPerms(); return; } if(S.pilImp && await savePil(mergePil([],S.pilImp),"Lista de pilotos reemplazada")){ cancelPil(); markCarga("pilotos"); } };
$("#btnPilOne").onclick=()=>{ if(!S.P?.admin){ toast("Solo un administrador puede agregar pilotos uno a uno"); return; } addOnePil(); };
$("#btnDataMes").onclick=downloadDataMes;
$("#rutaAlc").onchange=renderIndicadores; $("#reintAlc").onchange=renderReintChart;
{ const dz=$("#pilDrop"); ["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("over");})); ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("over");})); dz.addEventListener("drop",e=>{ const f=e.dataTransfer?.files?.[0]; if(f) readPilFile(f); }); }
$("#btnAuthCancel").onclick=()=>{ S.authOpen=false; updateSaveState(); };
$("#btnAuthSend").onclick=sendAuth;
$("#autFiltro").onchange=renderAut;
["#fRuta","#fPiloto","#fBoleta","#fBanco","#fRegistro"].forEach(id=>{ $(id).addEventListener("input",updateSaveState); $(id).addEventListener("change",updateSaveState); });
$("#filtroSector").onchange=e=>{ S.filtro=e.target.value; renderPagos(); };
$("#impFile").onchange=onImpFile;
$("#impMes").addEventListener("input",renderImpPreview);
$("#btnImpCancel").onclick=cancelImp;
$("#btnGoImp").onclick=()=>{ S.tab="presupuesto"; renderTabs(); $("#dropZone").scrollIntoView({block:"center"}); };
{ const dz=$("#dropZone");
  ["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{ e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{ e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop",e=>{ const f=e.dataTransfer?.files?.[0]; if(f) readImpFile(f); }); }
$("#btnImp").onclick=saveImp;
$("#btnExport").onclick=exportXlsx; $("#btnExport2").onclick=exportXlsx;
$("#btnGoImp2").onclick=()=>$("#btnGoImp").click();
{ const tip=$("#tip");
  document.addEventListener("mousemove",e=>{ const el=e.target.closest?.("[data-tip]"); if(!el){ tip.hidden=true; return; }
    tip.innerHTML=el.getAttribute("data-tip"); tip.hidden=false;
    const w=tip.offsetWidth,h=tip.offsetHeight; let x=e.clientX+14, y=e.clientY+14;
    if(x+w>innerWidth-8) x=e.clientX-w-14; if(y+h>innerHeight-8) y=e.clientY-h-14; tip.style.left=x+"px"; tip.style.top=y+"px"; });
  document.addEventListener("scroll",()=>tip.hidden=true,true); }

$("#fRegistro").value=todayISO; $("#fRetiro").value=todayISO;
try{ const t=localStorage.getItem("zr.tab"); if(t && document.querySelector(`[data-tab="${t}"]`)) S.tab=t; }catch(e){}
function pickMes(){ const keys=Object.keys(S.budgets).sort(); if(S.mes && S.budgets[S.mes]) return; S.mes = S.budgets[todayISO.slice(0,7)]? todayISO.slice(0,7) : keys[keys.length-1] || todayISO.slice(0,7); }

// Local preview until the shared store answers
/* DISCARGA: sin datos de ejemplo mientras carga la agencia */
S.budgets={}; pickMes(); renderAll();

(async()=>{
  const db = window.claude?.use ? await window.claude.use("db") : null;
  initUser();
  if(!db){ const b=$("#banner"); b.hidden=false; b.textContent="Vista previa sin almacenamiento: los pagos que ingrese aquí no se guardarán."; scheduleReminder(); return; }
  S.db=db; let gotBud=false;
  db.collection("presupuestos").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{ const v=d.data(); if(v?.sectores) m[d.id]=v; });
    S.budgets=m; gotBud=true; if(S.mes && !m[S.mes]) S.mes=null; pickMes(); safeRender();
  }, e=>{ toast("Se perdió la conexión con los datos"); });
  db.collection("solicitudes").onSnapshot(snap=>{ S.sols=snap.docs.map(d=>({id:d.id,...d.data()})); safeRender(); }, e=>{ console.warn("solicitudes snapshot", e?.code); refreshSols(); });
  db.collection("reintegros").onSnapshot(snap=>{ const m={}; snap.docs.forEach(d=>m[d.id]=d.data()); S.reint=m; safeRender(); }, ()=>{});
  db.collection("reintegros").get().then(snap=>{ const m={}; snap.docs.forEach(d=>m[d.id]=d.data()); S.reint=m; safeRender(); }).catch(()=>{});
  db.collection("vales").onSnapshot(snap=>{ const m={}; snap.docs.forEach(d=>m[d.id]=d.data()); S.vales=m; safeRender(); }, ()=>{});
  db.collection("vales").get().then(snap=>{ const m={}; snap.docs.forEach(d=>m[d.id]=d.data()); S.vales=m; safeRender(); }).catch(()=>{});
  db.collection("gastos").onSnapshot(snap=>{ const m={}; snap.docs.forEach(d=>m[d.id]=d.data()); S.gastos=m; safeRender(); }, ()=>refreshGastos());
  refreshGastos();
  refreshSols(); setInterval(()=>{ if(S.tab==="autorizaciones" && document.visibilityState==="visible") refreshSols(); }, 20000);
  db.doc("config/usuarios").onSnapshot(d=>{ const x=d.exists? d.data() : {}; S.usuarios=x.lista||[]; if(x.owner&&!(S.me?.owner)) S.owner=x.owner; else if(x.owner&&S.me?.owner&&x.owner.id===S.me.id&&x.owner.nombre===S.owner?.nombre) S.ownerDirty=false; else if(S.me?.owner) S.ownerDirty=true; S.usrLoaded=true; syncOwner(); applyPerms(); renderUsuarios(); }, ()=>{});
  db.doc("config/claves").onSnapshot(d=>{ S.claves=d.exists? {...d.data()} : {}; renderUsuarios(); }, ()=>{});
  db.collection("bitacora").onSnapshot(snap=>{ S.bitacora=snap.docs.map(d=>({id:d.id,...d.data()})); if(S.tab==="historial") renderHistorial(); else { const c=$("#cntHist"); if(c) c.textContent=histMeses().length; } }, ()=>{});
  db.collection("historial_meses").onSnapshot(snap=>{ const m={}; snap.docs.forEach(d=>m[d.id]=d.data()); S.respaldos=m; if(S.tab==="historial") renderHistorial(); }, ()=>{});
  db.doc("config/cargas").onSnapshot(d=>{ S.cargas=d.exists? {...d.data()} : {}; applyPerms(); }, ()=>{});
  db.doc("config/seguridad").onSnapshot(d=>{ S.seg=d.exists? {...d.data()} : null; if(S.tab==="presupuesto") renderMeses(); }, ()=>{});
  /* DISCARGA: pilotos = conductores de Personal de las agencias asignadas al usuario */
  window.__zrPilotos(list=>{ S.pil=list; safeRender(); });
  db.doc("config/general").onSnapshot(d=>{ S.cfg=d.exists? {...d.data()} : {}; }, ()=>{});
  db.collection("pagos").onSnapshot(snap=>{
    S.pagos=snap.docs.map(d=>({id:d.id,...d.data()})); safeRender(); scheduleReminder();
  }, e=>{ toast("Se perdió la conexión con los datos"); });
  try{ const u=await window.claude.use("user"); const can=u? await u.can("data.write") : null; if(can===false){ S.readOnly=true; renderAll(); } }catch(e){}
})();
})();
