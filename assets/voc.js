(() => {
  'use strict';
  const C = window.APP_CONFIG;
  const page = document.body.dataset.page;
  const $ = id => document.getElementById(id);
  const base = new URL(page === 'voc-tool' ? '../' : '../../', location.href);
  const link = path => new URL(path, base).href;
  const table = 'voc_tasks';
  const statuses = {排队中: 'pending', 抓评论: 'running', 标注中: 'running', 生成报告: 'running', 完成: 'completed', 失败: 'failed'};
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const show = (id, text, kind = '') => { const node = $(id); if (!node) return; node.textContent = text; node.className = 'message ' + kind; node.hidden = !text; };
  const friendly = error => {
    const value = String(error?.message ?? error ?? '');
    if (/row-level security|permission denied/i.test(value)) return '当前账号无权提交或读取这项任务，请检查新工具的权限设置。';
    if (/JWT expired|refresh token|session.*missing/i.test(value)) return '登录已过期，请重新登录。';
    if (/fetch|network|timeout|abort/i.test(value)) return '网络连接未完成，请检查网络后重试。';
    return '操作未完成，请稍后重试；持续失败请联系管理员。';
  };
  if (!C || !window.supabase) { show(page === 'voc-tool' ? 'form-message' : 'report-message', '页面资源加载失败，请刷新后重试。', 'error'); return; }
  const client = window.supabase.createClient(C.supabaseUrl, C.publishableKey, {auth: {storageKey: 'keyword-battle-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  async function requireUser() {
    const {data, error} = await client.auth.getUser();
    if (error || !data.user) { location.replace(link(page === 'voc-report' ? '?next=voc/report/%3Ftask%3D' + encodeURIComponent(new URLSearchParams(location.search).get('task') ?? '') : '?next=voc/')); return null; }
    $('auth-loading').hidden = true;
    $('protected-content').hidden = false;
    if ($('account')) $('account').textContent = data.user.email;
    client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') location.replace(link('')); });
    $('logout').onclick = async () => {
      $('logout').disabled = true;
      const {error: signoutError} = await client.auth.signOut({scope: 'local'});
      if (signoutError) { $('logout').disabled = false; show(page === 'voc-tool' ? 'form-message' : 'report-message', friendly(signoutError), 'error'); }
      else location.replace(link(''));
    };
    return data.user;
  }
  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});
  }
  async function tool() {
    const user = await requireUser(); if (!user) return;
    const asins = [];
    let pageIndex = 0, total = 0, loading = false, submitting = false, pending = null;
    function renderAsins() {
      $('asin-chips').replaceChildren();
      for (const asin of asins) {
        const chip = make('span', asin, 'asin-chip');
        const remove = make('button', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `移除 ${asin}`);
        remove.onclick = () => { if (submitting) return; if (pending) { show('form-message', '上一任务尚未确认提交成功。请保持原 ASIN 和选项重试，避免重复任务。', 'error'); return; } asins.splice(asins.indexOf(asin), 1); renderAsins(); };
        chip.append(remove); $('asin-chips').append(chip);
      }
      $('asin-count').textContent = `${asins.length}/10`;
    }
    function addInput() {
      const input = $('asin-input');
      const pieces = input.value.trim().toUpperCase().split(/[\s,，;；]+/).filter(Boolean);
      if (!pieces.length) return true;
      if (pending) { show('form-message', '上一任务尚未确认提交成功。请先重试同一任务。', 'error'); return false; }
      for (const asin of pieces) {
        if (!/^[A-Z0-9]{10}$/.test(asin)) { show('form-message', `${asin} 不是有效的 10 位 ASIN。`, 'error'); return false; }
        if (asins.includes(asin)) continue;
        if (asins.length >= 10) { show('form-message', '每个任务最多添加 10 个 ASIN。', 'error'); return false; }
        asins.push(asin);
      }
      input.value = ''; show('form-message', ''); renderAsins(); return true;
    }
    $('asin-input').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addInput(); } });
    $('asin-input').addEventListener('blur', () => { if ($('asin-input').value.trim()) addInput(); });
    $('open-confirm').onclick = () => {
      if (!addInput()) return;
      if (!asins.length) { show('form-message', '请先添加至少一个 ASIN。', 'error'); $('asin-input').focus(); return; }
      $('selected-count').textContent = asins.length;
      $('selected-asins').replaceChildren(...asins.map(asin => make('div', asin, 'selected-asin')));
      show('submit-message', ''); $('confirm-dialog').showModal();
    };
    $('close-dialog').onclick = $('cancel-dialog').onclick = () => $('confirm-dialog').close();
    $('confirm-dialog').addEventListener('click', event => { if (event.target === $('confirm-dialog')) $('confirm-dialog').close(); });
    async function loadTasks() {
      if (loading) return; loading = true; $('refresh-tasks').disabled = true;
      try {
        const {data, error, count} = await client.from(table).select('id,asins,site,target_reviews,review_scope,status,annotated_count,failure_reason,report_file_path,created_at', {count: 'exact'}).eq('user_id', user.id).order('created_at', {ascending: false}).order('id', {ascending: false}).range(pageIndex * 10, pageIndex * 10 + 9);
        if (error) throw error;
        total = count ?? data.length; $('task-count').textContent = total; $('task-list').replaceChildren();
        for (const task of data) {
          const card = make('article', undefined, 'voc-task-card');
          const top = make('div', undefined, 'task-card-top');
          const name = make('strong', (task.asins ?? []).join(' · '), 'task-asins');
          const status = make('span', task.status, 'status ' + (statuses[task.status] ?? 'pending'));
          top.append(name, status); card.append(top);
          card.append(make('p', `${task.site} · ${task.asins?.length ?? 0} 个 ASIN · 每个 ${task.target_reviews} 条 · ${task.review_scope}`, 'task-meta'));
          card.append(make('p', `已标注 ${task.annotated_count ?? 0} 条 · ${formatTime(task.created_at)}`, 'task-meta'));
          if (task.status === '失败') card.append(make('p', task.failure_reason || '未提供失败原因，请联系管理员。', 'task-error'));
          const action = make('div', undefined, 'task-card-action');
          if (task.status === '完成' && task.report_file_path) {
            const a = make('a', '打开报告 →', 'report-link'); a.href = link(`voc/report/?task=${encodeURIComponent(task.id)}`); action.append(a);
          } else action.append(make('span', task.status === '完成' ? '报告尚未生成' : task.status === '失败' ? '处理失败' : '等待结果', 'muted'));
          card.append(action); $('task-list').append(card);
        }
        $('empty-state').hidden = total !== 0;
        $('previous-page').disabled = pageIndex === 0;
        $('next-page').disabled = (pageIndex + 1) * 10 >= total;
        $('page-info').textContent = `第 ${pageIndex + 1} / ${Math.max(1, Math.ceil(total / 10))} 页 · 每页 10 条`;
        $('refresh-status').textContent = `每 10 秒自动刷新 · 更新于 ${new Date().toLocaleTimeString('zh-CN', {hour12: false})}`;
        show('list-message', '');
      } catch (error) { show('list-message', friendly(error), 'error'); }
      finally { loading = false; $('refresh-tasks').disabled = false; }
    }
    $('refresh-tasks').onclick = loadTasks;
    $('previous-page').onclick = () => { if (pageIndex > 0 && !loading) { pageIndex--; loadTasks(); } };
    $('next-page').onclick = () => { if (!loading && (pageIndex + 1) * 10 < total) { pageIndex++; loadTasks(); } };
    $('submit-task').onclick = async () => {
      if (submitting) return;
      const target = Number(document.querySelector('input[name="target-reviews"]:checked')?.value);
      const scope = document.querySelector('input[name="review-scope"]:checked')?.value;
      if (![100, 200, 300, 500].includes(target) || !['含变体评论', '仅本ASIN'].includes(scope)) { show('submit-message', '请先选择评论条数和范围。', 'error'); return; }
      const signature = JSON.stringify({asins, target, scope});
      if (pending && pending.signature !== signature) { show('submit-message', '上一任务尚未确认提交成功。请保持原 ASIN 和选项重试，避免重复任务。', 'error'); return; }
      if (!pending) pending = {id: crypto.randomUUID(), signature, asins: [...asins], target, scope};
      submitting = true; $('submit-task').disabled = true; $('submit-task').textContent = '正在提交…';
      try {
        const existing = await client.from(table).select('id').eq('id', pending.id).maybeSingle();
        if (existing.error) throw existing.error;
        if (!existing.data) {
          const result = await client.from(table).insert({id: pending.id, user_id: user.id, asins: pending.asins, site: 'US', target_reviews: pending.target, review_scope: pending.scope});
          if (result.error) throw result.error;
        }
        pending = null; asins.splice(0); renderAsins(); $('confirm-dialog').close(); show('form-message', '提交成功。任务已进入队列，下方将显示处理状态。', 'success'); pageIndex = 0; await loadTasks();
      } catch (error) { show('submit-message', friendly(error) + ' 重试将沿用同一任务编号。', 'error'); }
      finally { submitting = false; $('submit-task').disabled = false; $('submit-task').textContent = pending ? '重试提交同一任务' : '开始分析'; }
    };
    await loadTasks();
    const timer = setInterval(() => { if (!document.hidden) loadTasks(); }, 10000);
    window.addEventListener('pagehide', () => clearInterval(timer), {once: true});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadTasks(); });
  }
  async function report() {
    const user = await requireUser(); if (!user) return;
    const id = new URLSearchParams(location.search).get('task');
    async function load() {
      $('retry-report').hidden = true; $('report-frame').hidden = true;
      if (!uuid.test(id ?? '')) { show('report-message', '任务链接不完整，请返回任务列表选择报告。', 'error'); return; }
      try {
        const {data: task, error} = await client.from(table).select('id,asins,status,report_file_path,failure_reason').eq('id', id).eq('user_id', user.id).maybeSingle();
        if (error) throw error;
        if (!task) { show('report-message', '未找到这项任务，或它不属于当前账号。', 'error'); return; }
        $('report-subtitle').textContent = `${task.asins.join(' · ')} · ${task.status}`;
        if (task.status !== '完成' || !task.report_file_path) {
          show('report-message', task.status === '失败' ? `任务失败：${task.failure_reason || '未提供原因'}` : task.status === '完成' ? '任务已完成，报告尚未生成。' : '任务仍在处理中，请稍后刷新。', task.status === '失败' ? 'error' : '');
          $('retry-report').hidden = false; return;
        }
        const url = new URL(task.report_file_path);
        if (url.protocol !== 'https:' || url.origin !== C.reportOrigin || !url.pathname.startsWith('/user-insight-voc/reports/')) throw new Error('报告路径不符合本工具目录');
        const response = await fetch(url.href, {signal: AbortSignal.timeout(45000)});
        if (!response.ok) throw new Error('报告读取失败');
        $('report-frame').srcdoc = await response.text();
        $('report-frame').hidden = false; show('report-message', '');
      } catch (error) { show('report-message', friendly(error), 'error'); $('retry-report').hidden = false; }
    }
    $('retry-report').onclick = load; await load();
  }
  (page === 'voc-tool' ? tool() : report()).catch(error => show(page === 'voc-tool' ? 'form-message' : 'report-message', friendly(error), 'error'));
})();
