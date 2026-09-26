(function(root){
'use strict';
function build(task,review,batches){
 if(!review?.state||!review.files_ready)throw Error('请先保存事实与规则确认');
 const s=review.state,product=task.asin||task.id,replaced=new Set(batches.map(b=>b.replaces_id).filter(Boolean));
 const active=batches.filter(b=>!replaced.has(b.id)),ids=new Set(active.map(b=>b.id));
 if(s.product!==product||!s.facts_confirmation||!s.rules_confirmation)throw Error('请先完成当前产品的事实和规则确认');
 const facts=s.facts.filter(f=>f.status==='已确认'&&f.product===product&&(f.variant===s.variant||f.variant==='通用'));
 if(!facts.length)throw Error('没有当前产品的已确认事实');
 for(const f of facts){if(f.provided_by==='用户提供')continue;const source=s.sources.find(x=>x.id===f.source_id);if(!source||!ids.has(source.import_id)||source.version!==f.source_version)throw Error('产品资料已更新，请先重新核对事实');}
 if(s.rules.some(r=>r.status!=='已确认'&&r.status!=='暂不采用'))throw Error('写作规则尚未确认');
 if(s.settings.quantity!==task.qa_count)throw Error('目标组数已变更，请先同步并确认写作规则');
 const rows=kind=>active.filter(b=>b.kind===kind).flatMap(b=>b.records).filter(x=>x.state==='success'&&x.normalized?.text?.trim());
 const selected=[];for(const kind of ['keywords','own_reviews','competitor_reviews','insight']){const all=rows(kind);let chosen;if(kind==='competitor_reviews'){chosen=[...new Set(all.filter(x=>x.relation==='competitor').map(x=>x.product_ref))].sort().flatMap(product=>all.filter(x=>x.relation==='competitor'&&x.product_ref===product).slice(0,6));}else chosen=all.filter(x=>kind==='insight'||x.product_ref===product).slice(0,kind==='insight'?8:12);for(const x of chosen)selected.push({id:x.id,kind,product:x.product_ref,relation:x.relation,text:x.normalized.text});}
 const types={product:'产品资料',keywords:'关键词',own_reviews:'自家评论',competitor_reviews:'竞品评论',insight:'洞察'};
 const productSources=s.sources.filter(x=>facts.some(f=>f.source_id===x.id)).map(x=>({id:x.id,kind:'product',product:x.product,text:x.original}));
 const context={task_id:task.id,product,variant:s.variant,target:task.qa_count,fact_version:review.id,rule_version:review.id,confirmed:true,rules:s.rules.filter(r=>r.status==='已确认').map(r=>r.original),facts:facts.map(f=>({id:f.id,attribute:f.attribute,value:f.value,unit:f.unit,conditions:f.conditions,source_id:f.source_id,product:f.product,variant:f.variant,status:f.status,current:true})),sources:[...productSources,...selected].map(x=>({id:x.id,type:types[x.kind],product:x.product}))};
 return {context,input:{product,variant:s.variant,target:task.qa_count,candidate_max:task.qa_count*2,facts:context.facts,rules:context.rules,product_sources:productSources,source_records:selected,excluded:s.facts.filter(f=>f.status==='暂不采用').map(f=>f.attribute)},scope:{facts:facts.length,records:selected.length,product_records:productSources.length,selection:'按原表顺序取完整记录：自家评论12条，竞品每产品6条，关键词12条，洞察8条；不截断单条、不当作全量统计。'}};
}
const api={build};root.QAQuestionContext=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
