// Compact table presentation; existing review controls retain their handlers and values.
export function renderSampleTable(target,groups,country,loadImage){
 const cards=[...target.children],wrap=document.createElement('div'),table=document.createElement('table');
 wrap.className='table-wrap sample-table-scroll';wrap.setAttribute('tabindex','0');wrap.setAttribute('aria-label','父体样本表，可横向滚动');table.className='sample-table';
 const head=table.createTHead().insertRow();
 const date=country.baseline_date?.slice(0,7),month=date?new Date(date+'-01T00:00:00Z'):null;if(month)month.setUTCMonth(month.getUTCMonth()-1);
 const salesMonth=month&&!Number.isNaN(month.valueOf())?month.toISOString().slice(0,7):null;
 for(const text of ['图片','产品 / 父ASIN','保留 / 排除','来源 # / ASIN','品牌','价格 '+country.currency,(salesMonth||'参考月')+' 销量','AI建议','资料']){const th=document.createElement('th');th.scope='col';th.textContent=text;head.append(th);}
 cards.forEach((card,i)=>{
  const g=groups[i],source=g.members.find(r=>r.row_id===g.source_row),body=document.createElement('tbody');body.className='sample-group';body.dataset.group=String(i);body.dataset.groupId=g.id;
  const row=body.insertRow(),detail=body.insertRow();detail.className='sample-detail-row';detail.hidden=true;const content=detail.insertCell();content.colSpan=9;
  const image=row.insertCell();image.className='sample-thumb';image.textContent='—';if(source?.images?.length)loadImage(country.country,source.images[0].file,image);
  const product=row.insertCell();product.className='sample-product';const title=card.querySelector('.sample-title'),parent=document.createElement('small');parent.textContent=g.parent;product.append(title,parent);
  row.insertCell().append(card.querySelector('.sample-decision'));
  const origin=row.insertCell();origin.className='sample-origin';const number=document.createElement('strong'),asin=document.createElement('span');number.textContent=source?.original_number!=null?'#'+source.original_number:'原行 '+g.source_row;asin.textContent=g.source_asin;origin.append(number,asin);
  const brand=row.insertCell();brand.textContent=g.fields.brand||'—';const price=row.insertCell();price.textContent=g.fields.price==null?'—':String(g.fields.price);
  const sales=row.insertCell(),value=salesMonth?g.history.sales?.[salesMonth]:null;sales.textContent=value==null||value===''?'—':String(value);
  const ai=row.insertCell();ai.className='sample-ai-cell';const suggestion=card.querySelector('.sample-ai');if(suggestion)ai.append(suggestion);else ai.textContent='—';
  const action=row.insertCell(),button=document.createElement('button');button.type='button';button.className='sample-detail-toggle';button.textContent='查看 / 修改';button.setAttribute('aria-expanded','false');content.id='sample-detail-'+country.country+'-'+i;button.setAttribute('aria-controls',content.id);action.append(button);
  const heading=document.createElement('p');heading.className='sample-detail-title';heading.textContent=g.fields.title||'标题缺失';content.append(heading);
  const members=document.createElement('p');members.className='muted';members.textContent=g.members.length+' 条原始记录 · 父ASIN '+g.parent+'。当前固定来源见下方选择框；历史数据取该来源，不累加成员数值。';content.append(members);
  for(const node of [...card.children])if(node.classList.contains('actions')||node.tagName==='DETAILS')content.append(node);
  button.onclick=()=>{detail.hidden=!detail.hidden;button.setAttribute('aria-expanded',String(!detail.hidden));button.textContent=detail.hidden?'查看 / 修改':'收起';};
  table.append(body);
 });
 wrap.append(table);target.replaceChildren(wrap);
}
