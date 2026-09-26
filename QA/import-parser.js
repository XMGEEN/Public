/* Pure structural parsing. No formula evaluation, scripts, external links or model calls. */
(() => {
'use strict';
const LIMIT={file:10*1024*1024,rows:10000,chars:100000};
const textDecoder=new TextDecoder('utf-8',{fatal:true});
const fail=message=>{throw Error(message);};
const xml=text=>{if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('不支持含外部实体的 XML；原文件未执行。');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)fail('文件内部 XML 格式错误。');return doc;};
const els=(root,name)=>Array.from(root.getElementsByTagNameNS('*',name));
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function unzip(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)fail('文件不是有效的 DOCX/XLSX 压缩文档。');
 const count=view.getUint16(end+10,true),start=view.getUint32(end+16,true);if(count===65535||view.getUint16(end+4,true)!==0)fail('不支持分卷或 ZIP64 文档。');
 const files=new Map();let at=start,total=0;
 for(let i=0;i<count;i++){
  if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)fail('压缩目录损坏。');
  const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),size=view.getUint32(at+20,true),plain=view.getUint32(at+24,true),nl=view.getUint16(at+28,true),ex=view.getUint16(at+30,true),cm=view.getUint16(at+32,true),offset=view.getUint32(at+42,true);
  const name=textDecoder.decode(bytes.slice(at+46,at+46+nl));if(flags&1)fail('不支持加密文件，请使用未加密副本。');if(files.has(name))fail('压缩文档存在重名条目。');
  total+=plain;if(total>64*1024*1024)fail('文档解压内容超过安全解析容量 64 MB，整批停止，请拆分文件。');
  files.set(name,{method,size,plain,offset});at+=46+nl+ex+cm;
 }
 async function read(name){const e=files.get(name);if(!e)fail('文件缺少内部结构：'+name);const o=e.offset;if(o+30>bytes.length||view.getUint32(o,true)!==0x04034b50)fail('压缩数据损坏。');const from=o+30+view.getUint16(o+26,true)+view.getUint16(o+28,true);if(from+e.size>bytes.length)fail('文件内容不完整。');const data=bytes.slice(from,from+e.size);let result;
  if(e.method===0)result=data;else if(e.method===8){const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const parts=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>e.plain||length>64*1024*1024){await reader.cancel();fail('解压长度异常，已停止。');}parts.push(value);}result=new Uint8Array(length);let at=0;for(const p of parts){result.set(p,at);at+=p.length;}}else fail('不支持该压缩方式。');
  if(result.length!==e.plain)fail('解压长度不一致，文件可能损坏。');return textDecoder.decode(result);
 }
 return {files,read};
}
function csv(text){
 const rows=[];let fields=[],value='',quoted=false,closed=false,line=1,start=1;
 const push=()=>{fields.push(value);rows.push({row:start,endRow:line,cells:fields.map((text,i)=>({column:String(i+1),text}))});fields=[];value='';closed=false;start=line+1;};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else{value+=c;if(c==='\n')line++;}continue;}
  if(c==='"'){if(value||closed)fail('CSV 第 '+line+' 行引号位置不正确。');quoted=true;}else if(c===','){fields.push(value);value='';closed=false;}else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;push();line++;}else{if(closed)fail('CSV 第 '+line+' 行引号后存在多余内容。');value+=c;}
 }
 if(quoted)fail('CSV 第 '+start+' 行开始的引号未闭合。');if(value||fields.length||closed)push();return rows;
}
function resolveTarget(base,target){if(target.startsWith('/'))return target.slice(1);const parts=(base+target).split('/'),out=[];for(const part of parts){if(part==='..')out.pop();else if(part!=='.')out.push(part);}return out.join('/');}
async function parse(file,kind,pasted=false){
 if(file.size===0)fail(file.name+'：空文件，未导入。');if(file.size>LIMIT.file)fail(file.name+'：文件超过 10 MB，整批停止。');
 const ext=file.name.split('.').pop().toLowerCase(),allowed=kind==='product'?['docx']:['xlsx','csv'];if(!pasted&&!allowed.includes(ext))fail(file.name+'：此分类支持 '+allowed.join('、')+' 或文本粘贴。');
 const buffer=await file.arrayBuffer(),digest=await sha(buffer);let groups=[],notes=[];
 if(pasted){const text=textDecoder.decode(buffer);if(Array.from(text).length>LIMIT.chars)fail(file.name+'：粘贴超过 100000 字符，整批停止。');groups=[{name:'粘贴文本',mode:'paragraph',rows:text.split(/\r\n|\n|\r/).map((text,i)=>({row:i+1,cells:[{column:'text',text}]}))}];}
 else if(ext==='csv'){let text;try{text=textDecoder.decode(buffer).replace(/^\uFEFF/,'');}catch{fail(file.name+'：CSV 不是有效 UTF-8，请另存为 CSV UTF-8。');}groups=[{name:'CSV',mode:'table',rows:csv(text)}];}
 else{
  const z=await unzip(buffer);
  if(ext==='docx'){
   const document=xml(await z.read('word/document.xml'));groups=[{name:'文档正文',mode:'paragraph',rows:els(document,'p').map((p,i)=>({row:i+1,cells:[{column:'text',text:els(p,'t').map(t=>t.textContent).join('')}]}))}];
   for(const name of z.files.keys())if(/^word\/(header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/.test(name)){groups.push({name,mode:'paragraph',rows:els(xml(await z.read(name)),'p').map((p,i)=>({row:i+1,cells:[{column:'text',text:els(p,'t').map(t=>t.textContent).join('')}]}))});}
  }else{
   const strings=z.files.has('xl/sharedStrings.xml')?els(xml(await z.read('xl/sharedStrings.xml')),'si').map(x=>els(x,'t').map(t=>t.textContent).join('')):[];
   const relationships=new Map(els(xml(await z.read('xl/_rels/workbook.xml.rels')),'Relationship').map(x=>[x.getAttribute('Id'),x]));
   for(const sheet of els(xml(await z.read('xl/workbook.xml')),'sheet')){
    const rel=relationships.get(sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));if(!rel||rel.getAttribute('TargetMode')==='External')fail('工作表引用无效或指向外部，未读取。');
    const data=xml(await z.read(resolveTarget('xl/',rel.getAttribute('Target'))));const rows=els(data,'row').map(r=>({row:Number(r.getAttribute('r')),cells:els(r,'c').map(c=>{const ref=c.getAttribute('r'),type=c.getAttribute('t'),f=els(c,'f')[0],v=els(c,'v')[0]?.textContent||'';let text=type==='s'?strings[Number(v)]:type==='inlineStr'?els(c,'t').map(t=>t.textContent).join(''):v;if(text===undefined)fail('工作表 '+sheet.getAttribute('name')+' '+ref+' 的字符串索引无效。');return {column:ref.replace(/\d/g,''),text: f?'='+f.textContent:text,formula:Boolean(f)};})}));
    groups.push({name:sheet.getAttribute('name'),mode:'table',rows});if(sheet.getAttribute('state')&&sheet.getAttribute('state')!=='visible')notes.push('隐藏工作表“'+sheet.getAttribute('name')+'”也已读取。');
   }
  }
  const media=[...z.files.keys()].filter(n=>/\/(media|embeddings)\//.test(n));if(media.length)notes.push('含 '+media.length+' 个图片或嵌入文件：原件完整保留，本阶段不识别图片文字或执行嵌入内容。');
  notes.push('公式仅保留原始表达式，不计算；链接不访问，文件中的指令不执行。');
 }
 let blank=0;for(const g of groups){g.rows=g.rows.filter(r=>{const nonempty=r.cells.some(c=>c.text.trim());if(!nonempty)blank++;return nonempty;});}
 groups=groups.filter(g=>g.rows.length);if(!groups.length)fail(file.name+'：没有可导入的文字记录。');
 // Table headers count is excluded after field mapping; an absolute structural bound avoids truncation.
 if(groups.reduce((n,g)=>n+g.rows.length,0)>LIMIT.rows+groups.length)fail(file.name+'：记录超过 10000 条，整批停止。');
 return {name:file.name,kind,pasted,digest,groups,notes,blankRows:blank};
}
const aliases={text:['关键词','关键词 (数据来源于西柚洞察)','内容','文本','洞察','产品信息','参数值'],title:['评论标题','标题'],body:['评论内容','评论正文','正文'],product:['来源 ASIN','ASIN','产品归属','产品'],sourceId:['序号','编号','ID']};
function propose(group,kind){const rows=group.rows;let header=rows.find(r=>r.cells.some(c=>Object.values(aliases).flat().includes(c.text.trim())));if(kind==='insight'||group.mode==='paragraph')header=null;const map={headerRow:header?.row||0,allCells:!header,fields:{}};if(header)for(const [field,names]of Object.entries(aliases)){const c=header.cells.find(c=>names.includes(c.text.trim()));if(c)map.fields[field]=c.column;}return map;}
async function normalize(parsed,mappings,ownership,task,existing=[]){
 const records=[],issues=[],seen=new Map();let headerRows=0;
 for(const prior of existing){for(const r of prior.records||[])if(r.state==='success'&&r.product_ref&&r.signature&&!seen.has(r.signature))seen.set(r.signature,r.id);}
 for(const group of parsed.groups){const map=mappings[group.name];if(!map)fail('缺少工作表“'+group.name+'”的字段对应关系。');
  if(group.mode==='table'&&!map.allCells){if(!group.rows.some(r=>r.row===Number(map.headerRow)))fail(group.name+'：请选择有效表头行。');const needed=parsed.kind==='own_reviews'||parsed.kind==='competitor_reviews'?['title','body']:['text'];if(!needed.some(f=>map.fields[f]))fail(group.name+'：缺少内容字段对应关系，请指定。');}
  for(const row of group.rows){if(row.row===Number(map.headerRow)){headerRows++;continue;}
   const raw=Object.fromEntries(row.cells.map(c=>[c.column,c.text]));const get=field=>raw[map.fields[field]]||'';const value=map.allCells?row.cells.map(c=>c.text).join(' | '):[get('title'),get('body'),get('text')].filter(Boolean).join('\n');
   let product=get('product').trim()||ownership.product.trim(),relation=ownership.relation,state='success';const reasons=[];
   const review=['own_reviews','competitor_reviews'].includes(parsed.kind);
   if(review){relation=parsed.kind==='own_reviews'?'own':'competitor';if(!product&&relation==='own'&&ownership.confirmOwn)product=task.asin||'task:'+task.id;if(!product){state='pending';reasons.push('产品归属待确认');}if(product&&task.asin&&relation==='own'&&product.toUpperCase()!==task.asin){state='pending';reasons.push('自家评论的产品标识与任务 ASIN 不一致');}if(product&&task.asin&&relation==='competitor'&&product.toUpperCase()===task.asin){state='pending';reasons.push('竞品评论的产品标识与自家 ASIN 相同');}}
   else if(!product&&relation==='own'&&ownership.confirmOwn)product=task.asin||'task:'+task.id;
   if(!product||relation==='unconfirmed'){if(state!=='failed')state='pending';if(!reasons.includes('产品归属待确认'))reasons.push('产品归属待确认');}
   if(row.cells.some(c=>c.formula)){state='pending';reasons.push('含公式，已保留表达式但未计算，请核对原文');}
   if(!value.trim()){state='failed';reasons.push('内容为空或对应的列不存在');}
   if(review&&!map.allCells&&!get('body')&&get('title'))reasons.push('正文为空，仅保留已有标题');
   const normalized={text:value.trim(),title:get('title'),body:get('body'),source_id:get('sourceId')};
   const signature=await sha(new TextEncoder().encode(JSON.stringify([parsed.kind,relation,product,value.trim()])));const duplicate=state==='success'&&product?seen.get(signature)||null:null;
   const record={id:crypto.randomUUID(),source:{file:parsed.name,sheet:group.name,row:row.row,end_row:row.endRow||row.row,position:group.mode==='paragraph'?'paragraph':'row'},product_ref:product,relation,state,reasons,raw,normalized,signature,duplicate_of:duplicate};records.push(record);if(!duplicate&&state==='success'&&product)seen.set(signature,record.id);if(reasons.length)issues.push({record_id:record.id,sheet:group.name,row:row.row,state,reasons});
  }
 }
 if(records.length>LIMIT.rows)fail(parsed.name+'：记录超过 10000 条，整批停止。');if(!records.length)fail(parsed.name+'：只有表头，没有资料记录。');
 return {records,issues,counts:{total:records.length,success:records.filter(r=>r.state==='success').length,failed:records.filter(r=>r.state==='failed').length,pending:records.filter(r=>r.state==='pending').length,duplicates:records.filter(r=>r.duplicate_of).length,blank:parsed.blankRows,headers:headerRows}};
}
window.QAParser={LIMIT,parse,normalize,propose,sha,csv};
})();
