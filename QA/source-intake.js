/* Structural import only. Never evaluates instructions, formulas or remote links. */
(()=>{'use strict';
 const kinds={product:'产品资料',insight:'消费者洞察',keywords:'关键词',own_reviews:'自家评论',competitor_reviews:'竞品评论'};
 function suggest(name){
  if(/竞品.*评论|competitor.*review/i.test(name))return 'competitor_reviews';
  if(/自家.*评论|我们.*评论|own.*review/i.test(name))return 'own_reviews';
  if(/洞察|VOC|insight/i.test(name))return 'insight';
  if(/关键词|keyword/i.test(name))return 'keywords';
  if(/产品参数|产品说明|product.*spec/i.test(name))return 'product';
  return '';
 }
 async function prepare({file,kind,product,relation,pasted=false,mappings},task,existing=[]){
  if(!kinds[kind])throw Error(file.name+'：请选择资料分类。');
  const parsed=await window.QAParser.parse(file,kind,pasted);
  const maps=mappings||Object.fromEntries(parsed.groups.map(g=>[g.name,window.QAParser.propose(g,kind)]));
  const ownership={product:product||(['product','own_reviews','keywords'].includes(kind)?task.asin||task.id:''),relation:relation||(['product','own_reviews','keywords'].includes(kind)?'own':kind==='competitor_reviews'?'competitor':'mixed'),confirmOwn:false};
  const mappingIssues=[];
  for(const g of parsed.groups){if(g.mode==='table'&&['own_reviews','competitor_reviews','keywords'].includes(kind)&&maps[g.name].allCells)mappingIssues.push(g.name+'：未识别内容列，请指定表头和对应列。');}
  if(mappingIssues.length)return {file,parsed,mappings:maps,ownership,issues:mappingIssues,ready:false};
  const normalized=await window.QAParser.normalize(parsed,maps,ownership,task,existing);
  // VOC/insight is a mixed-product reference, not capability proof. Keep all source labels.
  if(kind==='insight'){
   for(const r of normalized.records){if(r.state==='pending'&&r.reasons.length===1&&r.reasons[0]==='产品归属待确认'&&r.relation==='mixed'){
    r.product_ref=r.product_ref||'mixed';r.state='success';r.reasons=[];
   }}
   normalized.counts.pending=normalized.records.filter(r=>r.state==='pending').length;
   normalized.counts.success=normalized.records.filter(r=>r.state==='success').length;
  }
  const issues=normalized.records.filter(r=>r.state!=='success').map(r=>({source:r.source,reason:r.reasons.join('；')}));
  const interpretation=await window.QAParser.sha(new TextEncoder().encode(JSON.stringify({kind,mappings:maps,ownership})));
  const duplicate=existing.find(b=>b.kind===kind&&b.raw_sha256===parsed.digest&&b.interpretation_sha256===interpretation);
  return {file,parsed,mappings:maps,ownership,...normalized,interpretation,issues,duplicate,ready:true,id:crypto.randomUUID()};
 }
 window.QASourceIntake={kinds,suggest,prepare};
})();
