import {bindInlineText} from './competitor-inline-edit.mjs?v=20261014-stage7-edit';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const missing={not_provided:'未提供',fetch_failed:'获取失败',not_mentioned:'图文未提及'};
export function sellingPanel(saved,record,op,budget,targets,demands=[]){
 const states={queued:'等待独立工人',running:'卖点分析中',succeeded:'卖点分析完成',partial:'卖点部分完成',failed:'卖点分析失败',paused:'卖点分析暂停'};
 const progress=op?.result?.progress;
 let html=`<h3>卖点对比</h3><div class="competitor-runtime-row"><span role="status">${op?esc(states[op.status]||op.status):'尚未启动卖点分析'}${progress?' · 已完成 '+progress.completed+'/'+progress.total+'，失败 '+progress.failed+'，待处理 '+progress.remaining:''}${op?.error_code?' · '+esc(({SELLING_SELECTION_REQUIRED:'候选卖点取舍或归类待确认',SELLING_MERGE_SAMPLE_OMITTED:'归并遗漏样本项目，已暂停'})[op.error_code]||op.error_code):''}</span>${saved&&!op&&Number(budget?.max_calls)>0&&Number(budget?.max_cny)>0?'<button id="competitor-selling-start" class="primary">分析当前类型卖点</button>':''}</div>`;

 if(!record&&op?.error_code==='SELLING_SELECTION_REQUIRED'){
  const needs=new Map(demands.map(d=>[d.id,d]));const candidates=[...(op.result?.candidate_points||[])].sort((a,b)=>{const x=needs.get(a.need_id)?.rank,y=needs.get(b.need_id)?.rank;return (x==null)-(y==null)||(x??0)-(y??0)}),pending=op.result?.unresolved_points||[];
  html+='<p class="muted">候选已保存，尚未确定最终最多10项；待确认项目不作为已完成分析。</p>';
  if(candidates.length)html+=`<div class="competitor-scroll"><table class="competitor-selling-candidates" style="min-width:1290px;width:100%;table-layout:fixed"><colgroup><col style="width:70px"><col style="width:220px">${targets.map(()=>'<col style="width:200px">').join('')}</colgroup><tr><th>需求排名</th><th>统一需求／候选卖点</th>${targets.map(t=>`<th>${esc(t.parent)}</th>`).join('')}</tr>${candidates.map(point=>`<tr><td>${needs.get(point.need_id)?.rank??'待排序'}</td><td>${needs.get(point.need_id)?.name===point.name?esc(point.name):esc(needs.get(point.need_id)?.name||'需求关联待确认')+'<br>'+esc(point.name)}</td>${targets.map(t=>{const product=op.result?.candidate_observations?.[t.parent],obs=product?.points?.[point.id];return `<td>${esc(obs?.value??(obs?'未提供':product?.inspection_complete?'图文未提及':'未提供'))}</td>`}).join('')}</tr>`).join('')}</table></div>`;
  return html;
 }
 if(!record)return html+'<p class="muted">'+(op?.error_code==='SELLING_SELECTION_REQUIRED'?'候选卖点超过已确认选择边界，完整候选已保存，需确认取舍。':'已完成商品进度单独保存；暂未生成可展示的卖点矩阵。')+'</p>';
 const rows=record.result.comparison.rows;
 html+=`<div class="competitor-scroll"><table class="competitor-selling-matrix" style="min-width:1290px;width:100%;table-layout:fixed"><colgroup><col style="width:70px"><col style="width:220px">${targets.map(()=>'<col style="width:200px">').join('')}</colgroup><tr><th>排名</th><th>统一需求／卖点</th>${targets.map(t=>`<th>${esc(t.brand||'未提供')}<br>${esc(t.parent)}</th>`).join('')}</tr>${rows.map(row=>`<tr><td>${row.rank??'待排序'}</td><td>${row.need_name===row.point_name?'':esc(row.need_name||'需求关联待确认')}<div data-selling-field="${esc('point/'+row.point_id+'/name')}">${esc(row.point_name)}</div></td>${targets.map(t=>{const item=row.parameters[t.parent];return `<td><div data-selling-field="${esc('point/'+row.point_id+'/target/'+t.parent)}">${esc(item?.value??missing[item?.status]??'未提供')}</div></td>`}).join('')}</tr>`).join('')}</table></div>`;
 html+=(record.result.comparison.needs_without_points||[]).map(d=>`<p>${esc(d.name)}：暂未找到对应卖点</p>`).join('');
 return html;
}
export function bindSelling(root,record,edits,client,task){
 if(!record)return ()=>{};
 const releases=[];const lookup=new Map(edits.filter(e=>e.result_id===record.id).map(e=>[e.field_id,e]));
 for(const element of root.querySelectorAll('[data-selling-field]')){
  const field=element.dataset.sellingField,edit=lookup.get(field);
  releases.push(bindInlineText(element,{context:{owner:record.owner_id,task:task.id,country:record.country,type:record.type_id,source:record.source_id,result:record.id,field},value:edit?.text_value??element.textContent,revision:edit?.revision??0,onSaved:()=>root.dispatchEvent(new CustomEvent('competitor-selling-saved',{bubbles:true})),
   save:async({context,text,expectedRevision})=>{const {data,error}=await client.rpc('competitor_save_selling_text',{p_result:context.result,p_field:context.field,p_text:text,p_expected:expectedRevision});if(error)throw error;return data;}}));
 }
 return ()=>releases.forEach(dispose=>dispose());
}

// Reuse the same saved values, field identities and runtime states in the unified report table.
export function sellingTableBody(saved,record,op,budget,targets,demands=[]){
 const template=document.createElement('template');template.innerHTML=sellingPanel(saved,record,op,budget,targets,demands);
 const content=template.content,matrix=content.querySelector('.competitor-selling-matrix,.competitor-selling-candidates');
 const runtime=content.querySelector('.competitor-runtime-row');const body=document.createElement('tbody');body.className='competitor-selling-matrix';body.dataset.comparisonSection='selling';
 const header=document.createElement('tr');header.className='competitor-section-title';header.innerHTML=`<th colspan="${targets.length+1}"><div class="competitor-section-heading"><span>卖点对比</span></div></th>`;if(runtime)header.firstElementChild.firstElementChild.append(runtime);body.append(header);
 if(matrix){const sub=document.createElement('tr');sub.className='competitor-selling-heading';sub.innerHTML='<th scope="col">统一卖点 / 需求顺序</th>'+targets.map(t=>`<th scope="col">${esc(t.brand||'未提供')}</th>`).join('');body.append(sub);
 for(const row of [...matrix.rows].slice(1)){const rank=row.cells[0],name=row.cells[1];const cell=document.createElement('th');cell.scope='row';cell.className='competitor-selling-label';const marker=document.createElement('span');marker.className='competitor-need-rank';marker.textContent=rank.textContent+' · ';cell.append(marker,...name.childNodes);rank.remove();name.replaceWith(cell);body.append(row);}
 matrix.parentElement.remove();
 }else if(demands.length){for(const d of demands){const row=document.createElement('tr');row.innerHTML=`<th scope="row">${esc(d.rank??'新增改善')} · ${esc(d.name)}</th>${targets.map(()=>'<td>尚未分析</td>').join('')}`;body.append(row);}}
 for(const note of [...content.querySelectorAll('p')]){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=targets.length+1;cell.append(note);row.append(cell);body.append(row);}
 return body;
}
