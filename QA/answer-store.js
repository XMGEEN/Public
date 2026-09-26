(function(){
'use strict';
function create(client,task){
 const one=async table=>{const r=await client.from(table).select('*').eq('task_id',task.id).maybeSingle();if(r.error)throw Error('答案草稿配置尚未就绪或读取失败');return r.data;};
 async function load(){const [row,job,plan]=await Promise.all([one('qa_answer_current'),one('qa_answer_jobs'),one('qa_question_current')]);const reviews=await client.from('qa_review_versions').select('id').eq('task_id',task.id).order('version',{ascending:false}).limit(1);if(reviews.error)throw Error('当前事实版本读取失败');return {draft:row?.draft||null,job,available:plan?.state?.questions?.filter(q=>q.selected&&q.answerability.status==='可回答')||[],stale:!!row&&(row.draft.answer_logic_version!=='benefit-context-v2'||row.draft.plan_revision!==plan?.revision||row.draft.fact_version!==reviews.data[0]?.id||!plan?.state?.confirmation)};}
 async function enqueue({replace,ids}){const plan=await one('qa_question_current');if(!plan?.state?.confirmation||plan.pending_id)throw Error('先完成问题清单确认与保存');if(!Array.isArray(ids)||!ids.length||ids.length>5||new Set(ids).size!==ids.length||ids.some(id=>!plan.state.questions.some(q=>q.id===id&&q.selected&&q.answerability.status==='可回答')))throw Error('本次仅限1–5条已选且可回答的问题');const r=await client.rpc('qa_enqueue_answer_job',{p_task:task.id,p_id:crypto.randomUUID(),p_expected:plan.revision,p_ids:ids,p_accept_cost:true,p_replace:replace});if(r.error)throw Error('答案请求未提交：'+r.error.message);return r.data;}
 async function wait(id,progress,cancelled){for(let attempt=0;attempt<240;attempt++){if(cancelled())throw Error('已离开任务，结果将在后台保存');const j=await one('qa_answer_jobs');if(!j||j.id!==id)throw Error('请求状态已变化，请刷新');if(j.status==='failed')throw Error(j.failure_reason||'生成未完成，原草稿保留');if(j.status==='succeeded')return;progress(j.phase==='checking'?'答案已生成，正在做一轮检查…':'正在生成答案…');await new Promise(r=>setTimeout(r,1000));}throw Error('仍在处理，请稍后刷新；不会自动重复调用');}
 return {load,enqueue,wait};
}
window.QAAnswerStore={create};
})();
