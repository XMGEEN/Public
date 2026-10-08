export function generationError(code,detail){
 if(code==='LISTING_BULLETS_ALREADY_CURRENT')code='ALREADY_CURRENT';
 const inputErrors={LISTING_SESSION_REQUIRED:'登录已失效，请重新登录。',LISTING_CONFIRMED_CARDS_REQUIRED:'请先保存并确认最新卖点卡片。',LISTING_CARDS_INPUT_STALE:'补问资料已更新，请先更新并确认卖点卡片。',LISTING_KEYWORDS_REQUIRED:'请先完成最新关键词处理。',LISTING_KEYWORD_SOURCES_CHANGED:'关键词资料已更新，请先重新处理关键词。',LISTING_BULLETS_REVISION_CONFLICT:'文案已更新，请刷新页面后重试。'};
 if(inputErrors[code])return inputErrors[code];
 if(code==='WORKFLOW_BUDGET_INSUFFICIENT'&&detail){
  const scope=detail.scope==='task'?'任务累计':'本段';
  const labels={calls:['调用次数','次'],input:['输入额度',' token'],output:['输出额度',' token'],yuan:['费用额度','元']};
  const [label,unit]=labels[detail.dimension]||['额度',''];
  const amount=x=>Number.isFinite(x)?String(Math.round(x*10000)/10000):'待核对';
  return `本次未启动模型调用：${scope}${label}不足。本轮需${amount(detail.required)}${unit}，剩余${amount(detail.remaining)}${unit}。`+(detail.dimension==='calls'?'':'按整轮保守预留计算。');
 }
 return {ALREADY_CURRENT:'当前文案已与最新卡片同步，无需重复生成。',KEYWORD_NONUSE_UNEXPLAINED:'有未覆盖关键词缺少说明，等待复核。',BULLETS_AUDIT_REVIEW_REQUIRED:'文案审核发现待处理问题。',INPUT_CHANGED:'生成期间资料有变更，请核对最新输入。',STAGE8_BUDGET_LIMIT:'本段调用次数、token或费用额度不足，需要核对本段用量。',REWRITE_BUDGET_LIMIT:'本次重生成额度不足，需要核对用量。',BUDGET_LIMIT:'任务累计额度不足，需要核对总用量。',WORKFLOW_INPUT_REASSESS_REQUIRED:'实际请求超过本轮预留范围，已停止后续调用，需要重新核对输入量。',WORKFLOW_BUDGET_INSUFFICIENT:'整轮生成额度不足，本次未启动模型调用。'}[code]||'生成未完成，请查看任务复核记录。';
}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=x=>/^[\s]*[=+@-]|^[\t\r\n]/.test(x)?"'"+x:x;
export function downloadCsv(name,result){
 const status={complete_phrase:'完整短语',variant:'词形变体',roots_only:'仅词根出现',not_covered:'未覆盖'};
 const describe=s=>'实际词根频次：'+Object.entries(s.root_frequency).filter(([,v])=>v).map(([k,v])=>k+' '+v+'次').join('；')+'\n'+s.keywords.map(k=>(result.keyword_labels?.[k.id]||k.id)+'：'+status[k.status]+'（原词 '+k.exact_count+'，变体 '+k.variant_count+'）').join('\n');
 const rows=[['中文','英文','关键词统计','卖点推导过程'],...result.bullets.map((b,i)=>[b.chinese_title+'\n'+b.chinese_body,b.english_title+'\n'+b.english_body,describe(result.statistics.rows[i]),b.rationale.replace(/\bC\d+\b/g,id=>result.card_display_labels?.[id]||id)])];
 const csv='\ufeff'+rows.map(r=>r.map(x=>'"'+safe(String(x)).replaceAll('"','""')+'"').join(',')).join('\r\n');
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','.');
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=(name+'五点文案'+date+'.csv').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function mountBullets({client,taskId,taskName,container,isCurrent}){
 let current,cards,keywords,job,loading=false,reportPath='';
 container.innerHTML='<h2>五点文案</h2><div class="panel-head"><div><h3>生成文案</h3><small>下载后自行挑选与修改</small></div><div class="actions"><button id="bullets-generate">按最新卡片重新生成</button><button id="bullets-download" disabled>下载(CSV)</button></div></div><p id="bullets-status" role="status"></p><div id="bullets-report"></div>';
 const $=s=>container.querySelector(s),message=x=>{$('#bullets-status').textContent=x};
 async function row(table){const {data,error}=await client.from(table).select('*').eq('task_id',taskId).maybeSingle();if(error)throw error;return data;}
 async function report(){
  if(!current||reportPath===current.report_file_path)return;
  const {data,error}=await client.rpc('listing_request_report',{p_task:taskId});if(error)throw error;
  const access=Array.isArray(data)?data[0]:data;
  if(access.status==='failed')throw Error('报告读取授权失败，请刷新重试。');
  if(access.status!=='ready'){$('#bullets-report').textContent='正在获取私有报告…';return;}
  const url=new URL(access.signed_url);
  if(url.origin!=='https://xmgeen-tools-123.oss-cn-shenzhen.aliyuncs.com'||url.pathname!=='/'+current.report_file_path)throw Error('报告地址不匹配。');
  const response=location.origin==='http://127.0.0.1:8766'?await fetch('/listing/report-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:access.signed_url})}):await fetch(access.signed_url,{cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('报告读取失败，请刷新重试。');
  const html=await response.text();if(!isCurrent())return;
  const frame=document.createElement('iframe');frame.title='五点文案报告';frame.setAttribute('sandbox','allow-scripts allow-downloads');frame.referrerPolicy='no-referrer';frame.style.cssText='width:100%;height:1050px;border:0';
  frame.srcdoc=html.replace('<body>','<body class="embedded">');$('#bullets-report').replaceChildren(frame);reportPath=current.report_file_path;
 }
 async function load(){
  if(loading||!isCurrent())return;loading=true;
  try{
   const values=await Promise.all([row('listing_bullets'),row('listing_cards'),row('listing_keywords'),client.from('listing_bullet_jobs').select('status,error_code,result').eq('task_id',taskId).order('created_at',{ascending:false}).limit(1)]);
   if(!isCurrent())return;[current,cards,keywords]=values;if(values[3].error)throw values[3].error;job=values[3].data?.[0];
   const running=['queued','running'].includes(job?.status),ready=cards&&cards.revision===cards.confirmed_revision&&keywords;
   $('#bullets-generate').disabled=running||!ready;$('#bullets-generate').textContent=current?'按最新卡片重新生成':'生成五点文案';$('#bullets-download').disabled=!current;
   const stale=current&&(current.input_snapshot.cards.cards_revision!==cards?.revision||current.input_snapshot.keywords_revision!==keywords?.revision);
   const reason=generationError(job?.error_code,job?.result?.budget_preflight);
   message(running?(current?'正在生成与审核，原文案继续保留。':'正在生成与审核…'):job?.status==='failed'?'本次生成已停止。'+(current?'原文案已保留。':'尚无通过审核的文案。')+reason:stale?'卡片或关键词已更新，当前文案尚未同步；点击重新生成后更新。':current?'已生成 · 审核稿，待核验内容请确认后使用。':ready?'卡片和关键词已准备好。':'请先完成并确认卖点卡片与关键词处理。');
   await report();
  }catch(e){if(isCurrent())message(e.message)}finally{loading=false}
 }
 $('#bullets-download').onclick=()=>current&&downloadCsv(taskName,current.result);
 $('#bullets-generate').onclick=async()=>{
  $('#bullets-generate').disabled=true;
  try{const {error}=await client.rpc('listing_request_bullets',{p_task:taskId,p_cards_revision:cards.revision,p_keywords_revision:keywords.revision,p_revision:current?.revision||0});if(error)throw error;await load()}catch(e){message(generationError(e.message));$('#bullets-generate').disabled=false}
 };
 await load();
 const timer=setInterval(()=>{if(!isCurrent()){clearInterval(timer);return;}load()},5000);
}
