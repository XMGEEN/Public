const messages={FLOW_AUTH_REQUIRED:'等待分项预算授权，尚未调用付费接口。',FLOW_INTERPRETATION_DISABLED:'等待解读预算授权与工人启用。',FLOW_PROVIDER_FAILED:'接口调用失败，已暂停，请核对回执。',FLOW_UNSETTLED_CHARGE:'接口扣费尚未确认，已暂停。',FLOW_CHILD_TRAFFIC_INCOMPLETE:'子体流量缺失，已暂停，未计算不完整父体占比。',FLOW_LARGE_FAMILY:'子体数量超过授权范围，已暂停。',FLOW_MIXED_RELATION:'父子关系含混合类型，需核对广告样本。',FLOW_INTERPRETATION_PAUSED:'解读处理已暂停，请核对失败原因。',FLOW_KEYWORDS_REQUIRED:'请先补充任务搜索词。',FLOW_INPUT_STALE:'任务资料已修改，需要按当前资料重新处理。'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function flowNotice(flow,phase,ready=false){
 if(ready)return '';
 let text;
 if(!flow)text='后续自动流程待接入，尚未开始调用。';
 else if(flow.status==='paused')text=messages[flow.error_code]||'后续处理已暂停，请核对预算或失败回执。';
 else if(phase==='interpretation'&&flow.phase!=='interpretation')text='搜索与广告数据完成后，自动生成解读。';
 else if(flow.status==='waiting_budget')text=messages[flow.error_code]||messages.FLOW_AUTH_REQUIRED;
 else text=phase==='interpretation'?'正在准备或生成AI解读…':'正在获取搜索趋势与广告流量…';
 return `<p class="section-note report-flow-status" role="status">${esc(text)}</p>`;
}
export const flowActive=flow=>!!flow&&['queued','running','waiting_budget'].includes(flow.status);

// Independently show already settled search evidence while advertisements run.
export function searchFromReceipts(calls,task){
 const countries=[];
 for(const site of task.input.sites){
  const search=[];
  for(const keyword of site.keywords){
   const points=new Map();let conflict=false;
   for(const call of calls){
    if(call.task_id!==task.id||call.tool!=='get_keyword_aba_trends'||call.state!=='succeeded'||call.actual_credits===null||call.actual_credits>call.reserved_credits)continue;
    for(const e of call.receipt?.data?.entities||[]){
     if(e.country!==site.country||e.searchTerm!==keyword)continue;
     for(const row of e.trends||[]){
      const start=row.reportFromDate,end=row.reportToDate;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||new Date(start+'T00:00:00Z').getUTCDay()!==0||(Date.parse(end)-Date.parse(start))/86400000!==6)continue;
      const number=x=>x===null||x===undefined||typeof x==='boolean'||!Number.isFinite(Number(x))||Number(x)<0?null:Number(x);
      const point={start,end,search_volume:number(row.weeklySearchVolume),aba_rank:number(row.searchFrequencyRank)};
      if(points.has(start)&&JSON.stringify(points.get(start))!==JSON.stringify(point)){conflict=true;continue;}
      points.set(start,point);
     }
    }
   }
   const weeks=[...points.values()].sort((a,b)=>a.start.localeCompare(b.start));
   if(conflict||!weeks.length)continue;
   const gaps=[];for(let i=1;i<weeks.length;i++)if((Date.parse(weeks[i].start)-Date.parse(weeks[i-1].start))/86400000!==7)gaps.push([weeks[i-1].end,weeks[i].start]);
   search.push({country:site.country,keyword,weeks,coverage:{start:weeks[0].start,end:weeks.at(-1).end,weeks:weeks.length,gaps},notices:[]});
  }
  if(search.length)countries.push({country:site.country,search,parents:[]});
 }
 return countries.length?{countries}:null;
}
