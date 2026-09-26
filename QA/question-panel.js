(function(){
'use strict';let epoch=0;
async function open(task,client,user){const stamp=++epoch;window.QAQuestionUI.clear();const host=document.getElementById('questions');if(!host||!task||task.unsaved||!user)return;host.textContent='正在读取问题清单…';
try{
 const rr=await client.from('qa_review_versions').select('*').eq('task_id',task.id).order('version',{ascending:false}).limit(1);if(rr.error)throw Error('事实版本读取失败');if(!rr.data.length){host.textContent='完成事实与规则确认后，可生成建议问题。';return;}
 const batches=[];for(let start=0;;start+=200){const r=await client.from('qa_sources').select('id,kind,records,replaces_id,created_at').eq('task_id',task.id).order('created_at',{ascending:true}).order('id',{ascending:true}).range(start,start+199);if(r.error)throw Error('资料读取失败');batches.push(...r.data);if(r.data.length<200)break;}
 if(stamp!==epoch)return;const pack=window.QAQuestionContext.build(task,rr.data[0],batches),store=window.QAQuestionStore.create(client,user,task);
 const jobQuery=()=>client.from('qa_question_jobs').select('*').eq('task_id',task.id).maybeSingle();
 async function poll(id){for(let attempt=0;attempt<210;attempt++){if(stamp!==epoch)throw Error('已离开此任务；后台结果保留，重新打开可恢复。');const r=await jobQuery();if(r.error||!r.data||r.data.id!==id)throw Error('后台请求读取失败，请重新打开任务。');if(r.data.status==='failed')throw Error(r.data.failure_reason||'后台检查未通过，原清单保留。');if(r.data.status==='succeeded')return r.data.result;await new Promise(resolve=>setTimeout(resolve,1000));}throw Error('后台仍在处理，请稍后重新打开任务；不要重复提交。');}
 async function enqueue(operation){
  if(!window.confirm('本次'+(operation==='generate'?'生成建议问题并复核':'复核当前问题')+'将调用豆包模型，费用上限0.10元，不自动重试。范围：'+pack.scope.facts+'条已确认事实、'+pack.scope.records+'条完整资料记录（非全量统计）。不生成答案。是否继续？'))throw Error('已取消，未发起模型调用。');
  const saved=await client.from('qa_question_current').select('revision,pending_id').eq('task_id',task.id).maybeSingle();if(saved.error||saved.data?.pending_id)throw Error('请先完成当前清单保存');const id=crypto.randomUUID();
  const r=await client.rpc('qa_enqueue_question_job',{p_task:task.id,p_id:id,p_operation:operation,p_expected:saved.data?.revision||0,p_accept_cost:true,p_replace:operation==='generate'});if(r.error)throw Error('请求未提交：'+r.error.message);return poll(id);
 }
 const saved=await store.load(),jr=await jobQuery();if(stamp!==epoch)return;if(jr.error)throw Error('后台请求配置尚未就绪');
 async function mount(){if(stamp!==epoch)return;await window.QAQuestionUI.open({host,context:pack.context,store,generate:()=>enqueue('generate'),recheck:async()=>{const result=await enqueue('recheck');return result.results;},simulation:false});}
 await mount();
 const job=jr.data;if(job&&['queued','running','succeeded'].includes(job.status)&&job.expected_plan_revision===(saved?.revision||0)){
  const message=document.createElement('p');message.textContent=job.status==='succeeded'?'正在恢复已完成的后台结果…':'后台处理中，关闭页面后结果也会保留；请勿重复提交。';host.prepend(message);
  const result=job.status==='succeeded'?job.result:await poll(job.id);if(stamp!==epoch)return;
  if(result?.state){await store.save(result.state);await mount();}
 }
}catch(e){if(stamp===epoch){const p=document.createElement('p');p.textContent=e.message;host.append(p);}}}
function clear(){epoch++;window.QAQuestionUI?.clear();const h=document.getElementById('questions');if(h)h.replaceChildren();}
window.QAQuestions={open,clear};
})();
