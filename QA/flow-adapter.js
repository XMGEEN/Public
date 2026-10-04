(()=>{'use strict';
 function create(client,user,guard){
  const rpc=async(name,args)=>{await guard();const r=await client.rpc(name,args);if(r.error)throw Error(r.error.code==='PGRST202'?'新版后台尚未配置，资料已保存，未调用模型。':'请求未完成：'+r.error.message);return r.data;};
  async function read(id){await guard();const r=await client.from('qa_simple_runs').select('id,state').eq('id',id).eq('user_id',user.id).single();if(r.error)throw Error('运行状态读取失败，请稍后重新打开任务；不会自动重试模型。');return r.data;}
  async function wait(id,stop,progress){for(let n=0;n<900;n++){const r=await read(id);if(stop(r.state.status))return r;progress(({preparing:'正在检查资料并估算调用范围…',queued:'请求已保存，等待处理…',running:'后台正在整理资料和撰写 QA…'})[r.state.status]||'正在读取结果…');await new Promise(resolve=>setTimeout(resolve,1000));}throw Error('处理尚未结束，请稍后打开任务；刷新不会重新生成。');}
  async function generate(task,fingerprint,progress){
   const key='qa-simple-operation:'+user.id+':'+task.id;
   let saved;try{saved=JSON.parse(sessionStorage.getItem(key));}catch{}
   if(!saved||saved.fingerprint!==fingerprint){saved={fingerprint,id:crypto.randomUUID()};sessionStorage.setItem(key,JSON.stringify(saved));}
   let run=await rpc('qa_simple_prepare',{p_task:task.id,p_id:saved.id});
   if(['failed','unknown','needs_input'].includes(run.state.status)){
    if(!confirm('上次运行已停止。是否在当前资料上准备一个新请求？下一步仍需单独确认费用。'))return null;
    saved.id=crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify(saved));run=await rpc('qa_simple_prepare',{p_task:task.id,p_id:saved.id});
   }
   if(run.state.status==='preparing')run=await wait(run.id,s=>s!=='preparing',progress);
   if(run.state.status==='needs_input')throw Error('需要补充：'+(run.state.issues||[]).map(x=>typeof x==='string'?x:x.reason).join('；'));
   if(run.state.status==='awaiting_authorization'){
    const q=run.state.quote;
    const message='本次将理解资料、规划问题、生成答案并做一轮检查。\n最多 '+q.max_calls+' 次模型请求，费用停止上限 ¥'+q.budget.toFixed(2)+'（按现有计价估算，实际账单可能未知）。\n预算不足、调用结果不明或失败即停止，不自动付费重试。\n如已有结果，本次成功后替换，失败保留原稿。\n是否授权本轮生成？';
    if(!confirm(message)){progress('资料已保存，尚未授权模型调用。');return null;}
    run=await rpc('qa_simple_authorize',{p_id:run.id,p_hash:run.state.input_hash,p_budget:q.budget,p_replace:true});
   }
   if(['queued','running'].includes(run.state.status))run=await wait(run.id,s=>!['queued','running'].includes(s),progress);
   if(run.state.status!=='succeeded')throw Error(run.state.status==='unknown'?'调用结果不明，已停止，原稿保留；不会自动重试。':'本轮未完成，原稿保留：'+(run.state.failure||'资料需要补充'));
   const state=await rpc('qa_simple_result',{p_task:task.id});if(!state||state.base_token!==run.id)throw Error('本次结果尚未保存完成，请稍后刷新；原稿仍保留，不会重新调用模型。');
   sessionStorage.removeItem(key);state.simple=true;return {metadata:{product:task.product_name,quantity:task.qa_count},state};
  }
  return {generate};
 }
 window.QAFlowAdapter={create};
})();
