import {flushInterpretations,interpretationPending} from './interpretation-view.mjs?v=20261015-report-edit1';
export function mountExports(root,task,client,alive){
 root.querySelector('.export-download-status')?.remove();
 const buttons=[...root.querySelectorAll('[data-export-format]')];if(!buttons.length)return;
 const box=document.createElement('div');box.className='export-download-status';box.setAttribute('role','status');buttons[0].closest('.row').after(box);
 let busy=false;const pause=()=>new Promise(r=>setTimeout(r,1500));
 const one=async(table,id)=>{const r=await client.from(table).select('*').eq(table==='market_exports'?'id':'export_id',id).single();if(r.error)throw r.error;return r.data;};
 const ready=async()=>{if(!alive()||busy)return;try{const r=await client.from('market_interpretation_drafts').select('blocks').eq('task_id',task.id).limit(1);if(alive()&&!busy)buttons.forEach(b=>b.disabled=!!r.error||r.data?.[0]?.blocks?.length!==5);}catch{}};
 const links=async id=>{
  const request=await client.rpc('market_request_export_access',{p_export:id});if(request.error)throw request.error;
  for(let i=0;i<80&&alive();i++){const data=await one('market_export_access',id);if(data.status==='failed')throw Error('SIGN_FAILED');if(data.status==='ready'&&Date.parse(data.expires_at)>Date.now()+15000)return data.links;await pause();}
  throw Error('SIGN_PENDING');
 };
 const download=(data,format)=>{
  const file=data[format];if(!file)throw Error('FILE_NOT_READY');box.replaceChildren();
  const note=document.createElement('span');note.textContent='文件已生成，如未自动下载，请点击：';box.append(note);
  const a=document.createElement('a');a.href=file.url;a.textContent=format==='xlsx'?'下载Excel':'下载PDF';a.download=file.filename;a.rel='noopener';a.className='export-file-link';box.append(a);a.click();
 };
 for(const button of buttons)button.onclick=async()=>{
  if(busy||!alive())return;busy=true;buttons.forEach(b=>b.disabled=true);const format=button.dataset.exportFormat,label=format==='xlsx'?'Excel':'PDF';box.textContent='正在保存编辑并准备'+label+'…';
  try{
   root.querySelector('[contenteditable="true"]')?.blur();
   if(!await flushInterpretations()||interpretationPending())throw Error('EDIT_NOT_SAVED');if(!alive())return;
   const request=await client.rpc('market_request_export',{p_task:task.id});if(request.error)throw request.error;
   for(let i=0;i<400&&alive();i++){
    const data=await one('market_exports',request.data);
    if(data[format]?.status==='succeeded'){const access=await links(data.id);if(alive())download(access,format);return;}
    if(data.status==='failed'){box.textContent=label+'生成失败，请再次点击对应下载按钮重试。已完成的文件保留。';return;}
    box.textContent='正在准备'+label+'…';await pause();
   }
   if(alive())box.textContent=label+'仍在后台生成，请稍后点击对应按钮查看。';
  }catch(e){if(alive())box.textContent=e.message==='EDIT_NOT_SAVED'?'结论尚未保存，请先在解读区重试保存，再下载。':'下载未完成，请稍后重试。已完成文件会保留。';}
  finally{busy=false;if(alive())ready();}
 };
 ready();const timer=setInterval(()=>{if(!alive()){clearInterval(timer);return;}ready();},5000);
}
