export function mountExports(root,task,client,alive){
 const button=root.querySelector('#export-download');if(!button)return;
 const box=document.createElement('div');box.className='export-download-status';box.setAttribute('role','status');button.parentElement.after(box);
 let busy=false;
 const pause=()=>new Promise(r=>setTimeout(r,1500));
 const one=async(table,id)=>{const r=await client.from(table).select('*').eq(table==='market_exports'?'id':'export_id',id).single();if(r.error)throw r.error;return r.data;};
 const ready=async()=>{if(!alive()||busy)return;try{const r=await client.from('market_interpretation_drafts').select('blocks').eq('task_id',task.id).limit(1);if(alive())button.disabled=!!r.error||r.data?.[0]?.blocks?.length!==5;}catch{}};
 const links=async id=>{
  const request=await client.rpc('market_request_export_access',{p_export:id});if(request.error)throw request.error;
  for(let i=0;i<80&&alive();i++){const data=await one('market_export_access',id);if(data.status==='failed')throw Error('SIGN_FAILED');if(data.status==='ready'&&Date.parse(data.expires_at)>Date.now()+15000)return data.links;await pause();}
  throw Error('SIGN_PENDING');
 };
 const showLinks=data=>{
  box.replaceChildren();const note=document.createElement('p');note.textContent='文件已生成。如浏览器拦截双下载，请分别点击下方链接。链接有效期10分钟，可再次点击下载报告刷新。';box.append(note);
  for(const format of ['xlsx','pdf'])if(data[format]){const a=document.createElement('a');a.href=data[format].url;a.textContent=format==='xlsx'?'下载Excel':'下载PDF';a.download=data[format].filename;a.rel='noopener';a.className='export-file-link';box.append(a);const frame=document.createElement('iframe');frame.hidden=true;frame.setAttribute('aria-hidden','true');frame.src=a.href;box.append(frame);}
 };
 button.onclick=async()=>{
  if(busy||!alive())return;busy=true;button.disabled=true;box.textContent='正在准备当前报告的Excel和PDF…';
  try{
   root.querySelector('[contenteditable="true"]')?.blur();
   while(alive()&&root.querySelector('[data-autosave="saving"]'))await pause();
   if(!alive()||root.querySelector('[data-autosave="failed"]'))throw Error('EDIT_NOT_SAVED');
   const request=await client.rpc('market_request_export',{p_task:task.id});if(request.error)throw request.error;
   for(let i=0;i<400&&alive();i++){
    const data=await one('market_exports',request.data);
    if(data.status==='succeeded'){showLinks(await links(data.id));return;}
    if(data.status==='failed'){
     if(data.xlsx.status==='succeeded'||data.pdf.status==='succeeded')showLinks(await links(data.id));
     const note=document.createElement('p');note.textContent='部分文件生成失败，再点“下载报告”只重试失败文件。';box.append(note);return;
    }
    await pause();
   }
   if(alive())box.textContent='生成仍在后台继续，请稍后再点下载报告查看；重复点击不会重复生成已完成文件。';
  }catch{if(alive())box.textContent='下载未完成，请稍后重试。已完成文件会保留。';}
  finally{busy=false;if(alive())ready();}
 };
 ready();const timer=setInterval(()=>{if(!alive()){clearInterval(timer);return;}ready();},5000);
}
