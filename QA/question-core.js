(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)),fail=m=>{throw Error(m);};
function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
const clean=x=>String(x||'').trim(),id=()=>globalThis.crypto.randomUUID();
function contextKey(c){return canonical({task:c.task_id,product:c.product,variant:c.variant,fact_version:c.fact_version,rule_version:c.rule_version,facts:c.facts,rules:c.rules,target:c.target,sources:c.sources});}
function validContext(c){if(!c||!c.task_id||!c.product||!c.variant||!Number.isSafeInteger(c.target)||c.target<1||!c.fact_version||!c.rule_version||!c.confirmed||!Array.isArray(c.facts)||!Array.isArray(c.sources))fail('请先完成当前产品的事实和规则确认');}
function blank(c,simulation=false){validContext(c);return {schema_version:1,task_id:c.task_id,product:c.product,variant:c.variant,simulation,revision:0,context_key:contextKey(c),fact_version:c.fact_version,rule_version:c.rule_version,target:c.target,questions:[],confirmation:null,needs_recheck:false};}
function norm(x){return clean(x).normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,'');}
function duplicates(items){const seen=new Map(),pairs=[];for(const q of items){for(const lang of ['en','zh']){const key=lang+':'+norm(q.content[lang]);if(key.endsWith(':'))continue;if(seen.has(key)&&seen.get(key)!==q.id)pairs.push([seen.get(key),q.id]);else seen.set(key,q.id);}}return [...new Map(pairs.map(p=>[p.join(':'),p])).values()];}
function usable(c,fid){return c.facts.find(f=>f.id===fid&&f.status==='已确认'&&f.current!==false&&f.product===c.product&&(f.variant===c.variant||f.variant==='通用'));}
function assessment(q,c,a){
 const pending=missing=>({status:'待补资料',missing});
 if(!a||canonical(a.content)!==canonical(q.content))return pending('新增或修改后需检查问题及事实是否足够');
 if(a.sufficient!==true)return pending(clean(a.missing)||'现有事实不足以回答此问题');
 if(!Array.isArray(a.fact_ids)||!a.fact_ids.length||!Array.isArray(q.facts)||!q.facts.length)return pending('缺少直接支持答案的已确认事实');
 if(canonical([...a.fact_ids].sort())!==canonical(q.facts.map(f=>f.id).sort()))return pending('检查结果与引用事实不一致');
 for(const ref of q.facts){const f=usable(c,ref.id);if(!f)return pending('引用事实未确认、已失效或不属于当前产品');if(clean(ref.conditions)!==clean(f.conditions))return pending('需要保留事实的完整适用条件');}
 if(!clean(a.reason))return pending('缺少依据充分性说明，不能仅凭有关联参数判为可回答');
 return {status:'可回答',missing:''};
}
function candidate(raw,c,a){
 if(!raw||!clean(raw.content?.en)||!clean(raw.content?.zh))fail('问题需提供英文及中文对照');
 if(!Array.isArray(raw.reason?.sources)||!clean(raw.reason?.text))fail('请提供简短来源或推荐理由');
 for(const ref of raw.reason.sources){if(ref.type==='用户新增'){if(ref.id!==null)fail('用户新增问题不能伪造资料来源编号');continue;}const src=c.sources.find(x=>x.id===ref.id);if(!src||src.type!==ref.type)fail('问题来源编号或自家/竞品归属不匹配');}
 if(!Array.isArray(raw.facts))fail('相关事实格式不正确');
 const q={id:id(),content:{en:clean(raw.content.en),zh:clean(raw.content.zh)},reason:clone(raw.reason),facts:clone(raw.facts),answerability:null,selected:false};
 q.answerability=assessment(q,c,a);return q;
}
function fresh(s,c){validContext(c);if(s.task_id!==c.task_id)fail('问题清单不属于本任务');return s.context_key===contextKey(c);}
function replace(input,raw,c,{allowReplace=false,assessments=[]}={}){
 validContext(c);if(input.questions.length&&!allowReplace)fail('重新生成将替换当前列表，请先确认');if(input.task_id!==c.task_id)fail('问题清单不属于本任务');if(!Array.isArray(raw)||!raw.length)fail('未获得有效问题，原列表保留');if(raw.length>c.target*2)fail('候选数量超过本次约定上限，原列表保留');
 const questions=raw.map((q,i)=>candidate(q,c,assessments[i]));if(duplicates(questions).length)fail('候选存在明显重复，原列表保留');
 const s=blank(c,input.simulation);s.revision=input.revision+1;s.questions=questions;let count=0;for(const q of questions)if(q.answerability.status==='可回答'&&count++<c.target)q.selected=true;return s;
}
function change(input,fn){const s=clone(input);fn(s);s.revision++;s.confirmation=null;return s;}
function edit(input,qid,content){return change(input,s=>{const q=s.questions.find(x=>x.id===qid);if(!q)fail('问题不存在');if(!clean(content.en)||!clean(content.zh))fail('请填写英文问题及中文对照');q.content={en:clean(content.en),zh:clean(content.zh)};q.facts=[];q.answerability={status:'待补资料',missing:'问题已修改，需重新检查相关事实与明显重复'};});}
function add(input,content,c){return change(input,s=>{if(!fresh(s,c))fail('事实或规则已更新，请先重新检查');s.questions.push(candidate({content,reason:{text:'用户手动新增，待检查依据',sources:[{type:'用户新增',id:null}]},facts:[]},c,null));});}
function select(input,qid,value){return change(input,s=>{const q=s.questions.find(x=>x.id===qid);if(!q)fail('问题不存在');q.selected=!!value;});}
function updateContext(input,c){validContext(c);if(input.task_id!==c.task_id)fail('问题清单不属于本任务');if(fresh(input,c))return clone(input);return change(input,s=>{s.needs_recheck=true;for(const q of s.questions)q.answerability={status:'待补资料',missing:'事实、规则或来源已变化，需要重新检查并确认选择'};});}
function recheck(input,c,results){validContext(c);if(input.task_id!==c.task_id)fail('问题清单不属于本任务');if(!Array.isArray(results)||results.length!==input.questions.length)fail('检查结果不完整，原清单保留');return change(input,s=>{for(const q of s.questions){const result=results.find(x=>x.id===q.id);if(!result||canonical(result.content)!==canonical(q.content))fail('检查结果对应的是旧问题，原清单保留');q.facts=clone(result.facts||[]);q.answerability=assessment(q,c,result);}s.context_key=contextKey(c);s.fact_version=c.fact_version;s.rule_version=c.rule_version;s.target=c.target;s.needs_recheck=false;});}
function counts(s){const selected=s.questions.filter(q=>q.selected);return {target:s.target,selected:selected.length,generatable:selected.filter(q=>q.answerability.status==='可回答').length};}
function confirm(input,c){if(!fresh(input,c)||input.needs_recheck)fail('事实或规则已更新，需重新检查');if(duplicates(input.questions).length)fail('问题存在明显重复，请修改后再确认');const n=counts(input);if(!n.selected)fail('请至少选择一个问题');if(!n.generatable)fail('选中问题均待补，尚不能交给答案生成');const out=clone(input);out.revision++;out.confirmation={at:new Date().toISOString(),revision:out.revision,fact_version:out.fact_version,rule_version:out.rule_version};return out;}
function bundle(s,c){const current=fresh(s,c)&&!s.needs_recheck,confirmed=!!s.confirmation&&current;const selected=s.questions.filter(q=>q.selected);return {'question_plan.json':{schema_version:1,task_id:s.task_id,simulation:s.simulation,revision:s.revision,fact_version:s.fact_version,rule_version:s.rule_version,questions:clone(s.questions)},'question_selection.json':{schema_version:1,task_id:s.task_id,simulation:s.simulation,revision:s.revision,fact_version:s.fact_version,rule_version:s.rule_version,confirmed,confirmation:confirmed?s.confirmation:null,selected:clone(selected),generatable_ids:confirmed?selected.filter(q=>q.answerability.status==='可回答').map(q=>q.id):[],pending:selected.filter(q=>q.answerability.status!=='可回答').map(q=>({id:q.id,missing:q.answerability.missing})),ready_for_stage5:confirmed&&!s.simulation&&selected.some(q=>q.answerability.status==='可回答')}};}
const api={blank,replace,edit,add,select,updateContext,recheck,confirm,counts,duplicates,bundle,contextKey};root.QAQuestionCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
