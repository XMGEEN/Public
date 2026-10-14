const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function editRevisions(root,result,fallback=[]){
 const revisions=new Map(fallback.filter(e=>!e.result_id||e.result_id===result).map(e=>[e.field_id,e.revision]));
 for(const el of root.querySelectorAll('[data-edit-result]'))if(el.dataset.editResult===result){const n=Number(el.dataset.editRevision);if(n>0)revisions.set(el.dataset.editField,n)}
 return [...revisions].sort(([a],[b])=>a<b?-1:a>b?1:0);
}
export async function finishEdits(root,alive=()=>true){
 for(const el of root.querySelectorAll('[data-autosave]'))el.dispatchEvent(new Event('competitor-export-flush'));
 for(let i=0;i<150&&root.querySelector('[data-autosave="saving"]');i++){if(!alive())throw Error('EXPORT_VIEW_CLOSED');await wait(200)}
 if(root.querySelector('[data-autosave="saving"]'))throw Error('EXPORT_STILL_SAVING');
 if(root.querySelector('[data-autosave="dirty"],[data-autosave="failed"]'))throw Error('EXPORT_UNSAVED_TEXT');
}
export function mountExports(root,{task,client,context,valid}){
 let disposed=false,busy=false;const alive=()=>!disposed&&valid();
 const box=root.querySelector('.competitor-export');box.innerHTML='<button data-export-format="xlsx">导出 Excel</button><button data-export-format="pdf">导出 PDF</button><span role="status" class="muted" data-export-status></span>';
 const message=box.querySelector('[data-export-status]');
 const say=t=>{if(alive())message.textContent=t};
 const rpc=async(name,args)=>{const {data,error}=await client.rpc('competitor_'+name,args);if(error)throw error;return data};
 const read=async(table,id,column='id')=>{const {data,error}=await client.from(table).select('*').eq(column,id).single();if(error)throw error;return data};
 const describe=e=>{
  const code=String(e?.message||e?.code||'');
  if(/UNSAVED/.test(code))return '有未保存或保存失败的文本，请保存成功后再导出。';
  if(/STILL_SAVING/.test(code))return '文本仍在保存，请稍后再导出。';
  if(/STALE|VIEW_LOADING/.test(code))return '页面数据尚未就绪或已更新，请刷新当前竞品页后再导出。';
  if(/SESSION|ACCESS/.test(code))return '登录已失效或没有导出权限，请重新登录。';
  if(/EMPTY/.test(code))return '当前类型暂无可导出的已保存内容。';
  if(/PGRST202|PGRST205|does not exist/.test(code))return '导出服务尚未接入。';
  if(/EXPORT_/.test(code))return '导出未完成（'+(code.match(/EXPORT_[A-Z_]+/)?.[0]||'EXPORT_FAILED')+'），已完成文件保留，可重试剩余部分。';
  return '暂时无法读取导出状态，请检查网络后重试；已提交的导出任务会继续处理。';
 };
 async function start(format){
  if(busy||!alive())return;busy=true;box.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   say('正在确认已保存内容…');await finishEdits(root,alive);if(!alive())return;
   let c=context();for(let i=0;i<50&&!c.development.loaded;i++){await wait(200);if(!alive())return;c=context()}
   if(!c.development.loaded||c.development.error||c.unavailable)throw Error('EXPORT_VIEW_LOADING');
   // A development refresh may have restored a draft while the first flush completed.
   await finishEdits(root,alive);if(!alive())return;c=context();
   const expected={input_revision:c.scope.input_revision,sample_version:c.scope.sample_version,tag_version:c.scope.tag_version,source_id:c.source?.id??null,insight_id:c.insight?.source_id??null,selling_result_id:c.selling?.id??null,development_result_id:c.development.record?.id??null,traffic_updated_at:c.traffic?.updated_at??null,cached_revision:c.traffic?.result?.parents?null:c.cache[0]?.revision??null,selling_edits:editRevisions(root,c.selling?.id,c.sellingEdits),development_edits:editRevisions(root,c.development.record?.id,c.development.edits)};
   expected.selling_updated_at=c.sellingOperation?.updated_at??null;expected.insight_updated_at=c.insightOperation?.updated_at??null;expected.development_updated_at=c.development.operation?.updated_at??null;
   const id=await rpc('request_export',{p_task:task.id,p_country:c.country,p_type:c.type,p_expected:expected});
   let job;
   for(let i=0;i<120;i++){
    if(!alive())return;job=await read('competitor_exports',id);
    const completed=['xlsx','pdf'].filter(k=>job[k]?.status==='succeeded').length;
    say(job.status==='queued'?'等待独立工人导出…':'已完成 '+completed+'/2 个文件…');
    if(['succeeded','partial','failed'].includes(job.status))break;
    await wait(2500);
   }
   if(!alive())return;
   if(!['succeeded','partial','failed'].includes(job.status)){say('导出仍在处理，稍后点击同一按钮可继续查看。');return}
   if(job[format]?.status!=='succeeded')throw Error(job[format]?.error_code||'EXPORT_PART_FAILED');
   say('正在获取下载地址…');await rpc('request_export_access',{p_export:id});
   for(let i=0;i<90;i++){
    if(!alive())return;const access=await read('competitor_export_access',id,'export_id');
    if(access.status==='failed')throw Error(access.error_code||'EXPORT_LINK_FAILED');
    if(access.status==='ready'&&access.links?.[format]&&Date.parse(access.expires_at)>Date.now()+30000){
     const link=access.links[format];if(!link.url.startsWith('https://xmgeen-tools-123.oss-cn-shenzhen.aliyuncs.com/competitor-analysis/'))throw Error('EXPORT_LINK_INVALID');
     message.replaceChildren(document.createTextNode(job.status==='partial'?'部分文件已完成 · ':''));const a=document.createElement('a');a.href=link.url;a.textContent='下载 '+(format==='xlsx'?'Excel':'PDF');a.download=link.filename;a.rel='noopener';message.append(a);a.click();return;
    }
    await wait(2000);
   }
   say('下载地址仍在准备，稍后再次点击可获取。');
  }catch(error){if(alive())say(describe(error))}finally{busy=false;if(alive())box.querySelectorAll('button').forEach(b=>b.disabled=false)}
 }
 for(const b of box.querySelectorAll('[data-export-format]'))b.onclick=()=>start(b.dataset.exportFormat);
 return ()=>{disposed=true;box.querySelectorAll('button').forEach(b=>b.onclick=null)};
}
