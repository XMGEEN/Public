(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x)),text=x=>typeof x==='string'&&x.trim().length>0;
function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x);}
function prepare(pack,plan,settings,ids){
 const c=pack.context,Q=root.QAQuestionCore||(typeof require==='function'?require('./question-core.cjs'):null);
 if(!plan||plan.simulation||!plan.confirmation||plan.needs_recheck||plan.context_key!==Q.contextKey(c)||plan.fact_version!==c.fact_version||plan.rule_version!==c.rule_version)throw Error('QA_ANSWER_CONTEXT_CHANGED:请先重新检查并确认问题、事实与规则');
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('QA_ANSWER_SELECTION_INVALID');
 const questions=ids.map(id=>plan.questions.find(q=>q.id===id&&q.selected&&q.answerability.status==='可回答'));
 if(questions.some(q=>!q))throw Error('QA_ANSWER_PENDING_EXCLUDED:待补或未选问题不能生成答案');
 for(const q of questions){if(!q.facts.length)throw Error('QA_ANSWER_FACT_REQUIRED');for(const ref of q.facts){const f=c.facts.find(f=>f.id===ref.id&&f.status==='已确认'&&f.current!==false&&f.product===c.product&&(f.variant===c.variant||f.variant==='通用'));if(!f||f.conditions!==ref.conditions)throw Error('QA_ANSWER_FACT_CHANGED:事实或适用条件已变化');}}
 // 问题关联事实是回答门槛；写作还可引用当前产品其他已确认事实来说明买家收益。
 const facts=copy(c.facts.filter(f=>f.status==='已确认'&&f.current!==false&&f.product===c.product&&(f.variant===c.variant||f.variant==='通用')));
 const sourceIds=new Set(facts.map(f=>f.source_id));
 return {answer_logic_version:'benefit-context-v2',task_id:c.task_id,product:c.product,variant:c.variant,plan_revision:plan.revision,fact_version:c.fact_version,rule_version:c.rule_version,context_key:plan.context_key,settings:copy(settings),rules:copy(c.rules),questions:copy(questions),facts,consumer_context:copy((pack.input.source_records||[]).filter(s=>['keywords','insight','own_reviews','competitor_reviews'].includes(s.kind))),product_sources:copy((pack.input.product_sources||[]).filter(s=>sourceIds.has(s.id))),pending:copy(plan.questions.filter(q=>q.selected&&q.answerability.status!=='可回答').map(q=>({id:q.id,question:q.content,missing:q.answerability.missing}))),deferred:copy(plan.questions.filter(q=>q.selected&&q.answerability.status==='可回答'&&!ids.includes(q.id)).map(q=>({id:q.id,question:q.content,reason:'未在本次生成范围'})))};
}
function words(s){return (s.match(/[A-Za-z0-9]+(?:['’.-][A-Za-z0-9]+)*/g)||[]).length;}
function evidenceWarnings(input,answer,factIds){
 const issues=[],both=answer.en+'\n'+answer.zh,cited=input.facts.filter(f=>factIds.includes(f.id));
 if(/\b(?:approved|certified|certification|accredited)\b|获准|获批|认证|通过审批/i.test(both)&&!cited.some(f=>/认证|批准|资质/.test(f.attribute)&&!/未|无|不/.test(String(f.value))))issues.push('认证或批准措辞缺少对应已确认依据；内部事实确认不能写成对外认证，请删除或补充依据');
 const unknownBox=input.facts.some(f=>/礼盒数量(?:原文)?未注明/.test(f.unit+'；'+f.conditions));
 if(unknownBox&&(/(?:\d+|[一二三四五六七八九十])\s*(?:个|只|套)?\s*(?:精装)?礼盒/.test(answer.zh)||/\b(?:\d+|a|an|one|two|three|four|five)\s+(?:premium\s+)?gift[ -]?box(?:es)?\b/i.test(answer.en)))issues.push('礼盒数量原文未注明，不能补为一个或其他数量；请写礼盒包装');
 const age=input.facts.find(f=>/适用年龄/.test(f.attribute)),range=age&&String(age.value).match(/(\d+)\s*[–—~～-]\s*(\d+)/);
 const enKids=/\b(?:kids?|children|child)\b/i.test(answer.en),zhKids=/儿童|孩童|孩子/.test(answer.zh);
 if(age&&(enKids||zhKids)){
  if(!factIds.includes(age.id))issues.push('答案涉及儿童人群，缺少适用年龄事实编号');
  if(range){const [_,low,high]=range,pattern=low+'\\s*(?:[–—~～-]|to|至|到)\\s*'+high;if((enKids&&!new RegExp(pattern,'i').test(answer.en))||(zhKids&&!new RegExp(pattern).test(answer.zh)))issues.push('涉及儿童人群时需保留已确认的'+low+'–'+high+'岁范围，中英文均需一致');}
 }
 return issues;
}
function parseGenerated(input,raw){
 if(!raw||!Array.isArray(raw.items))throw Error('QA_ANSWER_SCHEMA');
 const allowed=new Set(input.questions.map(q=>q.id)),counts=new Map();
 for(const item of raw.items){if(!allowed.has(item.id))throw Error('QA_ANSWER_UNEXPECTED_QUESTION:模型返回未请求的问题，旧草稿保留');counts.set(item.id,(counts.get(item.id)||0)+1);}
 return input.questions.map(q=>{
  const candidates=raw.items.filter(x=>x.id===q.id),x=candidates[0],issues=[],notes=[];
  const answer={en:typeof x?.answer?.en==='string'?x.answer.en.trim():'',zh:typeof x?.answer?.zh==='string'?x.answer.zh.trim():''};
  if(!x)issues.push('缺少该问题的答案');if(candidates.length>1)issues.push('同一问题返回了重复答案');
  const missing=typeof x?.missing==='string'?x.missing.trim():'';
  if((!text(answer.en)||!text(answer.zh))&&!missing)issues.push('英文或中文答案为空');
  const fact_ids=Array.isArray(x?.fact_ids)?x.fact_ids:[];
  if(!fact_ids.length&&!missing)issues.push('缺少事实编号');
  if(new Set(fact_ids).size!==fact_ids.length||fact_ids.some(id=>!input.facts.some(f=>f.id===id)))issues.push('引用事实不属于当前产品已确认依据');
  issues.push(...evidenceWarnings(input,answer,fact_ids));
  const n=words(answer.en),s=input.settings||{},unit=s.measure||'英文词数';
  const length=unit==='英文词数'?n:unit==='英文字符数'?answer.en.length:null;
  if(length===null)issues.push('长度计量方式尚不支持，请明确后再检查');
  else if(answer.en&&((Number.isFinite(s.answer_min)&&length<s.answer_min)||(Number.isFinite(s.answer_max)&&length>s.answer_max))){const warning=`英文答案长度${length}，设置范围${s.answer_min}–${s.answer_max}（${unit}）`;if((s.length_policy||'').includes('建议'))notes.push(warning+'；建议范围，简单回答可更短，交由人工判断');else issues.push(warning);}
  // 仅匹配明确逐字禁用清单；自然语言禁用要求交给内容检查，不臆造隐藏词表。
  for(const term of s.forbidden_literals||[]){if(text(term)&&(answer.en+'\n'+answer.zh).toLocaleLowerCase().includes(term.toLocaleLowerCase()))issues.push('包含明确禁用表达：'+term);}
  return {id:q.id,question:copy(q.content),answer,fact_ids:copy(fact_ids),basis:copy(input.facts.filter(f=>fact_ids.includes(f.id))),status:missing?'待补资料':'检查未完成',issues,notes,missing,content_checked:false,human_approved:false};
 });
}
function applyCheck(items,raw){
 if(!raw||!Array.isArray(raw.results)||raw.results.length!==items.length)throw Error('QA_ANSWER_CHECK_INCOMPLETE');
 const ids=raw.results.map(x=>x.id);if(new Set(ids).size!==items.length||items.some(x=>!ids.includes(x.id)))throw Error('QA_ANSWER_CHECK_MISMATCH');
 for(const item of items){const r=raw.results.find(x=>x.id===item.id);if(stable(r.answer)!==stable(item.answer)||!['待人工审核','需修改','待补资料'].includes(r.status)||!Array.isArray(r.issues)||r.issues.some(x=>!text(x))||typeof r.missing!=='string'||(r.status==='需修改'&&!r.issues.length)||(r.status==='待补资料'&&!text(r.missing)))throw Error('QA_ANSWER_CHECK_SCHEMA');}
 return items.map(item=>{const r=raw.results.find(x=>x.id===item.id),out=copy(item);out.content_checked=true;out.issues.push(...r.issues);out.missing=out.missing||r.missing;out.status=out.missing?'待补资料':out.issues.length?'需修改':r.status;return out;});
}
function draft(input,items,checkError=null){return {schema_version:1,answer_logic_version:input.answer_logic_version||'legacy',task_id:input.task_id,product:input.product,variant:input.variant,plan_revision:input.plan_revision,fact_version:input.fact_version,rule_version:input.rule_version,context_key:input.context_key,generated_at:new Date().toISOString(),requested:input.questions.length,actual:items.filter(x=>text(x.answer.en)&&text(x.answer.zh)).length,check_completed:!checkError,check_error:checkError,items:copy(items),pending:copy(input.pending),deferred:copy(input.deferred),human_approved:false,published:false};}
const api={prepare,parseGenerated,applyCheck,draft,words,stable};root.QAAnswerCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
