import {searchPanel,adsPanel} from './external-view.mjs';
import {interpretationPanel,bindInterpretation} from './interpretation-view.mjs';
import {flowNotice,flowActive,searchFromReceipts} from './report-flow-view.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>x===null||x===undefined?'—':Number(x).toLocaleString('en-US',{maximumFractionDigits:2});
const pct=x=>x===null||x===undefined?'—':fmt(x)+'%';
const labels=['父体列表与标签','产品类型定义','搜索量需求趋势','销量与销售额趋势','品牌占比与销售额','链接销量占比','价格段分布','广告流量占比','评分占比','上架趋势','卖家所属地','BuyBox 类型','AI 解读与市场方向建议'];
const table=(headers,rows)=>`<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
function rankedTable(group,kind){
 const price=kind==='price',value=x=>price?x.sales.value:x.count;
 const top=new Set(group.items.map((x,i)=>({i,v:Number(value(x))})).filter(x=>Number.isFinite(x.v)&&x.v>0).sort((a,b)=>b.v-a.v||a.i-b.i).slice(0,3).map(x=>x.i));
 const cell=(text,i)=>top.has(i)?`<strong>${esc(text)}</strong>`:esc(text);
 return `<div class="table-wrap ${price?'price':'rating'}-table"><table><thead><tr><th>指标</th>${group.items.map(x=>`<th>${esc(x.label)}</th>`).join('')}</tr></thead><tbody><tr><th>${price?'销量':'数量'}</th>${group.items.map((x,i)=>`<td>${cell(fmt(value(x)),i)}</td>`).join('')}</tr><tr><th>${price?'销量占比':'数量占比'}</th>${group.items.map((x,i)=>`<td>${cell(pct(price?x.sales_share:x.share),i)}</td>`).join('')}</tr></tbody></table></div>`;
}
const priceTable=g=>rankedTable(g,'price');
const ratingTable=g=>rankedTable(g,'rating');
// Export consumes a frozen owner-authorized snapshot, never live business APIs.
export function frozenReport(data,images){
 const snapshot=data.statistics.snapshot,external=data.external.snapshot,report=data.report;
 const image=(country,row)=>{const uri=images[country+':'+row?.images?.[0]?.file];return uri?`<img src="${esc(uri)}" alt="产品图片">`:'';};
 return snapshot.countries.map(c=>{
  const ext=external.countries.find(x=>x.country===c.country),sections=[];
  const add=(i,body)=>sections.push(`<section class="stat-section print-section" data-section="${i}"><h2>${String(i).padStart(2,'0')} ${esc(labels[i-1])}${i===13?' <small>仅供参考</small>':''}</h2>${body}</section>`);
  add(1,`<p class="print-collapsed">▸ 父体列表（${c.rows.length}）</p>`);
  add(2,`<div class="stat-types">${c.types.map(t=>`<article>${image(c.country,c.rows.find(r=>r.id===t.representative_id))}<h3>${esc(t.name)}</h3><p>${esc(t.definition)}</p></article>`).join('')}</div>`);
  add(3,`<div class="print-search">${searchPanel(ext,{metric:'search_volume'})}</div>`);
  add(4,plot(c.trend.map(x=>x.month),c.trend.map(x=>x.sales.value),{line:c.trend.map(x=>x.revenue.value),left:'销量（件）',right:'销售额（'+c.currency+'）'}));
  add(5,plot(c.brands.map(x=>x.label),c.brands.map(x=>x.sales_share),{line:c.brands.map(x=>x.revenue.value),left:'销量占比（%）',right:'销售额（'+c.currency+'）',percent:true}));
  add(6,plot(c.links.map(x=>x.label),c.links.map(x=>x.sales_share),{left:'销量占比（%）',percent:true}));
  add(7,['all','type','age'].map(k=>c.price[k].map(g=>`<div class="print-table-group ${g.items.length>6?'price-wide':''}"><h3>${esc(g.label)}</h3>${priceTable(g)}</div>`).join('')).join(''));
  add(8,adsPanel(ext,{view:'type',rows:c.rows})+adsPanel(ext,{view:'age',rows:c.rows}));
  add(9,['all','new','type'].map(k=>c.rating[k].map(g=>`<div class="print-table-group"><h3>${esc(g.label)}</h3>${ratingTable(g)}</div>`).join('')).join(''));
  add(10,plot(c.launch.map(x=>x.label),c.launch.map(x=>x.count),{left:'产品数量（组）'}));
  add(11,plot(c.sellers.map(x=>x.label),c.sellers.map(x=>x.count),{line:c.sellers.map(x=>x.sales_share),left:'产品数量（组）',right:'销量占比（%）'}));
  add(12,plot(c.buybox.map(x=>x.label),c.buybox.map(x=>x.count),{left:'产品数量（组）'}));
  add(13,interpretationPanel({...report.snapshot,printAll:true,status:'confirmed',confirmed_version:report.version},c.country));
  return `<article class="print-country"><h1>${esc(c.country)} · 市场调研报告</h1><p>报告版本 ${esc(report.version)} · 样本 ${esc(report.sample_version)} · 标签 ${esc(report.tag_version)} · 外部结果 ${esc(report.external_revision)}</p>${sections.join('')}</article>`;
 }).join('');
}
function plot(labels,bars,{line=null,left='数量',right='',percent=false}={}){
 const valid=x=>x!==null&&x!==undefined&&Number.isFinite(Number(x));
 if(!bars.some(valid)&&!(line||[]).some(valid))return '<p class="muted">暂无可用数据</p>';
 const W=Math.max(620,labels.length*48+120),H=300,L=65,R=65,T=30,B=70,pw=W-L-R,ph=H-T-B;
 const max=Math.max(1,...bars.filter(valid).map(Number)),maxR=Math.max(1,...(line||[]).filter(valid).map(Number));
 const x=i=>L+pw*(i+.5)/Math.max(1,labels.length),y=(v,m)=>T+ph-(Number(v)/m)*ph;
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(left+(line?'与'+right:''))}"><text x="8" y="16">${esc(left)}</text>${line?`<text x="${W-8}" y="16" text-anchor="end">${esc(right)}</text>`:''}`;
 for(let i=0;i<=4;i++){const yy=T+ph*i/4;svg+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e6ecf5"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${fmt(max*(1-i/4))}${percent?'%':''}</text>${line?`<text x="${W-R+8}" y="${yy+4}">${fmt(maxR*(1-i/4))}${right.includes('%')?'%':''}</text>`:''}`;}
 const bw=Math.min(40,pw/labels.length*.55);labels.forEach((name,i)=>{svg+=`<text x="${x(i)}" y="${H-B+20}" text-anchor="end" transform="rotate(-30 ${x(i)} ${H-B+20})">${esc(String(name).length>16?String(name).slice(0,15)+'…':name)}</text>`;if(valid(bars[i]))svg+=`<rect class="stat-bars" tabindex="0" x="${x(i)-bw/2}" y="${y(bars[i],max)}" width="${bw}" height="${Math.max(1,T+ph-y(bars[i],max))}" fill="#3979db"><title>${esc(name)} · ${esc(left)}：${fmt(bars[i])}${percent?'%':''}${line?' · '+esc(right)+'：'+fmt(line[i]):''}</title></rect>`;});
 if(line){let points=[];const flush=()=>{if(points.length)svg+=`<polyline class="stat-lines" points="${points.join(' ')}" fill="none" stroke="#173f85" stroke-width="2.5"/>`;points=[];};line.forEach((v,i)=>{if(!valid(v)){flush();return;}points.push(x(i)+','+y(v,maxR));svg+=`<circle class="stat-lines" tabindex="0" cx="${x(i)}" cy="${y(v,maxR)}" r="4" fill="#173f85"><title>${esc(labels[i])} · ${esc(right)}：${fmt(v)}</title></circle>`;});flush();}
 svg+='</svg>';
 return `<div class="stat-plot"><div class="stat-legend"><button type="button" data-series="bars" aria-pressed="true">● ${esc(left)}</button>${line?`<button type="button" data-series="lines" aria-pressed="true">━ ${esc(right)}</button>`:''}</div><div class="stat-svg">${svg}</div><output class="stat-readout" aria-live="polite"></output></div>`;
}
export async function mountStatistics(root,task,client,alive){
 let stopped=false,timer,snapshot,external=null,searchPreview=null,interpretation=null,externalRevision=null,flow=null,renderSignature='',searchMetric='search_volume',adsView='type',site=0,price='all',rating='all',urls=[];
 const valid=()=>!stopped&&alive(),q=s=>root.querySelector(s);
 function disposeImages(){urls.splice(0).forEach(URL.revokeObjectURL);}
 async function load(){
  clearTimeout(timer);
  if(root.querySelector('[contenteditable="true"],[data-autosave="saving"],[data-autosave="failed"]')){timer=setTimeout(load,5000);return;}
  try{
   const d=await client.from('market_tag_drafts').select('confirmed_version,status').eq('task_id',task.id).single();if(d.error)throw d.error;if(!valid())return;
   if(d.data.status!=='confirmed'){root.innerHTML='';return;}
   const v=d.data.confirmed_version;
   const [r,o]=await Promise.all([client.from('market_statistics').select('snapshot').eq('task_id',task.id).eq('tag_version',v).maybeSingle(),client.from('market_statistics_operations').select('status,error_code').eq('task_id',task.id).eq('tag_version',v).maybeSingle()]);if(r.error||o.error)throw r.error||o.error;if(!valid())return;
   if(r.data){snapshot=r.data.snapshot;compactEditors();
    // External failures cannot erase or block the existing statistics report.
    try{const e=await client.from('market_external_results').select('snapshot,revision').eq('task_id',task.id).eq('tag_version',v).order('revision',{ascending:false}).limit(1).maybeSingle();if(valid()&&!e.error&&e.data){external=e.data.snapshot;externalRevision=e.data.revision;}}catch{}
    if(!external)try{const s=await client.from('market_external_calls').select('task_id,tool,state,actual_credits,reserved_credits,receipt').eq('task_id',task.id).eq('tool','get_keyword_aba_trends').eq('state','succeeded');if(valid()&&!s.error)searchPreview=searchFromReceipts(s.data,task);}catch{}
    try{const i=await client.from('market_interpretation_drafts').select('*').eq('task_id',task.id).maybeSingle();if(valid()&&!i.error&&i.data&&i.data.tag_version===v&&i.data.external_revision===externalRevision){interpretation=i.data;}}catch{}
    try{const f=await client.from('market_report_flows').select('status,phase,error_code').eq('task_id',task.id).eq('tag_version',v).maybeSingle();if(valid()&&!f.error)flow=f.data;}catch{}
    const signature=JSON.stringify([snapshot,externalRevision,searchPreview,interpretation?.revision,flow]);
    if(valid()&&signature!==renderSignature&&!root.querySelector('[contenteditable="true"],[data-autosave="saving"],[data-autosave="failed"]')){renderSignature=signature;render();}
    if(valid()&&flowActive(flow))timer=setTimeout(load,5000);
    return;}
   root.innerHTML=`<div class="section-note">${o.data?.status==='running'||o.data?.status==='queued'?'正在整理统计图表…':o.data?.status==='failed'?'统计未完成，请重试。':'标签已确认，可生成统计图表。'}</div>${!['queued','running'].includes(o.data?.status)?'<button id="stat-generate">生成统计图表</button>':''}`;
   q('#stat-generate')?.addEventListener('click',async()=>{q('#stat-generate').disabled=true;const r=await client.rpc('market_request_statistics',{p_task:task.id});if(!valid())return;if(r.error){root.innerHTML='<p class="error">统计请求未完成，请刷新核对。</p>';return;}load();});
   if(['queued','running'].includes(o.data?.status))timer=setTimeout(load,2500);
  }catch{if(valid())root.innerHTML='<p class="muted">统计服务尚未接入。</p>';}
 }
 function compactEditors(){
  const panel=root.parentElement;panel.classList.add('report-ready');
  for(const [id,label] of [['sample-content','父体样本'],['tag-content','标签与产品类型']]){
   const content=panel.querySelector('#'+id);if(!content||content.parentElement.classList.contains('report-editor-fold'))continue;
   const fold=document.createElement('details'),summary=document.createElement('summary');fold.className='report-editor-fold';summary.textContent=label;content.before(fold);fold.append(summary,content);
  }
 }
 function restoreEditors(){
  const panel=root.parentElement;if(!panel)return;panel.classList.remove('report-ready');panel.querySelectorAll('.report-editor-fold').forEach(fold=>{const content=fold.querySelector('#sample-content,#tag-content');if(content)fold.replaceWith(content);});panel.querySelectorAll('.compact-grid button').forEach(b=>{b.disabled=true;b.onclick=null;});
 }
 function render(){
  disposeImages();const c=snapshot.countries[site];if(!c){root.innerHTML='<p>暂无确认数据</p>';return;}
  const panels=[];const section=(i,body)=>panels.push(`<section class="stat-section" id="stat-section-${i}" tabindex="-1"><h2><span>${String(i).padStart(2,'0')}</span> ${labels[i-1]}${i===13?' <small class="interpretation-subtitle muted">仅供参考</small>':''}</h2>${body}</section>`);
  section(1,`<details class="stat-products"><summary>父体产品列表（${c.rows.length}）</summary><div class="table-wrap"><table><thead><tr><th>图片</th><th>产品 / 父ASIN</th><th>类型</th><th>新老品</th><th>价格段</th><th>销量</th><th>全部字段</th></tr></thead><tbody>${c.rows.map((r,i)=>`<tr><td data-stat-image="${i}"></td><td>${esc(r.title||'标题缺失')}<small>${esc(r.parent)}</small></td><td>${esc(r.type_name)}</td><td>${esc({new:'新品',old:'老品',unknown:'未知'}[r.age])}</td><td>${esc(r.price_band?.label||'未知')}</td><td>${fmt(r.sales)}</td><td><details><summary>查看</summary>${table(['字段','原始值'],Object.entries(r.raw_fields).map(([k,v])=>[k,v===null?'—':v]))}</details></td></tr>`).join('')}</tbody></table></div></details>`);
  section(2,`<div class="stat-types">${c.types.map(t=>`<article><div data-stat-type="${esc(t.representative_id)}"></div><h3>${esc(t.name)}</h3><p>${esc(t.definition)}</p></article>`).join('')}</div>`);
  const ext=external?.countries?.find(x=>x.country===c.country);
  const searchExt=ext||searchPreview?.countries?.find(x=>x.country===c.country);
  section(3,flowNotice(flow,'search',!!searchExt?.search?.length)+searchPanel(searchExt,{metric:searchMetric}));
  section(4,plot(c.trend.map(x=>x.month),c.trend.map(x=>x.sales.value),{line:c.trend.map(x=>x.revenue.value),left:'销量（件）',right:'销售额（'+c.currency+'）'})+`<details><summary>查看数据（${c.trend.length}个完整月）</summary>${table(['月份','销量','销售额 '+c.currency],c.trend.map(x=>[x.month,fmt(x.sales.value),fmt(x.revenue.value)]))}</details>`);
  section(5,plot(c.brands.map(x=>x.label),c.brands.map(x=>x.sales_share),{line:c.brands.map(x=>x.revenue.value),left:'销量占比（%）',right:'销售额（'+c.currency+'）',percent:true}));
  section(6,plot(c.links.map(x=>x.label),c.links.map(x=>x.sales_share),{left:'销量占比（%）',percent:true}));
  const tabs=(kind,choices,current)=>`<div class="stat-tabs">${choices.map(([value,label])=>`<button data-${kind}="${value}" aria-pressed="${current===value}">${label}</button>`).join('')}</div>`;
  section(7,tabs('price',[['all','整体市场'],['type','产品类型'],['age','新品 / 老品']],price)+c.price[price].map(g=>`<div class="print-table-group ${g.items.length>6?'price-wide':''}"><h3>${esc(g.label)}</h3>${priceTable(g)}</div>`).join(''));
  section(8,flowNotice(flow,'ads',!!ext?.parents?.length)+adsPanel(ext,{view:adsView,rows:c.rows}));
  section(9,tabs('rating',[['all','整体评分'],['new','新品评分'],['type','产品类型评分']],rating)+c.rating[rating].map(g=>`<div class="print-table-group"><h3>${esc(g.label)}</h3>${ratingTable(g)}</div>`).join(''));
  section(10,plot(c.launch.map(x=>x.label),c.launch.map(x=>x.count),{left:'产品数量（组）'}));
  section(11,plot(c.sellers.map(x=>x.label),c.sellers.map(x=>x.count),{line:c.sellers.map(x=>x.sales_share),left:'产品数量（组）',right:'销量占比（%）'}));
  section(12,plot(c.buybox.map(x=>x.label),c.buybox.map(x=>x.count),{left:'产品数量（组）'}));
  section(13,flowNotice(flow,'interpretation',!!interpretation?.blocks?.length)+interpretationPanel(interpretation,c.country));
  root.innerHTML=`${snapshot.countries.length>1?`<label>国家<select id="stat-country">${snapshot.countries.map((c,i)=>`<option value="${i}" ${i===site?'selected':''}>${esc(c.country)}</option>`).join('')}</select></label>`:''}${panels.join('')}`;
  bindInterpretation(q('#stat-section-13'),interpretation,client,task.id,async()=>{const r=await client.from('market_interpretation_drafts').select('*').eq('task_id',task.id).single();if(r.error)throw r.error;if(valid()){interpretation=r.data;render();}});
  root.querySelectorAll('[data-price]').forEach(b=>b.onclick=()=>{price=b.dataset.price;const y=window.scrollY;render();window.scrollTo(0,y);});root.querySelectorAll('[data-rating]').forEach(b=>b.onclick=()=>{rating=b.dataset.rating;const y=window.scrollY;render();window.scrollTo(0,y);});q('#stat-country')?.addEventListener('change',e=>{site=Number(e.target.value);render();});
  root.querySelectorAll('[data-series]').forEach(b=>b.onclick=()=>{const active=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(active));b.closest('.stat-plot').querySelectorAll('.stat-'+b.dataset.series).forEach(x=>x.style.visibility=active?'visible':'hidden');});
  root.querySelectorAll('svg [tabindex]').forEach(el=>{const show=()=>{el.closest('.stat-plot').querySelector('output').textContent=el.querySelector('title').textContent;};el.onpointerenter=show;el.onfocus=show;el.onclick=show;});
  const nav=root.parentElement.querySelector('.compact-grid');nav?.querySelectorAll('button').forEach((b,i)=>{b.disabled=false;b.onclick=()=>{root.querySelectorAll('.stat-section').forEach(x=>x.classList.remove('stat-target'));const el=q('#stat-section-'+(i+1));el.classList.add('stat-target');el.focus({preventScroll:true});el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});};});
  root.querySelectorAll('[data-external-metric]').forEach(b=>b.onclick=()=>{searchMetric=b.dataset.externalMetric;const y=window.scrollY;render();window.scrollTo(0,y);});
  root.querySelectorAll('[data-external-ads]').forEach(b=>b.onclick=()=>{adsView=b.dataset.externalAds;const y=window.scrollY;render();window.scrollTo(0,y);});
  root.querySelectorAll('[data-external-series]').forEach(b=>b.onclick=()=>{const active=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(active));b.closest('.stat-plot').querySelectorAll('[data-search-series="'+b.dataset.externalSeries+'"]').forEach(el=>{el.style.visibility=active?'visible':'hidden';});});
  loadImages(c);
 }
 async function loadImages(c){const generation=root.firstElementChild;try{const r=await client.from('market_imports').select('image_prefix').eq('task_id',task.id).eq('input_revision',task.revision).eq('country',c.country).single();if(r.error)return;const display=async(el,row)=>{if(!row?.images?.length)return;const d=await client.storage.from('market-research-inbox').download(r.data.image_prefix+row.images[0].file);if(d.error||!valid()||generation!==root.firstElementChild)return;const url=URL.createObjectURL(d.data);urls.push(url);const img=document.createElement('img');img.src=url;img.alt='产品图片';el.replaceChildren(img);};await Promise.all([...root.querySelectorAll('[data-stat-type]')].map(el=>display(el,c.rows.find(x=>x.id===el.dataset.statType))));q('.stat-products').ontoggle=()=>{if(q('.stat-products').open)root.querySelectorAll('[data-stat-image]').forEach(el=>{if(!el.children.length)display(el,c.rows[Number(el.dataset.statImage)]);});};}catch{}}
 await load();return ()=>{stopped=true;clearTimeout(timer);disposeImages();restoreEditors();};
}

