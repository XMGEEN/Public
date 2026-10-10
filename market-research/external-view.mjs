const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const known=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const fmt=x=>known(x)?x.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
const pct=x=>known(x)?fmt(x*100)+'%':'—';

function trend(searches,metric){
 const dates=[...new Set(searches.flatMap(s=>(s.weeks||[]).map(r=>r.start)))].sort();
 const maps=searches.map(s=>new Map((s.weeks||[]).map(r=>[r.start,r]))),values=searches.flatMap(s=>(s.weeks||[]).map(r=>r[metric]));
 if(!values.some(known))return '<p class="muted">暂无可用数据</p>';
 const colors=['#3979db','#19856c','#dc7b20','#9a55b9','#c74769'];
 const W=760,H=250,L=62,R=20,T=20,B=40,pw=W-L-R,ph=H-T-B,max=Math.max(1,...values.filter(known));
 const x=i=>L+pw*i/Math.max(1,dates.length-1),y=v=>T+ph*(1-v/max),label=metric==='aba_rank'?'ABA排名':'周搜索量';
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(searches.map(s=>s.keyword).join('、'))} ${label}">`;
 for(let i=0;i<5;i++){let yy=T+ph*i/4;svg+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#e6ecf5"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${fmt(max*(1-i/4))}</text>`;}
 searches.forEach((series,k)=>{
  const color=colors[k%colors.length];let path=[];
  const flush=()=>{if(path.length)svg+=`<polyline data-search-series="${k}" points="${path.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`;path=[];};
  dates.forEach((date,i)=>{const r=maps[k].get(date);
   if(i&&Date.parse(date)-Date.parse(dates[i-1])!==7*86400000)flush();
   if(!r||!known(r[metric])){flush();return;}path.push(x(i)+','+y(r[metric]));
  });flush();
  dates.forEach((date,i)=>{const r=maps[k].get(date);if(r&&known(r[metric]))svg+=`<circle tabindex="0" class="external-point" data-search-series="${k}" data-week="${esc(date)}" cx="${x(i)}" cy="${y(r[metric])}" r="3" fill="${color}"><title>${esc(series.keyword)} · ${esc(r.start)}～${esc(r.end)} · 周搜索量：${fmt(r.search_volume)} · ABA排名：${fmt(r.aba_rank)}</title></circle>`;});
 });
 dates.forEach((date,i)=>{if(i===0||i===dates.length-1||i%Math.max(1,Math.ceil(dates.length/5))===0)svg+=`<text x="${x(i)}" y="${H-12}" text-anchor="${i===0?'start':i===dates.length-1?'end':'middle'}">${esc(date)}</text>`;});
 return `<div class="external-trend stat-plot"><div class="stat-legend external-search-legend">${searches.map((s,k)=>`<button type="button" data-external-series="${k}" aria-pressed="true"><span style="color:${colors[k%colors.length]}">━</span> ${esc(s.keyword)}</button>`).join('')}</div><div class="stat-svg">${svg}</svg></div><output class="stat-readout" aria-live="polite"></output></div>`;
}

export function searchPanel(country,{metric='search_volume'}={}){
 const searches=country?.search||[];if(!searches.length)return '<p class="muted">关键词搜索趋势待接入</p>';
 const dates=[...new Set(searches.flatMap(s=>(s.weeks||[]).map(r=>r.start)))].sort(),ends=searches.flatMap(s=>(s.weeks||[]).map(r=>r.end)).sort();
 return `<div class="external-toolbar"><div class="stat-tabs">${[['search_volume','周搜索量'],['aba_rank','ABA排名']].map(([value,label])=>`<button data-external-metric="${value}" aria-pressed="${metric===value}">${label}</button>`).join('')}</div></div><p class="muted external-coverage">${esc(dates[0])}～${esc(ends.at(-1))} · ${dates.length}周${searches.some(s=>s.coverage?.gaps?.length)?' · 存在缺失周':''}</p>${trend(searches,metric)}`;
}

// Section08: nearby seven-day snapshots share the majority reporting window.
// Source parent windows remain intact; this is a display/aggregation convention.
function reportingWindow(country){
 const counts=new Map();
 for(const p of country?.parents||[]){if(p.country!==country.country||!Array.isArray(p.window))continue;
  const [start,end]=p.window.map(Date.parse);if(end-start!==6*86400000)continue;
  const key=p.window.join('|');counts.set(key,(counts.get(key)||0)+1);
 }
 return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0].split('|')||null;
}
function alignedWindow(window,anchor){
 if(!Array.isArray(window)||window.length!==2)return null;
 const [start,end]=window.map(Date.parse);
 return anchor&&end-start===6*86400000&&Math.abs(start-Date.parse(anchor[0]))<=7*86400000?anchor:window;
}
export function ageTraffic(country,confirmedRows=[]){
 const ages=new Map(confirmedRows.map(r=>[r.id,r.age]));
 for(const g of country?.selection||[])for(const p of g.selected||[])if(!ages.has(p.id))ages.set(p.id,p.age);
 const groups=new Map(),anchor=reportingWindow(country);
 for(const p of country?.parents||[]){
  if(p.country!==country.country)continue;
  const rawAge=ages.get(p.sample_id),age=['new','old'].includes(rawAge)?rawAge:'unknown';
  const window=alignedWindow(p.window,anchor),key=age+'|'+(window||[]).join('|');
  if(!groups.has(key))groups.set(key,{age,window,parents:[]});groups.get(key).parents.push(p);
 }
 return [...groups.values()].sort((a,b)=>['new','old','unknown'].indexOf(a.age)-['new','old','unknown'].indexOf(b.age)).map(g=>{
  const seen=new Set();let valid=!!g.window;
  for(const p of g.parents){if(!p.complete||!known(p.organic)||!known(p.advertising))valid=false;for(const id of p.children||[]){if(seen.has(id))valid=false;seen.add(id);}}
  const organic=valid?g.parents.reduce((v,p)=>v+p.organic,0):null,advertising=valid?g.parents.reduce((v,p)=>v+p.advertising,0):null,total=valid?organic+advertising:0;
  return {...g,organic,advertising,organic_share:valid&&total>0?organic/total:null,ad_share:valid&&total>0?advertising/total:null,state:!valid?'incomplete':total===0?'zero_total':'complete'};
 });
}

export function adsPanel(country,{view='type',rows:confirmedRows=[]}={}){
 const parents=country?.parents||[];if(!parents.length)return '<p class="muted">广告流量数据待接入</p>';
 const groups=country.selection||[];
 const toolbar=`<div class="stat-tabs">${[['type','产品类型'],['age','新品 / 老品']].map(([id,label])=>`<button type="button" data-external-ads="${id}" aria-pressed="${id===view}">${label}</button>`).join('')}</div>`;
 const anchor=reportingWindow(country);
 const periods=[...new Set(parents.filter(p=>p.country===country.country).map(p=>(alignedWindow(p.window,anchor)||[]).join('～')).filter(Boolean))];
 const legend=`<div class="external-legend"><span><i class="natural"></i>自然流量</span><span><i class="advertising"></i>广告流量</span><small class="muted">${esc(periods.join(' · '))}</small></div>`;
 if(view==='age')return toolbar+legend+`<div class="external-ad-groups">${ageTraffic(country,confirmedRows).map(g=>{
  const label={new:'新品',old:'老品',unknown:'新老品未知'}[g.age];
  return `<article class="external-parent" data-ad-age="${g.age}"><div class="external-parent-heading"><strong>${label}（${g.parents.length}个父体）</strong></div>${g.state==='complete'?`<div class="external-ad-bar" role="img" aria-label="${label} 自然${pct(g.organic_share)}，广告${pct(g.ad_share)}"><span class="natural" style="width:${g.organic_share*100}%"></span><span class="advertising" style="width:${g.ad_share*100}%"></span></div><div class="external-ad-values"><span>${pct(g.organic_share)}</span><span>${pct(g.ad_share)}</span></div>`:`<p class="muted">${g.state==='zero_total'?'暂无有效占比':'数据未完整'}</p>`}<details><summary>查看父体</summary><div class="table-wrap"><table><thead><tr><th>父ASIN</th><th>自然得分</th><th>广告得分</th></tr></thead><tbody>${g.parents.map(p=>`<tr><td>${esc(p.parent)}</td><td>${fmt(p.organic)}</td><td>${fmt(p.advertising)}</td></tr>`).join('')}</tbody><tfoot><tr><td>合计</td><td>${fmt(g.organic)}</td><td>${fmt(g.advertising)}</td></tr></tfoot></table></div></details></article>`;
 }).join('')}</div>`;
 return toolbar+legend+`<div class="external-ad-groups">${groups.map(g=>{
  const rows=parents.filter(p=>p.type_id===g.type_id);
  return `<div class="external-ad-group"><h3>${esc(g.type_name)}</h3>${rows.map(p=>{
   const complete=p.complete&&known(p.ad_share)&&known(p.organic_share);
   return `<article class="external-parent" data-external-parent="${esc(p.parent)}"><div class="external-parent-heading"><strong>${esc(p.parent)}</strong></div>${complete?`<div class="external-ad-bar" role="img" aria-label="${esc(p.parent)} 自然${pct(p.organic_share)}，广告${pct(p.ad_share)}"><span class="natural" style="width:${p.organic_share*100}%"></span><span class="advertising" style="width:${p.ad_share*100}%"></span></div><div class="external-ad-values"><span>${pct(p.organic_share)}</span><span>${pct(p.ad_share)}</span></div>`:`<p class="muted">${p.state==='zero_total'?'暂无有效占比':'子体数据未完整'}</p>`}</article>`;
  }).join('')}${rows.length<Math.min(g.target,g.available)?'<p class="muted">替换样本待补查</p>':''}</div>`;
 }).join('')}</div>`;
}
