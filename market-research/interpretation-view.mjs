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
 return `<ul class="interpretation-points">${(printAll?points:points.slice(0,4)).map((p,i)=>`<li><strong>${esc((topics[b.id]||[])[i]||'判断依据')}：</strong><span data-inline-field="comparison" data-point-index="${i}">${esc(p)}</span></li>`).join('')}</ul>`;
}
export function interpretationPanel(draft,country){
 if(!draft?.blocks?.length)return '<p class="muted">AI解读待生成</p>';
 const evidence=new Map((draft.context?.evidence||[]).filter(x=>x.country===country).map(x=>[x.id,x]));
 return `<div class="interpretation-review"><div class="interpretation-grid">${draft.blocks.map((b,i)=>`<article class="interpretation-block" data-interpretation-block="${i}"><h3>${esc(titles[b.id])}</h3>${cardPoints(b,evidence,draft.printAll)}<p class="interpretation-conclusion" data-inline-field="conclusion">${esc(b.conclusion)}</p></article>`).join('')}</div><p class="interpretation-status" role="status"></p></div>`;
}
export function bindInterpretation(section,draft,client,taskId,onSaved){
 if(!draft)return;
 let saving=false,pending=false;
 section.querySelectorAll('[data-inline-field]').forEach(el=>{
  el.tabIndex=0;
  const begin=()=>{el.contentEditable='true';el.classList.add('inline-editing');el.focus();};
  el.addEventListener('dblclick',begin);
  el.addEventListener('keydown',e=>{if(el.contentEditable!=='true'&&e.key==='Enter'){e.preventDefault();begin();}else if(el.contentEditable==='true'&&e.key==='Escape'){el.blur();}});
  el.addEventListener('blur',()=>{el.contentEditable='false';el.classList.remove('inline-editing');submit();});
  el.addEventListener('paste',e=>{e.preventDefault();const value=e.clipboardData.getData('text/plain');const selection=window.getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0);if(!el.contains(range.commonAncestorContainer))return;range.deleteContents();const text=document.createTextNode(value);range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);});
 });
 const submit=async()=>{
  if(saving){pending=true;return;}
  const blocks=structuredClone(draft.blocks);
  section.querySelectorAll('[data-interpretation-block]').forEach(el=>{
   const b=blocks[Number(el.dataset.interpretationBlock)];
   const points=b.comparison.split(/(?<=[。；])/u).map(x=>x.trim()).filter(Boolean);
   el.querySelectorAll('[data-inline-field]').forEach(input=>{
    if(input.dataset.inlineField==='conclusion')b.conclusion=input.textContent.trim();
    else points[Number(input.dataset.pointIndex)]=input.textContent.trim();
   });
   b.comparison=points.join('');
  });
  const status=section.querySelector('.interpretation-status'),buttons=section.querySelectorAll('.interpretation-actions button');
  if(blocks.some(b=>!b.conclusion||!b.comparison||!b.assumptions.length||!b.limitations.length)){status.textContent='请补全结论、对比、假设和限制。';return;}
  if(JSON.stringify(blocks)===JSON.stringify(draft.blocks))return;
  saving=true;section.dataset.autosave='saving';status.textContent='正在保存…';
  try{const r=await client.rpc('market_save_interpretation',{p_task:taskId,p_revision:draft.revision,p_blocks:blocks,p_confirm:false});if(r.error)throw r.error;draft.revision=r.data;draft.blocks=blocks;section.dataset.autosave='saved';status.textContent='';status.onclick=null;}
  catch{section.dataset.autosave='failed';status.textContent='未保存，点击重试';status.onclick=()=>submit();}
  finally{saving=false;if(pending){pending=false;submit();}}
 };

}


