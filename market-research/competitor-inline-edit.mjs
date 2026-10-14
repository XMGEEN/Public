// Persistence is injected by the versioned owner-authorized API. No local
// simulation is mounted on the business page as if it were server persistence.
export function bindInlineText(element,{context,value,revision,save,draftStore=globalThis.sessionStorage,onSaved=()=>{}}){
 const keys=['owner','task','country','type','source','result','field'];
 if(keys.some(k=>typeof context?.[k]!=='string'||!context[k]))throw Error('EDIT_CONTEXT_REQUIRED');
 if(typeof save!=='function'||!Number.isSafeInteger(revision)||revision<0)throw Error('EDIT_SAVE_REQUIRED');
 const bound=Object.freeze(Object.fromEntries(keys.map(k=>[k,context[k]])));
 const storageKey='competitor-text-draft:'+JSON.stringify(bound);
 let committed=String(value??''),currentRevision=revision,editing=false,pending=false,disposed=false,blocked=false;
 const status=document.createElement('small');status.setAttribute('role','status');status.style.cssText='display:block;min-height:1.6em;line-height:1.6;font-size:12px;color:#62718c';
 element.after(status);element.tabIndex=0;element.title='双击编辑，离开编辑区域自动保存';element.textContent=committed;
 const announce=text=>{if(!disposed)status.textContent=text;};
 const sync=()=>{element.dataset.editRevision=String(currentRevision);element.dataset.editResult=bound.result;element.dataset.editField=bound.field;element.dataset.autosave=pending?'saving':blocked?'failed':element.textContent!==committed?'dirty':'saved';};
 function storeDraft(text){try{draftStore?.setItem(storageKey,JSON.stringify({text,revision:currentRevision}));}catch{announce('未保存；本地暂存不可用，请保留当前页面。');}}
 try{const draft=JSON.parse(draftStore?.getItem(storageKey)||'null');if(draft){element.textContent=String(draft.text);blocked=draft.revision!==currentRevision;announce(blocked?'版本已更新；保留待保存文本，请核对后继续。':'有上次未保存的文本，双击后离开可重试。');}}catch{}
 sync();
 async function finish(){
  if(!editing||pending||disposed)return;
  editing=false;element.contentEditable='false';const text=element.textContent;
  if(text===committed){try{draftStore?.removeItem(storageKey)}catch{}announce('');sync();return;}
  storeDraft(text);
  if(blocked){announce('权限或版本已变化，暂时停止写入；待保存文本已保留。');sync();return;}
  pending=true;sync();announce('保存中…');
  try{
   const result=await save({context:bound,text,expectedRevision:currentRevision});
   if(!result||!Number.isSafeInteger(result.revision)||result.revision<=currentRevision||result.text!==text)throw Error('SAVE_UNCONFIRMED');
   committed=text;currentRevision=result.revision;try{draftStore?.removeItem(storageKey)}catch{}
   if(!disposed){announce('已保存');onSaved(result);}
  }catch(error){
   const code=String(error?.code||error?.message||'');
   blocked=/CONFLICT|STALE|ACCESS|SESSION|PERMISSION/.test(code);
   announce(blocked?'权限或版本已变化，保存失败；待保存文本已保留。':'保存失败；待保存文本已保留，双击后离开可重试。');
  }finally{pending=false;sync();}
 }
 function start(){if(disposed||pending||blocked)return;editing=true;element.contentEditable='true';element.focus({preventScroll:true});announce('编辑中');}
 function input(){if(editing){storeDraft(element.textContent);sync();}}
 function focusout(e){if(!element.contains(e.relatedTarget))void finish();}
 function paste(e){if(!editing)return;e.preventDefault();const text=e.clipboardData?.getData('text/plain')||'';const selection=getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0);if(!element.contains(range.commonAncestorContainer))return;range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);input();}
 element.addEventListener('dblclick',start);element.addEventListener('input',input);element.addEventListener('mouseleave',finish);element.addEventListener('focusout',focusout);element.addEventListener('paste',paste);
 element.addEventListener('competitor-export-flush',finish);
 return ()=>{if(disposed)return;void finish();disposed=true;element.contentEditable='false';element.removeEventListener('dblclick',start);element.removeEventListener('input',input);element.removeEventListener('mouseleave',finish);element.removeEventListener('focusout',focusout);element.removeEventListener('paste',paste);element.removeEventListener('competitor-export-flush',finish);status.remove();};
}
