import {escapeText as e} from './live-research.mjs?v=20261007-6';
export const fields={name:'卖点名称',support:'卖点支撑',audience:'主要人群',need:'核心需求',pain:'痛点',detail:'使用细节',mechanism:'作用机制',benefit:'核心利益',expression:'表达连接',priority_reason:'优先级理由',evidence_status:'证据状态',quantification:'量化机会',limits:'限制',merge_relation:'合并与保留关系'};
export function cardsCsv(bundle){
 const keys=['id','priority',...Object.keys(fields),'proposed_roots','fact_ids','need_ids','evidence_ids'];
 const labels=['编号','优先级',...Object.values(fields),'拟议关键词词根','事实编号','需求编号','证据与来源'];
 const quote=v=>{let s=Array.isArray(v)?v.join('；'):String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\ufeff'+[labels,...bundle.cards.map((c,i)=>keys.map(k=>k==='id'?'C'+(i+1):k==='evidence_ids'?c[k].map(id=>{const x=bundle.evidence.find(v=>v.id===id);return `${id}: ${x?.source} / ${x?.location}`;}):c[k]))].map(row=>row.map(quote).join(',')).join('\r\n');
}
export function cardsFilename(taskName,now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 const name=String(taskName||'未命名任务').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim();
 return `${name}卖点推导${parts.year}.${parts.month}.${parts.day}.csv`;
}
export async function mountCards({client,taskId,taskName,container,isCurrent=()=>true}){
 const [a,b,r]=await Promise.all([client.from('listing_cards').select('*').eq('task_id',taskId).maybeSingle(),client.from('listing_card_jobs').select('id,status,error_code').eq('task_id',taskId).order('created_at',{ascending:false}).limit(1),client.from('listing_research').select('*').eq('task_id',taskId).maybeSingle()]);
 if(!isCurrent())return;
 if(a.error||b.error||r.error){container.textContent='卡片读取失败，请刷新重试。';return;}
 let current=a.data;const job=b.data?.[0],research=r.data;
 const snap=research&&{question_revision:research.question_revision,answer_revision:research.answer_revision,answers:research.answers,summary:research.summary,questions:research.questions};
 const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const stale=current&&canonical(current.research_snapshot)!==canonical(snap);
 const running=['queued','running'].includes(job?.status);
 const status=running?'推导进行中':stale?'资料已变化，需更新卡片':current?.confirmed_revision===current?.revision&&current?'已确认':current?'待人工确认':job?.status==='failed'?'推导暂停，需核查后恢复':'尚未生成';
 container.innerHTML=`<div class="panel-head"><h2>细致卖点卡片大全</h2><span class="badge">${e(status)}</span></div><p>覆盖全部细致卖点；关键词词根为拟议，尚未执行关键词筛选。</p><div class="actions"><span id="cards-note"></span><button id="cards-generate">${current?'按最新研究更新卡片':'生成卖点卡片'}</button><button id="cards-download">下载全部卖点(CSV)</button><button id="cards-confirm">确认当前卡片</button></div><div id="cards-list"></div>`;
 const note=container.querySelector('#cards-note'),generate=container.querySelector('#cards-generate'),confirm=container.querySelector('#cards-confirm'),download=container.querySelector('#cards-download');
 generate.disabled=running||job?.status==='failed'||!!(current&&!stale)||research?.status!=='answers_saved';
 confirm.disabled=!current||stale||running||current.confirmed_revision===current.revision;download.disabled=!current;
 generate.onclick=async()=>{generate.disabled=true;try{const {error}=await client.rpc('listing_request_cards',{p_task:taskId,p_revision:current?.revision||0});if(error)throw error;note.textContent='已提交给工人，稍后刷新查看；页面关闭不影响处理。';}catch{note.textContent='提交未成功，请刷新核对；不会自动重复调用。';}};
 confirm.onclick=async()=>{confirm.disabled=true;try{const {data,error}=await client.rpc('listing_confirm_cards',{p_task:taskId,p_revision:current.revision});if(error)throw error;current=data;note.textContent='当前卡片已确认。本操作不生成五点。';}catch{note.textContent='确认失败，资料或修订可能已变化，请刷新核对。';}};
 download.onclick=()=>{const url=URL.createObjectURL(new Blob([cardsCsv(current.current_bundle)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=cardsFilename(taskName);link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if(!current)return;
 const list=container.querySelector('#cards-list');
 function draw(){list.innerHTML=current.current_bundle.cards.map((c,i)=>`<article class="panel"><div class="panel-head"><h3>C${i+1} · ${e(c.name)}</h3><span>${e(c.priority)}</span><button data-edit="${i}" ${stale||running?'disabled':''}>编辑卡片</button></div>${Object.entries(fields).filter(([k])=>k!=='name').map(([k,label])=>`<p><strong>${label}：</strong>${e(c[k])}</p>`).join('')}<p>拟议关键词词根：${e(c.proposed_roots.join('、'))}</p><details><summary>依据来源</summary>${c.evidence_ids.map(id=>{const src=current.current_bundle.evidence.find(x=>x.id===id);return `<p>${e(id)} · ${e(src?.source)} · ${e(src?.location)} · ${e(src?.type)}</p>`;}).join('')}</details><div data-editor="${i}"></div></article>`).join('');
 for(const btn of list.querySelectorAll('[data-edit]'))btn.onclick=()=>{const i=Number(btn.dataset.edit),card=current.current_bundle.cards[i],box=list.querySelector(`[data-editor="${i}"]`);confirm.disabled=true;btn.disabled=true;
 box.innerHTML=Object.entries(fields).map(([k,label])=>`<label>${label}<textarea data-field="${k}" rows="3">${e(card[k])}</textarea></label>`).join('')+`<label>优先级<select data-field="priority">${['P0','P1','P2','P3'].map(p=>`<option ${p===card.priority?'selected':''}>${p}</option>`).join('')}</select></label><label>拟议关键词词根（逗号分隔）<input data-field="proposed_roots" value="${e(card.proposed_roots.join(', '))}"></label><button data-save>保存卡片</button><button data-cancel>取消</button>`;
 box.querySelector('[data-cancel]').onclick=()=>{draw();confirm.disabled=current.confirmed_revision===current.revision;};
 box.querySelector('[data-save]').onclick=async()=>{const next=structuredClone(current.current_bundle);for(const el of box.querySelectorAll('[data-field]'))next.cards[i][el.dataset.field]=el.dataset.field==='proposed_roots'?el.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean):el.value;
 const save=box.querySelector('[data-save]');save.disabled=true;try{const {data,error}=await client.rpc('listing_save_cards',{p_task:taskId,p_revision:current.revision,p_bundle:next});if(error)throw error;current=data;draw();confirm.disabled=false;note.textContent='已保存，需重新确认；原始证据保留。';}catch{note.textContent='保存失败，输入保留。请核对是否有其他页面或研究更新。';save.disabled=false;}};
 };}draw();
}
