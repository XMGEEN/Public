(()=>{'use strict';
 const $=id=>document.getElementById(id),I=window.QASourceIntake;
 const say=text=>$('notice').textContent=text;
 let descriptors=[],prepared=new Map(),batches=[],store=null,saving=false,sessionEpoch=0;
 const element=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const input=()=>({product:$('product').value.trim(),quantity:Number($('quantity').value),asin:$('asin').value,instructions:$('instructions').value});
 $('files').addEventListener('change',()=>{
  descriptors=[...$('files').files].map(file=>({file,kind:I.suggest(file.name),product:'',relation:undefined}));prepared.clear();$('file-list').replaceChildren();
  for(const d of descriptors){const row=element('div');row.className='file-row';row.append(element('strong',d.file.name));const select=element('select');select.setAttribute('aria-label',d.file.name+' 分类');select.append(new Option('请选择资料分类',''));for(const [key,label]of Object.entries(I.kinds))select.append(new Option(label,key));select.value=d.kind;select.onchange=()=>{d.kind=select.value;prepared.delete(d);};row.append(select);
   const ownership=element('input');ownership.placeholder='竞品标识（文件有 ASIN 列时不用填）';ownership.setAttribute('aria-label',d.file.name+' 竞品标识');ownership.value=d.product;ownership.hidden=d.kind!=='competitor_reviews';ownership.oninput=()=>{d.product=ownership.value;prepared.delete(d);};select.addEventListener('change',()=>ownership.hidden=d.kind!=='competitor_reviews');row.append(ownership);d.host=row;$('file-list').append(row);
  }
 });
 function showSaved(){const old=new Set(batches.map(b=>b.replaces_id).filter(Boolean));$('saved-sources').replaceChildren();for(const b of batches.filter(b=>!old.has(b.id))){$('saved-sources').append(element('p',b.filename+' · 已保存 '+b.stats.total+' 条'+(b.stats.pending||b.stats.failed?' · '+(b.stats.pending+b.stats.failed)+' 条需补充':'')));}}
 function mappingUI(d,p){
  d.host.querySelector('.mapping')?.remove();const box=element('div');box.className='mapping';box.append(element('p','仅以下字段需要补充；原文未丢弃。'));
  for(const g of p.parsed.groups){const group=element('fieldset');group.append(element('legend',g.name));const map=p.mappings[g.name];const header=element('input');header.type='number';header.min=0;header.value=map.headerRow;header.setAttribute('aria-label',g.name+'表头行');header.oninput=()=>{map.headerRow=Number(header.value);map.allCells=false;d.mappings=p.mappings;prepared.delete(d);};group.append(element('p','表头行号'),header);
   const columns=[...new Set(g.rows.flatMap(r=>r.cells.map(c=>c.column)))];for(const [field,title]of [['text','内容/关键词列'],['title','评论标题列'],['body','评论正文列'],['product','产品标识列']]){const label=element('label',title),select=element('select');select.append(new Option('未指定',''));for(const col of columns)select.append(new Option(col,col));select.value=map.fields[field]||'';select.onchange=()=>{map.fields[field]=select.value;map.allCells=false;d.mappings=p.mappings;prepared.delete(d);};label.append(select);group.append(label);}const sample=element('pre',g.rows.slice(0,3).map(r=>'第'+r.row+'行 '+r.cells.map(c=>c.column+': '+c.text).join(' | ')).join('\n'));group.append(sample);box.append(group);
  }d.host.append(box);
 }
 async function save(){
  if(saving)throw Error('正在保存，请稍候。');if(!store)throw Error('本地开发版尚未连接正式账号。');saving=true;const stamp=sessionEpoch;
  try{
   const task=await store.saveTask(input());history.replaceState(null,'','?task='+task.id);batches=await store.sources(task.id);
   if($('paste').value.trim()){
    const content=$('paste').value,kind=$('paste-kind').value,product=$('paste-product').value;
    const key='paste:'+kind+':'+product+':'+content;
    if(!descriptors.some(d=>d.pasteKey===key)){const d={file:new File([content],'粘贴-'+I.kinds[kind]+'.txt',{type:'text/plain'}),kind,product,pasted:true,pasteKey:key,host:element('div')};$('file-list').append(d.host);descriptors.push(d);}
   }
   for(const d of descriptors){
    let p=prepared.get(d);const context=JSON.stringify([task.id,task.asin,d.kind,d.product,d.mappings]);
    if(!p||p.context!==context){p=await I.prepare(d,task,batches);p.context=context;prepared.set(d,p);}
    if(!p.ready){mappingUI(d,p);throw Error(d.file.name+'：'+p.issues.join('；'));}
    await store.saveSource(p);if(stamp!==sessionEpoch)throw Error('登录状态已变化。');
    if(!batches.some(b=>b.id===(p.duplicate?.id||p.id)))batches.push({id:p.id,kind:p.parsed.kind,filename:d.file.name,raw_sha256:p.parsed.digest,interpretation_sha256:p.interpretation,stats:p.counts,records:p.records});
    d.host.querySelector('.import-status')?.remove();const status=element('p',p.duplicate?'相同资料已保存，本次不重复导入。':'已保存 '+p.counts.total+' 条'+(p.issues.length?'，其中 '+p.issues.length+' 条需补充：'+p.issues.slice(0,3).map(x=>(x.source?.sheet||'')+' '+(x.source?.row||'')+' '+x.reason).join('；'):''));status.className='import-status';d.host.append(status);
   }
   await store.saveWriting($('instructions').value);showSaved();say('资料已保存。'+(batches.some(b=>b.stats.pending||b.stats.failed)?'存在需补充的记录，请先处理提示。':''));return {task,batches};
  }finally{saving=false;}
 }
 async function list(){const tasks=await store.list();$('task-list').replaceChildren();for(const t of tasks){const b=element('button',t.product_name+' · '+t.qa_count+'组');b.onclick=()=>open(t.id).catch(e=>say(e.message));$('task-list').append(b);}}
 async function open(id){const data=await store.open(id);$('product').value=data.task.product_name;$('asin').value=data.task.asin||'';$('quantity').value=data.task.qa_count;$('instructions').value=data.instructions;batches=data.batches;descriptors=[];prepared.clear();$('files').value='';$('paste').value='';$('file-list').replaceChildren();showSaved();history.replaceState(null,'','?task='+id);$('result-screen').hidden=true;$('input-screen').hidden=false;if(data.state?.draft)window.QASimple.show({metadata:{product:data.task.product_name,quantity:data.task.qa_count},state:data.state});}
 async function attach(client,user){
  const leave=()=>{sessionEpoch++;store=null;batches=[];prepared.clear();descriptors=[];document.querySelector('main').hidden=true;location.replace('/?next='+encodeURIComponent('QA/'));};
  store=window.QATaskAdapter.create(client,user,{onExpired:leave});await store.guard();
  client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id&&session.user.id!==user.id)leave();});
  $('logout').hidden=false;$('logout').onclick=async()=>{await client.auth.signOut();leave();};$('save-input').hidden=false;$('save-input').onclick=()=>save().catch(e=>say(e.message));$('tasks-area').hidden=false;
  $('new-task').onclick=()=>{store.newTask();batches=[];descriptors=[];prepared.clear();for(const id of ['product','asin','paste','instructions','files'])$(id).value='';$('quantity').value='5';$('file-list').replaceChildren();showSaved();history.replaceState(null,'',location.pathname);};
  const flow=window.QAFlowAdapter.create(client,user,()=>store.guard());
  window.QASimple.connect({saveEdit:(state,item)=>store.saveEdit(state,item),hasSources:()=>batches.length>0,generate:async(_,progress)=>{const {task,batches}=await save();const fingerprint=JSON.stringify([task.id,task.product_name,task.asin,task.qa_count,batches.map(b=>b.id),$('instructions').value]);return flow.generate(task,fingerprint,progress);}});
  await list();const id=new URLSearchParams(location.search).get('task');if(id)await open(id);
 }
 window.QAWorkspace={attach,save};
 window.addEventListener('pagehide',()=>{document.querySelector('main').hidden=true;});
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 // Same-origin shared login only when deployed at the confirmed QA URL.
 if(location.hostname==='xmgeen.com'){
  document.querySelector('main').hidden=true;
  const script=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('共享登录资源加载失败。'));document.head.append(s);});
  (async()=>{await script('/assets/vendor/supabase.js');await script('/assets/config.js');const c=window.APP_CONFIG;const client=window.supabase.createClient(c.supabaseUrl,c.publishableKey,{auth:{storageKey:'keyword-battle-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data,error}=await client.auth.getUser();if(error||!data.user){const id=new URLSearchParams(location.search).get('task');location.replace('/?next='+encodeURIComponent('QA/'+(/^[0-9a-f-]{36}$/.test(id||'')?'?task='+id:'')));return;}await attach(client,data.user);document.querySelector('main').hidden=false;})().catch(e=>{document.querySelector('main').hidden=false;say(e.message);});
 }
})();
