/* 公开浏览器配置；所有权限由 Supabase RLS 约束。 */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),C=window.APP_CONFIG,page=document.body.dataset.page;
 const base=new URL(page==='login'?'./':'../',location.href);
 const to=path=>new URL(path,base).href;
 const message=(id,text,kind='')=>{const el=$(id);if(!el)return;el.textContent=text;el.className='message '+kind;el.hidden=!text;};
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const friendly=error=>{
  const s=String(error?.message??error??'');
  if(/Invalid login credentials/i.test(s))return '邮箱或密码不正确，请检查后重试。';
  if(/Email not confirmed/i.test(s))return '邮箱还未确认，请先打开注册邮件中的确认链接。';
  if(/already registered/i.test(s))return '这个邮箱已有账号，请切换到登录。';
  if(/rate limit|too many requests|over_email_send_rate_limit/i.test(s))return '操作有些频繁，请稍后再试。';
  if(/Password should|weak_password/i.test(s))return '密码不符合要求，请使用更长的密码并加入字母和数字。';
  if(/JWT expired|refresh token|session.*missing/i.test(s))return '登录已过期，请退出后重新登录。';
  if(/row-level security|permission denied/i.test(s))return '当前账号没有此操作的权限，请联系管理员检查配置。';
  if(/fetch|network|timeout|abort/i.test(s))return '网络连接未完成，请检查网络后重试。';
  return '操作暂时未完成，请稍后重试；持续失败请联系管理员。';
 };
 if(!C||!window.supabase){message(page==='login'?'auth-message':'report-message','页面资源加载失败，请刷新后重试。','error');return;}
 const client=window.supabase.createClient(C.supabaseUrl,C.publishableKey,{auth:{storageKey:'keyword-battle-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 function loginUrl(){const u=new URL(base);if(page==='report'){const id=new URLSearchParams(location.search).get('task');if(/^[0-9a-f-]{36}$/.test(id??''))u.searchParams.set('task',id);}return u.href;}
 function afterLogin(){const id=new URLSearchParams(location.search).get('task');location.replace(to(/^[0-9a-f-]{36}$/.test(id??'')?'report/?task='+id:'tool/'));}
 async function requireUser(){
  const {data,error}=await client.auth.getUser();
  if(error||!data.user){location.replace(loginUrl());return null;}
  $('auth-loading').hidden=true;$('protected-content').hidden=false;
  if($('account'))$('account').textContent=data.user.email;
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')location.replace(to(''));});
  $('logout').onclick=async()=>{const button=$('logout');button.disabled=true;const {error}=await client.auth.signOut({scope:'local'});if(error){button.disabled=false;message(page==='tool'?'task-message':'report-message',friendly(error),'error');}else location.replace(to(''));};
  return data.user;
 }
 async function login(){
  const hash=new URLSearchParams(location.hash.slice(1));if(hash.get('error')){message('auth-message','确认链接已失效或无法验证，请重新注册获取确认邮件，或联系管理员。','error');history.replaceState(null,'',location.pathname+location.search);}
  const current=await client.auth.getSession();if(current.data.session){const user=await client.auth.getUser();if(user.data.user){afterLogin();return;}}
  let mode='login',busy=false;
  function changeMode(next){if(busy)return;mode=next;const signup=mode==='signup';$('login-tab').setAttribute('aria-selected',String(!signup));$('signup-tab').setAttribute('aria-selected',String(signup));$('auth-title').textContent=signup?'创建你的账号':'欢迎回来';$('auth-description').textContent=signup?'用邮箱注册，开始整理你的关键词。':'登录后，继续你的关键词分析。';$('confirm-label').hidden=$('confirm-password').hidden=!signup;$('confirm-password').required=signup;$('password').minLength=signup?8:1;$('password').autocomplete=signup?'new-password':'current-password';$('auth-submit').textContent=signup?'注册账号 →':'登录作战台 →';message('auth-message','');}
  $('login-tab').onclick=()=>changeMode('login');$('signup-tab').onclick=()=>changeMode('signup');
  $('show-password').onclick=()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('show-password').textContent=show?'隐藏密码':'显示密码';};
  $('auth-form').onsubmit=async event=>{
   event.preventDefault();if(busy)return;
   const email=$('email').value.trim(),password=$('password').value;
   if(mode==='signup'&&password!==$('confirm-password').value){message('auth-message','两次输入的密码不一致。','error');return;}
   busy=true;$('auth-submit').disabled=true;$('auth-submit').textContent=mode==='signup'?'正在注册…':'正在登录…';message('auth-message','');
   try{
    const result=mode==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:base.href}}):await client.auth.signInWithPassword({email,password});
    if(result.error)throw result.error;
    if(result.data.session){afterLogin();return;}
    message('auth-message','请前往邮箱查看确认邮件。完成确认后，返回这里登录；若已注册，请直接登录。','success');
   }catch(error){message('auth-message',friendly(error),'error');}
   finally{busy=false;$('auth-submit').disabled=false;$('auth-submit').textContent=mode==='signup'?'注册账号 →':'登录作战台 →';}
  };
 }
 async function tool(){
  const user=await requireUser();if(!user)return;
  let pageIndex=0,total=0,loading=false,submitting=false,pending=null;
  const statuses={'已完成':'completed','进行中':'running','待处理':'pending','失败':'failed'};
  const formatTime=value=>{const d=new Date(value);return isNaN(d)?'时间未知':d.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});};
  async function loadTasks(){
   if(loading)return;loading=true;$('refresh-tasks').disabled=true;
   try{
    let data,error,count;
    if(C.apiBaseUrl){
     const session=await client.auth.getSession();if(session.error||!session.data.session)throw Error('session missing');
     const response=await fetch(C.apiBaseUrl+'/v1/tasks?page='+(pageIndex+1),{headers:{Authorization:'Bearer '+session.data.session.access_token},signal:AbortSignal.timeout(30000)});
     if(response.status===401)throw Error('JWT expired');if(!response.ok)throw Error('network API failed');
     const result=await response.json();if(!Array.isArray(result.tasks)||!Number.isInteger(result.total))throw Error('network API response invalid');
     data=result.tasks;count=result.total;message('api-notice',result.warning||'');
    }else{({data,error,count}=await client.from(C.table).select('id,asin,status,created_at,failure_reason,report_url',{count:'exact'}).eq('user_id',user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(pageIndex*10,pageIndex*10+9));}
    if(error)throw error;total=count??data.length;$('task-count').textContent=total;$('task-rows').replaceChildren();
    for(const task of data){
     const tr=el('tr');tr.append(el('td',task.asin),el('td',formatTime(task.created_at)));
     const state=el('td');state.append(el('span',task.status,'status '+(statuses[task.status]??'pending')));
     if(task.status==='失败')state.append(el('div',task.failure_reason||'未提供失败原因，请联系管理员。','failure-reason'));
     const action=el('td');if(task.status==='已完成'&&task.report_url){const a=el('a','查看报告 ↗','report-link');a.href=to('report/?task='+task.id);action.append(a);}else action.append(el('span',task.status==='失败'?'处理失败':task.status==='已完成'?'暂无报告':'等待结果','muted'));
     tr.append(state,action);$('task-rows').append(tr);
    }
    $('empty-state').hidden=total!==0;$('previous-page').disabled=pageIndex===0;$('next-page').disabled=(pageIndex+1)*10>=total;
    $('page-info').textContent='第'+(pageIndex+1)+' / '+Math.max(1,Math.ceil(total/10))+'页 · 每页10条';
    $('refresh-status').textContent='每30秒自动刷新 · 更新于 '+new Date().toLocaleTimeString('zh-CN',{hour12:false});message('list-message','');
   }catch(error){message('list-message',friendly(error),'error');}finally{loading=false;$('refresh-tasks').disabled=false;}
  }
  $('refresh-tasks').onclick=loadTasks;$('previous-page').onclick=()=>{if(pageIndex>0&&!loading){pageIndex--;loadTasks();}};$('next-page').onclick=()=>{if(!loading&&(pageIndex+1)*10<total){pageIndex++;loadTasks();}};
  function validateAsin(){const value=$('asin').value.trim().toUpperCase();$('asin').value=value;const good=/^B0[A-Z0-9]{8}$/.test(value);$('asin').setAttribute('aria-invalid',String(value!==''&&!good));$('asin-hint').textContent=value&&!good?'ASIN须为10位字母或数字，并以B0开头。':'10位字符，以 B0 开头。';return good;}
  $('asin').addEventListener('input',validateAsin);
  function validateFile(file){if(!file)return '请选择广告报表。';if(!/\.(xlsx|csv)$/i.test(file.name))return '仅支持 .xlsx 或 .csv 报表。';if(file.size===0)return '报表是空文件，请重新选择。';if(file.size>C.maxFileBytes)return '报表超过10 MB，请缩小文件后重试。';return '';}
  $('report-file').onchange=()=>{const file=$('report-file').files[0];$('file-name').textContent=file?file.name:'选择报表文件';const error=validateFile(file);$('file-hint').textContent=error||'已选择 · '+(file.size/1024).toFixed(1)+' KB';};
  $('task-form').onsubmit=async event=>{
   event.preventDefault();if(submitting)return;if(!validateAsin()){message('task-message','请填写有效的10位 ASIN。','error');return;}
   const file=$('report-file').files[0],validation=validateFile(file);if(validation){message('task-message',validation,'error');return;}
   const asin=$('asin').value;
   if(pending&&(pending.file!==file||pending.asin!==asin)){message('task-message','上一任务尚未确认提交成功。请保持原文件和ASIN重试，或联系管理员核对，避免重复上传。','error');return;}
   if(!pending){const id=crypto.randomUUID();pending={id,asin,file,path:user.id+'/'+id+'.'+file.name.split('.').at(-1).toLowerCase(),uploaded:false};}
   submitting=true;$('task-submit').disabled=true;$('asin').disabled=true;$('report-file').disabled=true;
   try{
    // 断网后重试先确认同一UUID是否已插入，避免重复任务。
    const existing=await client.from(C.table).select('id').eq('id',pending.id).maybeSingle();if(existing.error)throw existing.error;
    if(!existing.data){
     if(!pending.uploaded){
      $('task-submit').textContent='正在上传报表…';
      const upload=await client.storage.from(C.bucket).upload(pending.path,file,{contentType:file.name.toLowerCase().endsWith('.csv')?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',upsert:false});
      if(upload.error){
       // 上传响应丢失时，只读确认原UUID文件已到达，再继续插行。
       const check=await client.storage.from(C.bucket).download(pending.path);
       if(check.error||check.data.size!==file.size)throw upload.error;
      }
      pending.uploaded=true;
     }
     $('task-submit').textContent='正在提交任务…';
     const inserted=await client.from(C.table).insert({id:pending.id,user_id:user.id,asin:pending.asin,report_file_path:pending.path,status:'待处理'});
     if(inserted.error)throw inserted.error;
    }
    pending=null;$('task-form').reset();$('file-name').textContent='选择报表文件';$('file-hint').textContent='支持 .xlsx、.csv，最大10 MB';message('task-message','提交成功。任务已进入处理队列，结果会显示在下方。','success');pageIndex=0;await loadTasks();
   }catch(error){message('task-message',friendly(error)+(pending?.uploaded?' 报表已上传，点击重试会继续提交同一任务。':''),'error');}
   finally{submitting=false;$('task-submit').disabled=false;$('asin').disabled=false;$('report-file').disabled=false;$('task-submit').textContent=pending?'重试提交同一任务':'生成作战总表 →';}
  };
  await loadTasks();const timer=setInterval(()=>{if(!document.hidden)loadTasks();},30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadTasks();});
 }
 function safeContent(source){
  const fragment=document.createDocumentFragment();
  for(const child of source.childNodes){
   if(child.nodeType===Node.TEXT_NODE){fragment.append(document.createTextNode(child.textContent));continue;}
   if(child.nodeType!==Node.ELEMENT_NODE)continue;
   if(child.tagName==='IMG'){
    let url;try{url=new URL(child.getAttribute('src'));}catch{continue;}
    if(url.protocol!=='https:'||!['m.media-amazon.com','images-na.ssl-images-amazon.com'].includes(url.hostname))continue;
    const box=el('span',undefined,'image-box'),placeholder=el('span','主图','image-placeholder'),img=el('img');box.append(placeholder,img);img.alt='商品主图';img.loading='lazy';img.referrerPolicy='no-referrer';img.onload=()=>{placeholder.hidden=true;img.style.opacity='1';};img.onerror=()=>{img.hidden=true;placeholder.textContent='无图';};img.src=url.href;fragment.append(box);
   }else if(['SMALL','DIV','SPAN','BR','STRONG'].includes(child.tagName)){const n=el(child.tagName.toLowerCase());n.append(safeContent(child));fragment.append(n);}
  }return fragment;
 }
 function trendCell(source){
  const cell=el('td'),values=[...source.querySelectorAll('small')].map(n=>({text:n.textContent,value:Number(n.textContent.split(':').slice(1).join(':').replaceAll(',','').trim())})).filter(x=>Number.isFinite(x.value));
  if(values.length>1){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 160 34');svg.classList.add('trend-chart');svg.setAttribute('role','img');svg.setAttribute('aria-label','13周搜索量趋势');const max=Math.max(...values.map(x=>x.value)),min=Math.min(...values.map(x=>x.value));const line=document.createElementNS(ns,'polyline');line.setAttribute('points',values.map((x,i)=>`${i*156/(values.length-1)+2},${30-(x.value-min)/(max-min||1)*26}`).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#398571');line.setAttribute('stroke-width','1.7');svg.append(line);cell.append(svg);}
  const details=el('details');details.append(el('summary','查看'+values.length+'周数据'));for(const v of values)details.append(el('small',v.text));cell.append(details);return cell;
 }
 function renderReport(html){
  const parsed=new DOMParser().parseFromString(html,'text/html'),source=parsed.querySelector('table');if(!source)throw Error('报告格式不正确');
  const rows=[...source.querySelectorAll('tbody tr')];if(!rows.length)throw Error('报告没有数据');
  const order=[0,1,2,5,3,4,6,7,8,9,10,11,12,13,14,15],widths=[190,155,115,185,90,115,220,95,185,95,95,95,110,120,95,265];
  const table=$('battle-table');table.replaceChildren();table.style.width=widths.reduce((a,b)=>a+b,0)+'px';
  const cols=el('colgroup');for(const width of widths){const col=el('col');col.style.width=width+'px';cols.append(col);}table.append(cols);
  const head=el('thead'),groups=el('tr',undefined,'group-row');for(const [name,span] of [['热度',4],['竞争格局',5],['自己广告实绩',6],['打法建议',1]]){const th=el('th',name);th.colSpan=span;th.scope='colgroup';groups.append(th);}head.append(groups);
  const titles=[...source.querySelectorAll('thead th')],labels=el('tr');for(const index of order){const th=el('th',titles[index]?.textContent??'数据');th.scope='col';labels.append(th);}head.append(labels);table.append(head);const body=el('tbody');
  for(const sourceRow of rows){const cells=[...sourceRow.children];if(cells.length!==16)throw Error('报告列数不正确');const tr=el('tr');
   for(const index of order){if(index===5){tr.append(trendCell(cells[index]));continue;}const td=el('td');
    if(index===15){const text=cells[index].textContent;let label='数据不足',cls='insufficient';if(/待测试|暂无点击/.test(text)){label='待测试';cls='test';}else if(/已有转化|有点击有订单|已有点击有订单/.test(text)){label='已有转化';cls='conversion';}else if(/相关性|图片.*详情/.test(text)){label='检查相关性';cls='check';}td.append(el('span',label,'advice-tag '+cls),el('p',text));}
    else td.append(safeContent(cells[index]));tr.append(td);
   }body.append(tr);
  }table.append(body);$('report-notes').replaceChildren();for(const p of parsed.querySelectorAll('body > p')){if(p.textContent.includes('美国站 · ASIN'))continue;$('report-notes').append(el('p',p.textContent));}
  return rows.length;
 }
 async function report(){
  const user=await requireUser();if(!user)return;const id=new URLSearchParams(location.search).get('task');
  async function load(){
   $('retry-report').hidden=true;$('report-body').hidden=true;message('report-message','正在加载报告，请稍候…');
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id??'')){message('report-message','任务链接不完整，请返回工具页选择报告。','error');return;}
   try{
    const {data:task,error}=await client.from(C.table).select('id,asin,status,report_url,failure_reason,created_at').eq('id',id).eq('user_id',user.id).maybeSingle();if(error)throw error;
    if(!task){message('report-message','未找到这份报告，或它不属于当前账号。','error');return;}
    $('report-subtitle').textContent='ASIN '+task.asin+' · '+task.status;
    if(task.status!=='已完成'||!task.report_url){message('report-message',task.status==='失败'?'任务失败：'+(task.failure_reason||'未提供原因'): '任务仍在处理中，请稍后刷新。',task.status==='失败'?'error':'');$('retry-report').hidden=false;return;}
    const url=new URL(task.report_url);if(url.origin!==C.reportOrigin||!url.pathname.startsWith(C.reportPrefix))throw Error('报告地址不正确');
    const response=await fetch(url.href,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('报告读取失败');
    const count=renderReport(await response.text());$('report-subtitle').textContent='ASIN '+task.asin+' · '+count+'个关键词 · 已完成';message('report-message','');$('report-body').hidden=false;
   }catch(error){message('report-message',friendly(error),'error');$('retry-report').hidden=false;}
  }
  $('retry-report').onclick=load;await load();
 }
 (page==='login'?login():page==='tool'?tool():report()).catch(error=>{message(page==='login'?'auth-message':page==='tool'?'task-message':'report-message',friendly(error),'error');});
})();
