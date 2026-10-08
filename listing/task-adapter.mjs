// Uses the shared authenticated Supabase client; never accepts a service key.
export const LIMITS={fileBytes:30*1024*1024,totalBytes:200*1024*1024,files:40};
const TYPES={voc:['xlsx','csv'],reviews:['xlsx','csv'],keywords:['xlsx','csv'],product:['xlsx','csv'],copy:['docx','pdf','txt'],images:['png','jpg','jpeg','webp']};
const MIME={xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pdf:'application/pdf',txt:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
export function asins(value=''){
 const values=[...new Set(value.trim().toUpperCase().split(/\s+/).filter(Boolean))];
 if(values.some(x=>!/^[A-Z0-9]{10}$/.test(x)))throw Error('请检查ASIN格式，多个ASIN用空格分隔。');
 return values;
}
export function validateFile(kind,file){
 const ext=file.name.split('.').pop().toLowerCase();
 if(!TYPES[kind]?.includes(ext)||file.size<1||file.size>LIMITS.fileBytes||file.name.length>240)throw Error('文件类型、名称或大小不符合要求（每个文件最多30MB）。');
 return ext;
}
export async function sha256(data){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function createTaskAdapter(client){
 const busy=new Map();
 async function guard(){const {data,error}=await client.auth.getUser();if(error||!data?.user)throw Error('登录已失效，请重新登录。');return data.user;}
 async function rpc(name,args){await guard();const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message?.startsWith('LISTING_')?error.message:'操作未完成，请重试同一次提交。');return data;}
 async function create({id,name,input}){return rpc('listing_create_task',{p_id:id,p_name:name,p_input:input});}
 async function list(page=0){await guard();const r=await client.from('listing_task_progress').select('id,name,status,workflow_status,workflow_stage,revision,created_at,updated_at').order('updated_at',{ascending:false}).order('id').range(page*10,page*10+9);if(r.error)throw Error('任务列表读取失败。');return r.data;}
 async function open(id){await guard();const r=await client.from('listing_task_progress').select('*').eq('id',id).single();if(r.error)throw Error('任务不存在或无权访问。');return r.data;}
 async function sources(id){await guard();const r=await client.from('listing_sources').select('*').eq('task_id',id).order('created_at').order('id');if(r.error)throw Error('资料列表读取失败。');return r.data;}
 async function upload(taskId,kind,file){
  const ext=validateFile(kind,file),hash=await sha256(await file.arrayBuffer());
  const key=taskId+':'+kind+':'+hash;if(busy.has(key))return busy.get(key);
  const work=(async()=>{
   const s=await rpc('listing_reserve_source',{p_task:taskId,p_id:crypto.randomUUID(),p_kind:kind,p_filename:file.name,p_bytes:file.size,p_sha256:hash});
   if(s.status==='uploaded')return s;
   const bucket=client.storage.from('keyword-battle-inbox');
   const uploaded=await bucket.upload(s.raw_path,file,{upsert:false,contentType:MIME[ext]});
   if(uploaded.error){
    // A timed-out upload may already exist. Verify bytes before recovering.
    const prior=await bucket.download(s.raw_path);
    if(prior.error||prior.data.size!==file.size||await sha256(await prior.data.arrayBuffer())!==hash)throw Error('原件上传未完成，请重试；不会覆盖已有文件。');
   }
   return rpc('listing_finish_source',{p_source:s.id});
  })();busy.set(key,work);
  try{return await work;}finally{busy.delete(key);}
 }
 async function submit(id){const t=await open(id);return rpc('listing_submit_task',{p_task:id,p_revision:t.revision});}
 return {create,list,open,sources,upload,submit};
}
