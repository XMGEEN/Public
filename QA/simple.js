'use strict';
(()=>{
 const $=id=>document.getElementById(id),R=window.QAResultCore;
 let adapter=null,state=null,metadata=null;
 const notify=text=>$('notice').textContent=text;
 function selected(){return state?R.select(state,$('include-edited').checked):[];}
 function download(bytes,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([bytes],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function copy(rows){if(!rows.length)return notify('没有可复制的内容。');try{await navigator.clipboard.writeText(R.plain(rows,$('language').value==='both'));notify('已复制 '+rows.length+' 组 QA。');}catch{notify('浏览器未允许复制，请下载纯文本。');}}
 const button=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.onclick=fn;return b;};
 function render(){
  $('input-screen').hidden=true;$('result-screen').hidden=false;$('result-title').textContent=metadata.product;
  const items=R.items(state);$('counts').textContent='目标 '+metadata.quantity+' 组 · 实际 '+items.filter(x=>x.answer.en.trim()&&x.answer.zh.trim()).length+' 组 · 可用 '+items.filter(x=>x.normal).length+' 组';
  $('edited-option').hidden=!items.some(x=>x.optional);$('export-range').textContent='当前复制 / 下载范围：'+selected().length+' 组'+($('include-edited').checked?'（含已修改、未复查内容）':'（检查完成且无明确问题）');
  $('cards').replaceChildren();
  items.forEach((item,i)=>{
   const card=document.createElement('article');card.className='card';
   const title=document.createElement('h2');title.textContent=String(i+1).padStart(2,'0')+' · '+item.question.en;card.append(title);
   for(const [text,cls] of [[item.answer.en,''],[item.question.zh,'zh'],[item.answer.zh,'zh']]){const p=document.createElement('p');p.textContent=text;p.className=cls;card.append(p);}
   if(!item.normal){const p=document.createElement('p');p.className='issue';p.textContent=item.status+(item.messages.length?'：'+item.messages.join('；'):'');card.append(p);}
   const actions=document.createElement('div');actions.className='actions';actions.append(button('编辑',()=>edit(card,item)));if(item.normal||item.optional)actions.append(button('复制本条',()=>item.optional&&!confirm('这条已修改，未重新检查事实。继续复制？')?null:copy([item])));card.append(actions);$('cards').append(card);
  });
 }
 function edit(card,item){
  if(card.querySelector('form'))return;const form=document.createElement('form');form.className='edit-form';const fields={};
  for(const [key,title]of [['question.en','英文问题'],['answer.en','英文答案'],['question.zh','中文问题'],['answer.zh','中文答案']]){const label=document.createElement('label');label.textContent=title;const t=document.createElement('textarea'),[a,b]=key.split('.');t.value=item[a][b];t.rows=a==='answer'?4:2;fields[key]=t;label.append(t);form.append(label);}
  const save=document.createElement('button');save.textContent='保存';save.className='primary';form.append(save);
  form.onsubmit=async e=>{e.preventDefault();const edited={id:item.id,question:{en:fields['question.en'].value,zh:fields['question.zh'].value},answer:{en:fields['answer.en'].value,zh:fields['answer.zh'].value}};const check=R.basic(edited,state.settings);if(check.errors.length)return notify(check.errors.join('；'));save.disabled=true;
   try{state=await adapter.saveEdit(state,edited);render();notify('已保存；未调用模型重新检查事实。');}catch(e){notify(e.message||'保存失败，原结果保留。');}finally{save.disabled=false;}};card.append(form);
 }
 $('files').onchange=()=>{$('file-list').replaceChildren();for(const file of $('files').files){const p=document.createElement('p');p.className='file-row';p.textContent=file.name+(file.size>10*1024*1024?' · 超过 10 MB，请拆分':' · 已选择，尚未上传');$('file-list').append(p);}};
 $('generate').onclick=async()=>{
  if(!adapter)return notify('本地界面已就绪，正式生成接口正在接入；没有提交任务或调用模型。');
  if(!$('product').value.trim()||(!$('files').files.length&&!$('paste').value.trim()&&!adapter.hasSources?.()))return notify('请填写产品名称，并上传或粘贴资料。');
  if([...$('files').files].some(f=>f.size>10*1024*1024))return notify('有文件超过 10 MB，请先拆分。');
  $('generate').disabled=true;try{const result=await adapter.generate({product:$('product').value.trim(),quantity:Number($('quantity').value),files:[...$('files').files],paste:$('paste').value,instructions:$('instructions').value},notify);if(result){metadata=result.metadata;state=result.state;render();}}catch(e){notify(e.message||'生成失败，已有结果保留。');}finally{$('generate').disabled=false;}
 };
 $('back').onclick=()=>{$('result-screen').hidden=true;$('input-screen').hidden=false;};$('include-edited').onchange=render;$('copy').onclick=()=>copy(selected());
 $('excel').onclick=()=>{const rows=selected();if(!rows.length)return notify('没有符合当前范围的内容。');download(R.excel(rows),'QA.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');};
 $('text').onclick=()=>{const rows=selected();if(!rows.length)return notify('没有符合当前范围的内容。');download(R.plain(rows,$('language').value==='both'),'QA.txt','text/plain;charset=utf-8');};
 // Injected adapter must own auth, fee authorization, durable save, and revision checks.
 // Disconnected local previews never fall back to fabricated results.
 window.QASimple={connect(value){adapter=value;},show(result){metadata=result.metadata;state=result.state;render();}};
})();
