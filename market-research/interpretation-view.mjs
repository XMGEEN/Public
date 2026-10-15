const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titles={market:'市场概况与规模',demand:'需求与趋势',competition:'竞争格局',reviews:'评分与成功要素',opportunities:'机会点和细分市场'};
const labels={sales:'销量',revenue:'销售额',brands:'品牌分布',links:'父体销量分布',price:'价格段分布',rating:'评分分布',launch:'上架数量',sellers:'卖家所属地',buybox:'BuyBox类型'};
const fmt=x=>x===null||x===undefined?'—':Number(x).toLocaleString('en-US',{maximumFractionDigits:2});
function evidenceValue(e){
 const v=e.value;
 if(typeof v==='number')return esc(fmt(v));
 if(v&&typeof v==='object'&&!Array.isArray(v)&&'value'in v)return `${esc(fmt(v.value))} · ${esc(v.known)}/${esc(v.total)}个父体有数据`;
 if(e.source==='external/search')return v.map(x=>`${esc(x.keyword)}：${esc(x.coverage.start)}～${esc(x.coverage.end)}，${esc(x.coverage.weeks)}周`).join('<br>');
 if(e.source==='external/parents')return v.map(x=>`${esc(x.parent)}：自然得分${esc(fmt(x.organic))}，广告得分${esc(fmt(x.advertising))}，广告占比${esc(fmt(x.ad_share*100))}%`).join('<br>');
 if(e.source==='statistics/types')return v.map(x=>`${esc(x.name)}：${esc(x.definition)}`).join('<br>');
 // Full source is available in the existing report; keep evidence readable.
 if(e.source==='statistics/trend')return v.map(x=>`${esc(x.month)}：销量${esc(fmt(x.sales.value))}，销售额${esc(fmt(x.revenue.value))}`).join('<br>');
 const groups=Array.isArray(v)?v:Object.values(v).flat();
 return groups.map(x=>x.items?`${esc(x.label)}：`+x.items.map(i=>`${esc(i.label)}（${i.count!==undefined?'数量'+esc(i.count):'销量'+esc(fmt(i.sales?.value))}）`).join('；'):`${esc(x.label)}：${x.count!==undefined?'数量'+esc(x.count):'销量'+esc(fmt(x.sales?.value))}${x.sales_share!==undefined?'，销量占比'+esc(fmt(x.sales_share))+'%':''}`).join('<br>');
}
function cardPoints(b,evidence,printAll=false){
 const topics={market:['当月规模','销量变化','销售额变化','覆盖与波动'],demand:['搜索需求','价格定位','新品机会'],competition:['品牌集中度','卖家结构','广告竞争'],reviews:['评分分布','已知评分','新品表现'],opportunities:['优先方向','细分取舍','进入验证']};
 const points=b.comparison.split(/(?<=[。；])/u).map(x=>x.trim()).filter(Boolean);
 return `<ul class="interpretation-points">${points.map((p,i)=>`<li><strong>${esc((topics[b.id]||[])[i]||'判断依据')}：</strong><span data-inline-field="comparison" data-point-index="${i}">${esc(p)}</span></li>`).join('')}</ul>`;
}
export function interpretationPanel(draft,country){
 if(!draft?.blocks?.length)return '<p class="muted">AI解读待生成</p>';
 const evidence=new Map((draft.context?.evidence||[]).filter(x=>x.country===country).map(x=>[x.id,x]));
 return `<div class="interpretation-review"><div class="interpretation-grid">${draft.blocks.map((b,i)=>`<article class="interpretation-block" data-interpretation-block="${i}"><h3>${esc(titles[b.id])}</h3>${cardPoints(b,evidence,draft.printAll)}<p class="interpretation-conclusion" data-inline-field="conclusion">${esc(b.conclusion)}</p></article>`).join('')}</div><p class="interpretation-status" role="status"></p></div>`;
}
const editors=new Map();
const clone=x=>structuredClone(x);
export const interpretationPending=()=>[...editors.values()].some(e=>e.dirty.size||e.saving);
export async function flushInterpretations(){
 const results=await Promise.all([...editors.values()].map(e=>e.flush()));return results.every(Boolean);
}
if(typeof window!=='undefined')window.addEventListener('beforeunload',e=>{if(interpretationPending()){e.preventDefault();e.returnValue='';}});
function editorFor(draft,client,taskId){
 const key=(draft.owner_id||'')+':'+taskId;
 let e=editors.get(key);
 if(e){e.accept(draft);return e;}
 e={base:clone(draft),dirty:new Map(),saving:null,timer:null,section:null,error:false,conflict:false};
 const storageKey='market-interpretation-pending:'+key;
 const persist=()=>{try{if(e.dirty.size)sessionStorage.setItem(storageKey,JSON.stringify([...e.dirty]));else sessionStorage.removeItem(storageKey);}catch{}};
 try{for(const [k,v] of JSON.parse(sessionStorage.getItem(storageKey)||'[]'))if(v&&typeof v.value==='string'&&e.base.blocks.some(b=>b.id===v.id)&&['conclusion','comparison'].includes(v.field))e.dirty.set(k,v);}catch{}
 e.value=()=>{const d=clone(e.base);for(const v of e.dirty.values()){const b=d.blocks.find(b=>b.id===v.id);if(b)b[v.field]=v.value;}return d;};
 e.paint=()=>{
  const section=e.section;if(!section?.isConnected)return;
  const draft=e.value();
  section.querySelectorAll('[data-interpretation-block]').forEach(article=>{
   const b=draft.blocks[Number(article.dataset.interpretationBlock)];if(!b)return;
   article.querySelectorAll('[data-inline-field="conclusion"]').forEach(el=>{
    if(el.contentEditable==='true')return;
    const text=el.dataset.inlineField==='conclusion'?b.conclusion:b.comparison.split(/(?<=[。；])/u).map(x=>x.trim()).filter(Boolean)[Number(el.dataset.pointIndex)]||'';
    if(el.textContent!==text)el.textContent=text;
   });
   const points=article.querySelector('.interpretation-points');
   if(points&&b.comparison.trim()&&!points.querySelector('[contenteditable="true"]')){
    const rendered=cardPoints(b,null,true);
    if(points.outerHTML!==rendered){points.outerHTML=rendered;section._bindFields?.(article);}
   }
  });
  section.dataset.autosave=e.error?'failed':e.saving?'saving':e.dirty.size?'pending':'saved';
  const status=section.querySelector('.interpretation-status');if(!status)return;
  status.textContent=e.error?(e.conflict?'其他窗口已修改同一段，当前编辑已保留。点击保留我的修改并保存。':'未保存，当前编辑已保留，点击重试。'):e.saving?'正在保存…':e.dirty.size?'待保存…':'已保存';
  status.onclick=e.error?()=>{e.force=e.conflict;e.error=false;e.flush();}:null;
 };
 e.accept=d=>{if(d.revision>e.base.revision){e.base=clone(d);e.paint();}};
 e.change=(id,field,value)=>{
  const k=id+':'+field,old=e.dirty.get(k),base=e.base.blocks.find(b=>b.id===id)?.[field];
  e.dirty.set(k,{id,field,value,base:old?old.base:base});e.error=false;e.conflict=false;persist();e.paint();
  clearTimeout(e.timer);e.timer=setTimeout(()=>e.flush(),700);
 };
 e.flush=async()=>{
  clearTimeout(e.timer);if(e.saving)return e.saving;if(!e.dirty.size)return true;
  e.saving=Promise.resolve().then(async()=>{
   try{
    while(e.dirty.size){
     const changes=new Map([...e.dirty].map(([k,v])=>[k,{...v}]));
     if([...changes.values()].some(v=>!v.value.trim()))throw Error('EMPTY');
     const r=await client.from('market_interpretation_drafts').select('*').eq('task_id',taskId).single();if(r.error||!r.data)throw Error('READ');
     const latest=r.data,blocks=clone(latest.blocks);
     for(const v of changes.values()){
      const b=blocks.find(b=>b.id===v.id);if(!b)throw Error('BLOCK_MISSING');
      if(!e.force&&b[v.field]!==v.base&&b[v.field]!==v.value){e.conflict=true;throw Error('CONFLICT');}
      b[v.field]=v.value;
     }
     const saved=await client.rpc('market_save_interpretation',{p_task:taskId,p_revision:latest.revision,p_blocks:blocks,p_confirm:false});if(saved.error)throw saved.error;
     e.base={...latest,revision:saved.data,blocks};e.force=false;
     for(const [k,v] of changes){const now=e.dirty.get(k);if(now?.value===v.value)e.dirty.delete(k);else if(now)now.base=v.value;}
     persist();e.paint();
    }
    e.error=false;return true;
   }catch{e.error=true;persist();return false;}
   finally{e.saving=null;e.paint();}
  });e.paint();return e.saving;
 };
 editors.set(key,e);return e;
}
export function bindInterpretation(section,draft,client,taskId){
 if(!section||!draft?.blocks?.length)return;
 if(section._interpretationEditor){section._interpretationEditor.accept(draft);return;}
 const e=editorFor(draft,client,taskId);e.section=section;section._interpretationEditor=e;
 section._bindFields=container=>container.querySelectorAll('[data-inline-field]').forEach(el=>{
  if(el._boundInterpretation)return;el._boundInterpretation=true;
  el.tabIndex=0;
  const capture=()=>{
   const article=el.closest('[data-interpretation-block]'),b=e.value().blocks[Number(article.dataset.interpretationBlock)],field=el.dataset.inlineField;
   let value=el.textContent.trim();
   if(field==='comparison'){const points=[...(el._comparisonPoints||b.comparison.split(/(?<=[。；])/u).map(x=>x.trim()).filter(Boolean))];points[Number(el.dataset.pointIndex)]=value;value=points.join('');}
   if(value!==b[field])e.change(b.id,field,value);
  };
  const begin=()=>{if(el.dataset.inlineField==='comparison')el._comparisonPoints=e.value().blocks[Number(el.closest('[data-interpretation-block]').dataset.interpretationBlock)].comparison.split(/(?<=[。；])/u).map(x=>x.trim()).filter(Boolean);el.contentEditable='true';el.classList.add('inline-editing');el.focus();};
  el.addEventListener('dblclick',begin);el.addEventListener('input',capture);
  el.addEventListener('keydown',event=>{if(el.contentEditable!=='true'&&event.key==='Enter'){event.preventDefault();begin();}else if(el.contentEditable==='true'&&event.key==='Escape')el.blur();});
  el.addEventListener('blur',()=>{capture();el.contentEditable='false';el.classList.remove('inline-editing');delete el._comparisonPoints;e.paint();if(e.dirty.size)e.flush();});
  el.addEventListener('paste',event=>{event.preventDefault();const selection=window.getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0);if(!el.contains(range.commonAncestorContainer))return;range.deleteContents();const text=document.createTextNode(event.clipboardData.getData('text/plain'));range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);capture();});
 });section._bindFields(section);e.paint();if(e.dirty.size)e.flush();
}
