import {bindInlineText} from './competitor-inline-edit.mjs?v=20261014-stage7-edit';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const columns=[['priority','优先级'],['direction','开发方向'],['people','人群'],['scenes','场景'],['focus','投入重点'],['difference','产品差异'],['recommendation','具体开发建议'],['tradeoffs','取舍／待验证']];
function decoratePriority(element){
 const update=()=>{const text=element.textContent.trim(),match=text.match(/^(P\d+|待验证|待评估)(?=[\s·:：、，,]|$)/i),label=match?match[1].toUpperCase():text;
  element.dataset.priorityLabel=label;element.dataset.priorityTone=label==='P1'?'primary':label==='P2'?'secondary':/^待/.test(label)?'pending':'neutral';
  element.title=text+'\n双击编辑，离开编辑区域自动保存';
 };
 update();const observer=new MutationObserver(update);observer.observe(element,{childList:true,characterData:true,subtree:true});return ()=>observer.disconnect();
}
export function mountDevelopment(root,{selling,task,client,valid,eventRoot,onState=()=>{}}){
 let disposed=false,timer,editDisposers=[],generation=0,requesting=false;
 const alive=()=>!disposed&&valid();
 const clean=()=>{editDisposers.forEach(f=>f());editDisposers=[]};
 const rpc=async(name,args)=>{const {data,error}=await client.rpc('competitor_'+name,args);if(error)throw error;return data};
 const errorText=error=>{const code=String(error?.message||error?.code||'');if(/PGRST202|PGRST205/.test(code))return '开发建议服务尚未接入';if(/STALE/.test(code))return '输入已更新，请按当前已保存资料重新生成；此前结果保留';if(/BUDGET/.test(code))return '本任务共享预算已达上限';if(/COST_UNCERTAIN|USAGE_UNCERTAIN/.test(code))return '调用用量或费用未知，已暂停';return code.startsWith('COMPETITOR_')?code:'请求未完成，请检查网络后重试'};
 async function load(){clearTimeout(timer);const stamp=++generation;onState({loaded:false});
  try{
   const [state,budget]=await Promise.all([rpc('development_status',{p_result:selling.id}),rpc('model_budget_status',{p_task:task.id})]);if(!alive()||stamp!==generation)return;
   clean();const record=state.current_result||state.previous_result,stale=!state.current_result&&!!record,op=state.operation,labels={queued:'等待独立工人',running:'开发方案生成中',succeeded:'开发方案已保存',partial:'开发方案部分完成',failed:'开发方案生成失败',paused:'开发方案已暂停'};
   root.innerHTML=`<div class="competitor-development-heading"><h3>开发方向及建议</h3><div class="competitor-development-meta"><div class="competitor-runtime-row"><span role="status">${op?esc(labels[op.status]||op.status):'尚未生成当前输入的开发方案'}${op?.error_code?' · '+esc(errorText({message:op.error_code})):''}</span>${!op?'<button class="primary" data-development-generate>生成当前类型开发方案</button>':''}</div><details class="competitor-usage"><summary>模型用量</summary><p class="muted">与卖点分析共用本任务${budget.max_calls}次／${budget.max_cny}元 · 已调用${budget.calls}次 · 用量价格估算${budget.estimated_cny}元（非实际账单） · 预留${budget.reserved_cny}元</p></details></div></div>${stale?'<p class="error">输入已变化，下面保留此前方案供查看；生成当前输入的新方案后再编辑。</p>':''}`;
   if(record){const plans=record.result.plans||[],edits=new Map((state.edits||[]).map(e=>[e.field_id,e]));
    root.insertAdjacentHTML('beforeend',`<div class="competitor-scroll"><table class="competitor-development-table"><colgroup><col style="width:75px"><col style="width:160px"><col style="width:150px"><col style="width:150px"><col style="width:230px"><col style="width:230px"><col style="width:230px"><col style="width:230px"></colgroup><thead><tr>${columns.map(([,label])=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${plans.map(plan=>`<tr>${columns.map(([key])=>{const field='plan/'+plan.id+'/'+key;return `<td class="competitor-development-${key}"><div data-development-field="${esc(field)}"${key==='priority'?' class="competitor-priority-value"':''}>${esc(edits.get(field)?.text_value??plan[key])}</div></td>`}).join('')}</tr>`).join('')}</tbody></table></div>`);
    if(!stale)for(const element of root.querySelectorAll('[data-development-field]')){const field=element.dataset.developmentField,edit=edits.get(field);editDisposers.push(bindInlineText(element,{context:{owner:record.owner_id,task:task.id,country:record.country,type:record.type_id,source:record.source_id,result:record.id,field},value:element.textContent,revision:edit?.revision??0,
     save:async({context,text,expectedRevision})=>rpc('save_development_text',{p_result:context.result,p_field:context.field,p_text:text,p_expected:expectedRevision})}));}
    for(const element of root.querySelectorAll('.competitor-priority-value'))editDisposers.push(decoratePriority(element));
    if(record.result.issues?.length)root.insertAdjacentHTML('beforeend','<p class="error">'+record.result.issues.length+'项建议未通过校验，原响应已保留：'+record.result.issues.map(i=>esc(i.code)).join('；')+'</p>');
   }
   const button=root.querySelector('[data-development-generate]');if(button)button.onclick=async()=>{if(requesting)return;requesting=true;button.disabled=true;try{await rpc('request_development',{p_result:selling.id});if(alive())await load()}catch(error){if(alive())button.insertAdjacentHTML('afterend','<span class="error">'+esc(errorText(error))+'</span>')}finally{requesting=false;if(button.isConnected)button.disabled=false}};
   onState({loaded:true,record,edits:state.edits||[],stale,operation:op});
   if(op&&['queued','running'].includes(op.status))timer=setTimeout(load,2500);
  }catch(error){if(alive()&&stamp===generation){onState({loaded:true,error:true});clean();root.innerHTML='<h3>开发方向及建议</h3><p class="error">'+esc(errorText(error))+'</p>'}}
 }
 function inputChanged(){void load()}
 eventRoot?.addEventListener('competitor-selling-saved',inputChanged);void load();
 return ()=>{disposed=true;generation++;clearTimeout(timer);clean();eventRoot?.removeEventListener('competitor-selling-saved',inputChanged)};
}
