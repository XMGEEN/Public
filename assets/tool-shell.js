/* Shared presentation only. Authentication and business actions remain owned by each page. */
(() => {
  'use strict';
  // New tools: add one entry, then include tool-shell.css and this script in their pages.
  const tools = [
    { id: 'keyword', label: '关键词作战台', mark: 'K', href: '/tool/', roots: ['/tool/', '/report/'] },
    { id: 'voc', label: 'VOC 用户洞察', mark: 'V', href: '/voc/', roots: ['/voc/'] },
    { id: 'qa', label: 'QA 工具', mark: 'Q', href: '/QA/', roots: ['/QA/'] }
  ];
  const path = location.pathname.replace(/\/index\.html$/, '/');
  const current = tools.find(tool => tool.roots.some(root => path === root.slice(0, -1) || path.startsWith(root)));
  const originalHeader = document.querySelector('body > header');
  if (!current || !originalHeader || document.getElementById('tool-navigation')) return;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  const mobile = matchMedia('(max-width: 900px)');
  const reportPage = path.includes('/report/');
  const side = element('aside', 'tool-shell-sidebar');
  side.id = 'tool-navigation';
  side.setAttribute('aria-label', '工具导航');
  const close = element('button', 'tool-shell-close', '关闭菜单 ×');
  close.type = 'button';
  const brand = element('div', 'tool-shell-brand');
  const brandMark = element('span', 'tool-shell-brand-mark', 'X');
  brandMark.setAttribute('aria-hidden', 'true');
  brand.append(brandMark, document.createTextNode('工具工作台'));
  const group = element('div', 'tool-shell-group');
  group.append(element('div', 'tool-shell-label', '我的工具'));
  const nav = element('nav', 'tool-shell-links');
  nav.setAttribute('aria-label', '选择工具');
  for (const tool of tools) {
    const link = element('a', 'tool-shell-link');
    link.href = tool.href;
    const mark = element('span', 'tool-shell-link-mark', tool.mark);
    mark.setAttribute('aria-hidden', 'true');
    link.append(mark, document.createTextNode(tool.label));
    if (tool.id === current.id) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  group.append(nav);
  const account = element('div', 'tool-shell-account');
  account.append(element('div', 'tool-shell-label', '当前账号'));
  // Move, never clone: IDs and the existing page's handlers remain intact.
  for (const id of ['account', 'logout']) {
    const node = document.getElementById(id);
    if (node) account.append(node);
  }
  side.append(close, brand, group, account);

  const header = element('header', 'tool-shell-header');
  const toggle = element('button', 'tool-shell-toggle', '☰ 菜单');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', side.id);
  toggle.setAttribute('aria-expanded', 'false');
  const title = element('span', 'tool-shell-title', current.label + (reportPage ? ' · 报告' : ''));
  header.append(toggle, title);
  if (reportPage) {
    const back = element('a', 'tool-shell-back', '← 返回任务');
    back.href = current.href;
    header.append(back);
  } else {
    header.append(element('span', 'tool-shell-context', current.id === 'qa' ? '美国站 · 英文附中文对照' : '美国站 US'));
  }
  const backdrop = element('button', 'tool-shell-backdrop');
  backdrop.type = 'button';
  backdrop.hidden = true;
  backdrop.setAttribute('aria-label', '关闭工具菜单');
  backdrop.tabIndex = -1;
  originalHeader.replaceWith(header);
  document.body.prepend(side, backdrop);
  document.body.classList.add('tool-shell');
  document.body.dataset.shellTool = current.id;
  document.body.dataset.shellView = reportPage ? 'report' : 'tool';

  let opened = false;
  const locked = new Map();
  function unlock() {
    for (const [node, wasInert] of locked) node.inert = wasInert;
    locked.clear();
  }
  function setOpen(value, restoreFocus = true) {
    opened = Boolean(value && mobile.matches);
    document.body.classList.toggle('tool-shell-menu-open', opened);
    toggle.setAttribute('aria-expanded', String(opened));
    side.inert = mobile.matches && !opened;
    backdrop.hidden = !opened;
    if (opened) {
      side.setAttribute('role', 'dialog');
      side.setAttribute('aria-modal', 'true');
      for (const node of document.body.children) {
        if (node === side || node === backdrop || /^(SCRIPT|STYLE|LINK)$/.test(node.tagName)) continue;
        if (!locked.has(node)) locked.set(node, node.inert);
        node.inert = true;
      }
      close.focus();
    } else {
      side.removeAttribute('role');
      side.removeAttribute('aria-modal');
      unlock();
      if (restoreFocus && mobile.matches) toggle.focus();
    }
  }
  toggle.addEventListener('click', () => setOpen(!opened));
  close.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  nav.addEventListener('click', event => {
    if (event.target.closest('a') && opened) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (!opened) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...side.querySelectorAll('a[href],button:not(:disabled)')].filter(node => !node.hidden && node.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  mobile.addEventListener('change', () => setOpen(false, false));
  window.addEventListener('pageshow', () => setOpen(false, false));
  setOpen(false, false);
})();
