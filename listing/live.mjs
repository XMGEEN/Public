import {mountResearch} from './live-research.mjs?v=20261007-6';
import {mountCards} from './live-cards.mjs?v=20261008-3';
import {mountBullets} from './live-bullets.mjs?v=20261008-9';
import {createTaskAdapter,asins,validateFile,LIMITS} from './task-adapter.mjs?v=20261008-9';
import {renderForm} from './live-form.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Keep the live tool navigation here; the explicit demo link stays unchanged.
const listingNav=document.querySelector('#tool-navigation a[href="/listing/"]');
if(listingNav)listingNav.href='/listing/#home';
const C=window.APP_CONFIG,client=window.supabase.createClient(C.supabaseUrl,C.publishableKey,{auth:{storageKey:'keyword-battle-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}),api=createTaskAdapter(client);
let files={},page=0,busy=false,pending=null,epoch=0,pendingKey='';
const state=s=>({generated:'已生成',copy_update_required:'文案待更新',research_update_required:'研究待更新',keywords_pending:'关键词待处理',cards_pending:'卡片待推导',draft:'待提交',submitted:'已提交 · 等待处理',processing:'进行中',awaiting_input:'待补充',awaiting_cards:'待确认',ready:'待生成',generating:'生成中',completed:'已完成',failed:'处理失败'}[s]||s);
function error(e){const box=$('#form-error')||$('#page-error');if(box)box.textContent=e.message;}
async function history(){const rows=await api.list(page);if(!$('#history-body'))return;$('#history-body').innerHTML=rows.map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(t.workflow_stage||"资料提交")}</td><td>${esc(state(t.workflow_status||t.status))}</td><td>${esc(new Date(t.created_at).toLocaleString())}</td><td><a href="#task/${t.id}">进入任务 →</a></td></tr>`).join('')||'<tr><td colspan="5">暂无真实任务</td></tr>';$('#next').disabled=rows.length<10;$('#prev').disabled=page===0;}
async function render(){const stamp=++epoch;const {data,error:e}=await client.auth.getUser();if(stamp!==epoch)return;
 if(e||!data.user){$('#account').textContent='尚未登录工作台账号';$('#app').innerHTML='<section class="panel"><h1>请先登录工作台</h1><p>Supabase控制台登录与工作台用户登录不同。此页面复用工作台已有账号及会话。</p><p>请先登录工作台，登录后将返回当前Listing页面。</p><a href="/?next='+encodeURIComponent('listing/'+location.hash)+'">打开共享登录页</a> <button id="retry">登录后刷新</button></section>';$('#retry').onclick=()=>render();return;}
 $('#account').textContent='已登录 · '+data.user.email;
 pendingKey='listing-pending-submit-'+data.user.id;
 const [route,id]=location.hash.slice(1).split('/');
 const view=route||'home';
 if(view==='home'){
  files={};try{pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null')}catch{pending=null}renderForm({$,esc,renderHistory:()=>{},tasks:[]});
  if(pending){$('#task-name').value=pending.name;for(const [field,key] of [['product-text','product_text'],['own-asin','own_asin'],['position','position'],['support','support'],['preferences','preferences']])$('#'+field).value=pending.input[key]||'';$('#asins').value=pending.input.competitor_asins.join(' ');$('#form-error').textContent='发现未完成提交，请重新选择原文件后重试，将复用同一任务。';}
  $('#history-search').remove();$('#app .panel:last-child .panel-head').innerHTML='<h2>历史任务</h2><div><button id="prev">上一页</button><button id="refresh">刷新状态</button><button id="next">下一页</button></div>';
  const action=$('#submit-form .actions');action.querySelector('span').textContent='文件上传到私有收件桶；提交后等待工人，不自动调用模型。';action.querySelector('button').textContent='提交资料 →';
  $('#refresh').onclick=()=>history().catch(error);$('#prev').onclick=()=>{page--;history().catch(error)};$('#next').onclick=()=>{page++;history().catch(error)};
  await history();return;
 }
 if(!['task','points','title','bullets','description','images'].includes(view)||!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){
  $('#app').innerHTML='<section class="panel"><h2>任务链接不完整</h2><a href="#home">返回资料提交与历史任务</a></section>';return;
 }
 let t,sources;try{[t,sources]=await Promise.all([api.open(id),api.sources(id)])}catch(e){if(stamp===epoch)$('#app').innerHTML='<section class="panel"><h2>无法打开此任务</h2><p>'+esc(e.message)+'</p><a href="#home">返回资料提交与历史任务</a></section>';return;}if(stamp!==epoch)return;
 const modules=[['points','卖点推导'],['title','标题'],['bullets','五点'],['description','描述'],['images','图片方案']];
 $('#app').innerHTML=`<div class="crumb"><a href="#home">Listing生成</a> / ${esc(t.name)}</div><div class="lead"><h1>${esc(t.name)}</h1><span class="badge">${esc(state(t.workflow_status||t.status))}</span></div><p id="page-error" class="error"></p><div class="info">资料已保存在真实任务中。研究与卡片进度请查看卖点推导模块；文案生成与报告请进入五点模块。</div>${view==='task'?`<div class="modules">${modules.map(([key,label])=>`<a class="module" href="#${key}/${t.id}"><h2>${label}</h2><p>${['title','description','images'].includes(key)?'暂未开放':key==='points'?'查看参数问题与卖点卡片':'查看文案与生成状态'}</p></a>`).join('')}</div>`:'<section class="panel"><h2>'+esc(modules.find(x=>x[0]===view)?.[1]||'任务')+'</h2><p>暂无生成结果。</p><a href="#task/'+t.id+'">返回任务</a></section>'}<section class="panel"><h2>已提交资料 · ${sources.length} 份</h2>${sources.map(s=>`<p>${esc(s.filename)} <span class="badge">${s.status==='uploaded'?'已上传':'上传待完成'}</span></p>`).join('')}<button id="refresh-task">刷新状态</button></section>`;
 if(view==='points'){
  const panel=$('#app section.panel');
  panel.innerHTML='<h2>卖点推导</h2><div class="tabs" role="tablist" aria-label="卖点推导板块"><button type="button" id="points-questions-tab" role="tab" aria-selected="true" aria-controls="questions-pane" class="active">参数问题汇总</button><button type="button" id="points-cards-tab" role="tab" aria-selected="false" aria-controls="cards-pane">卖点卡片</button></div><div id="questions-pane" role="tabpanel" aria-labelledby="points-questions-tab"><div id="research-content">正在读取研究结果…</div></div><div id="cards-pane" role="tabpanel" aria-labelledby="points-cards-tab" hidden><details id="cards-research"><summary>产品研究与资料缺口</summary></details><section id="cards-content">正在读取卡片…</section></div>';
  const switchTab=cards=>{panel.querySelector('#questions-pane').hidden=cards;panel.querySelector('#cards-pane').hidden=!cards;for(const [key,on] of [['questions',!cards],['cards',cards]]){const b=panel.querySelector('#points-'+key+'-tab');b.setAttribute('aria-selected',String(on));b.classList.toggle('active',on);}};
  panel.querySelector('#points-questions-tab').onclick=()=>switchTab(false);
  panel.querySelector('#points-cards-tab').onclick=()=>switchTab(true);
  await mountResearch({client,taskId:id,container:$('#research-content'),isCurrent:()=>stamp===epoch});
  if(stamp!==epoch)return;
  panel.querySelector('#research-content .tabs')?.remove();
  const summary=panel.querySelector('#research-summary');
  if(summary){summary.hidden=false;summary.querySelector('p').textContent='产品研究摘要与来源缺口，供核对卡片依据。';panel.querySelector('#cards-research').append(summary);}
  else panel.querySelector('#cards-research').hidden=true;
  await mountCards({client,taskId:id,taskName:t.name,container:$('#cards-content'),isCurrent:()=>stamp===epoch});
 }
 if(view==='bullets')await mountBullets({client,taskId:id,taskName:t.name,container:$('#app section.panel'),isCurrent:()=>stamp===epoch});
 $('#refresh-task').onclick=()=>render().catch(error);
}
document.addEventListener('change',e=>{const kind=e.target.dataset.file;if(!kind)return;try{const selected=[...e.target.files];selected.forEach(f=>validateFile(kind,f));const all=[...Object.values(files).flat(),...selected];if(all.length>LIMITS.files||all.reduce((n,f)=>n+f.size,0)>LIMITS.totalBytes)throw Error('每个任务最多40份文件，总量200MB。');files[kind]=[...(files[kind]||[]),...selected];$('#files-'+kind).innerHTML=files[kind].map((f,i)=>`<p>${esc(f.name)} <button type="button" data-remove="${kind}:${i}">移除</button></p>`).join('')}catch(err){error(err)}e.target.value='';});
document.addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b||busy)return;const[k,i]=b.dataset.remove.split(':');files[k].splice(Number(i),1);b.parentElement.remove();$('#files-'+k).querySelectorAll('[data-remove]').forEach((n,i)=>n.dataset.remove=k+':'+i);});
document.addEventListener('submit',async e=>{if(e.target.id!=='submit-form')return;e.preventDefault();if(busy)return;try{
 const list=Object.entries(files).flatMap(([kind,v])=>v.map(file=>({kind,file})));if(list.length>40||list.reduce((s,x)=>s+x.file.size,0)>LIMITS.totalBytes)throw Error('资料超过任务上传上限。');
 const input={market:'US',language:'en',product_text:$('#product-text').value,competitor_asins:asins($('#asins').value),own_asin:asins($('#own-asin').value).join(''),position:$('#position').value,support:$('#support').value,preferences:$('#preferences').value};
 if(!input.product_text.trim()&&!list.some(x=>['product','copy','images'].includes(x.kind)))throw Error('请填写产品信息或选择产品文件。');
 const name=$('#task-name').value.trim();if(!pending)pending={id:crypto.randomUUID(),name,input};if(JSON.stringify({name,input})!==JSON.stringify({name:pending.name,input:pending.input}))throw Error('本次任务已开始保存，请先恢复原输入并重试，避免创建重复任务。');
 sessionStorage.setItem(pendingKey,JSON.stringify(pending));busy=true;$('#submit-form').querySelectorAll('input,textarea,button').forEach(x=>x.disabled=true);
 await api.create(pending);for(const x of list){$('#form-error').textContent='正在上传：'+x.file.name;await api.upload(pending.id,x.kind,x.file)}await api.submit(pending.id);sessionStorage.removeItem(pendingKey);location.hash='task/'+pending.id;
 }catch(err){error(err)}finally{busy=false;$('#submit-form')?.querySelectorAll('input,textarea,button').forEach(x=>x.disabled=false)}});
window.addEventListener('hashchange',()=>{if(!busy)render().catch(error)});
render().catch(e=>{$('#app').textContent='读取失败：'+e.message;});
