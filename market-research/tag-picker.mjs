// Keep the original AI choice distinct from pointer/keyboard navigation.
export function mountTypePicker(select,aiType){
 const button=document.createElement('button'),menu=document.createElement('div');
 button.type='button';button.className='tag-type-picker';button.setAttribute('role','combobox');button.setAttribute('aria-label','产品类型');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.disabled=select.disabled;
 menu.className='tag-type-menu';menu.id='tag-picker-'+crypto.randomUUID();menu.setAttribute('popover','manual');menu.setAttribute('role','listbox');menu.setAttribute('aria-label','产品类型');button.setAttribute('aria-controls',menu.id);
 select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.after(button);document.body.append(menu);
 const options=[...select.options];let opened=false,active=-1;
 const sync=()=>{button.textContent=select.selectedOptions[0]?.textContent||'未知';};sync();select.addEventListener('change',sync);
 const close=(focus=false)=>{if(!opened)return;opened=false;menu.hidePopover();button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');if(focus)button.focus({preventScroll:true});};
 const highlight=i=>{active=i;[...menu.children].forEach((el,j)=>el.classList.toggle('is-active',j===i));if(i>=0)button.setAttribute('aria-activedescendant',menu.children[i].id);else button.removeAttribute('aria-activedescendant');};
 const choose=i=>{select.value=options[i].value;select.dispatchEvent(new Event('change',{bubbles:true}));close(true);};
 const open=()=>{
  if(opened||button.disabled)return;
  menu.replaceChildren();options.forEach((o,i)=>{const el=document.createElement('div');el.id=menu.id+'-'+i;el.className='tag-type-option';el.setAttribute('role','option');el.setAttribute('aria-selected',String(o.value===select.value));el.textContent=o.textContent;if(aiType!==undefined&&o.value===(aiType??'')){el.classList.add('is-ai');el.setAttribute('aria-description','AI原始判断');}el.onpointermove=()=>highlight(i);el.onpointerdown=e=>e.preventDefault();el.onclick=()=>choose(i);menu.append(el);});
  const rect=button.getBoundingClientRect(),width=Math.min(Math.max(rect.width,340),innerWidth-16);
  menu.style.width=width+'px';menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';menu.style.top='0px';menu.style.maxHeight=Math.min(280,innerHeight-16)+'px';menu.showPopover();
  const height=menu.getBoundingClientRect().height;menu.style.top=Math.max(8,Math.min(rect.bottom+3,innerHeight-height-8))+'px';opened=true;button.setAttribute('aria-expanded','true');
  highlight(options.findIndex(o=>aiType!==undefined&&o.value===(aiType??'')));if(active>=0)menu.scrollTop=Math.max(0,menu.children[active].offsetTop-menu.clientHeight+menu.children[active].offsetHeight);
 };
 button.onclick=()=>opened?close():open();
 button.onkeydown=e=>{
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(!opened){open();return;}const next=e.key==='Home'?0:e.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,active+(e.key==='ArrowDown'?1:-1)));highlight(next);menu.scrollTop=Math.max(0,menu.children[next].offsetTop-menu.clientHeight/2);}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(opened&&active>=0)choose(active);else open();}
  else if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab')close();
 };
 menu.onpointerleave=()=>highlight(-1);
 const outside=e=>{if(!button.contains(e.target)&&!menu.contains(e.target))close();};
 const scroll=e=>{if(!opened||menu.contains(e.target))return;const r=button.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight){close();return;}const box=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,innerWidth-box.width-8))+'px';menu.style.top=Math.max(8,Math.min(r.bottom+3,innerHeight-box.height-8))+'px';};
 const resize=()=>close();document.addEventListener('pointerdown',outside);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',resize);
 return ()=>{close();select.removeEventListener('change',sync);document.removeEventListener('pointerdown',outside);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',resize);menu.remove();button.remove();select.hidden=false;select.removeAttribute('aria-hidden');select.removeAttribute('tabindex');};
}
