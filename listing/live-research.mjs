export function escapeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const text=v=>typeof v==='string'?v:JSON.stringify(v,null,2);
export function researchHtml(r){
 const e=escapeText;
 if(!r)return '<p>资料解析已接入；研究和补问结果尚未回写，请稍后刷新。此处不会展示演示内容。</p>';
 return `<div class="tabs"><button type="button" data-research-tab="questions">参数问题汇总 ${r.questions.length}</button><button type="button" data-research-tab="summary">产品研究与资料缺口</button></div><div id="research-questions"><p>已结合产品资料与评论研究补问。填写后统一保存；保存不会调用模型。</p>${r.questions.map((q,i)=>`<div class="question"><h3><span class="badge">${e(q.priority)}</span> ${i+1}. ${e(q.question)}</h3><p>已知：${e(q.known)}</p><p>为什么需要：${e(q.why)}</p><p>影响：${e(q.affects)}</p><details><summary>问题来源 · 第${e(q.round)}轮</summary><pre style="white-space:pre-wrap">${e(text(q.sources||[]))}</pre></details><textarea data-question-id="${e(q.id)}" rows="3" maxlength="5000" aria-label="${e(q.question)}">${e(r.answers[q.id]||'')}</textarea></div>`).join('')}<div class="actions"><span id="answer-status">${r.status==='answers_saved'?(r.summary?.answer_update?.answer_revision===r.answer_revision?'回答已保存，研究摘要已按本次回答更新。':'回答已保存，等待定向研究更新。'):'请补充可确认的信息，未知项可直接说明。'}</span><button type="button" id="save-research-answers" class="primary">保存回答</button></div></div><div id="research-summary" hidden><p>这是产品研究摘要；细致卖点卡片将在下一阶段生成。</p>${Object.entries(r.summary).map(([key,value])=>`<details><summary>${e(({product_understanding:'产品理解',positioning:'定位与人群',priority_needs:'核心需求',mechanism_comparisons:'结构与机制对比',real_experiences:'真实使用细节',history_and_alternatives:'历史与替代方案',uncertainties:'待确认事项',source_coverage:'来源覆盖',source_coverage_note:'来源覆盖说明',answer_update:'本次回答更新',competitor_images:'竞品图片核读',competitor_bullets:'竞品五点核读'})[key]||key)}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${e(text(value))}</pre></details>`).join('')}</div>`;
}
export async function mountResearch({client,taskId,container,isCurrent=()=>true}){
 const {data,error}=await client.from('listing_research').select('*').eq('task_id',taskId).maybeSingle();
 if(!isCurrent())return;
 if(error){container.textContent='研究结果读取失败，请稍后刷新。';return;}
 let current=data;container.innerHTML=researchHtml(current);if(!current)return;
 const save=container.querySelector('#save-research-answers'),notice=container.querySelector('#answer-status');
 const update=document.createElement('button');update.type='button';update.textContent='按已保存回答更新研究';update.id='request-research-update';save.before(update);
 let dirty=false;
 function controls(){
  const busy=current.status==='updating';save.disabled=busy;
  update.disabled=dirty||busy||current.status!=='answers_saved'||current.summary?.answer_update?.answer_revision===current.answer_revision;
  for(const el of container.querySelectorAll('[data-question-id]'))el.disabled=busy;
  if(busy)notice.textContent='研究更新已提交，工人处理中；可离开页面，稍后刷新查看。';
  if(current.status==='failed')notice.textContent='研究更新已暂停，已保留旧摘要与回答；需核查失败原因后恢复，避免重复计费。';
 }
 controls();
 for(const el of container.querySelectorAll('[data-question-id]'))el.addEventListener('input',()=>{dirty=true;controls();notice.textContent='回答尚未保存，请先保存再更新研究。';});
 update.onclick=async()=>{
  update.disabled=true;save.disabled=true;
  try{
   const {error}=await client.rpc('listing_request_research_update',{p_task:taskId,p_question_revision:current.question_revision,p_answer_revision:current.answer_revision});
   if(error)throw error;current.status='updating';controls();
  }catch(err){notice.textContent=err.message?.includes('ALREADY_UPDATED')?'本次回答已经更新，无需重复生成。':'提交未成功，请刷新核对状态；不会在此自动重试。';controls();}
 };
 for(const b of container.querySelectorAll('[data-research-tab]'))b.onclick=()=>{container.querySelector('#research-questions').hidden=b.dataset.researchTab!=='questions';container.querySelector('#research-summary').hidden=b.dataset.researchTab!=='summary';};
 container.querySelector('#save-research-answers').onclick=async()=>{
  const button=container.querySelector('#save-research-answers'),status=container.querySelector('#answer-status');button.disabled=true;
  const answers=Object.fromEntries([...container.querySelectorAll('[data-question-id]')].map(el=>[el.dataset.questionId,el.value]));
  try{
   const {data:updated,error}=await client.rpc('listing_save_answers',{p_task:taskId,p_question_revision:current.question_revision,p_answer_revision:current.answer_revision,p_answers:answers});
   if(error)throw error;current=updated;dirty=false;status.textContent=current.summary?.answer_update?.answer_revision===current.answer_revision?'回答未变化，无需重复更新研究。':'回答已保存，可点击更新研究；保存没有调用模型。';
  }catch(err){status.textContent=err.message?.includes('REVISION_CONFLICT')?'其他页面已更新回答，请保留当前文字并刷新核对后再保存。':'保存失败，当前输入已保留，请重试。';}
  finally{controls();}
 };
}
