(function(){
'use strict';let epoch=0;
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
async function open({host,store,simulation=false}){const stamp=++epoch;host.replaceChildren();let state=null,busy=false;
 const title=el('h2',simulation?'答案草稿（本地模拟）':'答案草稿'),msg=el('p'),choices=el('fieldset'),body=el('div'),button=el('button','生成答案小样（最多5题）'),reload=el('button','刷新草稿');msg.setAttribute('role','status');
 host.append(title,el('p','生成后仅为待审核草稿。内容检查提供辅助提示，最终由你审核。'),choices,button,reload,msg,body);
 function render(){body.replaceChildren();choices.replaceChildren(el('legend','本次小样范围（最多5题）'));for(const [i,q] of (state?.available||[]).entries()){const label=el('label'),box=el('input');label.className='check-label';box.type='checkbox';box.value=q.id;box.checked=i<5;label.append(box,document.createTextNode(q.content.zh));choices.append(label);}
 const d=state?.draft;button.textContent=d?'重新生成答案小样（最多5题）':'生成答案小样（最多5题）';if(!d){body.append(el('p','尚未生成答案。先确认问题选择，再生成小样。'));return;}
  body.append(el('p',`本次请求 ${d.requested} 组 · 实际答案 ${d.actual} 组 · 待补 ${d.pending.length+d.items.filter(x=>x.status==='待补资料').length} 组`));
  if(state.stale)body.append(el('p','事实、规则、回答逻辑或问题清单已变化；以下是旧草稿，需重新检查相关问题后再生成。'));
  if(d.check_error)body.append(el('p',d.check_error));
  for(const item of d.items){const row=el('article');row.className='answer-item';row.append(el('h3',item.question.en),el('p',item.question.zh),el('p',item.answer.en||'暂无英文答案'),el('p',item.answer.zh||'暂无中文答案'),el('strong',state.stale?'需重新检查':item.status));for(const note of [...item.issues,...item.notes,item.missing].filter(Boolean))row.append(el('p',note));const details=el('details');details.append(el('summary','查看简短依据'));for(const f of item.basis)details.append(el('p',`${f.id} · ${f.attribute}：${f.value} ${f.unit||''}；${f.conditions||''}`));row.append(details);body.append(row);}
  for(const q of d.pending)body.append(el('p',q.question.zh+' · 待补资料：'+q.missing));
  if(d.deferred.length)body.append(el('p',`另有 ${d.deferred.length} 题未在本次小样范围，未生成答案。`));
 }
 async function load(){state=await store.load();if(stamp!==epoch)return;render();if(state?.job&&['queued','running'].includes(state.job.status)){msg.textContent='后台处理中，刷新不会重新调用。';watch(state.job.id);}else if(state?.job?.status==='failed')msg.textContent=state.job.failure_reason||'本次生成未完成，原草稿保留。';}
 async function watch(id){busy=true;button.disabled=true;try{await store.wait(id,progress=>{if(stamp===epoch)msg.textContent=progress;},()=>stamp!==epoch);if(stamp!==epoch)return;state=await store.load();if(stamp!==epoch)return;render();msg.textContent='草稿已保存，尚未人工批准。';}catch(e){if(stamp===epoch)msg.textContent=e.message;}finally{busy=false;if(stamp===epoch)button.disabled=false;}}
 button.onclick=async()=>{if(busy)return;const ids=[...choices.querySelectorAll('input:checked')].map(x=>x.value);if(!ids.length||ids.length>5){msg.textContent='请勾选1–5题作为本次小样';return;}if(state?.draft&&!confirm('重新生成将替换当前草稿；失败保留原稿。是否继续？'))return;
  if(!confirm(simulation?'仅使用本地模拟结果，不调用模型。继续？':'本次仅生成勾选的'+ids.length+'题及一轮检查；使用本题已确认事实、顾虑和写作规则，最多2次模型调用，费用上限0.10元，失败不自动重试。是否继续？'))return;
  busy=true;button.disabled=true;try{const job=await store.enqueue({replace:!!state?.draft,ids});if(stamp===epoch)await watch(job.id);}catch(e){if(stamp===epoch)msg.textContent=e.message;}finally{busy=false;if(stamp===epoch)button.disabled=false;}};
 reload.onclick=async()=>{if(busy)return;try{await load();}catch(e){if(stamp===epoch)msg.textContent=e.message;}};
 try{await load();}catch(e){if(stamp===epoch){button.disabled=true;msg.textContent=e.message;}}
}
function clear(){epoch++;const h=document.getElementById('answers');if(h)h.replaceChildren();}
window.QAAnswerUI={open,clear};
})();
