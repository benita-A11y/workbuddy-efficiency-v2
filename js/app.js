/**
 * 效率管理应用 - 主逻辑
 * 包含待办、复盘、记账三大模块
 */
const App = (function () {

  // ===== 维度配置（支持自定义重命名/换色/排序，4个预设始终存在）=====
  const DIMENSION_PRESETS = {
    work:   { name: '工作', icon: '💼', bg: 'var(--work-bg)',   accent: 'var(--work-accent)' },
    study:  { name: '学习', icon: '📚', bg: 'var(--study-bg)',  accent: 'var(--study-accent)' },
    health: { name: '健康', icon: '🏃', bg: 'var(--health-bg)', accent: 'var(--health-accent)' },
    life:   { name: '生活', icon: '🌸', bg: 'var(--life-bg)',   accent: 'var(--life-accent)' },
  };

  const CATEGORIES = {
    food: { name: '饮食', icon: '🍜', bg: 'var(--food-bg)', accent: 'var(--food-accent)' },
    shopping: { name: '购物', icon: '🛍️', bg: 'var(--shopping-bg)', accent: 'var(--shopping-accent)' },
    transport: { name: '路程', icon: '🚌', bg: 'var(--transport-bg)', accent: 'var(--transport-accent)' },
  };

  // 收入来源分类（参与结余，不参与支出饼图）
  const INCOME_SOURCES = {
    salary: { name: '工资', icon: '💼' },
    bonus: { name: '奖金', icon: '🎁' },
    other: { name: '其他', icon: '💰' },
  };

  // 主题色预设（12色盘，旧版单色）
  const THEME_COLORS = ['#333333', '#E57373', '#F06292', '#BA68C8', '#9575CD', '#7986CB',
    '#64B5F6', '#4DB6AC', '#81C784', '#FFB74D', '#FF8A65', '#A1887F'];

  // 主题换肤预设包（多变量：主色 / 背景 / 卡片 / 强调），与 css [data-theme] 对应
  const THEME_PACKS = {
    default:  { name: '经典莫兰迪', emoji: '🩶', primary: '#B8C5D6', bg: '#F5F5F7', card: '#FFFFFF', accent: '#C5E1D5' },
    matcha:   { name: '抹茶绿', emoji: '🌿', primary: '#7FB069', bg: '#F2F8ED', card: '#FFFFFF', accent: '#5E8C4E' },
    hazyblue: { name: '雾霾蓝', emoji: '🌊', primary: '#8FA9C4', bg: '#EDF2F8', card: '#FFFFFF', accent: '#6E89A8' },
    peach:    { name: '蜜桃粉', emoji: '🍑', primary: '#EBA8A0', bg: '#FDF3F0', card: '#FFFFFF', accent: '#D98C82' },
    milktea:  { name: '奶茶棕', emoji: '☕', primary: '#C2A06B', bg: '#F7F1E8', card: '#FFFFFF', accent: '#A8854E' },
    lavender: { name: '薰衣草', emoji: '💜', primary: '#B0A4D9', bg: '#F3F0FA', card: '#FFFFFF', accent: '#9384C9' },
    dark:     { name: '深色模式', emoji: '🌙', primary: '#A8C0A0', bg: '#1E1E24', card: '#2A2A31', accent: '#C8E6D5' }
  };

  // 动态维度：从设置读取自定义（重命名/换色/排序）
  function getDimensionConfig() {
    const cfg = Store && Store.Settings ? Store.Settings.get().categories : null;
    const order = (cfg && cfg.order) ? cfg.order : ['work', 'study', 'health', 'life'];
    return order.map(k => {
      const base = DIMENSION_PRESETS[k] || { name: k, icon: '⭐', bg: '#eeeeee', accent: '#999999' };
      const c = (cfg && cfg.items && cfg.items[k]) || {};
      return {
        key: k,
        name: c.name || base.name,
        icon: c.icon || base.icon,
        bg: c.bg || base.bg,
        accent: c.accent || base.accent,
      };
    });
  }

  function getDimensionOrder() {
    const cfg = Store.Settings.get().categories;
    return (cfg && cfg.order) ? cfg.order : ['work', 'study', 'health', 'life'];
  }

  let DIMENSIONS = {};
  function refreshDimensions() {
    DIMENSIONS = {};
    getDimensionConfig().forEach(d => { DIMENSIONS[d.key] = d; });
  }
  refreshDimensions();

  let currentModule = 'todo';
  let deviceId = '';
  // 冷启动一律以"今天"为锚点（保证跨天 / 修改系统时间后打开即今天）
  let currentDate = new Date();
  let lastKnownTodayStr = Store.DateUtils.formatDate(new Date()); // 用于跨天检测
  let todoView = Store.Settings.get().todoView || 'dimension';
  let reviewView = Store.Settings.get().reviewView || 'week';
  let financeView = Store.Settings.get().financeView || 'month';
  let calendarMonth = new Date(currentDate);
  let currentBillType = 'expense';
  let billFilterDate = null; // 记账按日期筛选

  // ===== UI 工具 =====
  function toast(msg, duration = 2000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // 温柔反馈横幅：图标 + 标题 +（可选）副标题，从顶部轻滑入、2s 后轻滑出；不堆叠、不阻塞
  var _gtQueue = [];
  var _gtActive = false;
  function clearFeedback() {
    _gtQueue = [];
    _gtActive = false;
    const c = document.getElementById('toastContainer');
    if (!c) return;
    Array.prototype.slice.call(c.querySelectorAll('.gentle-toast')).forEach(function (n) {
      if (n._gtTimer) clearTimeout(n._gtTimer);
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }
  function feedback(item) {
    var icon = '', title = '', sub = '', dur = 2000;
    if (typeof item === 'string') { title = item; }
    else if (item) { icon = item.icon || ''; title = item.title || ''; sub = item.sub || ''; dur = item.duration || 2000; }
    _gtQueue.push({ icon: icon, title: title, sub: sub, dur: dur });
    if (!_gtActive) _showFeedback();
  }
  function _showFeedback() {
    if (!_gtQueue.length) { _gtActive = false; return; }
    _gtActive = true;
    var it = _gtQueue.shift();
    var c = document.getElementById('toastContainer');
    if (!c) { _gtActive = false; return; }
    var el = document.createElement('div');
    el.className = 'gentle-toast';
    var ih = it.icon ? '<span class="gt-icon">' + escapeHtml(it.icon) + '</span>' : '';
    el.innerHTML = ih + '<div class="gt-text"><div class="gt-title">' + escapeHtml(it.title) + '</div>' + (it.sub ? '<div class="gt-sub">' + escapeHtml(it.sub) + '</div>' : '') + '</div>';
    c.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    el._gtTimer = setTimeout(function () {
      el.classList.remove('show');
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); _showFeedback(); }, 320);
    }, it.dur);
  }

  function showModal(html) {
    const overlay = document.getElementById('modalOverlay');
    overlay.innerHTML = `<div class="modal">${html}</div>`;
    overlay.classList.add('active');
    // 点击遮罩关闭
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };
  }

  function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('active');
    overlay.innerHTML = '';
  }

  function confirmDialog(title, message, onConfirm) {
    showModal(`
      <div class="modal-title">${title}</div>
      <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">${message}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
        <button class="btn btn-danger" id="confirmBtn">确认删除</button>
      </div>
    `);
    document.getElementById('confirmBtn').onclick = () => {
      onConfirm();
      closeModal();
    };
  }

  function formatMoney(amount) {
    return parseFloat(amount).toFixed(2);
  }

  // ===== 模块切换 =====
  function switchModule(module) {
    // 消费小记：跳转独立页面（全新 消费小记 记账模块，不再内嵌渲染）
    if (module === 'finance') { window.location.href = 'finance.html'; return; }
    clearFeedback();
    currentModule = module;
    Store.Settings.update({ currentModule: module });

    // 将当前模块写入 URL hash（replaceState 不增加历史记录），
    // 使从灵感详情 history.back() 返回时能恢复正确模块，而非掉回首页
    try {
      if (document.getElementById(module + 'Module')) history.replaceState(null, '', '#' + module);
    } catch (e) {}

    document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
    const target = document.getElementById(module + 'Module');
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-tab, .bottom-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.module === module);
    });

    // FAB 显示控制
    const fab = document.getElementById('fab');
    if (module === 'todo' || module === 'finance') {
      fab.style.display = 'flex';
    } else {
      fab.style.display = 'none';
    }

    Store.Tasks.autoArchive();
    render();
    if (module === 'home') { updateHomeGreeting(); updateHomeHealth(); }
    // 从灵感详情返回瀑布流时，恢复之前的滚动位置（参考小红书）
    if (module === 'inspiration' && window.InspirationScroll) window.InspirationScroll.restore();
  }

  // ===== 首页动态区（问候语 + 健康速览）=====
  function updateHomeGreeting() {
    const el = document.getElementById('homeGreeting');
    const dt = document.getElementById('homeDate');
    if (!el) return;
    const h = new Date().getHours();
    let greet = '晚上好';
    if (h < 5) greet = '夜深了';
    else if (h < 11) greet = '早上好';
    else if (h < 13) greet = '中午好';
    else if (h < 18) greet = '下午好';
    const nick = (Store.Settings.get().nickname || '').trim();
    el.textContent = (nick ? greet + '，' + nick : '你好，朋友') + ' ✨';
    if (dt) {
      const d = new Date();
      const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      dt.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + wd;
    }
  }
  function updateHomeHealth() {
    const t = Store.DateUtils.formatDate(new Date());
    const fmtHM = (ts) => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

    // —— 睡眠：数值 + 起止时间明细 + 简短提示 ——
    const s = document.getElementById('hsSleep');
    const sd = document.getElementById('hsSleepDetail');
    const si = document.getElementById('hsSleepInsight');
    const sleepRec = Store.Health.getSleepRecord(t);
    const sleepMin = Store.Health.getSleepMinutes(t);
    if (s) {
      if (sleepMin != null && sleepMin > 0) {
        const h = sleepMin / 60;
        s.textContent = h.toFixed(1) + 'h';
        if (sd) sd.textContent = (sleepRec && sleepRec.asleep && sleepRec.awake) ? (fmtHM(sleepRec.asleep) + '-' + fmtHM(sleepRec.awake)) : '—';
        if (si) si.textContent = (h >= 7 && h <= 9) ? '💡 睡得不错' : (h < 7 ? '💡 早点休息' : '💡 适度运动');
      } else {
        s.textContent = '—'; if (sd) sd.textContent = '—'; if (si) si.textContent = '💡 记录睡眠';
      }
    }

    // —— 经期：第N天/还有N天 + 预计来期明细 + 提示 ——
    const p = document.getElementById('hsPeriod');
    const pd = document.getElementById('hsPeriodDetail');
    const pi = document.getElementById('hsPeriodInsight');
    if (p) {
      const pr = Store.Health.predict();
      const nextLabel = pr ? ('预计' + pr.nextStart.slice(5).replace('-', '/') + '来') : '—';
      if (Store.Health.isPeriodDay(t)) {
        let n = 0; const d = new Date(t + 'T00:00:00');
        while (Store.Health.isPeriodDay(Store.DateUtils.formatDate(d)) && n < 45) { n++; d.setDate(d.getDate() - 1); }
        p.textContent = '第' + n + '天';
        if (pd) pd.textContent = nextLabel;
        if (pi) pi.textContent = '💡 注意休息';
      } else if (pr && pr.daysUntilNext != null) {
        p.textContent = '还有' + pr.daysUntilNext + '天';
        if (pd) pd.textContent = nextLabel;
        if (pi) pi.textContent = '💡 规律记录';
      } else {
        p.textContent = '—'; if (pd) pd.textContent = '—'; if (pi) pi.textContent = '💡 记录经期';
      }
    }

    // —— 噗噗：完成状态 + 首次时间明细 + 提示 ——
    const b = document.getElementById('hsBowel');
    const bd = document.getElementById('hsBowelDetail');
    const bi = document.getElementById('hsBowelInsight');
    if (b) {
      const bwArr = (Store.Health.getBowel().days && Store.Health.getBowel().days[t]) || [];
      const cnt = bwArr.length || 0;
      if (cnt > 0) {
        b.textContent = '✅ 已完成';
        if (bd) bd.textContent = fmtHM(bwArr[0]);
        if (bi) bi.textContent = '💡 很规律';
      } else {
        b.textContent = '未记录';
        if (bd) bd.textContent = '—';
        if (bi) bi.textContent = '💡 多喝水';
      }
    }
  }

  // ===== 跨天检测（全局日期统一数据源 currentDate）=====
  function checkDayChange() {
    const realTodayStr = Store.DateUtils.formatDate(new Date());
    if (realTodayStr === lastKnownTodayStr) return;
    lastKnownTodayStr = realTodayStr;
    // 仅当用户当前正在查看「今天」时，自动跳转到新的一天；否则仅刷新高亮
    if (Store.DateUtils.isToday(currentDate)) {
      currentDate = new Date();
      calendarMonth = new Date(currentDate);
      Store.Settings.update({ selectedDate: realTodayStr });
      render();
      slideDayChange();
    } else {
      render(); // 浏览历史日期时，仅刷新今日高亮，不强制跳走
    }
    checkSupplementReminders();
    checkHealthReminders();
  }

  // 日期变化时的平滑滑动过渡
  function slideDayChange() {
    const c = document.querySelector('.module.active');
    if (!c) return;
    c.classList.remove('day-flip');
    void c.offsetWidth; // 触发重排以重启动画
    c.classList.add('day-flip');
  }

  // 手动刷新：强制重算并跳回今天
  function refreshData() {
    currentDate = new Date();
    lastKnownTodayStr = Store.DateUtils.formatDate(currentDate);
    calendarMonth = new Date(currentDate);
    Store.Settings.update({ selectedDate: lastKnownTodayStr });
    render();
    toast('已刷新到今天的数据');
  }

  // ===== 主渲染 =====
  function render() {
    if (currentModule === 'todo') renderTodo();
    else if (currentModule === 'review') renderReview();
    else if (currentModule === 'finance') renderFinance();
    else if (currentModule === 'supplement') renderSupplement();
    else if (currentModule === 'reading') renderReading();
    else if (currentModule === 'health') renderHealth();
    else if (currentModule === 'profile') renderProfile();
    else if (currentModule === 'almanac') { if (window.Almanac) { try { Almanac.render(); } catch (e) {} } }
    else if (currentModule === 'auspicious') { if (window.Auspicious) { try { Auspicious.render(); } catch (e) {} } }
    else if (currentModule === 'checkin') { if (window.Checkin) { try { Checkin.render(); } catch (e) { console.error('[checkin] 渲染失败', e); } } }
  }

  // ===== 待办模块 =====
  function renderTodo() {
    const container = document.getElementById('todoModule');
    const selectedDate = Store.DateUtils.formatDate(currentDate);
    const isToday = Store.DateUtils.isToday(currentDate);

    let html = `
      <div class="page-nav">
        <div class="view-tabs">
          <button class="view-tab ${todoView === 'dimension' ? 'active' : ''}" onclick="App.setTodoView('dimension')">维度打卡</button>
          <button class="view-tab ${todoView === 'timeline' ? 'active' : ''}" onclick="App.setTodoView('timeline')">时间线</button>
        </div>
        <div class="date-bar" id="dateBar">
          ${renderDateBar()}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-timer" style="flex:none;padding:8px 16px;" onclick="App.showTimerModal()">⏱️ 计时</button>
          <button class="btn btn-secondary" style="flex:none;padding:8px 16px;" onclick="App.showMultiDayModal()">+ 多日日程</button>
          <button class="btn btn-secondary" style="flex:none;padding:8px 16px;" onclick="App.showMilestoneModal()">大事记</button>
        </div>
      </div>
    `;

    if (todoView === 'dimension') {
      html += renderTodoDimension(selectedDate, isToday);
    } else {
      html += renderTodoTimeline(selectedDate);
    }

    container.innerHTML = html;
    attachTodoEvents();
    renderTodoGrowthInject();
  }

  // 在待办内容顶部插入"今日健康·成长"聚合卡（满足补品/阅读进度同步展示）
  function renderTodoGrowthInject() {
    const container = document.getElementById('todoModule');
    if (!container) return;
    const grid = container.querySelector('.todo-layout') || container.querySelector('.todo-cards-grid');
    if (grid && !container.querySelector('.growth-card')) {
      grid.insertAdjacentHTML('afterbegin', renderHealthGrowthCard());
    }
  }

  function renderDateBar() {
    const weekDates = Store.DateUtils.getWeekDates(currentDate);
    return weekDates.map(d => {
      const dateStr = Store.DateUtils.formatDate(d);
      const isActive = dateStr === Store.DateUtils.formatDate(currentDate);
      const isToday = Store.DateUtils.isToday(d);
      return `
        <div class="date-item ${isActive ? 'active' : ''}" onclick="App.selectDate('${dateStr}')">
          <span class="weekday">${Store.DateUtils.weekdayShort(d)}</span>
          <span class="date-num">${d.getDate()}</span>
        </div>
      `;
    }).join('');
  }

  function renderTodoDimension(selectedDate, isToday) {
    return `
      <div class="todo-layout">
        <div class="todo-left">
          ${renderWeeklyGoals()}
        </div>
        <div class="todo-center">
          <div class="todo-cards-grid">
            ${getDimensionOrder().map(dim => renderDimCard(dim, selectedDate)).join('')}
          </div>
        </div>
        <div class="todo-right">
          ${renderCalendar()}
          ${renderInspiration()}
          ${renderStickyNote()}
        </div>
      </div>
    `;
  }

  // 时间线视图状态
  let timelineFilter = 'today'; // today | yesterday | week | earlier
  let timelineSearch = '';

  function getTimelineDateRange() {
    const today = new Date();
    if (timelineFilter === 'today') {
      const s = Store.DateUtils.formatDate(today);
      return [s, s];
    }
    if (timelineFilter === 'yesterday') {
      const y = Store.DateUtils.addDays(today, -1);
      const s = Store.DateUtils.formatDate(y);
      return [s, s];
    }
    if (timelineFilter === 'week') {
      const w = Store.DateUtils.getWeekDates(today);
      return [Store.DateUtils.formatDate(w[0]), Store.DateUtils.formatDate(w[6])];
    }
    // earlier：本周一开始之前（含今年初）
    const w = Store.DateUtils.getWeekDates(today);
    const start = Store.DateUtils.formatDate(new Date(today.getFullYear(), 0, 1));
    const end = Store.DateUtils.formatDate(Store.DateUtils.addDays(w[0], -1));
    return [start, end];
  }

  function renderTodoTimeline(selectedDate) {
    const [start, end] = getTimelineDateRange();
    const q = (timelineSearch || '').trim().toLowerCase();

    let tasks = Store.Tasks.getByDateRange(start, end).filter(t => !t.isArchived);
    let focus = Store.FocusSessions.getByDateRange(start, end);
    if (q) {
      tasks = tasks.filter(t => t.name.toLowerCase().includes(q) || (t.notes && t.notes.toLowerCase().includes(q)));
      focus = focus.filter(f => (f.taskName && f.taskName.toLowerCase().includes(q)) || (f.note && f.note.toLowerCase().includes(q)));
    }

    const totalTasks = tasks.length;
    const totalFocus = focus.reduce((s, f) => s + (f.minutes || 0), 0);

    const filters = [
      { key: 'today', label: '今天' },
      { key: 'yesterday', label: '昨天' },
      { key: 'week', label: '本周' },
      { key: 'earlier', label: '更早' },
    ];

    let html = `<div class="card timeline-card">
      <div class="card-title"><span>时间线</span><span class="section-label">${totalTasks} 项任务 · 专注 ${totalFocus} 分</span></div>
      <div class="timeline-filters">
        ${filters.map(f => `<button class="tl-filter ${timelineFilter === f.key ? 'active' : ''}" onclick="App.setTimelineFilter('${f.key}')">${f.label}</button>`).join('')}
      </div>
      <div style="margin:10px 0;">
        <input type="text" class="form-input" placeholder="🔍 搜索任务或专注记录" value="${escapeHtml(timelineSearch)}" oninput="App.setTimelineSearch(this.value)" style="font-size:13px;">
      </div>
    `;

    // 按日期分组（降序）
    const dates = new Set();
    tasks.forEach(t => dates.add(t.date));
    focus.forEach(f => dates.add(f.date));
    const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));

    if (sortedDates.length === 0) {
      html += `<div class="empty-state">
        <div class="empty-illustration">📭</div>
        <div>${timelineFilter === 'today' ? '今天还没有记录' : '这段时间没有记录'}，<br>开始你的第一项任务或专注计时吧</div>
      </div>`;
    } else {
      sortedDates.forEach(dateStr => {
        const d = new Date(dateStr);
        const dayTasks = tasks.filter(t => t.date === dateStr)
          .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
        const dayFocus = focus.filter(f => f.date === dateStr)
          .sort((a, b) => a.startedAt - b.startedAt);
        const isToday = Store.DateUtils.isToday(d);

        html += `<div class="tl-date-group">
          <div class="tl-date-header ${isToday ? 'today' : ''}">
            <span>${d.getMonth() + 1}月${d.getDate()}日 ${Store.DateUtils.weekdayCN(d)}</span>
            <span class="section-label">${dayTasks.length} 任务 · 专注 ${dayFocus.reduce((s, f) => s + (f.minutes || 0), 0)}分</span>
          </div>
          <div class="timeline-view">`;

        dayTasks.forEach(task => {
          const dim = DIMENSIONS[task.dimension];
          const focusBadge = (task.focusMinutes && task.focusMinutes > 0)
            ? `<div class="task-time focus-badge">🎯 专注${task.focusMinutes}分</div>` : '';
          html += `
            <div class="timeline-item ${task.completed ? 'completed' : ''}">
              <div class="timeline-time">${task.time || '--:--'}</div>
              <div class="timeline-dot" style="background: ${dim.accent}"></div>
              <div class="timeline-content" onclick="App.editTask('${task.id}')">
                <span class="task-name" style="${task.completed ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${escapeHtml(task.name)}</span>
                ${task.notes ? `<div class="task-note">${escapeHtml(task.notes)}</div>` : ''}
                ${focusBadge}
              </div>
              <div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="App.toggleTask('${task.id}')"></div>
            </div>
          `;
        });

        dayFocus.forEach(f => {
          html += `
            <div class="timeline-item focus-item">
              <div class="timeline-time">${new Date(f.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
              <div class="timeline-dot focus-dot">🎯</div>
              <div class="timeline-content">
                <span class="task-name">已专注 ${f.minutes} 分钟${f.taskName ? ' · ' + escapeHtml(f.taskName) : ''}</span>
                ${f.note ? `<div class="task-note">${escapeHtml(f.note)}</div>` : ''}
              </div>
            </div>
          `;
        });

        html += `</div></div>`;
      });
    }

    html += `</div>`;
    return html;
  }

  function renderWeeklyGoals() {
    const goals = Store.WeeklyGoals.getByWeek(currentDate);
    const weekTasks = Store.Tasks.getByWeek(currentDate);
    const weekRange = Store.DateUtils.getWeekRange(currentDate);

    let html = `
      <div class="card">
        <div class="card-title">
          <span>周目标</span>
          <span class="section-label">${weekRange}</span>
        </div>
        <div class="section-label" style="margin-bottom:12px;">把本周目标放在当天旁边，方便判断今天的任务是不是在推进正确的方向</div>
        <div style="display:flex;gap:16px;margin-bottom:12px;font-size:13px;">
          <div>目标推进：<strong class="num">${goals.filter(g => Store.WeeklyGoals.getProgress(g.id).percent === 100).length}/${goals.length}</strong></div>
          <div>待办事项：<strong class="num">${weekTasks.length}</strong></div>
        </div>
    `;

    if (goals.length === 0) {
      html += `<div class="empty-state">暂无周目标</div>`;
    } else {
      goals.forEach(goal => {
        const progress = Store.WeeklyGoals.getProgress(goal.id);
        const dim = DIMENSIONS[goal.dimension];
        html += `
          <div class="weekly-goal-item">
            <div class="weekly-goal-header">
            <span class="weekly-goal-name" onclick="App.editWeeklyGoal('${goal.id}')">
              <span class="dim-dot" style="background:${DIMENSIONS[goal.dimension].accent}"></span>${escapeHtml(goal.name)}
            </span>
              <span class="weekly-goal-pct" style="color: ${dim.accent}">${progress.percent}%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width: ${progress.percent}%;background:${DIMENSIONS[goal.dimension].accent}"></div></div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${progress.completed}/${progress.total} 任务完成</div>
          </div>
        `;
      });
    }

    html += `
        <button class="add-task-btn" onclick="App.showWeeklyGoalModal()">
          + 添加周目标
        </button>
      </div>
    `;
    return html;
  }

  function renderDimCard(dimension, selectedDate) {
    const dim = DIMENSIONS[dimension];
    const tasks = Store.Tasks.getByDimension(currentDate, dimension);
    const completed = tasks.filter(t => t.completed).length;

    let html = `
      <div class="todo-dim-card" style="border-top: 3px solid ${dim.accent}; background: linear-gradient(180deg, ${dim.bg} 0%, var(--bg-card) 40%);">
        <div class="todo-dim-header">
          <div class="todo-dim-title">
            <span class="dim-dot" style="background:${dim.accent}"></span>${dim.icon} ${dim.name}
          </div>
          <div class="todo-dim-count">${completed}/${tasks.length}</div>
        </div>
        <div class="todo-dim-body">
    `;

    if (tasks.length === 0) {
      html += `<div class="empty-state">暂无任务</div>`;
    } else {
      tasks.forEach(task => {
        const focusBadge = (task.focusMinutes && task.focusMinutes > 0)
          ? `<div class="task-time focus-badge">🎯 专注${task.focusMinutes}分</div>` : '';
        html += `
          <div class="task-item ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
            <div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="App.toggleTask('${task.id}')"></div>
            <div class="task-content" onclick="App.editTask('${task.id}')">
              <div class="task-name">${escapeHtml(task.name)}</div>
              ${task.notes ? `<div class="task-note">${escapeHtml(task.notes)}</div>` : ''}
              <div class="task-meta-row">
                ${task.time ? `<div class="task-time">⏰ ${task.time}</div>` : ''}
                ${focusBadge}
              </div>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
        <button class="add-task-btn" onclick="App.showAddTaskInput('${dimension}')">
          + 加任务到「${dim.name}」
        </button>
        <div id="addTaskInput_${dimension}" style="display:none;">
          <input type="text" class="add-task-input" placeholder="输入任务名称，回车确认" 
            onkeydown="App.handleAddTaskKey(event, '${dimension}')">
        </div>
      </div>
    `;
    return html;
  }

  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const today = new Date();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysInMonth = Store.DateUtils.getMonthDays(year, month);
    const prevMonthDays = Store.DateUtils.getMonthDays(year, month - 1);
    const monthTasks = Store.Tasks.getByMonth(year, month);
    const milestones = Store.Milestones.getByMonth(year, month);

    let html = `
      <div class="card">
        <div class="card-title">
          <span>${year}年${month + 1}月概览</span>
          <span class="dim-tag" style="background: var(--bg-page); color: var(--text-primary);">深浅 = 密度</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <button class="nav-icon-btn" onclick="App.changeCalendarMonth(-1)">‹</button>
          <span style="flex:1;text-align:center;font-size:14px;font-weight:600;">${year}.${String(month + 1).padStart(2, '0')}</span>
          <button class="nav-icon-btn" onclick="App.changeCalendarMonth(1)">›</button>
        </div>
        <div class="calendar-header">
          ${['一', '二', '三', '四', '五', '六', '日'].map(d => `<div>${d}</div>`).join('')}
        </div>
        <div class="calendar-grid" id="calendarGrid">
    `;

    // 上月填充
    for (let i = startDay - 1; i >= 0; i--) {
      html += `<div class="calendar-day other-month"><span class="day-num">${prevMonthDays - i}</span></div>`;
    }

    // 当月日期
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = Store.DateUtils.formatDate(date);
      const count = monthTasks.filter(t => t.date === dateStr).length;
      const isSelected = dateStr === Store.DateUtils.formatDate(currentDate);
      const isToday = Store.DateUtils.isToday(date);
      const hasMilestone = milestones.some(m => m.date === dateStr);

      let bgColor = '';
      let textColor = '';
      if (count > 0) {
        const density = Math.min(count / 6, 1);
        bgColor = `rgba(255, 183, 77, ${0.15 + density * 0.35})`;
      }

      html += `
        <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" 
          onclick="App.selectDate('${dateStr}')" style="${bgColor ? `background:${bgColor};` : ''} position:relative;">
          <span class="day-num">${d}</span>
          ${hasMilestone ? '<span style="position:absolute;top:2px;right:2px;font-size:8px;color:var(--danger);">★</span>' : ''}
        </div>
      `;
    }

    // 下月填充
    const totalCells = startDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      html += `<div class="calendar-day other-month"><span class="day-num">${d}</span></div>`;
    }

    html += `</div>`;
    html += `<div style="margin-top:12px;font-size:12px;color:var(--text-secondary);text-align:right;">当月待办 <strong class="num">${monthTasks.length}</strong> 项</div>`;
    html += `</div>`;
    return html;
  }

  function renderInspiration() {
    const todayInspirations = Store.Inspirations.getByDate(new Date());

    let html = `
      <div class="card">
        <div class="card-title">
          <span>灵感日记</span>
          <button class="btn btn-secondary" style="padding:4px 12px;font-size:12px;" onclick="App.showTimelineWriteModal()">写入时间线</button>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">今天冒出的想法 · <span class="dim-tag" style="background:var(--work-bg);color:#E6940A;">今日</span></div>
        <textarea id="inspirationInput" class="form-textarea" placeholder="记录下灵光一现的想法..." style="margin-bottom:12px;"></textarea>
        <div class="inspiration-tabs">
          <button class="inspiration-tab active" data-type="idea" onclick="App.setInspirationType('idea')">💡 灵感</button>
          <button class="inspiration-tab" data-type="observation" onclick="App.setInspirationType('observation')">👁️ 观察</button>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" style="flex:1;font-size:13px;" onclick="App.saveInspiration()">写入日 +</button>
          <button class="btn btn-secondary" style="flex:1;font-size:13px;" onclick="App.inspirationToTask()">转任务</button>
        </div>
    `;

    if (todayInspirations.length > 0) {
      html += `<div class="inspiration-history">`;
      todayInspirations.forEach(insp => {
        const typeLabel = insp.type === 'idea' ? '💡' : '👁️';
        html += `
          <div class="inspiration-entry">
            <div>${typeLabel} ${escapeHtml(insp.content)}</div>
            <div class="ins-meta">${new Date(insp.createdAt).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  function renderStickyNote() {
    const content = Store.StickyNotes.get();
    return `
      <div class="sticky-note">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:600;color:#5D4037;font-size:14px;">📝 随手便利贴</span>
          <span style="font-size:11px;color:#BCAAA4;">仅本地</span>
        </div>
        <textarea id="stickyNoteInput" placeholder="临时备忘、草稿..." oninput="App.saveStickyNote(this.value)">${escapeHtml(content)}</textarea>
      </div>
    `;
  }

  // ===== 复盘模块 =====
  // 安全取维度配置：旧数据 / 字段缺失也不崩（返回兜底配置，避免 .name/.accent 抛错中断整页渲染）
  function dimConfig(key) {
    if (typeof DIMENSIONS !== 'undefined' && DIMENSIONS[key]) return DIMENSIONS[key];
    return { key: key || 'other', name: key || '其他', accent: 'var(--theme-accent)', icon: '📌' };
  }

  function renderReview() {
    const container = document.getElementById('reviewModule');
    if (!container) return;

    // 顶部外壳永远先拼好（即便下面统计炸了，标题 + 提示文字也必定出现）
    let html = `
      <div class="review-container">
        <div class="review-header">
          <div class="view-tabs">
            <button class="view-tab ${reviewView === 'week' ? 'active' : ''}" onclick="App.setReviewView('week')">周视图</button>
            <button class="view-tab ${reviewView === 'month' ? 'active' : ''}" onclick="App.setReviewView('month')">月视图</button>
            <button class="view-tab ${reviewView === 'year' ? 'active' : ''}" onclick="App.setReviewView('year')">年视图</button>
          </div>
          <div class="period-nav">
            <button onclick="App.changeReviewPeriod(-1)">‹</button>
            <span class="period-label">${getReviewPeriodLabel()}</span>
            <button onclick="App.changeReviewPeriod(1)">›</button>
          </div>
        </div>
    `;

    // 关键容错：子视图统计/渲染代码哪怕炸了，也强制把提示文字渲染出来，函数不许直接罢工
    let body = '';
    try {
      if (reviewView === 'week') body = renderReviewWeek();
      else if (reviewView === 'month') body = renderReviewMonth();
      else body = renderReviewYear();
    } catch (e) {
      console.error('[review] 子视图渲染出错，已降级显示提示：', e);
      body = `
        <div class="card" style="margin-bottom:24px;">
          <div class="card-title"><span>📋 本周期概览</span></div>
          <div class="empty-hint">这部分统计数据暂时无法显示，但不影响你查看与记录。可尝试切换周 / 月 / 年视图，或稍后重试。</div>
        </div>`;
    }

    html += body + `</div>`;
    container.innerHTML = html;   // 永远执行：外壳 + 内容/提示文字必定渲染
  }

  function getReviewPeriodLabel() {
    if (reviewView === 'week') return Store.DateUtils.getWeekRange(currentDate);
    if (reviewView === 'month') return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    return `${currentDate.getFullYear()}年`;
  }

  // ===== 本周目标完成率（用户自主设定 + 月/年自动累计）=====
  function weekCompletionRate(anchor) {
    const goal = Store.Settings.get().weeklyGoalCount || 5;
    const completed = Store.Tasks.getByWeek(anchor).filter(t => t.completed).length;
    return goal > 0 ? Math.min(1, completed / goal) : 0;
  }
  function getMonthWeekStarts(year, month) {
    const first = new Date(year, month, 1);
    const dow = (first.getDay() + 6) % 7; // 0=周一
    let d = Store.DateUtils.addDays(first, -dow);
    const last = new Date(year, month + 1, 0);
    const starts = [];
    while (d <= last) { starts.push(new Date(d)); d = Store.DateUtils.addDays(d, 7); }
    return starts;
  }
  function monthCompletionRate(year, month) {
    const starts = getMonthWeekStarts(year, month);
    if (!starts.length) return 0;
    const rates = starts.map(s => weekCompletionRate(s));
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  }
  function yearCompletionRate(year) {
    const rates = [];
    for (let m = 0; m < 12; m++) rates.push(monthCompletionRate(year, m));
    return rates.reduce((a, b) => a + b, 0) / 12;
  }

  function renderCompletionRing(rate) {
    const pct = Math.max(0, Math.min(100, Math.round(rate * 100)));
    const color = 'var(--theme-color)';
    const track = 'var(--border-color)';
    return `<div class="completion-ring" style="background:conic-gradient(${color} ${pct * 3.6}deg, ${track} 0);">
      <div class="completion-ring-inner"><div class="cr-num">${pct}%</div><div class="cr-label">完成率</div></div>
    </div>`;
  }

  function showWeeklyGoalModal() {
    const cur = Store.Settings.get().weeklyGoalCount || 5;
    showModal(`
      <div class="modal-title">设定本周目标数量</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">本周你需要完成多少个任务？设定后，周 / 月 / 年视图将自动累计统计。</p>
      <div class="form-group">
        <label class="form-label">目标数量（1-100）</label>
        <input type="number" id="weeklyGoalInput" class="form-input" min="1" max="100" value="${cur}">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" onclick="App.saveWeeklyGoal()">确认</button>
      </div>
    `);
  }
  function saveWeeklyGoal() {
    let v = parseInt(document.getElementById('weeklyGoalInput').value, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > 100) v = 100;
    Store.Settings.update({ weeklyGoalCount: v });
    closeModal();
    toast('本周目标已设为 ' + v + ' 个');
    render();
  }

  function renderReviewWeek() {
    const weekDates = Store.DateUtils.getWeekDates(currentDate);
    const goals = Store.WeeklyGoals.getByWeek(currentDate);
    const weekBills = Store.Bills.getByWeek(currentDate);
    const stats = Store.Bills.getStats(weekBills);
    const memo = Store.ReviewMemos.getByWeek(currentDate);

    let html = '';

    // 本周目标完成率（用户自主设定数量目标）
    const goalCount = Store.Settings.get().weeklyGoalCount || 5;
    const weekCompleted = Store.Tasks.getByWeek(currentDate).filter(t => t.completed).length;
    const weekRate = weekCompletionRate(currentDate);
    const weekPct = Math.round(weekRate * 100);
    html += `
      <div class="card" style="margin-bottom:24px;">
        <div class="card-title">
          <span>本周目标完成率</span>
          <button class="btn btn-timer" style="padding:4px 12px;font-size:12px;" onclick="App.showWeeklyGoalModal()">✏️ 设定目标</button>
        </div>
        <div class="weekly-goal-summary">
          <div class="wg-big">${weekPct}%</div>
          <div class="wg-sub">本周已完成 <b>${weekCompleted}</b> / 目标 <b>${goalCount}</b> 个任务</div>
        </div>
        <div class="progress-bar" style="height:10px;margin-top:12px;"><div class="progress-fill" style="width:${weekPct}%;background:var(--theme-color)"></div></div>
        <div class="section-label" style="margin-top:12px;">目标由你设定（默认5）。月/年视图将按各周完成率自动累计统计。</div>
      </div>
    `;

    // 当周日历复盘表
    html += `
      <div class="card" style="margin-bottom:24px;">
        <div class="card-title">
          <span>当周日历表</span>
          <span class="dim-tag" style="background:var(--text-primary);color:#fff;">${Store.DateUtils.getWeekRange(currentDate)}</span>
        </div>
        <div class="section-label" style="margin-bottom:12px;">按周一到周日铺开，保留每天最重要的 2-3 件事</div>
        <div class="review-calendar">
    `;

    weekDates.forEach(d => {
      const dateStr = Store.DateUtils.formatDate(d);
      const dayTasks = Store.Tasks.getByDate(d);
      const completed = dayTasks.filter(t => t.completed).length;
      const total = dayTasks.length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      const isToday = Store.DateUtils.isToday(d);

      // 找出当天最多的维度
      const dimCount = { work: 0, study: 0, health: 0, life: 0 };
      dayTasks.forEach(t => { if (dimCount[t.dimension] !== undefined) dimCount[t.dimension]++; });
      const maxDim = Object.entries(dimCount).reduce((a, b) => b[1] > a[1] ? b : a, ['work', 0])[0];

      html += `
        <div class="review-day-col ${isToday ? 'today' : ''}" onclick="App.jumpToTodoDate('${dateStr}')">
          <div class="review-day-header">
            <div class="weekday">${Store.DateUtils.weekdayShort(d)}</div>
            <div class="date-num">${d.getDate()}</div>
          </div>
          <div class="review-day-progress">
            <div class="progress-bar" style="margin-bottom:2px;"><div class="progress-fill" style="width:${pct}%;background:${dimConfig(maxDim).accent}"></div></div>
            <div class="pct">${completed}/${total} 完成</div>
          </div>
      `;

      // 展示前3条任务
      const topTasks = dayTasks.slice(0, 3);
      topTasks.forEach(task => {
        html += `<div class="review-task ${task.completed ? 'completed' : ''} dim-tag ${task.dimension}" style="font-size:10px;padding:2px 4px;">${escapeHtml(task.name)}</div>`;
      });
      if (dayTasks.length > 3) {
        html += `<div style="font-size:10px;color:var(--text-secondary);text-align:center;">+${dayTasks.length - 3} 更多</div>`;
      }

      html += `</div>`;
    });

    html += `</div></div>`;

    // 本周花销概览（容错：旧数据/字段缺失也不崩，崩了降级显示提示文字）
    let spendingHtml = '';
    try {
      const s = (typeof stats === 'object' && stats) ? stats : {};
      const totalExpense = (typeof s.totalExpense === 'number') ? s.totalExpense : 0;
      const byCategory = (s.byCategory && typeof s.byCategory === 'object') ? s.byCategory : {};
      spendingHtml = `
        <div class="spending-overview">
          <div class="card-title">
            <span>本周花销统计</span>
            <span class="dim-tag" style="background:var(--food-bg);color:#E65100;" onclick="App.switchModule('finance')">查看详情 ›</span>
          </div>
          <div class="spending-total">
            <span class="label">本周总支出</span>
            <span class="amount" style="color:var(--expense);">¥${formatMoney(totalExpense)}</span>
          </div>
      `;
      // —— 旧统计代码（已注释：裸访问 stats.byCategory[cat] / CATEGORIES[cat] 易崩，改用下方容错版本）——
      // ['food', 'shopping', 'transport'].forEach(cat => {
      //   const amount = stats.byCategory[cat];
      //   const pct = stats.totalExpense > 0 ? (amount / stats.totalExpense) * 100 : 0;
      //   const c = CATEGORIES[cat];
      //   html += `<div class="category-bar">...</div>`;
      // });
      ['food', 'shopping', 'transport'].forEach(cat => {
        const amount = byCategory[cat] || 0;
        const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
        const c = (typeof CATEGORIES !== 'undefined' && CATEGORIES[cat]) || { icon: '💰', name: cat, accent: 'var(--theme-accent)' };
        spendingHtml += `
          <div class="category-bar">
            <span class="cat-name">${c.icon} ${c.name}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c.accent};"></div></div>
            <span class="cat-amount">¥${formatMoney(amount)}</span>
          </div>
        `;
      });
      spendingHtml += `</div>`;
    } catch (e) {
      console.error('[review-week] 花销统计降级：', e);
      spendingHtml = `<div class="spending-overview"><div class="card-title"><span>本周花销统计</span></div><div class="empty-hint">花销统计暂不可用</div></div>`;
    }
    html += spendingHtml;

    // 复盘便利贴
    html += `
      <div class="sticky-note">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:600;color:#5D4037;font-size:14px;">📋 本周复盘备忘</span>
          <span style="font-size:11px;color:#BCAAA4;">仅本地</span>
        </div>
        <textarea id="reviewMemoInput" placeholder="在这里写下本周的反思、收获，或者给自己的夸奖" 
          oninput="App.saveReviewMemo(this.value)">${escapeHtml(memo)}</textarea>
      </div>
    `;

    return html;
  }

  function renderReviewMonth() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthTasks = Store.Tasks.getByMonth(year, month);
    const monthBills = Store.Bills.getByMonth(year, month);
    const stats = Store.Bills.getStats(monthBills);
    const memo = Store.ReviewMemos.getByMonth(year, month);

    let html = '';

    // 本月完成率（按周目标累计，容错：完成率统计链崩了也显示提示文字）
    try {
      const mRate = monthCompletionRate(year, month);
      const mPct = Math.round(mRate * 100);
      html += `
        <div class="card" style="margin-bottom:24px;">
          <div class="card-title"><span>本月完成率（按周目标累计）</span></div>
          <div class="completion-ring-wrap">
            ${renderCompletionRing(mRate)}
            <div class="cr-caption">本月各周完成率的平均：<b>${mPct}%</b></div>
          </div>
        </div>
      `;
    } catch (e) {
      console.error('[review-month] 完成率统计降级：', e);
      html += `
        <div class="card" style="margin-bottom:24px;">
          <div class="card-title"><span>本月完成率（按周目标累计）</span></div>
          <div class="empty-hint">完成率统计暂不可用</div>
        </div>
      `;
    }

    // 月度目标进度
    html += `
      <div class="card" style="margin-bottom:24px;">
        <div class="card-title"><span>月度目标进度</span></div>
        <div class="goal-cards-row">
    `;

    ['work', 'study', 'health', 'life'].forEach(dim => {
      const dimTasks = monthTasks.filter(t => t.dimension === dim);
      const completed = dimTasks.filter(t => t.completed).length;
      const total = dimTasks.length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      html += `
        <div class="goal-card ${dim}">
          <div class="goal-card-header">
            <span class="dim-tag ${dim}">${dimConfig(dim).name}</span>
            <span class="goal-count">${total} 个任务</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${dimConfig(dim).accent}"></div></div>
          <div style="text-align:right;font-size:12px;margin-top:4px;font-weight:600;" class="num">${pct}%</div>
        </div>
      `;
    });

    html += `</div></div>`;

    // 月历密度表
    html += `<div class="card" style="margin-bottom:24px;"><div class="card-title"><span>当月日历密度表</span></div>`;
    html += `<div class="calendar-header">${['一','二','三','四','五','六','日'].map(d=>`<div>${d}</div>`).join('')}</div>`;
    html += `<div class="calendar-grid">`;

    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysInMonth = Store.DateUtils.getMonthDays(year, month);
    const prevMonthDays = Store.DateUtils.getMonthDays(year, month - 1);

    for (let i = startDay - 1; i >= 0; i--) {
      html += `<div class="calendar-day other-month"><span class="day-num">${prevMonthDays - i}</span></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = Store.DateUtils.formatDate(date);
      const tasks = monthTasks.filter(t => t.date === dateStr);
      const completed = tasks.filter(t => t.completed).length;
      const total = tasks.length;
      const pct = total > 0 ? completed / total : 0;
      const isToday = Store.DateUtils.isToday(date);

      let bgColor = '';
      if (total > 0) {
        bgColor = `rgba(255, 183, 77, ${0.1 + pct * 0.4})`;
      }

      html += `<div class="calendar-day ${isToday ? 'today' : ''}" style="${bgColor ? `background:${bgColor};` : ''}" onclick="App.jumpToTodoDate('${dateStr}')"><span class="day-num">${d}</span></div>`;
    }

    const remaining = (7 - ((startDay + daysInMonth) % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      html += `<div class="calendar-day other-month"><span class="day-num">${d}</span></div>`;
    }

    html += `</div></div>`;

    // 月度趋势图
    const dailyData = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = Store.DateUtils.formatDate(date);
      dailyData.push(monthTasks.filter(t => t.date === dateStr).length);
    }
    html += `<div class="chart-container"><div class="card-title"><span>月度任务趋势</span></div>${renderLineChart(dailyData, '任务数')}</div>`;

    // 月度花销（容错：stats.byCategory / totalExpense 缺失也不崩，崩了降级显示提示）
    try {
      const s = (typeof stats === 'object' && stats) ? stats : {};
      const totalExpense = (typeof s.totalExpense === 'number') ? s.totalExpense : 0;
      const byCategory = (s.byCategory && typeof s.byCategory === 'object') ? s.byCategory : {};
      // —— 旧统计代码（已注释：renderPieChart(stats.byCategory, stats.totalExpense, 'month') 在 byCategory 缺失时必崩）——
      // html += `<div class="spending-overview">...${renderPieChart(stats.byCategory, stats.totalExpense, 'month')}...</div>`;
      html += `
        <div class="spending-overview">
          <div class="card-title"><span>月度花销统计</span></div>
          <div class="spending-total">
            <span class="label">本月总支出</span>
            <span class="amount" style="color:var(--expense);">¥${formatMoney(totalExpense)}</span>
          </div>
          ${renderPieChart(byCategory, totalExpense, 'month')}
        </div>
      `;
    } catch (e) {
      console.error('[review-month] 花销统计降级：', e);
      html += `<div class="spending-overview"><div class="card-title"><span>月度花销统计</span></div><div class="empty-hint">花销统计暂不可用</div></div>`;
    }

    // 月度复盘备忘
    html += `
      <div class="sticky-note">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:600;color:#5D4037;font-size:14px;">📋 ${year}年${month+1}月复盘</span>
          <span style="font-size:11px;color:#BCAAA4;">仅本地</span>
        </div>
        <textarea id="reviewMemoInput" placeholder="月度复盘..." oninput="App.saveReviewMemo(this.value)">${escapeHtml(memo)}</textarea>
      </div>
    `;

    return html;
  }

  function renderReviewYear() {
    const year = currentDate.getFullYear();
    const yearTasks = Store.Tasks.getByYear(year);
    const yearBills = Store.Bills.getByYear(year);
    const stats = Store.Bills.getStats(yearBills);
    const memo = Store.ReviewMemos.getByYear(year);

    let html = '';

    // 年度目标概览
    html += `<div class="card" style="margin-bottom:24px;"><div class="card-title"><span>年度目标概览 · ${year}</span></div><div class="goal-cards-row">`;

    ['work', 'study', 'health', 'life'].forEach(dim => {
      const dimTasks = yearTasks.filter(t => t.dimension === dim);
      const completed = dimTasks.filter(t => t.completed).length;
      const total = dimTasks.length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      html += `
        <div class="goal-card ${dim}">
          <div class="goal-card-header">
            <span class="dim-tag ${dim}">${dimConfig(dim).name}</span>
            <span class="goal-count">${total} 个任务</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${dimConfig(dim).accent}"></div></div>
          <div style="text-align:right;font-size:12px;margin-top:4px;font-weight:600;" class="num">${pct}%</div>
        </div>
      `;
    });

    html += `</div></div>`;

    // 各月完成率（按周目标累计，容错：完成率统计链崩了也显示提示文字）
    try {
      html += `<div class="card" style="margin-bottom:24px;"><div class="card-title"><span>各月完成率（按周目标累计）</span></div><div class="year-rate-bars">`;
      for (let m = 0; m < 12; m++) {
        const r = monthCompletionRate(year, m);
        const pct = Math.round(r * 100);
        html += `<div class="yr-bar-col">
          <div class="yr-bar-num">${pct}%</div>
          <div class="yr-bar-track"><div class="yr-bar-fill" style="height:${pct}%;background:var(--theme-color)"></div></div>
          <div class="yr-bar-month">${m + 1}月</div>
        </div>`;
      }
      html += `</div><div class="cr-caption" style="margin-top:10px;">年度完成率 = 12 个月完成率的平均：<b>${Math.round(yearCompletionRate(year) * 100)}%</b></div></div>`;
    } catch (e) {
      console.error('[review-year] 完成率统计降级：', e);
      html += `<div class="card" style="margin-bottom:24px;"><div class="card-title"><span>各月完成率（按周目标累计）</span></div><div class="empty-hint">完成率统计暂不可用</div></div>`;
    }

    // 月度完成热力图
    html += `<div class="chart-container"><div class="card-title"><span>月度完成热力图</span></div><div class="heatmap">`;
    for (let m = 0; m < 12; m++) {
      const monthTasks = yearTasks.filter(t => t.date.startsWith(`${year}-${String(m+1).padStart(2,'0')}`));
      const completed = monthTasks.filter(t => t.completed).length;
      const total = monthTasks.length;
      const pct = total > 0 ? completed / total : 0;
      const opacity = 0.1 + pct * 0.9;
      html += `<div class="heatmap-cell" style="background:rgba(255,183,77,${total > 0 ? opacity : 0.05});color:${pct > 0.5 ? '#fff' : '#333'};" onclick="App.jumpToReviewMonth(${m})" title="${m+1}月: ${completed}/${total}">${m+1}月</div>`;
    }
    html += `</div></div>`;

    // 年度花销趋势
    const monthlyExpenses = [];
    for (let m = 0; m < 12; m++) {
      const monthBills = yearBills.filter(b => b.date.startsWith(`${year}-${String(m+1).padStart(2,'0')}`));
      monthlyExpenses.push(monthBills.filter(b => b.type === 'expense').reduce((s, b) => s + b.amount, 0));
    }
    html += `<div class="chart-container"><div class="card-title"><span>年度花销趋势</span></div>${renderBarChart(monthlyExpenses, ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'])}</div>`;

    // 年度复盘备忘
    html += `
      <div class="sticky-note">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:600;color:#5D4037;font-size:14px;">📋 ${year}年复盘</span>
          <span style="font-size:11px;color:#BCAAA4;">仅本地</span>
        </div>
        <textarea id="reviewMemoInput" placeholder="年度复盘..." oninput="App.saveReviewMemo(this.value)">${escapeHtml(memo)}</textarea>
      </div>
    `;

    return html;
  }

  // ===== 记账模块 =====
  function renderFinance() {
    const container = document.getElementById('financeModule');

    let html = `<div class="finance-container">`;

    html += `
      <div class="review-header">
        <div class="view-tabs">
          <button class="view-tab ${financeView === 'week' ? 'active' : ''}" onclick="App.setFinanceView('week')">周视图</button>
          <button class="view-tab ${financeView === 'month' ? 'active' : ''}" onclick="App.setFinanceView('month')">月视图</button>
          <button class="view-tab ${financeView === 'year' ? 'active' : ''}" onclick="App.setFinanceView('year')">年视图</button>
        </div>
        <div class="period-nav">
          <button onclick="App.changeFinancePeriod(-1)">‹</button>
          <span class="period-label">${getFinancePeriodLabel()}</span>
          <button onclick="App.changeFinancePeriod(1)">›</button>
        </div>
        <div class="fin-date-filter">
          <button class="view-tab" style="flex:none;padding:6px 12px;" onclick="App.pickBillDate()" title="按日期查看账单">📅</button>
          ${billFilterDate ? `<button class="view-tab active" style="flex:none;padding:6px 12px;" onclick="App.clearBillFilter()">📅 ${billFilterDate} ✕</button>` : ''}
        </div>
      </div>
    `;

    let bills = getFinanceBills();
    if (billFilterDate) bills = bills.filter(b => b.date === billFilterDate);
    const stats = Store.Bills.getStats(bills);
    if (billFilterDate) {
      html += `<div class="fin-filter-tip">📅 正在查看 ${billFilterDate} 的记账（共 ${bills.length} 笔）<button class="link-btn" onclick="App.clearBillFilter()">查看全部</button></div>`;
    }

    // 收支概览
    html += `
      <div class="finance-overview">
        <div class="overview-card expense">
          <div class="label">总支出</div>
          <div class="amount">¥${formatMoney(stats.totalExpense)}</div>
        </div>
        <div class="overview-card income">
          <div class="label">总收入</div>
          <div class="amount">¥${formatMoney(stats.totalIncome)}</div>
        </div>
        <div class="overview-card balance ${stats.balance < 0 ? 'negative' : ''}">
          <div class="label">结余</div>
          <div class="amount">${stats.balance < 0 ? '-' : ''}¥${formatMoney(Math.abs(stats.balance))}</div>
        </div>
        <div class="overview-card">
          <div class="label">记账笔数</div>
          <div class="amount">${stats.count}</div>
        </div>
      </div>
    `;

    // 日历密度
    html += renderFinanceCalendar();

    // 分类统计
    if (financeView === 'year') {
      // 年视图：月度趋势柱状图 + 全年分类饼图
      const year = currentDate.getFullYear();
      const yearBills = Store.Bills.getByYear(year);
      const monthlyExpenses = [];
      for (let m = 0; m < 12; m++) {
        const monthBills = yearBills.filter(b => b.date.startsWith(`${year}-${String(m+1).padStart(2,'0')}`));
        monthlyExpenses.push(monthBills.filter(b => b.type === 'expense').reduce((s, b) => s + b.amount, 0));
      }
      html += `<div class="chart-container"><div class="card-title"><span>月度支出趋势</span></div>${renderBarChart(monthlyExpenses, ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'])}</div>`;
      
      const yearStats = Store.Bills.getStats(yearBills);
      html += `<div class="chart-container"><div class="card-title"><span>全年分类占比</span></div>${renderPieChart(yearStats.byCategory, yearStats.totalExpense, 'year')}</div>`;
    } else {
      // 周月视图：环形饼图 + 分类明细
      html += `<div class="chart-container"><div class="card-title"><span>分类统计</span></div>`;
      html += `<div class="pie-chart-container">`;
      html += renderPieChart(stats.byCategory, stats.totalExpense, financeView);
      html += `<div class="pie-legend">`;
      ['food', 'shopping', 'transport'].forEach(cat => {
        const amount = stats.byCategory[cat];
        const pct = stats.totalExpense > 0 ? (amount / stats.totalExpense) * 100 : 0;
        const c = CATEGORIES[cat];
        html += `
          <div class="category-bar">
            <span class="cat-name">${c.icon} ${c.name}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c.accent};"></div></div>
            <span class="cat-amount">¥${formatMoney(amount)} · ${pct.toFixed(1)}%</span>
          </div>
        `;
      });
      html += `</div></div></div>`;
    }

    // 消费明细列表
    html += renderBillList(bills);

    html += `</div>`;
    container.innerHTML = html;
    attachFinanceEvents();
  }

  function getFinancePeriodLabel() {
    if (financeView === 'week') return Store.DateUtils.getWeekRange(currentDate);
    if (financeView === 'month') return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    return `${currentDate.getFullYear()}年`;
  }

  function getFinanceBills() {
    if (financeView === 'week') return Store.Bills.getByWeek(currentDate);
    if (financeView === 'month') return Store.Bills.getByMonth(currentDate.getFullYear(), currentDate.getMonth());
    return Store.Bills.getByYear(currentDate.getFullYear());
  }

  function renderFinanceCalendar() {
    let html = `<div class="chart-container"><div class="card-title"><span>记账日历</span></div>`;

    if (financeView === 'week') {
      const weekDates = Store.DateUtils.getWeekDates(currentDate);
      html += `<div style="display:flex;gap:8px;overflow-x:auto;">`;
      weekDates.forEach(d => {
        const expense = Store.Bills.getExpenseByDate(d);
        const isToday = Store.DateUtils.isToday(d);
        const isSelected = Store.DateUtils.formatDate(d) === Store.DateUtils.formatDate(currentDate);
        let bgColor = '';
        if (expense > 0) {
          const density = Math.min(expense / 500, 1);
          bgColor = `rgba(255, 138, 101, ${0.1 + density * 0.4})`;
        }
        html += `
          <div style="flex:1;min-width:60px;background:${bgColor || '#fff'};border-radius:8px;padding:12px 8px;text-align:center;cursor:pointer;border:2px solid ${isSelected ? 'var(--text-primary)' : 'transparent'};" onclick="App.selectDate('${Store.DateUtils.formatDate(d)}')">
            <div style="font-size:11px;color:var(--text-secondary);">${Store.DateUtils.weekdayShort(d)}</div>
            <div style="font-size:18px;font-weight:600;margin:4px 0;${isToday ? 'color:var(--text-primary);' : ''}">${d.getDate()}</div>
            <div style="font-size:12px;color:var(--expense);font-family:'SF Mono',monospace;">${expense > 0 ? '¥' + formatMoney(expense) : '-'}</div>
          </div>
        `;
      });
      html += `</div>`;
    } else if (financeView === 'month') {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const monthBills = Store.Bills.getByMonth(year, month);

      html += `<div class="calendar-header">${['一','二','三','四','五','六','日'].map(d=>`<div>${d}</div>`).join('')}</div>`;
      html += `<div class="calendar-grid">`;

      const firstDay = new Date(year, month, 1);
      const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
      const daysInMonth = Store.DateUtils.getMonthDays(year, month);
      const prevMonthDays = Store.DateUtils.getMonthDays(year, month - 1);

      for (let i = startDay - 1; i >= 0; i--) {
        html += `<div class="calendar-day other-month"><span class="day-num">${prevMonthDays - i}</span></div>`;
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = Store.DateUtils.formatDate(date);
        const expense = monthBills.filter(b => b.date === dateStr && b.type === 'expense').reduce((s, b) => s + b.amount, 0);
        const isToday = Store.DateUtils.isToday(date);

        let bgColor = '';
        if (expense > 0) {
          const density = Math.min(expense / 500, 1);
          bgColor = `rgba(255, 138, 101, ${0.1 + density * 0.4})`;
        }

        html += `<div class="calendar-day ${isToday ? 'today' : ''}" style="${bgColor ? `background:${bgColor};` : ''}" title="${expense > 0 ? '¥' + formatMoney(expense) : ''}"><span class="day-num">${d}</span></div>`;
      }

      const remaining = (7 - ((startDay + daysInMonth) % 7)) % 7;
      for (let d = 1; d <= remaining; d++) {
        html += `<div class="calendar-day other-month"><span class="day-num">${d}</span></div>`;
      }

      html += `</div>`;
    } else {
      // 年视图 - 12个月密度
      const year = currentDate.getFullYear();
      const yearBills = Store.Bills.getByYear(year);
      html += `<div class="heatmap">`;
      for (let m = 0; m < 12; m++) {
        const monthBills = yearBills.filter(b => b.date.startsWith(`${year}-${String(m+1).padStart(2,'0')}`));
        const expense = monthBills.filter(b => b.type === 'expense').reduce((s, b) => s + b.amount, 0);
        const density = Math.min(expense / 2000, 1);
        html += `<div class="heatmap-cell" style="background:rgba(255,138,101,${expense > 0 ? 0.1 + density * 0.6 : 0.05});color:${density > 0.5 ? '#fff' : '#333'};" title="${m+1}月: ¥${formatMoney(expense)}">${m+1}月<br><small>¥${expense > 0 ? formatMoney(expense) : '0'}</small></div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  function renderBillList(bills) {
    let html = `<div class="card"><div class="card-title"><span>消费明细</span><span class="section-label">${bills.length} 笔</span></div>`;

    if (bills.length === 0) {
      html += `<div class="empty-state">暂无记账记录，点击右下角 + 添加</div>`;
      html += `</div>`;
      return html;
    }

    // 按日期分组
    const grouped = {};
    bills.forEach(b => {
      if (!grouped[b.date]) grouped[b.date] = [];
      grouped[b.date].push(b);
    });

    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach(date => {
      const dayBills = grouped[date];
      const dayExpense = dayBills.filter(b => b.type === 'expense').reduce((s, b) => s + b.amount, 0);
      const dayIncome = dayBills.filter(b => b.type === 'income').reduce((s, b) => s + b.amount, 0);
      const dateObj = new Date(date);

      html += `
        <div class="bill-group">
          <div class="bill-group-header">
            <span>${dateObj.getMonth() + 1}月${dateObj.getDate()}日 ${Store.DateUtils.weekdayCN(dateObj)}</span>
            <span class="group-total">${dayExpense > 0 ? '-¥' + formatMoney(dayExpense) : ''} ${dayIncome > 0 ? '+¥' + formatMoney(dayIncome) : ''}</span>
          </div>
      `;

      dayBills.forEach(bill => {
        const cat = bill.type === 'income'
          ? { icon: (INCOME_SOURCES[bill.category] || {}).icon || '💰', bg: 'var(--income)' }
          : (CATEGORIES[bill.category] || CATEGORIES.food);
        const amountClass = bill.type === 'expense' ? 'expense' : 'income';
        const sign = bill.type === 'expense' ? '-' : '+';

        html += `
          <div class="bill-item" onclick="App.editBill('${bill.id}')">
            <div class="bill-item-left">
              <div class="bill-icon ${bill.type === 'income' ? 'income' : bill.category}">${cat.icon}</div>
              <div class="bill-info">
                <div class="bill-cat">${bill.type === 'income' ? (INCOME_SOURCES[bill.category]?.name || '收入') : (CATEGORIES[bill.category]?.name || bill.category)}${bill.note ? ' · ' + escapeHtml(bill.note) : ''}</div>
                <div class="bill-time">${new Date(bill.createdAt).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})}</div>
              </div>
            </div>
            <div class="bill-amount ${amountClass}">${sign}¥${formatMoney(bill.amount)}</div>
          </div>
        `;
      });

      html += `</div>`;
    });

    html += `</div>`;
    return html;
  }

  // ===== 图表渲染（SVG） =====
  function renderPieChart(byCategory, total, viewMode) {
    if (total === 0) {
      return `<div style="text-align:center;padding:20px;color:var(--text-secondary);">
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="70" fill="none" stroke="#f0f0f0" stroke-width="30"/>
        </svg>
        <div style="margin-top:-110px;margin-bottom:50px;font-size:13px;">暂无支出</div>
      </div>`;
    }

    const colors = { food: '#FF8A65', shopping: '#BA68C8', transport: '#4DD0E1' };
    const segments = [];
    let currentAngle = -90;

    ['food', 'shopping', 'transport'].forEach(cat => {
      const amount = byCategory[cat];
      if (amount === 0) return;
      const angle = (amount / total) * 360;
      segments.push({ cat, angle, startAngle: currentAngle });
      currentAngle += angle;
    });

    let paths = '';
    segments.forEach(seg => {
      const startRad = (seg.startAngle * Math.PI) / 180;
      const endRad = ((seg.startAngle + seg.angle) * Math.PI) / 180;
      const x1 = 90 + 70 * Math.cos(startRad);
      const y1 = 90 + 70 * Math.sin(startRad);
      const x2 = 90 + 70 * Math.cos(endRad);
      const y2 = 90 + 70 * Math.sin(endRad);
      const largeArc = seg.angle > 180 ? 1 : 0;

      paths += `<path d="M 90 90 L ${x1} ${y1} A 70 70 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${colors[seg.cat]}" opacity="0.85"/>`;
    });

    return `
      <div style="position:relative;display:inline-block;">
        <svg class="pie-chart" viewBox="0 0 180 180">
          ${paths}
          <circle cx="90" cy="90" r="45" fill="#fff"/>
          <text x="90" y="85" text-anchor="middle" font-size="11" fill="#999">总支出</text>
          <text x="90" y="102" text-anchor="middle" font-size="16" font-weight="700" fill="#333" class="num">¥${formatMoney(total)}</text>
        </svg>
      </div>
    `;
  }

  function renderBarChart(data, labels) {
    const max = Math.max(...data, 1);
    const barWidth = 100 / data.length;
    let bars = '';

    data.forEach((val, i) => {
      const height = (val / max) * 70;
      const y = 80 - height;
      bars += `
        <rect x="${i * barWidth + 1}%" y="${y}" width="${barWidth - 2}%" height="${height}" 
          fill="#FF8A65" rx="2" opacity="0.85"/>
        <text x="${i * barWidth + barWidth/2}%" y="92" text-anchor="middle" font-size="9" fill="#999">${labels[i]}</text>
        ${val > 0 ? `<text x="${i * barWidth + barWidth/2}%" y="${y - 3}" text-anchor="middle" font-size="8" fill="#666" class="num">${val > 999 ? (val/1000).toFixed(1)+'k' : Math.round(val)}</text>` : ''}
      `;
    });

    return `
      <svg viewBox="0 0 300 100" style="width:100%;height:120px;">
        ${bars}
      </svg>
    `;
  }

  function renderLineChart(data, label) {
    const max = Math.max(...data, 1);
    const w = 300, h = 100;
    const step = w / Math.max(data.length - 1, 1);
    let points = '';
    let area = '';

    data.forEach((val, i) => {
      const x = i * step;
      const y = h - 10 - (val / max) * 70;
      points += `${x},${y} `;
      if (i === 0) area = `M ${x} ${h - 10}`;
      area += ` L ${x} ${y}`;
    });
    area += ` L ${(data.length - 1) * step} ${h - 10} Z`;

    return `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:120px;">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FFB74D" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#FFB74D" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${area}" fill="url(#lineGrad)"/>
        <polyline points="${points}" fill="none" stroke="#FFB74D" stroke-width="2"/>
        ${data.map((val, i) => `<circle cx="${i * step}" cy="${h - 10 - (val / max) * 70}" r="2.5" fill="#FFB74D"/>`).join('')}
      </svg>
    `;
  }

  // ===== 个人中心 =====
  function renderProfile() {
    const container = document.getElementById('profileModule');
    const allTasks = Store.Tasks.getAll();
    const allBills = Store.Bills.getAll();
    const totalExpense = allBills.filter(b => b.type === 'expense').reduce((s, b) => s + b.amount, 0);
    const recycleBin = Store.RecycleBin.getAll();
    const archivedCount = Store.Tasks.getArchived().length;
    const settings = Store.Settings.get();
    const delay = settings.archiveDelay;

    const themePacks = Object.keys(THEME_PACKS).map(function (k) {
      const p = THEME_PACKS[k];
      const active = settings.themePack === k ? ' active' : '';
      return `<button class="theme-pack${active}" onclick="App.setThemePack('${k}')" title="${p.name}">
        <span class="tp-emoji">${p.emoji}</span>
        <span class="tp-name">${p.name}</span>
        <span class="tp-dots"><i style="background:${p.primary}"></i><i style="background:${p.accent}"></i><i style="background:${p.bg}"></i></span>
      </button>`;
    }).join('');
    const ct = settings.customTheme || { primary: '#7FB069', bg: '#F2F8ED', card: '#FFFFFF', accent: '#5E8C4E' };

    container.innerHTML = `
      <div class="review-container">
        <div class="card" style="margin-bottom:16px;">
          <div class="card-title"><span>个人资料</span></div>
          <div class="setting-row">
            <span class="setting-label">昵称</span>
            <input class="form-input" style="max-width:160px;" value="${escapeHtml(settings.nickname || '')}" placeholder="朋友 / 小鹿…" onchange="App.setNickname(this.value)">
          </div>
          <div class="setting-label" style="color:var(--text-tertiary);font-size:12px;margin-top:6px;">首页问候会显示你的昵称，修改后即时生效</div>
        </div>
        <div class="card" style="margin-bottom:16px;">
          <div class="card-title"><span>数据概览</span></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
            <div class="overview-card"><div class="label">总任务数</div><div class="amount">${allTasks.length}</div></div>
            <div class="overview-card"><div class="label">已完成</div><div class="amount" style="color:var(--success);">${allTasks.filter(t=>t.completed).length}</div></div>
            <div class="overview-card"><div class="label">已归档</div><div class="amount" style="color:var(--text-secondary);">${archivedCount}</div></div>
            <div class="overview-card"><div class="label">总记账笔数</div><div class="amount">${allBills.length}</div></div>
            <div class="overview-card expense"><div class="label">累计支出</div><div class="amount">¥${formatMoney(totalExpense)}</div></div>
          </div>
        </div>
        <div class="card" style="margin-bottom:16px;">
          <div class="card-title"><span>✅ 我的打卡</span></div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <span style="font-size:13px;color:var(--text-secondary);">记录每日小习惯，松弛又治愈</span>
            <button class="btn btn-secondary" style="padding:6px 16px;font-size:13px;white-space:nowrap;" onclick="App.switchModule('checkin')">进入 ›</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:16px;">
          <div class="card-title"><span>个性化 · 主题换肤</span></div>
          <div class="setting-label" style="margin-bottom:8px;">预设主题包（点击即时换肤）</div>
          <div class="theme-packs">${themePacks}</div>
          <div class="setting-label" style="margin:14px 0 8px;">高级自定义取色</div>
          <div class="theme-custom">
            <label class="tc-item">主色 <input type="color" value="${ct.primary}" onchange="App.setCustomTheme({primary:this.value,bg:'${ct.bg}',card:'${ct.card}',accent:'${ct.accent}'})"></label>
            <label class="tc-item">背景 <input type="color" value="${ct.bg}" onchange="App.setCustomTheme({primary:'${ct.primary}',bg:this.value,card:'${ct.card}',accent:'${ct.accent}'})"></label>
            <label class="tc-item">卡片 <input type="color" value="${ct.card}" onchange="App.setCustomTheme({primary:'${ct.primary}',bg:'${ct.bg}',card:this.value,accent:'${ct.accent}'})"></label>
            <label class="tc-item">强调 <input type="color" value="${ct.accent}" onchange="App.setCustomTheme({primary:'${ct.primary}',bg:'${ct.bg}',card:'${ct.card}',accent:this.value})"></label>
          </div>
          <div class="setting-label" style="margin-top:12px;color:var(--text-tertiary);font-size:12px;line-height:1.6;">切换主题后所有页面即时联动变色，设置自动保存，下次打开仍是此主题。</div>
          <div class="setting-row">
            <span class="setting-label">自动归档已完成</span>
            <select class="form-select" style="width:auto;" onchange="App.setArchiveDelay(this.value)">
              <option value="3600000" ${String(delay)==='3600000'?'selected':''}>1 小时后</option>
              <option value="86400000" ${String(delay)==='86400000'?'selected':''}>1 天后</option>
              <option value="604800000" ${String(delay)==='604800000'?'selected':''}>1 周后</option>
              <option value="0" ${String(delay)==='0'?'selected':''}>仅手动</option>
            </select>
          </div>
          <div class="setting-row">
            <span class="setting-label">分类管理</span>
            <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px;" onclick="App.showCategoryModal()">管理</button>
          </div>
          <div class="setting-row">
            <span class="setting-label">手动刷新数据</span>
            <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px;" onclick="App.refreshData()">刷新</button>
          </div>
          <div class="setting-row">
            <span class="setting-label">已归档任务 (${archivedCount})</span>
            <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px;" onclick="App.showArchivedModal()">查看</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:16px;">
          <div class="card-title"><span>数据管理</span></div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button class="btn btn-secondary" onclick="App.exportData()">导出全部数据 (JSON)</button>
            <button class="btn btn-secondary" onclick="App.importData()">导入（覆盖）</button>
            <button class="btn btn-secondary" onclick="App.importDataMerge()">导入（合并去重）</button>
            <button class="btn btn-secondary" onclick="App.showRecycleBin()">回收站 (${recycleBin.length})</button>
            <button class="btn btn-danger" onclick="App.confirmClearAll()">清空所有数据</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title"><span>关于</span></div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
            <div>效率管理 v1.6.0</div>
            <div>任务 · 补品 · 阅读 · 健康 · 复盘 · 记账 一体化</div>
            <div>所有数据存储在本地，关闭后不丢失</div>
            <div style="margin-top:4px;">本机标识：<code style="font-size:11px;">${escapeHtml(deviceId)}</code></div>
            <div style="margin-top:4px;color:var(--text-tertiary);">数据保存在本机浏览器。卸载/重装若清除浏览器数据会丢失；绑定云端账号后可跨设备恢复（需后端支持）。</div>
            <div style="margin-top:8px;color:var(--text-tertiary);">支持 PWA 安装，可添加到桌面使用</div>
          </div>
        </div>
      </div>
    `;
  }

  // ===== 主题色 / 主题换肤 =====
  function applyTheme() {
    const s = Store.Settings.get();
    const root = document.documentElement;
    const packId = s.themePack || 'default';
    root.setAttribute('data-theme', packId);
    // 统一解析当前主题的 4 个维度（default / 预设包 / 自定义 一致处理）——真正实现整页联动
    let primary, bg, card, accent, isDark = false;
    if (packId === 'custom' && s.customTheme) {
      primary = s.customTheme.primary; bg = s.customTheme.bg; card = s.customTheme.card; accent = s.customTheme.accent;
    } else {
      const pack = THEME_PACKS[packId] || THEME_PACKS.default;
      primary = pack.primary; bg = pack.bg; card = pack.card; accent = pack.accent;
      isDark = (packId === 'dark');
    }
    // 主色系
    root.style.setProperty('--theme-primary', primary);
    root.style.setProperty('--theme-color', primary);
    // 背景 / 卡片 / 强调 —— 写入全局变量，body、卡片、导航、图表等皆跟随
    root.style.setProperty('--theme-bg', bg);
    root.style.setProperty('--bg-page', bg);
    root.style.setProperty('--theme-card', card);
    root.style.setProperty('--bg-card', card);
    root.style.setProperty('--theme-accent', accent);
    root.style.setProperty('--accent', accent);
    // 文字 / 分割线：深色模式转浅，保证可读
    if (isDark) {
      root.style.setProperty('--text-primary', '#E6E6EA');
      root.style.setProperty('--text-secondary', '#A0A0A8');
      root.style.setProperty('--border-color', '#3A3A42');
    } else {
      root.style.setProperty('--text-primary', '#4A4A4A');
      root.style.setProperty('--text-secondary', '#9A9A9A');
      root.style.setProperty('--border-color', '#EEEEEE');
    }
    // 导航底色 tint（顶部栏 / 底部栏 / hover 可引用）
    const rgb = hexToRgb(primary);
    root.style.setProperty('--nav-bg', `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.12)`);
    root.style.setProperty('--nav-bg-solid', `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.9)`);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', primary);
  }
  function setThemeColor(color) {
    Store.Settings.update({ themeColor: color, themePack: null, customTheme: null });
    applyTheme();
    render();
  }
  function setThemePack(id) {
    Store.Settings.update({ themePack: id, customTheme: null });
    applyTheme();
    render();
  }
  function setCustomTheme(obj) {
    Store.Settings.update({ themePack: 'custom', customTheme: obj });
    applyTheme();
    render();
  }

  // ===== 归档 =====
  function setArchiveDelay(val) {
    Store.Settings.update({ archiveDelay: parseInt(val, 10) });
    const n = Store.Tasks.autoArchive();
    toast(n > 0 ? `已自动归档 ${n} 项` : '归档设置已更新');
    render();
  }
  function showArchivedModal() {
    const items = Store.Tasks.getArchived();
    showModal(`
      <div class="modal-title">已归档任务 (${items.length})</div>
      <div style="max-height:380px;overflow-y:auto;">
        ${items.length === 0 ? '<div class="empty-state"><div class="empty-illustration">🗄️</div>暂无已归档任务</div>' :
          items.map(t => `
            <div class="archived-item">
              <div class="archived-info">
                <div class="archived-name">${escapeHtml(t.name)}</div>
                <div class="archived-meta">${DIMENSIONS[t.dimension].name} · ${t.date}${t.focusMinutes ? ' · 专注' + t.focusMinutes + '分' : ''}</div>
              </div>
              <div class="archived-actions">
                <button class="btn btn-secondary" style="padding:6px 10px;font-size:12px;" onclick="App.restoreTask('${t.id}')">恢复</button>
                <button class="btn btn-danger" style="padding:6px 10px;font-size:12px;" onclick="App.permanentlyDeleteTask('${t.id}')">删除</button>
              </div>
            </div>`).join('')
        }
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.archiveAllCompleted()">归档全部已完成</button>
        <button class="btn btn-secondary" onclick="App.closeModal()">关闭</button>
      </div>
    `);
  }
  function restoreTask(id) {
    Store.Tasks.restore(id);
    toast('已恢复任务');
    App.showArchivedModal();
    if (currentModule === 'todo') render();
  }
  function permanentlyDeleteTask(id) {
    confirmDialog('永久删除', '此操作不可恢复，确定要永久删除该任务吗？', () => {
      Store.Tasks.removePermanently(id);
      toast('已永久删除');
      App.showArchivedModal();
      if (currentModule === 'todo') render();
    });
  }
  function archiveAllCompleted() {
    let n = 0;
    Store.Tasks.getAll().forEach(t => { if (t.completed && !t.isArchived) { Store.Tasks.archive(t.id); n++; } });
    toast(`已归档 ${n} 项已完成任务`);
    App.showArchivedModal();
    if (currentModule === 'todo') render();
  }

  // ===== 分类管理 =====
  const DEFAULT_ACCENT_HEX = { work: '#FFB74D', study: '#CE93D8', health: '#64B5F6', life: '#F48FB1' };
  let categoryModalOrder = null;

  function hexToRgb(hex) {
    const h = (hex || '#999999').replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function lighten(hex, r) {
    const [R, G, B] = hexToRgb(hex);
    const mix = c => Math.round(c + (255 - c) * r);
    return `rgb(${mix(R)}, ${mix(G)}, ${mix(B)})`;
  }
  function accentHex(key) {
    const cur = DIMENSIONS[key] && DIMENSIONS[key].accent;
    if (cur && cur.startsWith('#')) return cur;
    return DEFAULT_ACCENT_HEX[key] || '#999999';
  }
  function showCategoryModal() {
    if (!categoryModalOrder) categoryModalOrder = getDimensionOrder().slice();
    const rows = categoryModalOrder.map((k, i) => {
      const d = DIMENSIONS[k];
      const accent = accentHex(k);
      return `
        <div class="cat-row">
          <span class="dim-dot" style="background:${accent}"></span>
          <input type="text" class="form-input cat-name-input" data-cat-name="${k}" value="${escapeHtml(d.name)}" style="flex:1;">
          <input type="color" class="cat-color-input" data-cat-color="${k}" value="${accent}">
          <button class="icon-btn" ${i === 0 ? 'disabled' : ''} onclick="App.moveCategory('${k}',-1)">↑</button>
          <button class="icon-btn" ${i === categoryModalOrder.length - 1 ? 'disabled' : ''} onclick="App.moveCategory('${k}',1)">↓</button>
        </div>`;
    }).join('');
    showModal(`
      <div class="modal-title">分类管理</div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">4 个维度始终保留（不可删除），可重命名、换色与排序。</p>
      <div class="cat-rows">${rows}</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.resetCategories()">恢复默认</button>
        <button class="btn btn-primary" onclick="App.saveCategories()">保存</button>
      </div>
    `);
  }
  function moveCategory(key, dir) {
    const i = categoryModalOrder.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= categoryModalOrder.length) return;
    const tmp = categoryModalOrder[i];
    categoryModalOrder[i] = categoryModalOrder[j];
    categoryModalOrder[j] = tmp;
    showCategoryModal();
  }
  function saveCategories() {
    const items = {};
    document.querySelectorAll('.cat-name-input').forEach(inp => {
      const k = inp.dataset.catName;
      const colorInput = document.querySelector(`[data-cat-color="${k}"]`);
      const accent = colorInput ? colorInput.value : (DEFAULT_ACCENT_HEX[k] || '#999999');
      items[k] = { name: inp.value.trim() || DIMENSION_PRESETS[k].name, icon: DIMENSION_PRESETS[k].icon, accent, bg: lighten(accent, 0.82) };
    });
    Store.Settings.update({ categories: { order: categoryModalOrder.slice(), items } });
    categoryModalOrder = null;
    refreshDimensions();
    closeModal();
    toast('分类已更新');
    render();
  }
  function resetCategories() {
    Store.Settings.update({ categories: null });
    categoryModalOrder = null;
    refreshDimensions();
    closeModal();
    toast('已恢复默认分类');
    render();
  }

  // ===== 事件绑定 =====
  function attachTodoEvents() {
    // 便利贴自动保存
    const sticky = document.getElementById('stickyNoteInput');
    if (sticky) {
      let timer;
      sticky.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          Store.StickyNotes.set(sticky.value);
          setSyncStatus('synced');
        }, 500);
      });
    }

    // 复盘备忘自动保存
    const memo = document.getElementById('reviewMemoInput');
    if (memo) {
      let timer;
      memo.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          saveReviewMemo(memo.value);
        }, 500);
      });
    }
  }

  function attachFinanceEvents() {
    // 财务模块事件
  }

  // ===== 专注计时器 =====
  const TIMER_KEY = 'efficiency_timer';
  let timerState = loadTimerState();
  let timerInterval = null;
  let timerBroadcast = null;
  try { timerBroadcast = new BroadcastChannel('efficiency_timer'); } catch (e) { /* 旧浏览器兼容 */ }

  function loadTimerState() {
    try {
      const s = JSON.parse(localStorage.getItem(TIMER_KEY));
      if (s && typeof s === 'object') return s;
    } catch (e) {}
    return { running: false, mode: 'countup', plannedSeconds: 10 * 60, startedAt: 0, accumulatedSeconds: 0, linkedTaskId: null, linkedTaskName: '' };
  }
  function saveTimerState() {
    try { localStorage.setItem(TIMER_KEY, JSON.stringify(timerState)); } catch (e) {}
  }
  function timerElapsedSeconds() {
    if (timerState.running && timerState.startedAt) {
      return timerState.accumulatedSeconds + (Date.now() - timerState.startedAt) / 1000;
    }
    return timerState.accumulatedSeconds;
  }
  function timerRemainingSeconds() {
    return Math.max(0, timerState.plannedSeconds - timerElapsedSeconds());
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  // ===== iOS 风格触摸滑动滚轮 =====
  const WHEEL_ITEM_H = 36;          // 单项高度
  const WHEEL_BASE = 72;            // 选中项居中偏移 = (180 - 36) / 2
  const WHEEL_RANGES = { h: 24, m: 60, s: 60 };
  function timerWheelCol(part, label) {
    const max = WHEEL_RANGES[part];
    let items = '';
    for (let i = 0; i < max; i++) items += `<div class="wheel-item">${String(i).padStart(2, '0')}</div>`;
    return `
      <div class="wheel-col">
        <div class="wheel-viewport" data-part="${part}">
          <div class="wheel-highlight"></div>
          <div class="wheel-list" data-part="${part}">${items}</div>
        </div>
        <div class="wheel-label">${label}</div>
      </div>`;
  }
  function wheelGetHMS() {
    return {
      h: Math.floor(timerState.plannedSeconds / 3600),
      m: Math.floor((timerState.plannedSeconds % 3600) / 60),
      s: timerState.plannedSeconds % 60,
    };
  }
  function wheelSetVal(part, val) {
    const v = wheelGetHMS();
    v[part] = val;
    timerState.plannedSeconds = v.h * 3600 + v.m * 60 + v.s;
    saveTimerState();
    // 静默更新大数字显示，不重渲染（避免打断触摸）
    const panel = document.getElementById('timerPanel');
    const disp = panel && panel.querySelector('.timer-display');
    if (disp && !timerState.running) disp.textContent = fmtTime(timerState.plannedSeconds);
  }
  // 触摸/鼠标滑动滚轮引擎：拖动跟手 + 松手惯性 + 吸附最近整数
  function initTimerWheels() {
    document.querySelectorAll('#timerPanel .wheel-viewport').forEach(vp => {
      const part = vp.dataset.part;
      const list = vp.querySelector('.wheel-list');
      const max = WHEEL_RANGES[part];
      const minOff = WHEEL_BASE - (max - 1) * WHEEL_ITEM_H;
      const maxOff = WHEEL_BASE;
      let offset = WHEEL_BASE - wheelGetHMS()[part] * WHEEL_ITEM_H;
      let dragging = false, startY = 0, startOff = 0, lastY = 0, lastT = 0, velocity = 0;

      function paint() {
        list.style.transform = `translateY(${offset}px)`;
        const idx = Math.round((WHEEL_BASE - offset) / WHEEL_ITEM_H);
        list.querySelectorAll('.wheel-item').forEach((el, i) => {
          el.classList.toggle('active', i === idx);
          el.classList.toggle('near', Math.abs(i - idx) === 1);
        });
      }
      function snap(extra) {
        let target = offset + (extra || 0);
        target = Math.max(minOff, Math.min(maxOff, target));
        const val = Math.max(0, Math.min(max - 1, Math.round((WHEEL_BASE - target) / WHEEL_ITEM_H)));
        offset = WHEEL_BASE - val * WHEEL_ITEM_H;
        list.style.transition = 'transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1)';
        paint();
        wheelSetVal(part, val);
        if (navigator.vibrate) navigator.vibrate(8); // 轻微触感反馈
      }
      function onDown(e) {
        dragging = true;
        startY = lastY = (e.touches ? e.touches[0].clientY : e.clientY);
        startOff = offset;
        lastT = Date.now();
        velocity = 0;
        list.style.transition = 'none';
      }
      function onMove(e) {
        if (!dragging) return;
        e.preventDefault();
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        const now = Date.now();
        if (now - lastT > 0) velocity = (y - lastY) / (now - lastT); // px/ms
        lastY = y; lastT = now;
        let next = startOff + (y - startY);
        // 越界橡皮筋阻尼
        if (next > maxOff) next = maxOff + (next - maxOff) * 0.3;
        if (next < minOff) next = minOff + (next - minOff) * 0.3;
        offset = next;
        paint();
      }
      function onUp() {
        if (!dragging) return;
        dragging = false;
        // 惯性投射：按松手速度延伸一段距离再吸附
        const momentum = Math.max(-260, Math.min(260, velocity * 160));
        snap(momentum);
      }
      // 触摸事件
      vp.addEventListener('touchstart', onDown, { passive: true });
      vp.addEventListener('touchmove', onMove, { passive: false });
      vp.addEventListener('touchend', onUp);
      vp.addEventListener('touchcancel', onUp);
      // 鼠标事件（桌面端）
      vp.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(e); });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      // 滚轮事件（桌面端）
      vp.addEventListener('wheel', (e) => {
        e.preventDefault();
        list.style.transition = 'none';
        offset -= Math.sign(e.deltaY) * WHEEL_ITEM_H;
        snap(0);
      }, { passive: false });
      // 点击上下相邻数字直接选中
      vp.addEventListener('click', (e) => {
        const item = e.target.closest('.wheel-item');
        if (!item || Math.abs(lastY - startY) > 6) return;
        const items = Array.from(list.querySelectorAll('.wheel-item'));
        const i = items.indexOf(item);
        if (i >= 0) { offset = WHEEL_BASE - i * WHEEL_ITEM_H; snap(0); }
      });
      paint();
    });
  }
  function broadcastTimer() {
    if (timerBroadcast) { try { timerBroadcast.postMessage({ state: timerState }); } catch (e) {} }
  }

  function ensureTimerDom() {
    if (document.getElementById('timerPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'timerPanel';
    panel.className = 'timer-panel';
    document.body.appendChild(panel);
    panel.addEventListener('click', (e) => { if (e.target === panel) closeTimerModal(); });
  }

  function showTimerModal() {
    ensureTimerDom();
    renderTimerModal();
    document.getElementById('timerPanel').classList.add('active');
  }
  function closeTimerModal() {
    const panel = document.getElementById('timerPanel');
    if (panel) panel.classList.remove('active');
  }

  function renderTimerModal() {
    const panel = document.getElementById('timerPanel');
    if (!panel) return;
    const display = timerState.mode === 'countdown' ? timerRemainingSeconds() : timerElapsedSeconds();
    const presets = [15, 30, 60].map(m =>
      `<button class="timer-preset ${timerState.plannedSeconds === m * 60 && timerState.mode === 'countdown' ? 'active' : ''}" onclick="App.timerSetPreset(${m})">${m < 60 ? m + 'm' : (m / 60) + 'h'}</button>`
    ).join('');
    const taskOpts = Store.Tasks.getByDate(currentDate).filter(t => !t.completed)
      .map(t => `<option value="${t.id}" ${timerState.linkedTaskId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
    const running = timerState.running;

    panel.innerHTML = `
      <div class="timer-modal">
        <div class="timer-modal-head">
          <span>⏱️ 专注计时</span>
          <button class="timer-close" onclick="App.closeTimerModal()">✕</button>
        </div>
        <div class="timer-mode">
          <button class="timer-mode-btn ${timerState.mode === 'countup' ? 'active' : ''}" onclick="App.timerSetMode('countup')">正计时</button>
          <button class="timer-mode-btn ${timerState.mode === 'countdown' ? 'active' : ''}" onclick="App.timerSetMode('countdown')">倒计时</button>
        </div>
        <button class="timer-ringtone-btn" onclick="App.showRingtonePanel()">🔔 铃声 · ${currentRingtoneName()}</button>
        ${timerState.mode === 'countdown' && !running ? `
          <div class="timer-wheels">
            ${timerWheelCol('h', '时')}
            <span class="wheel-sep">:</span>
            ${timerWheelCol('m', '分')}
            <span class="wheel-sep">:</span>
            ${timerWheelCol('s', '秒')}
          </div>` : ''}
        <div class="timer-display ${running ? 'running' : ''}">${fmtTime(display)}</div>
        ${timerState.mode === 'countdown' ? `<div class="timer-presets">${presets}</div>` : ''}
        <div class="form-group">
          <label class="form-label">关联任务（可选）</label>
          <select class="form-select" id="timerTask">
            <option value="">不关联</option>
            ${taskOpts}
          </select>
        </div>
        <div class="timer-controls">
          ${running
            ? `<button class="btn btn-secondary" onclick="App.timerPause()">⏸ 暂停</button>
               <button class="btn btn-primary" onclick="App.timerFinish()">⏹ 结束并记录</button>`
            : `<button class="btn btn-primary" onclick="App.timerStart()">▶ ${timerState.accumulatedSeconds > 0 ? '继续' : '开始'}</button>
               ${timerState.accumulatedSeconds > 0 ? `<button class="btn btn-secondary" onclick="App.timerReset()">↺ 重置</button>` : ''}`}
        </div>
        <div class="timer-hint">基于真实时间计时，切后台/刷新/多标签页均自动同步；倒计时归零自动记录。</div>
      </div>
    `;
    if (timerState.mode === 'countdown' && !running) initTimerWheels();
  }

  function startTimerTick() {
    stopTimerTick();
    timerInterval = setInterval(() => {
      if (!timerState.running) return;
      if (timerState.mode === 'countdown' && timerRemainingSeconds() <= 0) {
        timerFinish();
        return;
      }
      updateTimerDisplay();
      updateTimerPill();
    }, 1000);
  }
  function stopTimerTick() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }
  function updateTimerDisplay() {
    const panel = document.getElementById('timerPanel');
    const disp = panel && panel.querySelector('.timer-display');
    if (disp && timerState.running) {
      const display = timerState.mode === 'countdown' ? timerRemainingSeconds() : timerElapsedSeconds();
      disp.textContent = fmtTime(display);
    }
  }
  function updateTimerPill() {
    let pill = document.getElementById('timerPill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'timerPill';
      pill.className = 'timer-pill';
      pill.onclick = () => App.showTimerModal();
      document.body.appendChild(pill);
    }
    if (timerState.running) {
      const display = timerState.mode === 'countdown' ? timerRemainingSeconds() : timerElapsedSeconds();
      pill.style.display = 'flex';
      pill.innerHTML = `⏱️ ${fmtTime(display)} <span class="pill-mode">${timerState.mode === 'countdown' ? '倒计时' : '正计时'}${timerState.linkedTaskName ? ' · ' + escapeHtml(timerState.linkedTaskName) : ''}</span>`;
    } else {
      pill.style.display = 'none';
    }
  }
  // ===== 计时铃声（Web Audio 离线合成，无需任何音频文件）=====
  // 单一持久 AudioContext，避免反复 new 触发浏览器上下文数量限制 / 自动播放策略拦截
  let _ringtoneCtx = null;
  let _ringtoneNodes = [];
  function ringtoneCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!_ringtoneCtx) _ringtoneCtx = new Ctx();
    if (_ringtoneCtx.state === 'suspended') _ringtoneCtx.resume();
    return _ringtoneCtx;
  }
  function ringtoneStopAll() {
    _ringtoneNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    _ringtoneNodes = [];
  }
  // 单个音符（带 ADSR 包络）。峰值统一放大 1.7 倍并封顶 0.5，确保手机扬声器清晰可听
  function rtNote(ctx, dest, freq, t0, dur, type, peak) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.min(0.5, (peak || 0.28) * 1.7), t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    _ringtoneNodes.push(o);
  }
  // 12 种铃声合成函数（签名：ctx, dest, t0, durSec）
  const RINGTONE_SOUNDS = {
    雷达(ctx, dest, t0, dur) { // 清脆渐强脉冲（雷达式上扫）
      let t = t0;
      while (t < t0 + dur - 0.25) {
        rtNote(ctx, dest, 660, t, 0.22, 'sine', 0.3);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, t + 0.18);
        o.frequency.exponentialRampToValueAtTime(1320, t + 0.36);
        g.gain.setValueAtTime(0.0001, t + 0.18);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g); g.connect(dest);
        o.start(t + 0.18); o.stop(t + 0.45);
        _ringtoneNodes.push(o);
        t += 0.5;
      }
    },
    和弦(ctx, dest, t0) { // 柔和和弦上升
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => rtNote(ctx, dest, f, t0 + i * 0.12, 0.9, 'sine', 0.18));
    },
    钟声(ctx, dest, t0) { // 温暖木质钟声
      rtNote(ctx, dest, 784, t0, 1.4, 'triangle', 0.3);
      rtNote(ctx, dest, 1046.5, t0 + 0.02, 1.2, 'sine', 0.12);
    },
    叮咚(ctx, dest, t0) { // 清脆双音节
      rtNote(ctx, dest, 987.77, t0, 0.4, 'sine', 0.3);
      rtNote(ctx, dest, 783.99, t0 + 0.45, 0.6, 'sine', 0.3);
    },
    晨曦(ctx, dest, t0) { // 鸟鸣 + 风铃
      [880, 1100, 1320, 1100, 880, 659.25].forEach((f, i) => rtNote(ctx, dest, f, t0 + i * 0.16, 0.18, 'sine', 0.2));
    },
    电子(ctx, dest, t0, dur) { // 现代数字脉冲
      let t = t0;
      while (t < t0 + dur - 0.1) { rtNote(ctx, dest, 440, t, 0.06, 'square', 0.14); t += 0.15; }
    },
    涟漪(ctx, dest, t0) { // 水波扩散
      rtNote(ctx, dest, 1200, t0, 0.5, 'sine', 0.28);
      rtNote(ctx, dest, 800, t0 + 0.5, 0.7, 'sine', 0.2);
    },
    轻触(ctx, dest, t0) { // 短促轻柔三连
      rtNote(ctx, dest, 1200, t0, 0.12, 'sine', 0.26);
      rtNote(ctx, dest, 1400, t0 + 0.1, 0.12, 'sine', 0.22);
      rtNote(ctx, dest, 1600, t0 + 0.2, 0.12, 'sine', 0.18);
    },
    明亮(ctx, dest, t0) { // 高亢清亮
      rtNote(ctx, dest, 1760, t0, 0.6, 'sine', 0.3);
    },
    悠扬(ctx, dest, t0, dur) { // 长音渐弱
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(523, t0);
      o.frequency.exponentialRampToValueAtTime(392, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest);
      o.start(t0); o.stop(t0 + dur + 0.05);
      _ringtoneNodes.push(o);
    },
    颤音(ctx, dest, t0, dur) { // 快速重复脉冲 + 颤音
      let t = t0;
      while (t < t0 + dur - 0.1) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, t);
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 25; lg.gain.value = 40;
        lfo.connect(lg); lg.connect(o.frequency);
        lfo.start(t); lfo.stop(t + 0.12);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        o.connect(g); g.connect(dest);
        o.start(t); o.stop(t + 0.13);
        _ringtoneNodes.push(o); _ringtoneNodes.push(lfo);
        t += 0.13;
      }
    },
    静音() {},
  };
  const RINGTONES = Object.keys(RINGTONE_SOUNDS).map(name => ({ name }));
  function playRingtone(name, ms) {
    try {
      const ctx = ringtoneCtx(); // 用户手势中调用，内部已自动 resume()
      if (!ctx) throw new Error('当前浏览器不支持 Web Audio');
      ringtoneStopAll();
      if (name === '静音') { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); return; }
      const dest = ctx.createGain();
      dest.gain.value = 1;
      dest.connect(ctx.destination);
      const fn = RINGTONE_SOUNDS[name] || RINGTONE_SOUNDS['雷达'];
      fn(ctx, dest, ctx.currentTime + 0.04, (ms || 3000) / 1000);
      if (navigator.vibrate) navigator.vibrate(200); // 振动辅助反馈
      // 如果 resume 后仍处于 suspended（极端情况），提示用户
      setTimeout(() => {
        if (_ringtoneCtx && _ringtoneCtx.state !== 'running') {
          console.error('[铃声] AudioContext 状态异常：' + _ringtoneCtx.state);
          toast('铃声被浏览器拦截，请检查设备音量或权限');
        }
      }, 300);
    } catch (e) {
      console.error('[铃声播放失败]', e);
      toast('铃声播放失败，请检查设备音量或权限');
    }
  }
  // 依次播放所有铃声（调试用），每个约 1 秒
  let _testingAll = false;
  function testAllRingtones() {
    if (_testingAll) return;
    _testingAll = true;
    const names = RINGTONES.map(r => r.name).filter(n => n !== '静音');
    let i = 0;
    const next = () => {
      if (i >= names.length) { _testingAll = false; toast('✅ 全部铃声测试完成'); return; }
      toast('▶ 正在播放：' + names[i]);
      playRingtone(names[i], 900);
      i++;
      setTimeout(next, 1150);
    };
    next();
  }
  // 440Hz 正弦波调试音：排除合成算法问题，直接验证设备能否发声
  function debugBeep() {
    try {
      const ctx = ringtoneCtx();
      if (!ctx) throw new Error('当前浏览器不支持 Web Audio');
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 440;
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 1);
      _ringtoneNodes.push(o);
      if (navigator.vibrate) navigator.vibrate(200);
      toast('🔊 正在播放 440Hz 测试音…听不到请检查媒体音量/静音开关');
    } catch (e) {
      console.error('[调试音播放失败]', e);
      toast('播放失败：' + e.message);
    }
  }
  function currentRingtoneName() { return Store.Settings.get().timerRingtone || '雷达'; }
  function showRingtonePanel() {
    let sheet = document.getElementById('ringtoneSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'ringtoneSheet';
      sheet.className = 'sheet-mask';
      document.body.appendChild(sheet);
    }
    const cur = currentRingtoneName();
    sheet.innerHTML = `
      <div class="sheet">
        <div class="sheet-head"><span>🔔 倒计时归零铃声</span><button class="install-close" onclick="App.closeRingtonePanel()">✕</button></div>
        <div class="ringtone-list">
          ${RINGTONES.map(n => `
            <div class="ringtone-row ${n.name === cur ? 'active' : ''}" onclick="App.selectRingtone('${n.name}')">
              <span class="rt-name">${n.name}</span>
              <button class="rt-preview" onclick="event.stopPropagation();App.previewRingtone('${n.name}')">▶️ 试听</button>
              <span class="rt-check">${n.name === cur ? '✓' : ''}</span>
            </div>`).join('')}
        </div>
        <div class="ringtone-debug">
          <button onclick="App.testAllRingtones()">🧪 测试所有铃声</button>
          <button onclick="App.debugBeep()">🔊 440Hz 调试音</button>
        </div>
      </div>`;
    sheet.classList.add('active');
    sheet.onclick = (e) => { if (e.target === sheet) App.closeRingtonePanel(); };
  }
  function closeRingtonePanel() {
    const s = document.getElementById('ringtoneSheet');
    if (s) s.classList.remove('active');
  }
  function previewRingtone(name) { playRingtone(name, 2000); }
  function selectRingtone(name) {
    Store.Settings.update({ timerRingtone: name });
    closeRingtonePanel();
    renderTimerModal();
    toast('铃声已设为：' + name);
  }

  function timerStart() {
    // 全局计时单例：启动专注计时前，若阅读计时在跑则先暂停它
    if (readingTimer && readingTimer.running) {
      readingTimer.accumulated = readingElapsed();
      readingTimer.running = false; readingTimer.startedAt = 0;
      stopReadingTick();
      toast('已暂停阅读计时，开始专注计时');
    }
    const sel = document.getElementById('timerTask');
    if (sel) {
      timerState.linkedTaskId = sel.value || null;
      timerState.linkedTaskName = sel.value ? ((Store.Tasks.getById(sel.value) || {}).name || '') : '';
    }
    if (timerState.mode === 'countdown' && timerState.plannedSeconds <= 0) {
      toast('请先选择倒计时时长');
      return;
    }
    timerState.running = true;
    timerState.startedAt = Date.now();
    saveTimerState();
    startTimerTick();
    broadcastTimer();
    renderTimerModal();
    updateTimerPill();
  }
  function timerPause() {
    timerState.accumulatedSeconds = timerElapsedSeconds();
    timerState.running = false;
    timerState.startedAt = 0;
    saveTimerState();
    stopTimerTick();
    broadcastTimer();
    renderTimerModal();
    updateTimerPill();
  }
  function timerReset() {
    timerState.running = false;
    timerState.startedAt = 0;
    timerState.accumulatedSeconds = 0;
    saveTimerState();
    stopTimerTick();
    renderTimerModal();
    updateTimerPill();
  }
  function timerFinish() {
    const minutes = Math.max(1, Math.round(timerElapsedSeconds() / 60));
    const dateStr = Store.DateUtils.formatDate(new Date());
    const startedMs = timerState.startedAt
      ? timerState.startedAt - timerState.accumulatedSeconds * 1000
      : Date.now() - minutes * 60000;
    Store.FocusSessions.create({
      taskId: timerState.linkedTaskId,
      taskName: timerState.linkedTaskName,
      mode: timerState.mode,
      plannedMinutes: timerState.mode === 'countdown' ? Math.round(timerState.plannedSeconds / 60) : 0,
      minutes,
      date: dateStr,
      startedAt: startedMs,
      endedAt: Date.now(),
      note: timerState.mode === 'countdown' ? '倒计时完成' : '正计时结束',
    });
    if (timerState.linkedTaskId) Store.Tasks.addFocusMinutes(timerState.linkedTaskId, minutes);
    const label = timerState.linkedTaskName ? `《${timerState.linkedTaskName}》` : '';
    toast(`已记录专注 ${minutes} 分钟${label}`);
    playRingtone(currentRingtoneName(), 4000);
    timerState = { running: false, mode: timerState.mode, plannedSeconds: timerState.plannedSeconds, startedAt: 0, accumulatedSeconds: 0, linkedTaskId: null, linkedTaskName: '' };
    saveTimerState();
    stopTimerTick();
    broadcastTimer();
    closeTimerModal();
    updateTimerPill();
    if (currentModule === 'todo') render();
  }
  function timerSetMode(mode) {
    timerState.mode = mode;
    if (mode === 'countdown' && timerState.plannedSeconds <= 0) timerState.plannedSeconds = 10 * 60; // 默认 0时10分0秒
    saveTimerState();
    renderTimerModal();
  }
  function timerSetPreset(min) {
    timerState.mode = 'countdown';
    timerState.plannedSeconds = min * 60;
    saveTimerState();
    renderTimerModal();
  }
  function timerPickerDelta(part, delta) {
    let h = Math.floor(timerState.plannedSeconds / 3600);
    let m = Math.floor((timerState.plannedSeconds % 3600) / 60);
    let s = timerState.plannedSeconds % 60;
    if (part === 'h') h = Math.max(0, Math.min(23, h + delta));
    if (part === 'm') m = Math.max(0, Math.min(59, m + delta));
    if (part === 's') s = Math.max(0, Math.min(59, s + delta));
    timerState.plannedSeconds = h * 3600 + m * 60 + s;
    saveTimerState();
    renderTimerModal();
  }
  function recoverTimer() {
    if (timerState.running) {
      startTimerTick();
      updateTimerPill();
      toast('已恢复上次未结束的计时');
    }
  }

  if (timerBroadcast) {
    timerBroadcast.onmessage = (e) => {
      if (e.data && e.data.state) {
        timerState = e.data.state;
        saveTimerState();
        const panel = document.getElementById('timerPanel');
        if (panel && panel.classList.contains('active')) renderTimerModal();
        updateTimerPill();
      }
    };
  }

  // ============================================================
  //  内置知识库（离线 AI 解析用，无需联网）
  // ============================================================
  const SUPPLEMENT_KB = [
    { keys: ['维生素d', '维d', 'vd', 'd3', '维他命d'], name: '维生素D', effects: '促进钙吸收 · 强健骨骼 · 免疫支持', bestTime: '早餐后', frequency: 1, reminderTime: '09:00', reason: '随含脂肪早餐服用吸收更好' },
    { keys: ['维生素c', '维c', 'vc', '维他命c'], name: '维生素C', effects: '抗氧化 · 增强免疫 · 促进胶原', bestTime: '餐后', frequency: 1, reminderTime: '08:00', reason: '餐后服用减少胃部刺激' },
    { keys: ['复合维生素b', '维生素b族', '维b', 'b族', 'vb'], name: '复合维生素B', effects: '缓解疲劳 · 维护神经 · 促代谢', bestTime: '早餐后', frequency: 1, reminderTime: '08:00', reason: '早晨服用提神，避免影响夜间睡眠' },
    { keys: ['维生素b12', 'vb12', 'b12'], name: '维生素B12', effects: '补血 · 维护神经 · 抗疲劳', bestTime: '早餐后', frequency: 1, reminderTime: '08:00', reason: '随餐吸收更佳' },
    { keys: ['钙', '碳酸钙', '柠檬酸钙'], name: '钙片', effects: '强健骨骼 · 牙齿健康', bestTime: '晚餐后', frequency: 1, reminderTime: '20:00', reason: '夜间血钙低，睡前补钙吸收好' },
    { keys: ['铁', '补铁', '硫酸亚铁', '葡萄糖酸亚铁'], name: '铁剂', effects: '补血 · 改善贫血 · 抗疲劳', bestTime: '餐后', frequency: 1, reminderTime: '12:30', reason: '配合维C吸收好，避免与茶/咖啡同服' },
    { keys: ['锌', '葡萄糖酸锌', '赖氨葡锌'], name: '葡萄糖酸锌', effects: '免疫支持 · 改善食欲 · 皮肤健康', bestTime: '餐后', frequency: 1, reminderTime: '12:30', reason: '餐后服用减少恶心' },
    { keys: ['鱼油', '深海鱼油', 'dha', 'epa', '藻油'], name: '鱼油', effects: '护心脑 · 抗炎 · 明目', bestTime: '随餐', frequency: 1, reminderTime: '12:00', reason: '随脂餐吸收好，减少的鱼腥味反吐' },
    { keys: ['镁', '柠檬酸镁', '甘氨酸镁'], name: '镁', effects: '放松神经 · 助眠 · 缓解抽筋', bestTime: '睡前', frequency: 1, reminderTime: '22:00', reason: '夜间服用助放松与睡眠' },
    { keys: ['益生菌', '益生元', '乳酸菌'], name: '益生菌', effects: '调理肠道 · 增强消化 · 免疫', bestTime: '餐前', frequency: 1, reminderTime: '07:30', reason: '空腹服用活菌更易到达肠道' },
    { keys: ['蛋白粉', '乳清蛋白', '大豆蛋白'], name: '蛋白粉', effects: '增肌 · 修复组织 · 补充营养', bestTime: '运动后', frequency: 1, reminderTime: '18:00', reason: '运动后30分钟内补充吸收最佳' },
    { keys: ['叶酸', '活性叶酸'], name: '叶酸', effects: '造血 · 备孕支持 · 神经发育', bestTime: '早餐后', frequency: 1, reminderTime: '08:00', reason: '晨服吸收稳定' },
    { keys: ['维生素e', '维e', 've'], name: '维生素E', effects: '抗氧化 · 护肤 · 护血管', bestTime: '餐后', frequency: 1, reminderTime: '12:30', reason: '随餐脂溶吸收好' },
    { keys: ['维生素a', '维a', 'va', '胡萝卜素'], name: '维生素A', effects: '护眼 · 护肤 · 免疫', bestTime: '随餐', frequency: 1, reminderTime: '12:00', reason: '脂溶性，随脂餐服' },
    { keys: ['维生素k', '维k', 'vk', 'k2'], name: '维生素K', effects: '助钙成骨 · 凝血支持', bestTime: '晚餐后', frequency: 1, reminderTime: '20:00', reason: '与钙同服协同强骨' },
    { keys: ['氨糖', '软骨素', '葡萄糖胺'], name: '氨糖软骨素', effects: '养护关节 · 缓解关节痛', bestTime: '餐后', frequency: 1, reminderTime: '12:30', reason: '餐后减少胃肠刺激' },
    { keys: ['胶原蛋白', '胶原'], name: '胶原蛋白', effects: '护肤 · 护关节 · 强韧', bestTime: '睡前', frequency: 1, reminderTime: '22:00', reason: '夜间修复期吸收好' },
    { keys: ['辅酶q10', 'q10'], name: '辅酶Q10', effects: '护心 · 抗疲劳 · 抗氧化', bestTime: '随餐', frequency: 1, reminderTime: '12:00', reason: '脂溶性随餐服' },
    { keys: ['卵磷脂', '大豆卵磷脂'], name: '卵磷脂', effects: '护脑 · 降血脂 · 肝支持', bestTime: '餐前', frequency: 1, reminderTime: '07:30', reason: '空腹吸收好' },
    { keys: ['膳食纤维', '纤维粉', '菊粉'], name: '膳食纤维', effects: '促排便 · 控糖 · 肠道菌群', bestTime: '餐前', frequency: 1, reminderTime: '07:30', reason: '餐前冲服更利肠道' },
    { keys: ['褪黑素', '美拉托宁'], name: '褪黑素', effects: '调节睡眠 · 助眠', bestTime: '睡前', frequency: 1, reminderTime: '22:30', reason: '睡前30分钟服用助入睡' },
    { keys: ['叶黄素', '蓝莓', '护眼'], name: '叶黄素', effects: '护眼 · 缓解视疲劳', bestTime: '随餐', frequency: 1, reminderTime: '12:00', reason: '脂溶随脂餐吸收' },
    { keys: ['蜂胶', ' propolis'], name: '蜂胶', effects: '抗菌 · 增强免疫 · 口腔健康', bestTime: '餐后', frequency: 1, reminderTime: '12:30', reason: '餐后含服或温水送服' },
    { keys: ['螺旋藻', '藻粉'], name: '螺旋藻', effects: '补蛋白 · 抗疲劳 · 免疫', bestTime: '餐前', frequency: 1, reminderTime: '07:30', reason: '餐前温水送服' },
    { keys: ['葡萄籽', 'opc'], name: '葡萄籽', effects: '抗氧化 · 护肤 · 护血管', bestTime: '餐后', frequency: 1, reminderTime: '12:30', reason: '餐后减少刺激' },
    { keys: ['番茄红素', 'lycopene'], name: '番茄红素', effects: '护前列腺 · 抗氧化', bestTime: '随餐', frequency: 1, reminderTime: '12:00', reason: '脂溶随餐服' },
    { keys: ['牛磺酸', 'taurine'], name: '牛磺酸', effects: '抗疲劳 · 护心 · 明目', bestTime: '早餐后', frequency: 1, reminderTime: '08:00', reason: '晨服提神' },
    { keys: ['鱼肝油'], name: '鱼肝油', effects: '补维A/D · 护眼 · 强骨', bestTime: '早餐后', frequency: 1, reminderTime: '08:00', reason: '随脂餐吸收好' },
    { keys: ['多维', '复合维生素', '多种维生素', '善存'], name: '复合维生素', effects: '全面补充 · 抗疲劳 · 免疫', bestTime: '早餐后', frequency: 1, reminderTime: '08:00', reason: '晨服随餐吸收好' },
    { keys: ['鱼腥草', '板蓝根', '凉茶'], name: '草本冲剂', effects: '清热 · 舒缓咽喉', bestTime: '餐后', frequency: 1, reminderTime: '12:30', reason: '餐后温服减少刺激' },
  ];

  const QUOTE_KB = [
    { text: '世界上只有一种真正的英雄主义，那就是在认清生活的真相后依然热爱生活。', author: '罗曼·罗兰', source: '《米开朗琪罗传》' },
    { text: '你现在的气质里，藏着你走过的路、读过的书和爱过的人。', author: '佚名', source: '网络' },
    { text: '读书不是为了拿文凭或发财，而是成为一个有温度、懂情趣、会思考的人。', author: '杨绛', source: '《我们仨》' },
    { text: '腹有诗书气自华，读书万卷始通神。', author: '苏轼', source: '《和董传留别》' },
    { text: '当你翻过一座山，就会看见另一座山；但那又怎样，路本就是用来走的。', author: '佚名', source: '随笔' },
    { text: '阅读是一座随身携带的避难所。', author: '毛姆', source: '《阅读是一座随身携带的避难所》' },
    { text: '你迷茫的原因，往往是因为想得太多而读得太少。', author: '佚名', source: '网络' },
    { text: '一个人只拥有此生此世是不够的，他还应该拥有诗意的世界。', author: '王小波', source: '《万寿寺》' },
    { text: '所谓自由，不是随心所欲，而是自我主宰。', author: '康德', source: '哲学随笔' },
    { text: '我们读书是为了知道自己并不孤单。', author: 'C.S.路易斯', source: '书信集' },
    { text: '每一个不曾起舞的日子，都是对生命的辜负。', author: '尼采', source: '《查拉图斯特拉如是说》' },
    { text: '生活不止眼前的苟且，还有诗和远方的田野。', author: '高晓松', source: '歌词' },
    { text: '读书给人以乐趣，给人以光彩，给人以才干。', author: '培根', source: '《论读书》' },
    { text: '如果你因错过太阳而流泪，那么你也将错过群星。', author: '泰戈尔', source: '《飞鸟集》' },
    { text: '最是人间留不住，朱颜辞镜花辞树。', author: '王国维', source: '《蝶恋花》' },
    { text: '种一棵树最好的时间是十年前，其次是现在。', author: '谚语', source: '佚名' },
    { text: '你若盛开，蝴蝶自来；你若精彩，天自安排。', author: '佚名', source: '网络' },
    { text: '少年读书，如隙中窥月；中年读书，如庭中望月；老年读书，如台上玩月。', author: '张潮', source: '《幽梦影》' },
    { text: '脚步到不了的地方，文字可以；眼睛看不到的地方，书籍可以。', author: '佚名', source: '网络' },
    { text: '人生没有白读的书，每一页都算数。', author: '佚名', source: '网络' },
    { text: '智者说话，是因为有话要说；愚者说话，则是因为想说。', author: '柏拉图', source: '《理想国》' },
    { text: '心若没有栖息的地方，到哪里都是流浪。', author: '三毛', source: '散文' },
    { text: '不是所有的鱼都会生活在同一片海里。', author: '村上春树', source: '《舞！舞！舞！》' },
    { text: '愿你出走半生，归来仍是少年。', author: '佚名', source: '网络' },
    { text: '读书补天然之不足，经验又补读书之不足。', author: '培根', source: '《论读书》' },
    { text: '人生如逆旅，我亦是行人。', author: '苏轼', source: '《临江仙》' },
    { text: '所有命运的馈赠，都在暗中标好了价格。', author: '茨威格', source: '《断头王后》' },
    { text: '与其互为人间，不如自成宇宙。', author: '佚名', source: '网络' },
    { text: '你多学一样本事，就少说一句求人的话。', author: '佚名', source: '网络' },
    { text: '生活有望穿秋水的等待，也会有意想不到的惊喜。', author: '佚名', source: '网络' },
  ];

  const BOOK_RECS = [
    { name: '被讨厌的勇气', author: '岸见一郎', reco: '用阿德勒心理学，教你跳出讨好型人格的泥沼。' },
    { name: '蛤蟆先生去看心理医生', author: '罗伯特·戴博德', reco: '温柔治愈，读懂自己的情绪从哪来。' },
    { name: '认知觉醒', author: '周岭', reco: '帮你搞懂大脑运作，告别内耗式努力。' },
    { name: '活法', author: '稻盛和夫', reco: '做人做事的底层逻辑，越简单越有力。' },
    { name: '人类简史', author: '尤瓦尔·赫拉利', reco: '一口气看清我们从哪来、要到哪去。' },
    { name: '小王子', author: '圣埃克苏佩里', reco: '每个大人心里都该住着一个小王子。' },
    { name: '活着', author: '余华', reco: '苦难里长出韧劲，读完更懂珍惜。' },
    { name: '非暴力沟通', author: '马歇尔·卢森堡', reco: '把"吵架"变成"对话"的沟通圣经。' },
    { name: '心的重建', author: '露易丝·海', reco: '面对失去与离别，学会温柔地放过自己。' },
    { name: '纳瓦尔宝典', author: '埃里克·乔根森', reco: '关于财富与幸福的清醒思考合集。' },
  ];

  function parseSupplement(rawName) {
    const name = (rawName || '').trim();
    if (!name) return null;
    const norm = name.toLowerCase().replace(/\s+/g, '');
    let hit = null;
    for (const e of SUPPLEMENT_KB) {
      if (e.keys.some(k => {
        const nk = k.toLowerCase().replace(/\s+/g, '');
        return norm.includes(nk) || nk.includes(norm) || name.includes(e.name) || e.name.includes(name);
      })) { hit = e; break; }
    }
    if (hit) {
      return {
        matched: true, name: hit.name, effects: hit.effects, bestTime: hit.bestTime,
        frequency: hit.frequency, reminderEnabled: !!hit.reminderTime,
        reminderTime: hit.reminderTime || '', reminderReason: hit.reason || '',
        source: 'auto', editable: true,
      };
    }
    return {
      matched: false, name, effects: '请遵医嘱', bestTime: '餐后', frequency: 1,
      reminderEnabled: false, reminderTime: '', reminderReason: '', source: 'manual', editable: true,
    };
  }

  // ============================================================
  //  补品打卡模块
  // ============================================================
  let supplementView = 'check';       // check | review
  let supplementReviewView = 'month'; // month | year
  let supplementCalMonth = new Date();
  let supplementReminded = {};        // 会话内提醒去重 {id:true}

  function addSupplementFromInput() {
    const inp = document.getElementById('supplementInput');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) { toast('请输入补品名称'); return; }
    const info = parseSupplement(name);
    const sup = Store.Supplements.create(info);
    inp.value = '';
    if (info.matched) {
      toast(`已智能识别「${sup.name}」· ${sup.bestTime}`);
    } else {
      toast(`已添加「${sup.name}」，未识别，点击卡片可手动修正`);
    }
    render();
  }

  function tapSupplementDot(id, index) {
    const dateStr = Store.DateUtils.formatDate(new Date());
    const before = Store.Supplements.isDoneToday(id, dateStr);
    Store.Supplements.tapDot(id, index, dateStr);
    const after = Store.Supplements.isDoneToday(id, dateStr);
    if (after) checkSupplementAutoTask(id);
    render();
  }

  // 达标后向待办写入一条只读记录（去重：当日该补品仅写一次）
  function checkSupplementAutoTask(id) {
    const sup = Store.Supplements.getById(id);
    if (!sup) return;
    const dateStr = Store.DateUtils.formatDate(new Date());
    const exists = Store.Tasks.getAll().some(t => t.auto && t.autoKind === 'supplement' && t.autoRef === id && t.date === dateStr);
    if (exists) return;
    const t = Store.Tasks.create({ name: `[健康] 已完成今日补品：${sup.name}`, dimension: 'health', date: dateStr });
    Store.Tasks.update(t.id, { completed: true, completedAt: Date.now(), locked: true, auto: true, autoKind: 'supplement', autoRef: id });
  }

  function showSupplementEditModal(id) {
    const sup = Store.Supplements.getById(id);
    if (!sup) return;
    showModal(`
      <div class="modal-title">${id ? '编辑补品' : '添加补品'}</div>
      <div class="form-group">
        <label class="form-label">名称</label>
        <input type="text" class="form-input" id="supName" value="${escapeHtml(sup.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">核心功效（用 · 分隔）</label>
        <input type="text" class="form-input" id="supEffects" value="${escapeHtml(sup.effects)}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">最佳服用时间</label>
          <input type="text" class="form-input" id="supBestTime" value="${escapeHtml(sup.bestTime)}" placeholder="如 早餐后">
        </div>
        <div class="form-group">
          <label class="form-label">每日频次</label>
          <input type="number" class="form-input" id="supFreq" min="1" max="6" value="${sup.frequency}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label class="form-label">提醒时间</label>
          <input type="time" class="form-input" id="supReminderTime" value="${sup.reminderTime || ''}">
        </div>
        <div class="form-group" style="flex:0 0 auto;justify-content:flex-end;display:flex;flex-direction:column;">
          <label class="form-label">启用提醒</label>
          <input type="checkbox" id="supReminderOn" ${sup.reminderEnabled ? 'checked' : ''} style="width:22px;height:22px;">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">提醒文案（原因）</label>
        <input type="text" class="form-input" id="supReason" value="${escapeHtml(sup.reminderReason)}" placeholder="如 随含脂肪早餐服用吸收好">
      </div>
      <div class="modal-actions">
        ${id ? `<button class="btn btn-danger" onclick="App.deleteSupplement('${id}')">删除</button>` : ''}
        <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" onclick="App.saveSupplementEdit('${id}')">保存</button>
      </div>
    `);
  }

  function saveSupplementEdit(id) {
    const name = document.getElementById('supName').value.trim();
    if (!name) { toast('请输入名称'); return; }
    const updates = {
      name,
      effects: document.getElementById('supEffects').value.trim() || '请遵医嘱',
      bestTime: document.getElementById('supBestTime').value.trim() || '餐后',
      frequency: Math.max(1, Math.min(6, parseInt(document.getElementById('supFreq').value) || 1)),
      reminderEnabled: document.getElementById('supReminderOn').checked,
      reminderTime: document.getElementById('supReminderTime').value || '',
      reminderReason: document.getElementById('supReason').value.trim(),
      editable: true,
    };
    Store.Supplements.update(id, updates);
    closeModal();
    feedback({ icon: '💊', title: '已记录', sub: '今天也有认真爱自己 ✨' });
    render();
  }

  function deleteSupplement(id) {
    confirmDialog('删除补品', '将永久删除该补品及其历史打卡记录，确定吗？', () => {
      Store.Supplements.delete(id);
      toast('已删除');
      render();
    });
  }

  function renderDots(sup, dateStr) {
    const filled = Store.Supplements.getFilled(sup.id, dateStr);
    let dots = '';
    for (let i = 0; i < sup.frequency; i++) {
      dots += `<span class="sup-dot ${i < filled ? 'filled' : ''}" onclick="event.stopPropagation();App.tapSupplementDot('${sup.id}', ${i})"></span>`;
    }
    return dots;
  }

  function renderSupplementCheck() {
    const dateStr = Store.DateUtils.formatDate(new Date());
    const list = Store.Supplements.getAll();
    const prog = Store.Supplements.getTodayProgress(dateStr);
    const allDone = list.length > 0 && Store.Supplements.isAllDone(dateStr);
    let cards = '';
    if (!list.length) {
      cards = `<div class="empty-hint">还没有补品，在上方输入名称即可智能识别功效与服用时间 💊</div>`;
    } else {
      cards = list.map(sup => {
        const done = Store.Supplements.isDoneToday(sup.id, dateStr);
        return `
          <div class="sup-card" style="border-left-color:${sup.color}" onclick="App.showSupplementEditModal('${sup.id}')">
            <div class="sup-card-left">
              <div class="sup-name">${escapeHtml(sup.name)} ${sup.source === 'auto' ? '<span class="sup-badge">AI</span>' : ''}</div>
              <div class="sup-effects">${escapeHtml(sup.effects)}</div>
              ${!sup.matched ? '<div class="sup-warn">⚠ 未识别，点击手动修正</div>' : ''}
            </div>
            <div class="sup-card-right">
              <div class="sup-time">⏰ ${escapeHtml(sup.bestTime)}</div>
              <div class="sup-dots">${renderDots(sup, dateStr)}</div>
              ${done ? '<div class="sup-done">✅ 今日已达标</div>' : ''}
            </div>
          </div>`;
      }).join('');
    }
    return `
      <div class="sup-progress">
        <span>今日 <b>${prog.done}</b>/${prog.total}</span>
        <div class="sup-bar"><div class="sup-bar-fill" style="width:${prog.total ? (prog.done / prog.total * 100) : 0}%;background:var(--theme-color)"></div></div>
        ${allDone ? '<span class="sup-all-done">全部达标 🎉</span>' : ''}
      </div>
      <div class="add-row">
        <input type="text" class="form-input" id="supplementInput" placeholder="输入补品名称，如 葡萄糖酸锌 / 鱼油" onkeydown="if(event.key==='Enter')App.addSupplementFromInput()">
        <button class="btn btn-primary" onclick="App.addSupplementFromInput()">+ 添加</button>
      </div>
      <div class="sup-list">${cards}</div>
    `;
  }

  function renderSupplementMonthCalendar(year, month) {
    const first = new Date(year, month, 1);
    const startDay = (first.getDay() + 6) % 7; // 周一为起点
    const days = Store.DateUtils.getMonthDays(year, month);
    let cells = '';
    for (let i = 0; i < startDay; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const recs = Store.Supplements.getDayRecords(dateStr);
      let dots = '';
      recs.slice(0, 4).forEach(r => { dots += `<span class="cal-dot" style="background:${r.color}"></span>`; });
      const isToday = Store.DateUtils.isToday(dateStr);
      cells += `<div class="cal-cell ${isToday ? 'today' : ''}" onclick="App.showSupplementDay('${dateStr}')">
        <span class="cal-num">${d}</span>
        <div class="cal-dots">${dots}</div>
      </div>`;
    }
    return `
      <div class="cal-grid">
        ${['一', '二', '三', '四', '五', '六', '日'].map(w => `<div class="cal-week">${w}</div>`).join('')}
        ${cells}
      </div>`;
  }

  function renderSupplementReview() {
    let html = `
      <div class="view-tabs" style="margin-bottom:12px;">
        <button class="view-tab ${supplementReviewView === 'month' ? 'active' : ''}" onclick="App.setSupplementReviewView('month')">月视图</button>
        <button class="view-tab ${supplementReviewView === 'year' ? 'active' : ''}" onclick="App.setSupplementReviewView('year')">年视图</button>
      </div>`;
    if (supplementReviewView === 'month') {
      html += `
        <div class="cal-nav">
          <button class="nav-icon-btn" onclick="App.changeSupplementMonth(-1)">‹</button>
          <span class="cal-title">${supplementCalMonth.getFullYear()}年${supplementCalMonth.getMonth() + 1}月</span>
          <button class="nav-icon-btn" onclick="App.changeSupplementMonth(1)">›</button>
        </div>
        ${renderSupplementMonthCalendar(supplementCalMonth.getFullYear(), supplementCalMonth.getMonth())}`;
    } else {
      const year = supplementCalMonth.getFullYear();
      const start = new Date(year, 0, 1), end = new Date(year, 11, 31);
      const rank = Store.Supplements.getRanking(start, end);
      const max = rank.length ? rank[0].count : 0;
      const total = Store.Supplements.getAll().reduce((s, x) => s + (x.checkins ? Object.values(x.checkins).reduce((a, b) => a + b.length, 0) : 0), 0);
      html += `
        <div class="rank-head">${year}年 共打卡 <b>${total}</b> 次</div>
        ${rank.length ? rank.map(r => `
          <div class="rank-row">
            <span class="rank-name"><span class="rank-dot" style="background:${r.color}"></span>${escapeHtml(r.name)}</span>
            <div class="rank-bar"><div class="rank-bar-fill" style="width:${max ? (r.count / max * 100) : 0}%;background:${r.color}"></div></div>
            <span class="rank-count">${r.count}</span>
          </div>`).join('') : '<div class="empty-hint">本年还没有打卡记录</div>'}
        <div class="rank-tip">提示：打卡次数越多说明坚持得越好 💪</div>`;
    }
    return html;
  }

  function renderSupplement() {
    const container = document.getElementById('supplementModule');
    if (!container) return;
    let html = `
      <div class="page-nav">
        <div class="view-tabs">
          <button class="view-tab ${supplementView === 'check' ? 'active' : ''}" onclick="App.setSupplementView('check')">打卡</button>
          <button class="view-tab ${supplementView === 'review' ? 'active' : ''}" onclick="App.setSupplementView('review')">复盘</button>
        </div>
      </div>`;
    html += supplementView === 'check' ? renderSupplementCheck() : renderSupplementReview();
    container.innerHTML = html;
  }

  function showSupplementDay(dateStr) {
    const recs = Store.Supplements.getDayRecords(dateStr);
    if (!recs.length) { toast('这天还没有打卡记录'); return; }
    const items = recs.map(r => {
      const tstr = r.times.map(t => {
        const d = new Date(t);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }).join('、');
      return `<div class="day-item"><span class="day-dot" style="background:${r.color}"></span>
        <span class="day-name">${escapeHtml(r.name)}</span>
        <span class="day-time">${tstr}</span></div>`;
    }).join('');
    showModal(`
      <div class="modal-title">${dateStr} 补品打卡</div>
      <div class="day-list">${items}</div>
      <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>
    `);
  }

  function checkSupplementReminders() {
    if (!Store.Settings.get().supplementReminder) return;
    const now = new Date();
    const todayStr = Store.DateUtils.formatDate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    Store.Supplements.getAll().forEach(sup => {
      if (!sup.reminderEnabled || !sup.reminderTime) return;
      const [h, m] = sup.reminderTime.split(':').map(Number);
      const remMin = h * 60 + m;
      const key = sup.id + todayStr;
      if (nowMin >= remMin && !supplementReminded[key]) {
        supplementReminded[key] = true;
        const msg = `💊 该吃「${sup.name}」啦 · ${sup.reminderReason || sup.bestTime}`;
        toast(msg, 4000);
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification('补品提醒', { body: msg }); } catch (e) {}
        }
      }
      if (nowMin < remMin) delete supplementReminded[key]; // 跨天重置去重
    });
  }

  // ============================================================
  //  每日阅读模块
  // ============================================================
  let readingView = 'timer'; // timer | books | quotes
  let readingTimer = { running: false, seconds: 0, startedAt: 0, accumulated: 0, goalMinutes: 30, goalReached: false, bookPrompted: false };
  let readingInterval = null;
  // 全局计时单例锁：工作计时与阅读计时互斥
  let readingTimerPillShown = false;

  function fmtReadingTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function readingElapsed() {
    if (readingTimer.running && readingTimer.startedAt) return readingTimer.accumulated + (Date.now() - readingTimer.startedAt) / 1000;
    return readingTimer.accumulated;
  }
  function pauseWorkTimerIfRunning() {
    if (timerState.running) {
      timerState.accumulatedSeconds = timerElapsedSeconds();
      timerState.running = false; timerState.startedAt = 0;
      saveTimerState(); stopTimerTick(); broadcastTimer();
      updateTimerPill();
      return true;
    }
    return false;
  }
  function startReadingTimer() {
    if (pauseWorkTimerIfRunning()) toast('已暂停专注计时，开始阅读计时');
    readingTimer.running = true;
    readingTimer.startedAt = Date.now();
    readingTimer.bookPrompted = false;
    startReadingTick();
    renderReading();
  }
  function pauseReadingTimer() {
    readingTimer.accumulated = readingElapsed();
    readingTimer.running = false; readingTimer.startedAt = 0;
    stopReadingTick();
    renderReading();
  }
  function resetReadingTimerConfirm() {
    if (readingTimer.seconds === 0 && !readingTimer.accumulated) { renderReading(); return; }
    confirmDialog('重置阅读计时', '确定要重置吗？本次阅读时长将不会被记录。', () => {
      readingTimer = { running: false, seconds: 0, startedAt: 0, accumulated: 0, goalMinutes: readingTimer.goalMinutes, goalReached: false, bookPrompted: false };
      stopReadingTick();
      renderReading();
    });
  }
  function finishReadingTimer() {
    const sec = readingElapsed();
    const minutes = Math.max(1, Math.round(sec / 60));
    const dateStr = Store.DateUtils.formatDate(new Date());
    const medium = Store.Reading.get().medium || 'paper';
    const record = Store.Reading.addRecord({ date: dateStr, minutes, medium, goalMinutes: readingTimer.goalMinutes });
    readingTimer = { running: false, seconds: 0, startedAt: 0, accumulated: 0, goalMinutes: readingTimer.goalMinutes, goalReached: false, bookPrompted: true };
    stopReadingTick();
    feedback({ icon: '📖', title: '记录已保存', sub: '今天也有好好读书呢 ☕️' });
    // 自动写入待办
    const t = Store.Tasks.create({ name: `[已完成] 今日阅读 ${minutes} 分钟`, dimension: 'study', date: dateStr });
    Store.Tasks.update(t.id, { completed: true, completedAt: Date.now(), locked: true, auto: true, autoKind: 'reading', autoRef: record.id });
    // 询问读了什么书
    showReadingBookModal(record.id, minutes);
  }
  function showReadingBookModal(recordId, minutes) {
    const books = Store.Reading.get().books;
    const opts = books.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
    showModal(`
      <div class="modal-title">记录本次阅读</div>
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:14px;">本次阅读 <b>${minutes}</b> 分钟，读了什么书？</p>
      <div class="form-group">
        <label class="form-label">从书架选择</label>
        <select class="form-select" id="readBookSel">${opts ? '<option value="">— 不关联 —</option>' + opts : '<option value="">暂无书架，直接输入</option>'}</select>
      </div>
      <div class="form-group">
        <label class="form-label">或输入书名</label>
        <input type="text" class="form-input" id="readBookInput" placeholder="如 人类简史">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal();App.renderReading()">跳过</button>
        <button class="btn btn-primary" onclick="App.saveReadingBook('${recordId}')">保存</button>
      </div>
    `);
  }
  function saveReadingBook(recordId) {
    const sel = document.getElementById('readBookSel');
    const inp = document.getElementById('readBookInput');
    let name = (inp.value || '').trim() || (sel && sel.value ? sel.value : '');
    const r = Store.Reading.get();
    let rec = r.records.find(x => x.id === recordId);
    if (rec) { rec.book = name; Store.save(); }
    if (name && !r.books.some(b => b.name === name)) Store.Reading.addBook(name);
    closeModal();
    feedback({ icon: '📖', title: '记录已保存', sub: name ? ('《' + name + '》已关联 📚') : '今天也有好好读书呢 ☕️' });
    renderReading();
  }
  function startReadingTick() {
    stopReadingTick();
    readingInterval = setInterval(() => {
      if (!readingTimer.running) return;
      const sec = readingElapsed();
      const goalSec = readingTimer.goalMinutes * 60;
      if (!readingTimer.goalReached && goalSec > 0 && sec >= goalSec) {
        readingTimer.goalReached = true;
        toast('🎯 已达成今日阅读目标，可继续或结束');
        if (navigator.vibrate) navigator.vibrate(120);
      }
      const disp = document.getElementById('readingDisplay');
      if (disp) disp.textContent = fmtReadingTime(sec);
    }, 1000);
  }
  function stopReadingTick() {
    if (readingInterval) { clearInterval(readingInterval); readingInterval = null; }
  }
  function selectReadingGoal(min) {
    readingTimer.goalMinutes = min;
    readingTimer.goalReached = false;
    renderReading();
  }
  function setReadingMedium(m) {
    Store.Reading.setMedium(m);
    renderReading();
  }
  function addBookFromInput() {
    const inp = document.getElementById('bookInput');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) { toast('请输入书名'); return; }
    Store.Reading.addBook(name);
    inp.value = '';
    toast(`已加入书架：《${name}》`);
    renderReading();
  }
  function markBookDone(id) {
    const b = Store.Reading.markBookDone(id);
    if (!b) return;
    const dateStr = Store.DateUtils.formatDate(new Date());
    const t = Store.Tasks.create({ name: `[已完成] 阅读《${b.name}》`, dimension: 'study', date: dateStr });
    Store.Tasks.update(t.id, { completed: true, completedAt: Date.now(), locked: true, auto: true, autoKind: 'book', autoRef: id });
    toast(`📚 读完《${b.name}》已记录`);
    renderReading();
  }
  function getDailyQuotesLocal() {
    return Store.Reading.getDailyQuotes(QUOTE_KB);
  }
  function toggleQuoteFavorite(q) {
    const added = Store.Reading.toggleFavorite(q);
    toast(added ? '已收藏到金句本' : '已取消收藏');
    renderReading();
  }
  function reshuffleQuotes() {
    // 当日库存内换一批（不请求网络）：打乱当前未展示的其余句
    const r = Store.Reading.get();
    const pool = QUOTE_KB.filter(q => !r.quotes.some(x => x.text === q.text));
    if (!pool.length) { toast('今日金句已展示完啦'); return; }
    let seed = (Date.now() & 0xffffff) >>> 0;
    const picked = [];
    for (let i = 0; i < Math.min(3, pool.length); i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      picked.push(pool.splice(seed % pool.length, 1)[0]);
    }
    r.quotes = picked; r.quoteDate = Store.DateUtils.formatDate(new Date());
    Store.save();
    toast('已换一批金句');
    renderReading();
  }
  function getReadingBadges() {
    const streak = Store.Reading.getStreak().count || 0;
    const badges = [];
    if (streak >= 7) badges.push({ key: 'star', name: '阅读新星', icon: '🌟', need: 7 });
    if (streak >= 30) badges.push({ key: 'pro', name: '阅读达人', icon: '🏆', need: 30 });
    if (streak >= 90) badges.push({ key: 'king', name: '阅读王者', icon: '👑', need: 90 });
    return badges;
  }

  function renderReadingStats() {
    const stats = Store.Reading.getStats();
    const streak = Store.Reading.getStreak();
    const badges = getReadingBadges();
    const badgeHtml = badges.length
      ? `<div class="badge-row">${badges.map(b => `<span class="badge">${b.icon} ${b.name}</span>`).join('')}</div>`
      : `<div class="badge-hint">连续阅读 7 天解锁「阅读新星」🌟</div>`;
    return `
      <div class="read-stats">
        <div class="read-stat"><div class="read-stat-num">🔥 ${streak.count}</div><div class="read-stat-label">连续天数</div></div>
        <div class="read-stat"><div class="read-stat-num">⏱️ ${stats.totalMinutes}</div><div class="read-stat-label">总分钟数</div></div>
        <div class="read-stat"><div class="read-stat-num">📚 ${stats.booksDone}</div><div class="read-stat-label">已读书籍</div></div>
      </div>
      ${badgeHtml}`;
  }

  function renderReadingTimerCard() {
    const sec = readingElapsed();
    const goals = [15, 30, 45, 60].map(m =>
      `<button class="timer-preset ${readingTimer.goalMinutes === m ? 'active' : ''}" onclick="App.selectReadingGoal(${m})">${m}m</button>`
    ).join('');
    const custom = readingTimer.goalMinutes && ![15, 30, 45, 60].includes(readingTimer.goalMinutes)
      ? `<button class="timer-preset active">${readingTimer.goalMinutes}m</button>` : '';
    const media = ['paper', 'ebook', 'radio'].map(m => {
      const label = { paper: '📖 纸质书', ebook: '📱 电子书', radio: '📻 电台' }[m];
      return `<button class="medium-tag ${Store.Reading.get().medium === m ? 'active' : ''}" onclick="App.setReadingMedium('${m}')">${label}</button>`;
    }).join('');
    const running = readingTimer.running;
    return `
      <div class="read-timer-card">
        <div class="read-timer-display ${running ? 'running' : ''}" id="readingDisplay">${fmtReadingTime(sec)}</div>
        <div class="read-goal-label">本次目标</div>
        <div class="timer-presets">${goals}${custom}<input type="number" class="goal-custom" placeholder="自定义" min="1" onchange="App.selectReadingGoal(parseInt(this.value)||30)"></div>
        <div class="read-media">${media}</div>
        <div class="timer-controls">
          ${running
            ? `<button class="btn btn-secondary" onclick="App.pauseReadingTimer()">⏸ 暂停</button>
               <button class="btn btn-primary" onclick="App.finishReadingTimer()">⏹ 结束并记录</button>`
            : `<button class="btn btn-primary" onclick="App.startReadingTimer()">▶ ${readingTimer.accumulated > 0 ? '继续' : '开始阅读'}</button>
               ${readingTimer.accumulated > 0 ? `<button class="btn btn-secondary" onclick="App.resetReadingTimerConfirm()">↺ 重置</button>` : ''}`}
        </div>
        <div class="timer-hint">基于真实时间计时，切后台/刷新均自动保留；与其他计时互斥，全局仅一个在跑。</div>
      </div>`;
  }

  function renderReadingBooks() {
    const books = Store.Reading.get().books;
    const reading = books.filter(b => b.status === 'reading');
    const done = books.filter(b => b.status === 'done');
    const readingHtml = reading.length ? reading.map(b => `
      <div class="book-item">
        <div class="book-info">
          <div class="book-name">${escapeHtml(b.name)}</div>
          <div class="book-prog"><div class="book-prog-fill" style="width:${b.progress || 0}%"></div></div>
        </div>
        <div class="book-actions">
          <input type="range" min="0" max="100" value="${b.progress || 0}" onchange="App.setBookProgress('${b.id}', parseInt(this.value))" title="调整进度">
          <button class="btn btn-timer" style="padding:4px 10px;font-size:12px;" onclick="App.markBookDone('${b.id}')">读完</button>
        </div>
      </div>`).join('') : '<div class="empty-hint">书架空空，添加一本正在读的书吧</div>';
    const doneHtml = done.length ? done.map(b => `
      <div class="book-item done">
        <div class="book-info"><div class="book-name">✅ ${escapeHtml(b.name)}</div></div>
        <button class="book-del" onclick="App.deleteBook('${b.id}')">🗑</button>
      </div>`).join('') : '';
    return `
      <div class="add-row">
        <input type="text" class="form-input" id="bookInput" placeholder="添加书籍，如 人类简史" onkeydown="if(event.key==='Enter')App.addBookFromInput()">
        <button class="btn btn-primary" onclick="App.addBookFromInput()">+ 添加</button>
      </div>
      <div class="book-section-title">阅读中</div>
      ${readingHtml}
      ${done.length ? `<div class="book-section-title">已读完</div>${doneHtml}` : ''}`;
  }

  function renderReadingQuotes() {
    const title = Store.Settings.get().dailyQuoteTitle || '每日金句';
    const quotes = getDailyQuotesLocal();
    const favCount = Store.Reading.getFavorites().length;
    const items = quotes.map(q => {
      const fav = Store.Reading.isFavorite(q);
      return `
        <div class="quote-card ${fav ? 'fav' : ''}" onclick="App.toggleQuoteFavorite(${JSON.stringify(q).replace(/"/g, '&quot;')})">
          <div class="quote-text">“${escapeHtml(q.text)}”</div>
          <div class="quote-from">—— ${escapeHtml(q.author)} ${escapeHtml(q.source ? '《' + q.source + '》' : '')}</div>
          <div class="quote-fav">${fav ? '★ 已收藏' : '☆ 点击收藏'}</div>
        </div>`;
    }).join('');
    return `
      <div class="quote-head">${title} <span class="quote-favcount">★ ${favCount}</span></div>
      <div class="quote-list">${items}</div>
      <button class="btn btn-secondary quote-refresh" onclick="App.reshuffleQuotes()">🔄 换一批</button>`;
  }

  function renderBookRecs() {
    const recs = BOOK_RECS.map(b => `
      <div class="rec-card">
        <div class="rec-name">📕 ${escapeHtml(b.name)}</div>
        <div class="rec-author">${escapeHtml(b.author)}</div>
        <div class="rec-reco">${escapeHtml(b.reco)}</div>
        <button class="btn btn-timer rec-add" style="padding:3px 10px;font-size:12px;" onclick="App.addRecBook('${escapeHtml(b.name)}')">+ 加入书架</button>
      </div>`).join('');
    return `
      <div class="rec-head">为你推荐 · 治愈内耗书单</div>
      <div class="rec-list">${recs}</div>
      <button class="btn btn-secondary rec-refresh" onclick="App.refreshBookRecs()">🔄 联网更新书单</button>`;
  }

  function renderReading() {
    const container = document.getElementById('readingModule');
    if (!container) return;
    let html = `
      <div class="page-nav">
        <div class="view-tabs">
          <button class="view-tab ${readingView === 'timer' ? 'active' : ''}" onclick="App.setReadingView('timer')">计时</button>
          <button class="view-tab ${readingView === 'books' ? 'active' : ''}" onclick="App.setReadingView('books')">书架</button>
          <button class="view-tab ${readingView === 'quotes' ? 'active' : ''}" onclick="App.setReadingView('quotes')">金句</button>
        </div>
      </div>`;
    html += renderReadingStats();
    if (readingView === 'timer') html += renderReadingTimerCard() + renderBookRecs();
    else if (readingView === 'books') html += renderReadingBooks();
    else html += renderReadingQuotes();
    container.innerHTML = html;
    // 若计时在跑，确保显示实时
    if (readingTimer.running) {
      const d = document.getElementById('readingDisplay');
      if (d) d.textContent = fmtReadingTime(readingElapsed());
    }
  }

  // ============================================================
  //  健康生活模块（睡眠 / 经期 / 排便）
  // ============================================================
  let healthView = 'sleep'; // sleep | period | bowel
  let healthCalMonth = new Date();
  let sleepChartView = 'week'; // week | month

  function textOnly(s) { return (s || '').replace(/^[^一-龥A-Za-z]+/, '').trim() || s || ''; }
  function fmtSleep(min) {
    if (min == null) return '—';
    const h = Math.floor(min / 60), m = min % 60;
    return (h ? h + '小时' : '') + (m ? m + '分钟' : (h ? '' : '0分钟'));
  }
  function fmtMD(ds) {
    const p = (ds || '').split('-');
    return p.length === 3 ? `${p[1]}月${parseInt(p[2], 10)}日` : ds;
  }
  function hsvToRgb(h, s, v) {
    s /= 100; v /= 100; const c = v * s; const x = c * (1 - Math.abs((h / 60) % 2 - 1)); const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function hexToRgb2(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    const s = mx ? d / mx : 0;
    return [h, s * 100, mx * 100];
  }

  function renderHealth() {
    const container = document.getElementById('healthModule');
    if (!container) return;
    const names = Store.Health.getNames();
    let html = `
      <div class="page-nav">
        <div class="view-tabs">
          <button class="view-tab ${healthView === 'sleep' ? 'active' : ''}" onclick="App.setHealthView('sleep')">🌙 ${escapeHtml(textOnly(names.sleep.module))}</button>
          <button class="view-tab ${healthView === 'period' ? 'active' : ''}" onclick="App.setHealthView('period')">🌸 ${escapeHtml(textOnly(names.period.module))}</button>
          <button class="view-tab ${healthView === 'bowel' ? 'active' : ''}" onclick="App.setHealthView('bowel')">💩 ${escapeHtml(textOnly(names.bowel.module))}</button>
        </div>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;flex:none;" onclick="App.showHealthNamesModal()">✏️ 改名</button>
      </div>`;
    if (healthView === 'sleep') html += renderHealthSleep();
    else if (healthView === 'period') html += renderHealthPeriod();
    else html += renderHealthBowel();
    container.innerHTML = html;
  }

  // ---------- 睡眠 ----------
  function renderHealthSleep() {
    const names = Store.Health.getNames().sleep;
    const state = Store.Health.getSleepState();
    const t = Store.DateUtils.formatDate(new Date());
    const sleeping = state.sleeping;
    const minNow = sleeping ? Math.max(0, Math.round((Date.now() - state.asleepAt) / 60000)) : null;
    const durMin = Store.Health.getSleepMinutes(t);
    const sug = Store.Health.sleepSuggestion(t);
    const nap = Store.Health.napSuggestion();
    let html = `<div class="health-card sleep-card">
      <div class="health-mod-title">${escapeHtml(names.module)}</div>`;
    if (sleeping) {
      html += `<div class="sleep-status sleeping">⏰ 睡觉中… 已睡 ${minNow} 分钟</div>
        <button class="btn btn-sleep big" onclick="App.wakeUp()">${escapeHtml(names.wakeBtn)}</button>`;
    } else {
      html += `<div class="sleep-status">${durMin != null ? '今日已睡 ' + fmtSleep(durMin) : '昨晚睡得好吗？'}</div>
        <button class="btn btn-sleep big" onclick="App.startSleep()">${escapeHtml(names.sleepBtn)}</button>`;
    }
    html += `<div class="sleep-today">今日睡眠时长：<b>${durMin != null ? fmtSleep(durMin) : '—'}</b></div>`;
    if (sug.text) html += `<div class="health-tip ${sug.level}">${sug.text}</div>`;
    if (nap) html += `<div class="health-tip">${nap}</div>`;
    // 图表
    let data, avg, foot;
    if (sleepChartView === 'week') {
      data = Store.Health.getWeekSleep();
      const valid = data.filter(d => d.min != null);
      avg = valid.length ? (valid.reduce((s, d) => s + d.min, 0) / valid.length / 60) : 0;
      foot = `本周平均睡眠 ${avg.toFixed(1)} 小时`;
    } else {
      const y = healthCalMonth.getFullYear(), m = healthCalMonth.getMonth();
      const map = Store.Health.getMonthSleep(y, m);
      data = [];
      for (let d = 1; d <= Store.DateUtils.getMonthDays(y, m); d++) {
        data.push({ label: String(d), min: map[d] });
      }
      const valid = data.filter(d => d.min != null);
      avg = valid.length ? (valid.reduce((s, d) => s + d.min, 0) / valid.length / 60) : 0;
      const okDays = valid.filter(d => d.min >= 420 && d.min <= 540).length;
      foot = `本月平均 ${avg.toFixed(1)} 小时 · 达标 ${okDays} 天`;
    }
    html += `<div class="chart-head"><span>睡眠趋势</span>
      <div class="view-tabs mini">
        <button class="view-tab ${sleepChartView === 'week' ? 'active' : ''}" onclick="App.setSleepChart('week')">本周</button>
        <button class="view-tab ${sleepChartView === 'month' ? 'active' : ''}" onclick="App.setSleepChart('month')">本月</button>
      </div></div>`;
    html += sleepBarsHTML(data);
    html += `<div class="chart-foot">${foot}</div></div>`;
    return html;
  }
  function sleepBarsHTML(data) {
    const max = 12 * 60;
    return `<div class="bars">` + data.map(d => {
      const h = Math.min(100, Math.round((d.min || 0) / max * 100));
      const good = d.min && d.min >= 420 && d.min <= 540;
      return `<div class="bar-col">
        <div class="bar-track"><div class="bar-fill ${good ? 'good' : ''}" style="height:${h}%"></div></div>
        <div class="bar-val">${d.min ? (Math.round(d.min / 6) / 10) : ''}</div>
        <div class="bar-label">${d.label}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  // ---------- 经期 ----------
  function renderHealthPeriod() {
    const names = Store.Health.getNames().period;
    const y = healthCalMonth.getFullYear(), m = healthCalMonth.getMonth();
    const pred = Store.Health.predict();
    let html = `<div class="health-card">
      <div class="health-mod-title">${escapeHtml(names.module)}</div>`;
    if (pred) {
      html += `<div class="period-predict">🔮 预测下次经期：<b>${fmtMD(pred.nextStart)}</b>（还有 ${pred.daysUntilNext} 天）· 排卵期约 ${fmtMD(pred.ovulation)}</div>`;
    } else {
      html += `<div class="health-tip">点击日历标记经期第一天，App 会自动预测周期～</div>`;
    }
    html += `<div class="cal-head">
      <button class="btn btn-secondary" onclick="App.changeHealthMonth(-1)">‹</button>
      <span>${y}年${m + 1}月</span>
      <button class="btn btn-secondary" onclick="App.changeHealthMonth(1)">›</button>
    </div>`;
    html += periodMonthCalendarHTML(y, m);
    html += `<div class="health-tip">💡 点击某天标记为经期（再次点击取消）；标记后可记录症状。</div>`;
    html += `<div class="annual-title">📅 年度日历（横向滑动查看规律）</div>`;
    html += annualPeriodHTML(y);
    html += `<div class="period-set"><label>周期长度（天）</label>
      <input type="number" min="20" max="45" class="form-input" value="${Store.Health.getPeriod().cycleLength}" onchange="App.setCycleLength(this.value)" style="width:80px;display:inline-block;"></div>`;
    html += `</div>`;
    return html;
  }
  function periodMonthCalendarHTML(y, m) {
    const first = new Date(y, m, 1);
    const startW = first.getDay();
    const days = Store.DateUtils.getMonthDays(y, m);
    const wk = ['日', '一', '二', '三', '四', '五', '六'];
    let head = wk.map(w => `<div class="cal-wk">${w}</div>`).join('');
    let cells = '';
    for (let i = 0; i < startW; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isP = Store.Health.isPeriodDay(ds);
      const today = Store.DateUtils.isToday(ds);
      cells += `<div class="cal-cell ${isP ? 'period-day' : ''} ${today ? 'today' : ''}" onclick="App.togglePeriodDay('${ds}')">${d}</div>`;
    }
    return `<div class="cal-grid"><div class="cal-wk-row">${head}</div>${cells}</div>`;
  }
  function annualPeriodHTML(year) {
    const map = Store.Health.getYearPeriodMap(year);
    let rows = '';
    for (let mo = 0; mo < 12; mo++) {
      const dim = Store.DateUtils.getMonthDays(year, mo);
      let cells = '';
      for (let d = 1; d <= dim; d++) {
        const ds = `${year}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isP = Store.Health.isPeriodDay(ds);
        cells += `<div class="annual-cell ${isP ? 'on' : ''}" onclick="App.togglePeriodDay('${ds}')" title="${ds}"></div>`;
      }
      rows += `<div class="annual-row"><div class="annual-m">${mo + 1}月</div><div class="annual-cells">${cells}</div></div>`;
    }
    return `<div class="annual-cal">${rows}</div>`;
  }
  function showPeriodSymptomModal(ds) {
    const cur = Store.Health.getSymptoms(ds);
    showModal(`
      <div class="modal-title">🌸 记录经期症状</div>
      <div class="form-group">
        <div class="symptom-tags">
          ${['痛经', '情绪波动', '疲劳', '胀痛', '头痛'].map(s =>
            `<span class="sym-tag ${cur.includes(s) ? 'on' : ''}" onclick="App.toggleSymptom(this,'${s}')">${s}</span>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">稍后</button>
        <button class="btn btn-primary" onclick="App.savePeriodSymptoms('${ds}')">保存</button>
      </div>`);
    window._symTemp = cur.slice();
  }
  function toggleSymptom(el, s) {
    el.classList.toggle('on');
    window._symTemp = window._symTemp || [];
    if (el.classList.contains('on')) { if (!window._symTemp.includes(s)) window._symTemp.push(s); }
    else window._symTemp = window._symTemp.filter(x => x !== s);
  }
  function savePeriodSymptoms(ds) {
    Store.Health.togglePeriod(ds, window._symTemp || []);
    closeModal();
    render();
    feedback({ icon: '🩸', title: '已记录', sub: '记得照顾好自己 💕' });
  }

  // ---------- 排便 ----------
  function renderHealthBowel() {
    const names = Store.Health.getNames().bowel;
    const y = healthCalMonth.getFullYear(), m = healthCalMonth.getMonth();
    const todayCnt = Store.Health.getTodayBowelCount();
    const stats = Store.Health.getMonthBowelStats(y, m);
    let html = `<div class="health-card">
      <div class="health-mod-title">${escapeHtml(names.module)}</div>
      <button class="btn btn-bowel big" onclick="App.recordBowel()">${escapeHtml(names.recordBtn)}</button>
      <div class="bowel-today">今日已记录 <b>${todayCnt}</b> 次</div>
      <div class="cal-head">
        <button class="btn btn-secondary" onclick="App.changeHealthMonth(-1)">‹</button>
        <span>${y}年${m + 1}月</span>
        <button class="btn btn-secondary" onclick="App.changeHealthMonth(1)">›</button>
      </div>`;
    html += bowelMonthCalendarHTML(y, m);
    html += `<div class="chart-foot">本月共 ${stats.total} 次 · 日均 ${stats.avg.toFixed(1)} 次 · 有记录 ${stats.dayCount} 天</div>`;
    html += `<div class="health-tip">💡 点击日历任意日期可补记；连续 2 天未记录会收到暖心提醒哦～</div>`;
    html += `</div>`;
    return html;
  }
  function bowelMonthCalendarHTML(y, m) {
    const first = new Date(y, m, 1);
    const startW = first.getDay();
    const days = Store.DateUtils.getMonthDays(y, m);
    const wk = ['日', '一', '二', '三', '四', '五', '六'];
    let head = wk.map(w => `<div class="cal-wk">${w}</div>`).join('');
    let cells = '';
    for (let i = 0; i < startW; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cnt = Store.Health.getBowelCount(ds);
      const today = Store.DateUtils.isToday(ds);
      cells += `<div class="cal-cell ${cnt ? 'bowel-day' : ''} ${today ? 'today' : ''}" onclick="App.recordBowelOn('${ds}')">${d}${cnt ? `<span class="bowel-badge">💩${cnt > 1 ? cnt : ''}</span>` : ''}</div>`;
    }
    return `<div class="cal-grid"><div class="cal-wk-row">${head}</div>${cells}</div>`;
  }

  // ---------- 命名自定义 ----------
  function showHealthNamesModal() {
    const n = Store.Health.getNames();
    showModal(`
      <div class="modal-title">✏️ 自定义名称</div>
      <div class="form-group"><label class="form-label">模块名</label><input class="form-input" id="hnModule" value="${escapeHtml(n.module)}"></div>
      <div class="form-group"><label class="form-label">睡眠模块</label><input class="form-input" id="hnSleep" value="${escapeHtml(n.sleep.module)}"></div>
      <div class="form-group"><label class="form-label">「我要睡啦」按钮</label><input class="form-input" id="hnSleepBtn" value="${escapeHtml(n.sleep.sleepBtn)}"></div>
      <div class="form-group"><label class="form-label">「我醒啦」按钮</label><input class="form-input" id="hnWakeBtn" value="${escapeHtml(n.sleep.wakeBtn)}"></div>
      <div class="form-group"><label class="form-label">经期模块</label><input class="form-input" id="hnPeriod" value="${escapeHtml(n.period.module)}"></div>
      <div class="form-group"><label class="form-label">排便模块</label><input class="form-input" id="hnBowel" value="${escapeHtml(n.bowel.module)}"></div>
      <div class="form-group"><label class="form-label">「噗噗」按钮</label><input class="form-input" id="hnBowelBtn" value="${escapeHtml(n.bowel.recordBtn)}"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" onclick="App.saveHealthNames()">保存</button>
      </div>`);
  }
  function saveHealthNames() {
    Store.Health.setModuleName(document.getElementById('hnModule').value.trim() || '健康生活');
    Store.Health.setHealthName('sleep', 'module', document.getElementById('hnSleep').value.trim() || '🌙 安睡小窝');
    Store.Health.setHealthName('sleep', 'sleepBtn', document.getElementById('hnSleepBtn').value.trim() || '🌙 我要睡啦');
    Store.Health.setHealthName('sleep', 'wakeBtn', document.getElementById('hnWakeBtn').value.trim() || '☀️ 我醒啦');
    Store.Health.setHealthName('period', 'module', document.getElementById('hnPeriod').value.trim() || '🌸 小月历');
    Store.Health.setHealthName('bowel', 'module', document.getElementById('hnBowel').value.trim() || '💩 今日噗噗');
    Store.Health.setHealthName('bowel', 'recordBtn', document.getElementById('hnBowelBtn').value.trim() || '💩 噗噗');
    closeModal();
    toast('名称已更新');
    render();
  }

  // ---------- 高级颜色选择器 ----------
  const CP_PRESETS = ['#333333', '#6C5CE7', '#00B894', '#0984E3', '#E17055', '#D4A0A0', '#A0B8A0', '#A8B5C8', '#D4B89B', '#C2A8C2', '#9EB0B0', '#E84393'];
  let cpHSV = { h: 0, s: 0, v: 0 };
  function showColorPicker() {
    const cur = Store.Settings.get().themeColor || '#333333';
    const [r, g, b] = hexToRgb2(cur);
    const [h, s, v] = rgbToHsv(r, g, b);
    cpHSV = { h, s, v };
    const swatches = CP_PRESETS.map(c => `<button class="cp-swatch ${c.toLowerCase() === cur.toLowerCase() ? 'active' : ''}" style="background:${c}" onclick="App.cpApplyPreset('${c}')" title="${c}"></button>`).join('');
    showModal(`
      <div class="modal-title">🎨 自定义主题色</div>
      <div class="cp-square" id="cpSquare" onmousedown="App.cpSquareDrag(event)" ontouchstart="App.cpSquareDrag(event)">
        <div class="cp-white"></div><div class="cp-black"></div>
        <div class="cp-cursor" id="cpCursor"></div>
      </div>
      <div class="cp-row"><label>色相</label><input type="range" min="0" max="360" value="${Math.round(h)}" id="cpHue" oninput="App.cpHue(this.value)"></div>
      <div class="cp-preview-row">
        <div class="cp-preview" id="cpPreview"></div>
        <div class="cp-inputs">
          <input class="form-input" id="cpHex" value="${cur.toUpperCase()}" style="width:110px;" oninput="App.cpHex(this.value)">
          <input class="form-input" id="cpRgb" value="rgb(${r}, ${g}, ${b})" style="width:140px;" oninput="App.cpRgb(this.value)">
        </div>
      </div>
      <div class="cp-swatches">${swatches}</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">完成</button>
      </div>`);
    cpUpdate(true);
  }
  function cpCurrentHex() {
    const [r, g, b] = hsvToRgb(cpHSV.h, cpHSV.s, cpHSV.v);
    return rgbToHex(r, g, b);
  }
  function cpCommit() {
    const hex = cpCurrentHex();
    Store.Settings.update({ themeColor: hex });
    applyTheme();
  }
  function cpUpdate(skipCommit) {
    if (!skipCommit) cpCommit();
    const hex = cpCurrentHex();
    const sq = document.getElementById('cpSquare');
    const cur = document.getElementById('cpCursor');
    const prev = document.getElementById('cpPreview');
    if (sq) sq.style.background = `hsl(${cpHSV.h},100%,50%)`;
    if (cur) { cur.style.left = cpHSV.s + '%'; cur.style.top = (100 - cpHSV.v) + '%'; cur.style.background = hex; }
    if (prev) prev.style.background = hex;
    const [r, g, b] = hsvToRgb(cpHSV.h, cpHSV.s, cpHSV.v);
    const hexIn = document.getElementById('cpHex'); if (hexIn && document.activeElement !== hexIn) hexIn.value = hex;
    const rgbIn = document.getElementById('cpRgb'); if (rgbIn && document.activeElement !== rgbIn) rgbIn.value = `rgb(${r}, ${g}, ${b})`;
  }
  function cpHue(v) { cpHSV.h = +v; cpUpdate(); }
  function cpHex(v) {
    if (!/^#?[0-9a-fA-F]{6}$/.test(v.trim())) return;
    const hex = v.trim().startsWith('#') ? v.trim() : '#' + v.trim();
    const [r, g, b] = hexToRgb2(hex); const [h, s, vv] = rgbToHsv(r, g, b);
    cpHSV = { h, s, v: vv }; cpUpdate();
  }
  function cpRgb(v) {
    const m = v.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return;
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    const [h, s, vv] = rgbToHsv(r, g, b);
    cpHSV = { h, s, v: vv }; cpUpdate();
  }
  function cpApplyPreset(c) {
    const [r, g, b] = hexToRgb2(c); const [h, s, v] = rgbToHsv(r, g, b);
    cpHSV = { h, s, v }; cpUpdate();
  }
  function cpSquarePick(e) {
    const sq = document.getElementById('cpSquare'); if (!sq) return;
    const rect = sq.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    cpHSV.s = Math.max(0, Math.min(100, Math.round(cx / rect.width * 100)));
    cpHSV.v = Math.max(0, Math.min(100, Math.round((1 - cy / rect.height) * 100)));
    cpUpdate();
  }
  function cpSquareDrag(e) {
    cpSquarePick(e); e.preventDefault();
    const move = ev => cpSquarePick(ev);
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up);
  }

  // ---------- 健康交互动作 ----------
  function setHealthView(v) { healthView = v; render(); }
  function setSleepChart(v) { sleepChartView = v; render(); }
  function changeHealthMonth(d) { healthCalMonth.setMonth(healthCalMonth.getMonth() + d); render(); }
  function startSleep() {
    if (Store.Health.startSleep()) {
      feedback({ icon: '🛌', title: '睡眠已记录', sub: '好好休息很重要哦 🌙' }); render();
    }
  }
  function wakeUp() {
    const r = Store.Health.wakeUp();
    if (!r) { toast('还没有记录入睡哦'); return; }
    toast(`🌅 早安！你睡了 ${fmtSleep(r.durMin)}，今天也要元气满满哦！`, 4000);
    render();
  }
  function recordBowel() {
    const cnt = Store.Health.recordBowel();
    feedback({ icon: '💩', title: '已记录', sub: '肠道健康值得关注 🌿（今日第 ' + cnt + ' 次）' });
    render();
  }
  function recordBowelOn(ds) {
    const cnt = Store.Health.recordBowelOn(ds);
    feedback({ icon: '💩', title: '已记录', sub: '肠道健康值得关注 🌿（' + fmtMD(ds) + ' 第 ' + cnt + ' 次）' });
    render();
  }
  function togglePeriodDay(ds) {
    const was = Store.Health.isPeriodDay(ds);
    if (was) {
      // 已记录 → 再次点击即取消该日记录（立即移除并重绘）
      Store.Health.togglePeriod(ds, []);
      render();
    } else {
      // 未记录 → 仅弹症状窗；点「保存」才真正记录（添加+变色），点「稍后」= 取消，日历不变色
      showPeriodSymptomModal(ds);
    }
  }
  function setCycleLength(v) {
    Store.Health.setCycleLength(v);
    toast('周期已更新，预测已刷新');
    render();
  }
  // 健康提醒：经期补铁 + 排便连续 2 天未记录
  function checkHealthReminders() {
    const t = Store.DateUtils.formatDate(new Date());
    if (Store.Health.isPeriodDay(t)) {
      const key = 'iron_' + t;
      if (!healthReminded[key]) { healthReminded[key] = true; toast('🌸 经期期间记得补充铁元素哦～多吃红肉、菠菜', 4000); }
    }
    if (Store.Health.needsBowelReminder()) {
      toast('💛 这两天好像没有噗噗哦，记得多喝水、多吃蔬果～', 4000);
    }
  }
  let healthReminded = {};

  function renderHealthGrowthCard() {
    const dateStr = Store.DateUtils.formatDate(new Date());
    const sp = Store.Supplements.getTodayProgress(dateStr);
    const rs = Store.Reading.getStats();
    const readToday = Store.Reading.isCheckedToday();
    const spPct = sp.total ? Math.round(sp.done / sp.total * 100) : 0;
    const sleepMin = Store.Health.getSleepMinutes(dateStr);
    const sleepOk = sleepMin != null && sleepMin >= 420;
    const bowelCnt = Store.Health.getTodayBowelCount();
    const isPeriod = Store.Health.isPeriodDay(dateStr);
    return `
      <div class="growth-card">
        <div class="growth-title">🌿 今日健康 · 成长</div>
        <div class="growth-row">
          <div class="growth-item" onclick="App.switchModule('supplement')">
            <div class="growth-label">补品打卡</div>
            <div class="growth-bar"><div class="growth-bar-fill sup" style="width:${spPct}%"></div></div>
            <div class="growth-val">${sp.done}/${sp.total} ${Store.Supplements.isAllDone(dateStr) && sp.total ? '✅' : ''}</div>
          </div>
          <div class="growth-item" onclick="App.switchModule('reading')">
            <div class="growth-label">阅读时长</div>
            <div class="growth-bar"><div class="growth-bar-fill read" style="width:${Math.min(100, rs.totalMinutes % 600 / 6)}%"></div></div>
            <div class="growth-val">${rs.totalMinutes} 分 ${readToday ? '📖' : ''}</div>
          </div>
          <div class="growth-item" onclick="App.switchModule('health')">
            <div class="growth-label">睡眠</div>
            <div class="growth-bar"><div class="growth-bar-fill health" style="width:${sleepMin ? Math.min(100, sleepMin / 600 * 100) : 0}%"></div></div>
            <div class="growth-val">${sleepMin != null ? Math.round(sleepMin / 6) / 10 + 'h' : '—'} ${sleepOk ? '✅' : ''}</div>
          </div>
          <div class="growth-item" onclick="App.switchModule('health')">
            <div class="growth-label">${isPeriod ? '🌸经期' : '排便'}</div>
            <div class="growth-bar"><div class="growth-bar-fill bowel" style="width:${bowelCnt ? 100 : 0}%"></div></div>
            <div class="growth-val">${isPeriod ? '🌸在期' : (bowelCnt ? '💩' + bowelCnt : '未记')}</div>
          </div>
        </div>
      </div>`;
  }
  function readingElapsedToday() {
    const t = Store.DateUtils.formatDate(new Date());
    return Store.Reading.get().records.filter(r => r.date === t).reduce((s, x) => s + (x.minutes || 0), 0);
  }

  // ===== 公开 API =====
  return {
    init,
    switchModule,
    render,
    toast,
    feedback,
    clearFeedback,
    showModal,
    closeModal,
    confirmDialog,

    // 待办操作
    setTodoView(view) { todoView = view; Store.Settings.update({todoView: view}); render(); },
    setTimelineFilter(key) { timelineFilter = key; render(); },
    setTimelineSearch(val) { timelineSearch = val; render(); },
    refreshData,
    showWeeklyGoalModal,
    saveWeeklyGoal,

    // 计时器
    showTimerModal,
    closeTimerModal,
    timerStart,
    timerPause,
    timerReset,
    timerFinish,
    timerSetMode,
    timerSetPreset,
    timerPickerDelta,
    showRingtonePanel,
    closeRingtonePanel,
    previewRingtone,
    selectRingtone,
    testAllRingtones,
    debugBeep,

    // 补品打卡模块
    parseSupplement,
    setSupplementView(v) { supplementView = v; render(); },
    setSupplementReviewView(v) { supplementReviewView = v; render(); },
    changeSupplementMonth(d) { supplementCalMonth.setMonth(supplementCalMonth.getMonth() + d); render(); },
    addSupplementFromInput,
    tapSupplementDot,
    showSupplementEditModal,
    saveSupplementEdit,
    deleteSupplement,
    showSupplementDay,
    renderSupplement,
    renderReading,

    // 每日阅读模块
    setReadingView(v) { readingView = v; render(); },
    startReadingTimer,
    pauseReadingTimer,
    finishReadingTimer,
    resetReadingTimerConfirm,
    selectReadingGoal,
    setReadingMedium,
    addBookFromInput,
    saveReadingBook,
    markBookDone,
    setBookProgress(id, pct) { Store.Reading.setBookProgress(id, pct); render(); },
    deleteBook(id) { Store.Reading.deleteBook(id); render(); },
    toggleQuoteFavorite,
    reshuffleQuotes,
    addRecBook(name) { if (!Store.Reading.get().books.some(b => b.name === name)) Store.Reading.addBook(name); toast(`已加入书架：《${name}》`); render(); },
    refreshBookRecs() { toast('书单已刷新（离线精选，随时可换）'); render(); },
    renderHealthGrowthCard,
    // 健康生活模块
    renderHealth,
    setHealthView(v) { healthView = v; render(); },
    openHealth(sub) { healthView = sub; switchModule('health'); },
    // 今日宜忌：走 App 自身方法进入（不依赖外部全局函数，避免旧缓存入口失效）
    openAlmanac() { if (window.Almanac && Almanac.open) Almanac.open(); else switchModule('almanac'); },
    setNickname(name) { Store.Settings.update({ nickname: (name || '').trim() }); render(); },
    pickBillDate() {
      const inp = document.createElement('input');
      inp.type = 'date';
      inp.value = billFilterDate || Store.DateUtils.formatDate(new Date());
      inp.style.position = 'fixed'; inp.style.top = '-9999px';
      document.body.appendChild(inp);
      const done = () => { if (inp.parentNode) inp.parentNode.removeChild(inp); };
      inp.addEventListener('change', () => { if (inp.value) { billFilterDate = inp.value; render(); } done(); });
      inp.addEventListener('blur', () => setTimeout(done, 400));
      if (inp.showPicker) inp.showPicker(); else inp.click();
    },
    setBillFilterDate(d) { billFilterDate = d; render(); },
    clearBillFilter() { billFilterDate = null; render(); },
    setSleepChart(v) { sleepChartView = v; render(); },
    changeHealthMonth(d) { healthCalMonth.setMonth(healthCalMonth.getMonth() + d); render(); },
    startSleep,
    wakeUp,
    recordBowel,
    recordBowelOn,
    togglePeriodDay,
    setCycleLength,
    showHealthNamesModal,
    saveHealthNames,
    showPeriodSymptomModal,
    savePeriodSymptoms,
    toggleSymptom,
    showColorPicker,
    cpHue,
    cpHex,
    cpRgb,
    cpApplyPreset,
    cpSquareDrag,
    selectDate(dateStr) {
      currentDate = new Date(dateStr);
      calendarMonth = new Date(currentDate);
      Store.Settings.setSelectedDate(dateStr);
      render();
    },
    toggleTask(id) {
      const task = Store.Tasks.getById(id);
      if (task && task.locked) { toast('该记录为系统自动生成，不可修改'); return; }
      Store.Tasks.toggleComplete(id);
      setSyncStatus('syncing');
      render();
      setTimeout(() => setSyncStatus('synced'), 300);
    },
    editTask(id) {
      const task = Store.Tasks.getById(id);
      if (!task) return;
      showTaskEditModal(task);
    },
    showAddTaskInput(dimension) {
      const div = document.getElementById(`addTaskInput_${dimension}`);
      div.style.display = 'block';
      div.querySelector('input').focus();
    },
    handleAddTaskKey(e, dimension) {
      if (e.key === 'Enter') {
        const name = e.target.value.trim();
        if (!name) { toast('请输入任务名称'); return; }
        Store.Tasks.create({ name, dimension, date: Store.DateUtils.formatDate(currentDate) });
        setSyncStatus('syncing');
        render();
        setTimeout(() => setSyncStatus('synced'), 300);
      } else if (e.key === 'Escape') {
        e.target.value = '';
        e.target.parentElement.style.display = 'none';
      }
    },
    showMultiDayModal() {
      showModal(`
        <div class="modal-title">添加多日日程</div>
        <div class="form-group">
          <label class="form-label">任务名称</label>
          <input type="text" class="form-input" id="multiDayName" placeholder="输入任务名称">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">开始日期</label>
            <input type="date" class="form-input" id="multiDayStart">
          </div>
          <div class="form-group">
            <label class="form-label">结束日期</label>
            <input type="date" class="form-input" id="multiDayEnd">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">所属维度</label>
          <select class="form-select" id="multiDayDim">
            <option value="work">工作</option>
            <option value="study">学习</option>
            <option value="health">健康</option>
            <option value="life">生活</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
          <button class="btn btn-primary" onclick="App.createMultiDay()">确认添加</button>
        </div>
      `);
    },
    createMultiDay() {
      const name = document.getElementById('multiDayName').value.trim();
      const start = document.getElementById('multiDayStart').value;
      const end = document.getElementById('multiDayEnd').value;
      const dim = document.getElementById('multiDayDim').value;
      if (!name) { toast('请输入任务名称'); return; }
      if (!start || !end) { toast('请选择起止日期'); return; }
      if (start > end) { toast('开始日期不能晚于结束日期'); return; }
      Store.Tasks.createMultiDay({ name, dimension: dim, startDate: start, endDate: end });
      closeModal();
      toast('多日日程已添加');
      setSyncStatus('syncing');
      render();
      setTimeout(() => setSyncStatus('synced'), 300);
    },
    showMilestoneModal() {
      showModal(`
        <div class="modal-title">添加大事记</div>
        <div class="form-group">
          <label class="form-label">日期</label>
          <input type="date" class="form-input" id="milestoneDate" value="${Store.DateUtils.formatDate(currentDate)}">
        </div>
        <div class="form-group">
          <label class="form-label">事件内容</label>
          <input type="text" class="form-input" id="milestoneContent" placeholder="输入事件描述">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
          <button class="btn btn-primary" onclick="App.createMilestone()">确认添加</button>
        </div>
      `);
    },
    createMilestone() {
      const date = document.getElementById('milestoneDate').value;
      const content = document.getElementById('milestoneContent').value.trim();
      if (!content) { toast('请输入事件内容'); return; }
      Store.Milestones.create({ date, content });
      closeModal();
      toast('大事记已添加');
      render();
    },

    // 周目标
    showWeeklyGoalModal(goalId) {
      const goal = goalId ? Store.WeeklyGoals.getById(goalId) : null;
      showModal(`
        <div class="modal-title">${goal ? '编辑' : '添加'}周目标</div>
        <div class="form-group">
          <label class="form-label">目标名称</label>
          <input type="text" class="form-input" id="goalName" value="${goal ? escapeHtml(goal.name) : ''}" placeholder="输入目标名称">
        </div>
        <div class="form-group">
          <label class="form-label">所属维度</label>
          <select class="form-select" id="goalDim">
            <option value="work" ${goal?.dimension === 'work' ? 'selected' : ''}>工作</option>
            <option value="study" ${goal?.dimension === 'study' ? 'selected' : ''}>学习</option>
            <option value="health" ${goal?.dimension === 'health' ? 'selected' : ''}>健康</option>
            <option value="life" ${goal?.dimension === 'life' ? 'selected' : ''}>生活</option>
          </select>
        </div>
        ${goal ? `
          <div class="form-group">
            <label class="form-label">关联任务</label>
            <div style="max-height:200px;overflow-y:auto;">
              ${Store.Tasks.getByWeek(currentDate).map(t => `
                <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;">
                  <input type="checkbox" ${goal.taskIds.includes(t.id) ? 'checked' : ''} data-task-id="${t.id}" class="goal-task-link">
                  <span class="dim-dot ${t.dimension}"></span>
                  <span style="font-size:13px;${t.completed ? 'text-decoration:line-through;opacity:0.5;' : ''}">${escapeHtml(t.name)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
          ${goal ? `<button class="btn btn-danger" onclick="App.deleteWeeklyGoal('${goal.id}')">删除</button>` : ''}
          <button class="btn btn-primary" onclick="App.saveWeeklyGoal('${goalId || ''}')">保存</button>
        </div>
      `);
    },
    saveWeeklyGoal(goalId) {
      const name = document.getElementById('goalName').value.trim();
      const dim = document.getElementById('goalDim').value;
      if (!name) { toast('请输入目标名称'); return; }
      if (goalId) {
        Store.WeeklyGoals.update(goalId, { name, dimension: dim });
        const checkboxes = document.querySelectorAll('.goal-task-link');
        const taskIds = [];
        checkboxes.forEach(cb => { if (cb.checked) taskIds.push(cb.dataset.taskId); });
        Store.WeeklyGoals.update(goalId, { taskIds });
        toast('周目标已更新');
      } else {
        Store.WeeklyGoals.create({ name, dimension: dim, weekKey: Store.DateUtils.getWeekKey(currentDate) });
        toast('周目标已添加');
      }
      closeModal();
      setSyncStatus('syncing');
      render();
      setTimeout(() => setSyncStatus('synced'), 300);
    },
    deleteWeeklyGoal(id) {
      confirmDialog('删除周目标', '确定要删除这个周目标吗？关联的任务不会被删除。', () => {
        Store.WeeklyGoals.delete(id);
        closeModal();
        toast('周目标已删除');
        render();
      });
    },

    // 灵感
    setInspirationType(type) {
      document.querySelectorAll('.inspiration-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.type === type);
      });
    },
    saveInspiration() {
      const input = document.getElementById('inspirationInput');
      const content = input.value.trim();
      if (!content) { toast('请输入灵感内容'); return; }
      const type = document.querySelector('.inspiration-tab.active')?.dataset.type || 'idea';
      Store.Inspirations.create({ content, type });
      input.value = '';
      toast('灵感已记录');
      setSyncStatus('syncing');
      render();
      setTimeout(() => setSyncStatus('synced'), 300);
    },
    inspirationToTask() {
      const input = document.getElementById('inspirationInput');
      const content = input.value.trim();
      if (!content) { toast('请先输入灵感内容'); return; }
      showTaskEditModal({
        name: content,
        notes: '从灵感转换',
        dimension: 'work',
        date: Store.DateUtils.formatDate(currentDate),
      }, true);
    },
    showTimelineWriteModal() {
      showModal(`
        <div class="modal-title">写入时间线</div>
        <div class="form-group">
          <label class="form-label">时间线内容</label>
          <textarea class="form-textarea" id="timelineContent" placeholder="记录今天的重要时刻..." style="min-height:100px;"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">日期</label>
          <input type="date" class="form-input" id="timelineDate" value="${Store.DateUtils.formatDate(currentDate)}">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
          <button class="btn btn-primary" onclick="App.saveTimelineWrite()">保存</button>
        </div>
      `);
    },
    saveTimelineWrite() {
      const content = document.getElementById('timelineContent').value.trim();
      const date = document.getElementById('timelineDate').value;
      if (!content) { toast('请输入内容'); return; }
      Store.Inspirations.create({ content, type: 'idea' });
      closeModal();
      toast('已写入时间线');
      render();
    },

    // 便利贴
    saveStickyNote(content) {
      Store.StickyNotes.set(content);
      setSyncStatus('syncing');
      setTimeout(() => setSyncStatus('synced'), 300);
    },

    // 复盘备忘
    saveReviewMemo,

    // 复盘操作
    setReviewView(view) { reviewView = view; Store.Settings.update({reviewView: view}); render(); },
    changeReviewPeriod(dir) {
      if (reviewView === 'week') currentDate = Store.DateUtils.addDays(currentDate, dir * 7);
      else if (reviewView === 'month') currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
      else currentDate = new Date(currentDate.getFullYear() + dir, 0, 1);
      Store.Settings.setSelectedDate(currentDate);
      render();
    },
    jumpToTodoDate(dateStr) {
      currentDate = new Date(dateStr);
      Store.Settings.setSelectedDate(dateStr);
      switchModule('todo');
    },
    jumpToReviewMonth(month) {
      currentDate = new Date(currentDate.getFullYear(), month, 1);
      Store.Settings.setSelectedDate(currentDate);
      setReviewView('month');
    },

    // 记账操作
    setFinanceView(view) { financeView = view; Store.Settings.update({financeView: view}); render(); },
    changeFinancePeriod(dir) {
      if (financeView === 'week') currentDate = Store.DateUtils.addDays(currentDate, dir * 7);
      else if (financeView === 'month') currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
      else currentDate = new Date(currentDate.getFullYear() + dir, 0, 1);
      Store.Settings.setSelectedDate(currentDate);
      render();
    },
    editBill(id) {
      const bill = Store.Bills.getById(id);
      if (!bill) return;
      showBillEditModal(bill);
    },
    showAddBillModal() {
      showBillEditModal(null);
    },

    // 日历操作
    changeCalendarMonth(dir) {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + dir, 1);
      render();
    },

    // 数据管理
    exportData() { Store.IO.export(); toast('数据已导出'); },
    importData() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (Store.IO.import(ev.target.result)) {
            toast('数据导入成功');
            render();
          } else {
            toast('导入失败，请检查文件格式');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    },
    showRecycleBin() {
      const items = Store.RecycleBin.getAll();
      showModal(`
        <div class="modal-title">回收站</div>
        <div style="max-height:400px;overflow-y:auto;">
          ${items.length === 0 ? '<div class="empty-state">回收站为空</div>' :
            items.map(item => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f5f5f5;">
                <div>
                  <div style="font-size:13px;">${escapeHtml(item.data.name || item.data.content || item.data.note || item.type)}</div>
                  <div style="font-size:11px;color:var(--text-secondary);">${item.type} · ${new Date(item.deletedAt).toLocaleDateString('zh-CN')}</div>
                </div>
                <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;" onclick="App.restoreItem('${item.data.id}')">恢复</button>
              </div>
            `).join('')
          }
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">关闭</button>
          ${items.length > 0 ? '<button class="btn btn-danger" onclick="App.clearRecycleBin()">清空回收站</button>' : ''}
        </div>
      `);
    },
    restoreItem(id) {
      Store.RecycleBin.restore(id);
      toast('已恢复');
      App.showRecycleBin();
      render();
    },
    clearRecycleBin() {
      confirmDialog('清空回收站', '清空后无法恢复，确定要清空吗？', () => {
        Store.RecycleBin.clear();
        toast('回收站已清空');
        App.showRecycleBin();
      });
    },
    confirmClearAll() {
      showModal(`
        <div class="modal-title">确认清除所有数据？</div>
        <p style="font-size:14px;line-height:1.7;margin-bottom:16px;color:var(--text-primary);">此操作将永久删除所有待办任务、记账明细、复盘记录与本地备忘，数据清除后无法恢复，请谨慎操作。</p>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">建议先导出数据备份后再执行清除。</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
          <button class="btn btn-danger" id="clearAllBtn">确认清除</button>
        </div>
      `);
      document.getElementById('clearAllBtn').onclick = () => {
        Store.IO.clearAll();
        closeModal();
        toast('所有数据已清除，已重置为初始状态');
        currentDate = new Date();
        calendarMonth = new Date(currentDate);
        switchModule('todo');
      };
    },

    // 设置 / 归档 / 分类
    setThemeColor,
    setThemePack,
    setCustomTheme,
    setArchiveDelay,
    showArchivedModal,
    restoreTask,
    permanentlyDeleteTask,
    archiveAllCompleted,
    showCategoryModal,
    moveCategory,
    saveCategories,
    resetCategories,

    importDataMerge() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (Store.IO.import(ev.target.result, 'merge')) {
            toast('数据已合并导入');
            render();
          } else {
            toast('导入失败，请检查文件格式');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    },

    // PWA 安装
    doInstall,
    dismissInstallBar,

    // 搜索
    showSearch() {
      showModal(`
        <div class="modal-title">搜索</div>
        <div class="form-group">
          <input type="text" class="form-input" id="searchInput" placeholder="搜索任务、账单、灵感..." autofocus>
        </div>
        <div id="searchResults" style="max-height:300px;overflow-y:auto;"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">关闭</button>
        </div>
      `);
      document.getElementById('searchInput').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (q.length < 1) {
          document.getElementById('searchResults').innerHTML = '';
          return;
        }
        const tasks = Store.Tasks.search(q).slice(0, 5);
        const bills = Store.Bills.search(q).slice(0, 5);
        const insps = Store.Inspirations.search(q).slice(0, 5);
        let html = '';
        if (tasks.length) {
          html += '<div style="font-size:12px;color:var(--text-secondary);margin:8px 0;">任务</div>';
          tasks.forEach(t => html += `<div style="padding:6px 0;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5;" onclick="App.closeModal();App.selectDate('${t.date}');"><span class="dim-dot ${t.dimension}"></span>${escapeHtml(t.name)}</div>`);
        }
        if (bills.length) {
          html += '<div style="font-size:12px;color:var(--text-secondary);margin:8px 0;">账单</div>';
          bills.forEach(b => html += `<div style="padding:6px 0;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5;" onclick="App.closeModal();App.selectDate('${b.date}');">${CATEGORIES[b.category]?.icon || '💰'} ¥${formatMoney(b.amount)} ${escapeHtml(b.note || '')}</div>`);
        }
        if (insps.length) {
          html += '<div style="font-size:12px;color:var(--text-secondary);margin:8px 0;">灵感</div>';
          insps.forEach(i => html += `<div style="padding:6px 0;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5;" onclick="App.closeModal();App.selectDate('${i.date}');">💡 ${escapeHtml(i.content)}</div>`);
        }
        if (!html) html = '<div class="empty-state">无搜索结果</div>';
        document.getElementById('searchResults').innerHTML = html;
      });
    },

    // 暴露给 onclick 调用的函数
    saveTask,
    confirmDeleteTask,
    saveBill,
    confirmDeleteBill,
    setBillType,
  };

  // ===== 任务编辑弹窗 =====
  function showTaskEditModal(task, isNew = false) {
    const isEdit = !isNew;
    showModal(`
      <div class="modal-title">${isEdit ? '编辑任务' : '新建任务'}</div>
      <div class="form-group">
        <label class="form-label">任务名称 *</label>
        <input type="text" class="form-input" id="taskName" value="${escapeHtml(task.name || '')}" placeholder="输入任务名称">
      </div>
      <div class="form-group">
        <label class="form-label">备注</label>
        <input type="text" class="form-input" id="taskNotes" value="${escapeHtml(task.notes || '')}" placeholder="补充说明（选填）">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">日期</label>
          <input type="date" class="form-input" id="taskDate" value="${task.date || Store.DateUtils.formatDate(currentDate)}">
        </div>
        <div class="form-group">
          <label class="form-label">时间</label>
          <input type="time" class="form-input" id="taskTime" value="${task.time || ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">维度</label>
        <div class="category-grid">
          ${Object.entries(DIMENSIONS).map(([key, dim]) => `
            <div class="category-option ${task.dimension === key ? 'active' : ''}" data-dim="${key}" onclick="document.querySelectorAll('.category-option').forEach(o=>o.classList.remove('active'));this.classList.add('active');">
              <span class="cat-icon">${dim.icon}</span>
              <span>${dim.name}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button class="btn btn-danger" onclick="App.confirmDeleteTask('${task.id}')">删除</button>` : ''}
        <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" onclick="App.saveTask('${task.id || ''}')">保存</button>
      </div>
    `);
  }

  function saveTask(taskId) {
    const name = document.getElementById('taskName').value.trim();
    if (!name) { toast('请输入任务名称'); return; }
    const notes = document.getElementById('taskNotes').value.trim();
    const date = document.getElementById('taskDate').value;
    const time = document.getElementById('taskTime').value;
    const dimEl = document.querySelector('.category-option.active');
    const dimension = dimEl ? dimEl.dataset.dim : 'work';

    if (taskId) {
      Store.Tasks.update(taskId, { name, notes, date, time, dimension });
      toast('任务已更新');
    } else {
      Store.Tasks.create({ name, notes, date, time, dimension });
      toast('任务已创建');
    }
    closeModal();
    setSyncStatus('syncing');
    render();
    setTimeout(() => setSyncStatus('synced'), 300);
  }

  function confirmDeleteTask(taskId) {
    confirmDialog('删除任务', '确定要删除这个任务吗？删除后可在回收站恢复（30天内）。', () => {
      Store.Tasks.delete(taskId);
      closeModal();
      toast('任务已删除');
      render();
    });
  }

  // ===== 账单编辑弹窗 =====
  function showBillEditModal(bill) {
    const isEdit = !!bill;
    showModal(`
      <div class="modal-title">${isEdit ? '编辑账单' : '记一笔账'}</div>
      <div class="type-toggle">
        <button class="${(!bill || bill.type === 'expense') ? 'active' : ''}" onclick="App.setBillType('expense')" id="typeExpense">支出</button>
        <button class="${bill?.type === 'income' ? 'active' : ''}" onclick="App.setBillType('income')" id="typeIncome">收入</button>
      </div>
      <div id="categorySection" style="${bill?.type === 'income' ? 'display:none;' : ''}">
        <div class="form-group">
          <label class="form-label">支出分类</label>
          <div class="category-grid" id="expenseGrid">
            ${Object.entries(CATEGORIES).map(([key, cat]) => `
              <div class="category-option ${(!bill || (bill.type !== 'income' && bill.category === key)) ? 'active' : ''}" data-cat="${key}" onclick="document.querySelectorAll('#expenseGrid .category-option').forEach(o=>o.classList.remove('active'));this.classList.add('active');">
                <span class="cat-icon">${cat.icon}</span>
                <span>${cat.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <div id="incomeSection" style="${bill && bill.type === 'income' ? '' : 'display:none;'}">
        <div class="form-group">
          <label class="form-label">收入来源（参与结余，不计入支出饼图）</label>
          <div class="category-grid" id="incomeGrid">
            ${Object.entries(INCOME_SOURCES).map(([key, src]) => `
              <div class="category-option ${((!bill && key === 'salary') || (bill && bill.type === 'income' && bill.category === key)) ? 'active' : ''}" data-income="${key}" onclick="document.querySelectorAll('#incomeGrid .category-option').forEach(o=>o.classList.remove('active'));this.classList.add('active');">
                <span class="cat-icon">${src.icon}</span>
                <span>${src.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">金额 *</label>
        <input type="number" class="form-input" id="billAmount" value="${bill ? bill.amount : ''}" placeholder="0.00" step="0.01" min="0" max="999999.99">
      </div>
      <div class="form-group">
        <label class="form-label">日期</label>
        <input type="date" class="form-input" id="billDate" value="${bill ? bill.date : Store.DateUtils.formatDate(currentDate)}">
      </div>
      <div class="form-group">
        <label class="form-label">备注</label>
        <input type="text" class="form-input" id="billNote" value="${escapeHtml(bill?.note || '')}" placeholder="补充说明（选填）">
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button class="btn btn-danger" onclick="App.confirmDeleteBill('${bill.id}')">删除</button>` : ''}
        <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" onclick="App.saveBill('${bill?.id || ''}')">保存</button>
      </div>
    `);
  }

  function setBillType(type) {
    currentBillType = type;
    document.getElementById('typeExpense').classList.toggle('active', type === 'expense');
    document.getElementById('typeIncome').classList.toggle('active', type === 'income');
    document.getElementById('categorySection').style.display = type === 'expense' ? 'block' : 'none';
    document.getElementById('incomeSection').style.display = type === 'income' ? 'block' : 'none';
  }

  function saveBill(billId) {
    const amount = parseFloat(document.getElementById('billAmount').value);
    if (!amount || amount <= 0) { toast('请输入有效金额（大于0）'); return; }
    if (amount > 999999.99) { toast('金额不能超过 999999.99'); return; }
    const date = document.getElementById('billDate').value;
    const note = document.getElementById('billNote').value.trim();
    const type = currentBillType;

    let category = 'food';
    if (type === 'expense') {
      const catEl = document.querySelector('#expenseGrid .category-option.active');
      category = catEl ? catEl.dataset.cat : 'food';
    } else {
      const incEl = document.querySelector('#incomeGrid .category-option.active');
      category = incEl ? incEl.dataset.income : 'salary';
    }

    if (billId) {
      Store.Bills.update(billId, { type, category, amount, date, note });
      feedback({ icon: '💰', title: '已更新～', sub: '账单信息已保存 📋' });
    } else {
      Store.Bills.create({ type, category, amount, date, note });
      feedback({ icon: '💰', title: '记上啦！', sub: '今天的支出已归档 📋' });
    }
    closeModal();
    setSyncStatus('syncing');
    render();
    setTimeout(() => setSyncStatus('synced'), 300);
  }

  function confirmDeleteBill(billId) {
    confirmDialog('删除账单', '确定要删除这条账单吗？删除后可在回收站恢复（30天内）。', () => {
      Store.Bills.delete(billId);
      closeModal();
      toast('账单已删除');
      render();
    });
  }

  // ===== 同步状态 =====
  function setSyncStatus(status) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    el.className = 'sync-status ' + status;
    const text = el.querySelector('.sync-text');
    if (status === 'syncing') text.textContent = '同步中...';
    else if (status === 'failed') text.textContent = '同步失败';
    else text.textContent = '已同步';
  }

  // ===== 复盘备忘保存 =====
  function saveReviewMemo(content) {
    if (reviewView === 'week') Store.ReviewMemos.setByWeek(currentDate, content);
    else if (reviewView === 'month') Store.ReviewMemos.setByMonth(currentDate.getFullYear(), currentDate.getMonth(), content);
    else Store.ReviewMemos.setByYear(currentDate.getFullYear(), content);
    setSyncStatus('syncing');
    setTimeout(() => setSyncStatus('synced'), 300);
  }

  // ===== HTML 转义 =====
  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  // ===== 键盘快捷键 =====
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+1/2/3 切换板块
      if (e.ctrlKey && e.key >= '1' && e.key <= '3') {
        e.preventDefault();
        const modules = ['todo', 'review', 'finance'];
        switchModule(modules[parseInt(e.key) - 1]);
      }
      // Ctrl+N 新增任务/账单
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        if (currentModule === 'todo') {
          showTaskEditModal({}, true);
        } else if (currentModule === 'finance') {
          showBillEditModal(null);
        }
      }
      // Esc 关闭弹窗
      if (e.key === 'Escape') {
        closeModal();
      }
    });
  }

  // ===== 初始化 =====
  function init() {
    applyTheme();

    // 设备标识：稳定生成一次，用于「设备绑定」展示（纯前端无法在卸载后恢复数据，需后端云端才能真正跨设备同步）
    ensureDeviceId();


    // 冷启动锚定今天
    currentDate = new Date();
    lastKnownTodayStr = Store.DateUtils.formatDate(currentDate);
    calendarMonth = new Date(currentDate);
    Store.Settings.update({ selectedDate: lastKnownTodayStr });

    // 跨天检测：每分钟检测一次系统日期（飞行模式/改系统时间也能生效）
    setInterval(checkDayChange, 60000);

    // 导航事件
    document.querySelectorAll('.nav-tab, .bottom-tab').forEach(tab => {
      tab.addEventListener('click', () => switchModule(tab.dataset.module));
    });

    // FAB 按钮
    document.getElementById('fab').addEventListener('click', () => {
      if (currentModule === 'todo') {
        showTaskEditModal({}, true);
      } else if (currentModule === 'finance') {
        showBillEditModal(null);
      }
    });

    // 顶部操作按钮
    document.getElementById('searchBtn').addEventListener('click', () => App.showSearch());
    document.getElementById('exportBtn').addEventListener('click', () => Store.IO.export());
    document.getElementById('settingsBtn').addEventListener('click', () => switchModule('profile'));

    // 键盘快捷键
    setupKeyboardShortcuts();

    // 离线 / 在线提示
    window.addEventListener('online', updateOfflineBanner);
    window.addEventListener('offline', updateOfflineBanner);
    updateOfflineBanner();

    // PWA 安装引导
    setupInstallPrompt();

    // 页面可见性：从后台返回前台时，强制刷新所有日期相关数据 + 校正计时
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        checkDayChange();
        if (timerState.running) {
          updateTimerDisplay();
          updateTimerPill();
          if (timerState.mode === 'countdown' && timerRemainingSeconds() <= 0) timerFinish();
        }
      }
    });

  // 计时器恢复（异常退出后继续）
  recoverTimer();

  function ensureDeviceId() {
    let id = localStorage.getItem('wb_device_id');
    if (!id) { id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem('wb_device_id', id); }
    deviceId = id;
  }

    // 补品到时提醒（尝试请求通知权限，失败也不影响应用内提示）
    checkSupplementReminders();
    checkHealthReminders();
    if ('Notification' in window && Notification.permission === 'default') {
      // 不强制弹窗打扰，仅在用户开启提醒时已由打卡流程触发；此处仅预置
    }

    // 渲染初始页面：若 URL 带 #模块（如从灵感详情 history.back() 返回），恢复该模块；
    // 否则冷启动进入首页
    var initialModule = 'home';
    try {
      var _h = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
      if (_h && document.getElementById(_h + 'Module')) initialModule = _h;
    } catch (e) {}
    switchModule(initialModule);

    // PWA 自动更新提示（Service Worker 接管后已静默刷新，这里告知用户）
    try {
      if (sessionStorage.getItem('sw_updated')) {
        sessionStorage.removeItem('sw_updated');
        setTimeout(() => toast('🌟 已自动更新到最新版本', 3000), 600);
      }
    } catch (e) {}
  }

  // ===== 离线提示 =====
  function updateOfflineBanner() {
    let b = document.getElementById('offlineBanner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'offlineBanner';
      b.className = 'offline-banner';
      document.body.appendChild(b);
    }
    if (navigator.onLine === false) {
      b.style.display = 'block';
      b.textContent = '📡 当前离线，数据已本地保存，恢复网络后可继续使用';
    } else {
      b.style.display = 'none';
    }
  }

  // ===== PWA 安装引导 =====
  let deferredInstall = null;
  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstall = e;
      if (!Store.Settings.get().installBarDismissed) showInstallBar();
    });
    window.addEventListener('appinstalled', () => { hideInstallBar(); });
  }
  function showInstallBar() {
    let bar = document.getElementById('installBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'installBar';
      bar.className = 'install-bar';
      document.body.appendChild(bar);
    }
    bar.innerHTML = `
      <span class="install-text">📲 添加到主屏幕，像 App 一样随时打开</span>
      <button class="btn btn-primary" style="padding:6px 14px;font-size:12px;" onclick="App.doInstall()">安装</button>
      <button class="install-close" onclick="App.dismissInstallBar()">✕</button>
    `;
    bar.style.display = 'flex';
  }
  function hideInstallBar() {
    const bar = document.getElementById('installBar');
    if (bar) bar.style.display = 'none';
  }
  function doInstall() {
    if (deferredInstall) {
      deferredInstall.prompt();
      deferredInstall.userChoice.then(() => { deferredInstall = null; hideInstallBar(); });
    } else {
      toast('请使用浏览器菜单「添加到主屏幕」');
    }
  }
  function dismissInstallBar() {
    Store.Settings.update({ installBarDismissed: true });
    hideInstallBar();
  }

})();

// 初始化应用
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
