(() => {
 'use strict';
 const $=id=>document.getElementById(id), report=document.body.dataset.page==='report';
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const taskId=new URLSearchParams(location.search).get('task');
 const next=report?'QA/report/'+(uuid.test(taskId||'')?'?task='+taskId:''):'QA/'+(uuid.test(taskId||'')?'?task='+taskId:'');
 const login='/ ?next='.replace(' ','')+encodeURIComponent(next);
 const message=text=>{$('message').textContent=text;};
 if(!window.APP_CONFIG||!window.supabase){$('auth-loading').textContent='页面资源加载失败，请刷新重试。';return;}
 const C=window.APP_CONFIG;
 const client=window.supabase.createClient(C.supabaseUrl,C.publishableKey,{auth:{storageKey:'keyword-battle-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 let user=null,epoch=0,active=null,saving=false,loading=false,offset=0;
 const columns='id,product_name,asin,qa_count,market,output_language,status,report_file_path,created_at,updated_at';
 function hide(){window.QAQuestions?.clear();window.QAReview?.clear();window.QAImports?.clear();epoch++;user=null;$('protected-content').hidden=true;$('logout').hidden=true;$('account').textContent='';if($('task-list'))$('task-list').replaceChildren();if($('draft-form'))$('draft-form').reset();if($('report-title'))$('report-title').textContent='结果展示待开放';}
 function leave(){hide();location.replace(login);}
 function friendly(){return '操作未完成，请检查网络后重试；若仍失败，请联系管理员核对 QA 配置。';}
 async function requireSession(){const {data,error}=await client.auth.getSession();if(error||!data.session||!user||data.session.user.id!==user.id){leave();throw Error('AUTH_REQUIRED');}return epoch;}
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(user&&session?.user?.id&&session.user.id!==user.id))leave();});
 window.addEventListener('pagehide',hide);
 window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 function edit(task){active=task;$('editor').hidden=false;$('product-name').value=task?.product_name||'';$('asin').value=task?.asin||'';$('qa-count').value=task?.qa_count||5;$('save-state').textContent=task?.updated_at?'已保存 · '+new Date(task.updated_at).toLocaleString('zh-CN'):'尚未保存';history.replaceState(null,'',task?'/QA/?task='+task.id:'/QA/');$('product-name').focus();window.QAImports?.open(task,client,user);window.QAReview?.open(task,client,user);window.QAQuestions?.open(task,client,user);}
 async function load(append=false){
  if(loading)return;loading=true;$('refresh').disabled=true;
  try{const stamp=await requireSession();const start=append?offset:0;
   const {data,error}=await client.from('qa_tasks').select(columns).eq('user_id',user.id).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(start,start+19);
   if(error)throw error;if(stamp!==epoch)return;
   if(!append)$('task-list').replaceChildren();
   for(const task of data){const row=node('article','');row.className='task';const info=node('div','');info.append(node('h3',task.product_name),node('p',(task.asin||'未填写 ASIN')+' · '+task.qa_count+' 组 · '+new Date(task.updated_at).toLocaleString('zh-CN')));const actions=node('div','');actions.className='task-actions';const badge=node('span',task.status==='草稿'?'待准备资料':task.status);badge.className='badge';const button=node('button','编辑任务');button.onclick=()=>edit(task);actions.append(badge,button);if(task.report_file_path?.trim()){const link=node('a','查看结果状态');link.href='/QA/report/?task='+task.id;actions.append(link);}row.append(info,actions);$('task-list').append(row);}
   offset=start+data.length;$('empty').hidden=offset!==0;$('more').hidden=data.length<20;
  }catch(e){if(user)message(friendly());}finally{loading=false;$('refresh').disabled=false;}
 }
 async function save(event){event.preventDefault();if(saving)return;
  const name=$('product-name').value.trim(),asin=$('asin').value.trim().toUpperCase(),count=Number($('qa-count').value);
  if(!name||!Number.isSafeInteger(count)||count<1||count>2147483647||(asin&&!/^[A-Z0-9]{10}$/.test(asin))){message('请填写产品名称、有效的正整数组数和可选的10位 ASIN。');return;}
  saving=true;const controls=[...$('draft-form').elements];controls.forEach(c=>{if(c.id!=='')c.disabled=true;});$('new-task').disabled=$('close-editor').disabled=true;message('');
  try{const stamp=await requireSession();if(!active)active={id:crypto.randomUUID(),unsaved:true};const payload={product_name:name,asin:asin||null,qa_count:count};
   // 同一草稿 UUID 在响应丢失后重试，先读回，避免创建重复行。
   const existing=await client.from('qa_tasks').select('id').eq('id',active.id).maybeSingle();if(existing.error)throw existing.error;if(stamp!==epoch)return;
   const query=existing.data?client.from('qa_tasks').update(payload).eq('id',active.id):client.from('qa_tasks').insert({id:active.id,...payload});
   const {data,error}=await query.select(columns).single();if(error)throw error;if(stamp!==epoch)return;active=data;history.replaceState(null,'','/QA/?task='+data.id);$('save-state').textContent='已保存 · '+new Date(data.updated_at).toLocaleString('zh-CN');message('已保存。资料准备好后再生成问答。');window.QAImports?.open(data,client,user);window.QAReview?.open(data,client,user);window.QAQuestions?.open(data,client,user);await load();
  }catch(e){if(user)message(friendly());}finally{saving=false;controls.forEach(c=>{if(c.id!=='')c.disabled=false;});$('new-task').disabled=$('close-editor').disabled=false;}
 }
 window.addEventListener('qa-sources-changed',()=>{if(active&&user){window.QAReview?.open(active,client,user);window.QAQuestions?.open(active,client,user);}});window.addEventListener('qa-review-changed',()=>{if(active&&user)window.QAQuestions?.open(active,client,user);});
 async function start(){
  const {data,error}=await client.auth.getUser();if(error||!data.user){leave();return;}user=data.user;
  const session=await client.rpc('qa_session_active');if(session.error||session.data!==true){hide();$('auth-loading').textContent='QA 登录门禁尚未就绪或会话已失效，请返回登录后重试。';return;}
  $('auth-loading').hidden=true;$('protected-content').hidden=false;$('logout').hidden=false;$('account').textContent=user.email||'';
  $('logout').onclick=async()=>{hide();$('auth-loading').hidden=false;$('auth-loading').textContent='正在退出登录…';const result=await client.auth.signOut({scope:'local'});if(result.error){$('auth-loading').textContent='退出未完成，请刷新后重试退出。';return;}location.replace(login);};
  if(report){if(!taskId){message('从任务列表选择任务即可查看状态。');return;}if(!uuid.test(taskId)){message('任务链接无效。');return;}const stamp=await requireSession();const {data:task,error}=await client.from('qa_tasks').select(columns).eq('id',taskId).eq('user_id',user.id).maybeSingle();if(stamp!==epoch)return;if(error)throw error;if(!task){message('任务不存在或不属于当前账号。');return;}$('report-title').textContent=task.product_name;$('report-state').textContent='任务状态：'+(task.status==='草稿'?'待准备资料':task.status)+'。问答生成、报告及审核待开放。';return;}
  $('new-task').onclick=()=>edit(null);$('close-editor').onclick=()=>{$('editor').hidden=true;history.replaceState(null,'','/QA/');};$('refresh').onclick=()=>load();$('more').onclick=()=>load(true);$('draft-form').onsubmit=save;
  await load();if(taskId){if(!uuid.test(taskId)){message('任务链接无效。');return;}const stamp=await requireSession();const {data:task,error}=await client.from('qa_tasks').select(columns).eq('id',taskId).eq('user_id',user.id).maybeSingle();if(stamp!==epoch)return;if(error)throw error;if(task)edit(task);else message('任务不存在或不属于当前账号。');}
 }
 start().catch(()=>{if(user)message(friendly());else $('auth-loading').textContent='登录检查未完成，请刷新重试。';});
})();

