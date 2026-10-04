(()=>{'use strict';
 function create(client,user,{onExpired=()=>{}}={}){
  let active=null,epoch=0,pendingTaskId=null;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const fail=message=>{throw Error(message);};
  async function guard(stamp=epoch){
   const {data,error}=await client.auth.getUser();
   if(error||data.user?.id!==user.id){onExpired();fail('登录已失效，请重新登录。');}
   const session=await client.rpc('qa_session_active');if(session.error||session.data!==true){onExpired();fail('登录已失效，请重新登录。');}
   if(stamp!==epoch)fail('任务已切换，请重新打开。');return stamp;
  }
  async function list(){await guard();const r=await client.from('qa_tasks').select('id,product_name,asin,qa_count,updated_at').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(100);if(r.error)fail('任务列表读取失败。');return r.data;}
  async function sources(taskId){const result=[];for(let i=0;;i+=200){const r=await client.from('qa_sources').select('*').eq('task_id',taskId).order('created_at').order('id').range(i,i+199);if(r.error)fail('资料读取失败，未继续生成。');result.push(...r.data);if(r.data.length<200)return result;}}
  async function open(id){await guard();if(!uuid.test(id))fail('任务链接无效。');epoch++;const stamp=epoch;
   const r=await client.from('qa_tasks').select('*').eq('id',id).eq('user_id',user.id).single();if(r.error||!r.data)fail('任务不存在或无权访问。');
   active=r.data;pendingTaskId=null;
   const [batches,writing,result]=await Promise.all([sources(id),client.from('qa_writing_versions').select('id,content').eq('task_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1),resultLoad()]);
   await guard(stamp);if(writing.error)fail('写作要求读取失败。');return {task:active,batches,instructions:writing.data[0]?.content||'',state:result};
  }
  function newTask(){epoch++;active=null;pendingTaskId=null;}
  async function saveTask(input){const stamp=await guard();if(!input.product.trim()||!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>25)fail('请填写产品名称，数量为1–25组。');
   const values={product_name:input.product.trim(),qa_count:input.quantity,asin:input.asin?.trim().toUpperCase()||null};if(values.asin&&!/^[A-Z0-9]{10}$/.test(values.asin))fail('ASIN格式不正确。');
   let r;
   if(active){r=await client.from('qa_tasks').update(values).eq('id',active.id).eq('user_id',user.id).eq('updated_at',active.updated_at).select('*').maybeSingle();if(!r.error&&!r.data)fail('其他页面已更新任务，请刷新后再保存。');}
   else{const id=pendingTaskId||(pendingTaskId=crypto.randomUUID());const prior=await client.from('qa_tasks').select('*').eq('id',id).maybeSingle();if(prior.error)fail('保存前核对失败。');r=prior.data?prior:await client.from('qa_tasks').insert({id,...values}).select('*').single();}
   await guard(stamp);if(r.error)fail('任务保存失败，请重试；不会重复新建。');active=r.data;pendingTaskId=null;return active;
  }
  async function saveSource(prepared){const stamp=await guard();if(!active||!prepared.ready)fail('资料尚未完成解析。');if(prepared.duplicate)return {id:prepared.duplicate.id,duplicate:true};
   const {file,parsed,id}=prepared,ext=parsed.pasted?'txt':file.name.split('.').pop().toLowerCase();const rawPath='QA/'+user.id+'/'+active.id+'/'+id+'/source.'+ext;
   const prior=await client.from('qa_sources').select('id').eq('id',id).maybeSingle();if(prior.error)fail('保存前读取失败。');
   if(!prior.data){const uploaded=await client.storage.from('keyword-battle-inbox').upload(rawPath,file,{upsert:false,contentType:file.type||'application/octet-stream'});await guard(stamp);
    if(uploaded.error){const old=await client.storage.from('keyword-battle-inbox').download(rawPath);if(old.error||await window.QAParser.sha(await old.data.arrayBuffer())!==parsed.digest)fail('原件上传失败；可以重试同一次保存。');}
    const r=await client.from('qa_sources').insert({id,task_id:active.id,kind:parsed.kind,filename:file.name,raw_path:rawPath,raw_sha256:parsed.digest,interpretation_sha256:prepared.interpretation,file_bytes:file.size,pasted:parsed.pasted,mappings:prepared.mappings,ownership:prepared.ownership,records:prepared.records,notes:parsed.notes,stats:prepared.counts,replaces_id:null});
    await guard(stamp);if(r.error)fail('原件已保存，资料登记未完成。请重试，不要重复选择文件。');
   }return {id,duplicate:false};
  }
  async function saveWriting(content){await guard();if(!active)fail('请先保存任务。');if(content.length>100000)fail('写作要求超过100000字符。');const r=await client.from('qa_writing_versions').select('content').eq('task_id',active.id).order('created_at',{ascending:false}).limit(1);if(r.error)fail('写作要求核对失败。');if((r.data[0]?.content||'')===content)return;
   if(!content.trim())fail('已有写作要求不能静默清空；请明确填写“沿用默认设置”。');
   const saved=await client.from('qa_writing_versions').insert({task_id:active.id,content});if(saved.error)fail('写作要求保存失败。');
  }
  async function resultLoad(){const r=await client.rpc('qa_simple_result',{p_task:active.id});if(!r.error&&r.data)return {...r.data,simple:true};if(r.error&&r.error.code!=='PGRST202')fail('结果读取失败。');return window.QAAnswerStore.create(client,active).resultLoad();}
  async function saveEdit(state,item){const stamp=await guard();if(!active)fail('请先打开任务。');const store=window.QAAnswerStore.create(client,active),items={...(state.edits||{}),[item.id]:{question:item.question,answer:item.answer}};let next;if(state.simple){const r=await client.rpc('qa_simple_edit',{p_task:active.id,p_base:state.base_token,p_expected:state.revision,p_items:items});if(r.error)fail('保存失败，其他页面可能已更新，请刷新核对。');next={...r.data,simple:true};}else next=await store.resultSave(state,items);await guard(stamp);return next;}
  return {list,open,newTask,saveTask,saveSource,saveWriting,sources,saveEdit,guard,get active(){return active;}};
 }
 window.QATaskAdapter={create};
})();
