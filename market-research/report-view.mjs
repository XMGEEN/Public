import {frozenReport} from './statistics-view.mjs';
export async function mountReport(root,task,client,alive){
 root.innerHTML='<p role="status">正在读取报告…</p>';
 const urls=[];const cleanup=()=>urls.forEach(url=>URL.revokeObjectURL(url));
 try{
  const r=await client.from('market_exports').select('snapshot').eq('task_id',task.id).eq('status','succeeded').order('created_at',{ascending:false}).limit(1);
  if(r.error)throw r.error;if(!alive())return;
  if(!r.data?.length){root.textContent='尚未生成报告，请返回任务下载报告后查看。';return;}
  const data=r.data[0].snapshot,images={};
  for(const country of data.statistics.snapshot.countries){
   const imported=data.imports.find(x=>x.country===country.country);
   if(!imported?.image_prefix)continue;
   const files=[...new Set(country.types.map(t=>country.rows.find(x=>x.id===t.representative_id)?.images?.[0]?.file).filter(Boolean))];
   await Promise.all(files.map(async file=>{
    const d=await client.storage.from('market-research-inbox').download(imported.image_prefix+file);
    if(d.error)return;const url=URL.createObjectURL(d.data);urls.push(url);images[country.country+':'+file]=url;
   }));
  }
  if(!alive()){cleanup();return;}
  root.innerHTML=frozenReport(data,images);
  // Export bookkeeping is not an interpretation version in the reading interface.
  root.querySelectorAll('.print-country>h1+p').forEach(el=>el.remove());
  root.dataset.reportLoaded='true';
  window.addEventListener('pagehide',cleanup,{once:true});window.addEventListener('hashchange',cleanup,{once:true});
 }catch{cleanup();if(alive())root.textContent='报告暂时无法读取，请刷新重试。';}
}
