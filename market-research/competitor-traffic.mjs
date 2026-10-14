// Reads existing owner-authorized market results; never starts a task.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const pct=n=>(n*100).toLocaleString('zh-CN',{maximumFractionDigits:2})+'%';
export function cachedTraffic(records,taskId,tagVersion,country,targets){
 const byParent=new Map();
 for(const record of [...records].sort((a,b)=>b.revision-a.revision)){
  const snapshot=record.snapshot;
  if(record.task_id!==taskId||record.tag_version!==tagVersion||snapshot?.task_id!==taskId||snapshot?.tag_version!==tagVersion)continue;
  for(const c of snapshot.countries||[]){
   if(c.country!==country)continue;
   for(const p of c.parents||[]){if(p.country===country&&!byParent.has(p.parent))byParent.set(p.parent,{...p,cache_revision:record.revision});}
  }
 }
 return targets.map(target=>{
  const value=byParent.get(target.parent);
  if(!value)return {parent:target.parent,state:'not_provided'};
  const window=value.window;
  const windowValid=Array.isArray(window)&&window.length===2&&window.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d))&&Date.parse(window[1])-Date.parse(window[0])===6*86400000;
  const family=Array.isArray(value.children)&&value.children.length>0&&new Set(value.children).size===value.children.length;
  const valid=value.complete===true&&family&&windowValid&&number(value.organic)&&number(value.advertising)&&!(value.missing?.length);
  if(!valid)return {...value,state:'incomplete',organic_share:null,ad_share:null};
  const total=value.organic+value.advertising;
  return {...value,state:total>0?'complete':'zero_total',organic_share:total>0?value.organic/total:null,ad_share:total>0?value.advertising/total:null};
 });
}
export function trafficPanel(rows,{failed=false}={}){
 return `<section class="competitor-traffic"><h3>流量情况</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px">${rows.map(row=>{
  const state=failed?'fetch_failed':row.state;
  const message={not_provided:'未提供 · 待补查',fetch_failed:'获取失败 · 暂时无法读取流量',incomplete:'子体数据未完整',zero_total:'流量总得分为0，暂无有效占比'}[state];
  return `<article class="panel" data-competitor-traffic="${esc(row.parent)}" style="margin:0;min-width:0"><strong>${esc(row.parent)}</strong>${state==='complete'?`<div role="img" aria-label="自然流量${pct(row.organic_share)}，广告流量${pct(row.ad_share)}" style="display:flex;height:14px;border-radius:5px;overflow:hidden;background:#e9eef7;margin-top:14px"><span style="background:#2b8c75;width:${row.organic_share*100}%"></span><span style="background:#4267dd;width:${row.ad_share*100}%"></span></div><p style="margin:10px 0">自然 ${pct(row.organic_share)} <span style="float:right">广告 ${pct(row.ad_share)}</span></p>`:`<p class="muted">${esc(message||'未提供')}</p>`}<p class="muted" style="margin:8px 0 0">自然关键词：未提供 · 广告关键词：未提供</p></article>`;
 }).join('')}</div></section>`;
}

export function trafficTableRows(rows,{failed=false}={}){
 const cells=rows.map(row=>{const state=failed?'fetch_failed':row.state;
 const message={not_provided:'未提供',fetch_failed:'获取失败',incomplete:'子体数据未完整',zero_total:'流量总得分为0，暂无有效占比'}[state];
 return `<td data-competitor-traffic="${esc(row.parent)}">${state==='complete'?`<div class="competitor-ad-bar" role="img" aria-label="自然流量${pct(row.organic_share)}，广告流量${pct(row.ad_share)}"><span class="competitor-organic" style="width:${row.organic_share*100}%"></span><span class="competitor-advertising" style="width:${row.ad_share*100}%"></span></div><div class="competitor-ad-values"><span>自然 ${pct(row.organic_share)}</span> / 广告 ${pct(row.ad_share)}</div>`:`<span class="competitor-missing">${esc(message||'未提供')}</span>`}</td>`;
 }).join('');
 return `<tr><th scope="row">自然 / 广告流量</th>${cells}</tr><tr><th scope="row">自然 / 广告关键词数</th>${rows.map(()=>'<td>未提供 / 未提供</td>').join('')}</tr>`;
}
