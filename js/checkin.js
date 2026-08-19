/**
 * 我的打卡（习惯打卡）模块 —— 内嵌于首页的 checkinModule。
 * 数据来自 Store.Checkins（localStorage），UI 由本文件渲染。
 * 设计：松弛治愈、淡莫兰迪 + 浅马卡龙；无红点/角标/未完成催促。
 */
(function () {
  'use strict';

  var CI_EMOJIS = ['🍳', '💧', '🏃', '📚', '🧘', '☀️', '💊', '📖', '🌙', '🌿', '🍎', '☕', '🎯', '✍️', '🎨', '🎵', '💪', '🌸', '🐱', '🍵', '🧹', '💡', '🌟', '❤️'];

  var view = 'week';        // 当前视图：week / month / year
  var sortMode = false;     // 排序模式
  var pickedEmoji = CI_EMOJIS[0];
  var dragId = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(d) { return Store.DateUtils.formatDate(d); }

  // ===== 主渲染 =====
  function render() {
    var root = document.getElementById('checkinModule');
    if (!root) return;
    var d = new Date();
    var dateStr = fmt(d);
    var items = Store.Checkins.getAll();
    var todayDone = Store.Checkins.todayDone(dateStr);

    var wd = Store.DateUtils.getWeekDates(d);
    var ws = fmt(wd[0]), we = fmt(wd[6]);
    var y = d.getFullYear(), m = d.getMonth();
    var md = Store.DateUtils.getMonthDays(y, m);
    var ms = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    var me = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(md).padStart(2, '0');
    var ys = y + '-01-01', ye = y + '-12-31';

    var weekCount = Store.Checkins.countInRange(ws, we);
    var monthCount = Store.Checkins.countInRange(ms, me);
    var yearCount = Store.Checkins.countInRange(ys, ye);

    var html = '';
    html += navBar();
    html += '<div class="ci-date">' +
      '<div class="ci-date-main">' + y + '年' + (m + 1) + '月' + d.getDate() + '日 · ' + Store.DateUtils.weekdayCN(d) + '</div>' +
      '<div class="ci-date-sub">今日已完成 ' + todayDone + ' 项 ✨</div>' +
      '</div>';
    html += viewSwitcher(weekCount, monthCount, yearCount, m, y);
    html += viewBody(d, dateStr, y, m);
    html += todayList(items, dateStr);

    root.innerHTML = html;
    attachEvents();
  }

  function navBar() {
    return '<div class="ci-nav">' +
      '<button class="ci-back" onclick="App.switchModule(\'home\')" aria-label="返回">←</button>' +
      '<span class="ci-title">✅ 我的打卡</span>' +
      '<button class="ci-manage" onclick="Checkin.openManage()" aria-label="管理">⋮</button>' +
      '</div>';
  }

  function viewSwitcher(wc, mc, yc, m, y) {
    var tabs = [
      ['week', '周', (m + 1) + '/' + new Date().getDate(), wc],
      ['month', '月', (m + 1) + '月', mc],
      ['year', '年', y, yc]
    ];
    var cards = tabs.map(function (t) {
      return '<button class="ci-view-card ' + (view === t[0] ? 'active' : '') + '" onclick="Checkin.setView(\'' + t[0] + '\')">' +
        '<span class="ci-view-label">' + t[1] + '</span>' +
        '<span class="ci-view-period">' + t[2] + '</span>' +
        '<span class="ci-view-count">' + t[3] + ' 项</span>' +
        '</button>';
    }).join('');
    return '<div class="ci-views">' + cards + '</div>';
  }

  function viewBody(d, dateStr, y, m) {
    if (view === 'week') return weekView(d);
    if (view === 'month') return monthView(y, m);
    return yearView(y);
  }

  function weekView(d) {
    var dates = Store.DateUtils.getWeekDates(d);
    var dots = dates.map(function (dt) {
      var ds = fmt(dt);
      var on = Store.Checkins.getAll().some(function (c) { return c.records && c.records[ds]; });
      return '<div class="ci-wk">' +
        '<div class="ci-wk-dot ' + (on ? 'on' : '') + '">' + (on ? '●' : '○') + '</div>' +
        '<div class="ci-wk-wd">' + Store.DateUtils.weekdayShort(dt) + '</div>' +
        '</div>';
    }).join('');
    var active = dates.filter(function (dt) {
      var ds = fmt(dt);
      return Store.Checkins.getAll().some(function (c) { return c.records && c.records[ds]; });
    }).length;
    return '<div class="ci-card">' +
      '<div class="ci-card-title">本周打卡趋势</div>' +
      '<div class="ci-wk-row">' + dots + '</div>' +
      '<div class="ci-card-sub">已完成 ' + active + '/7 天 ✨</div>' +
      '</div>';
  }

  function monthView(y, m) {
    var days = Store.DateUtils.getMonthDays(y, m);
    var heat = Store.Checkins.monthHeat(y, m);
    var max = 1;
    Object.keys(heat).forEach(function (k) { if (heat[k] > max) max = heat[k]; });
    var first = new Date(y, m, 1).getDay();
    var cells = '';
    for (var i = 0; i < first; i++) cells += '<div class="ci-heat empty"></div>';
    for (var day = 1; day <= days; day++) {
      var c = heat[day] || 0;
      var ratio = c / max;
      var l = 92 - ratio * 37;
      var bg = c === 0 ? 'var(--ci-heat-0)' : 'hsl(140,48%,' + l.toFixed(1) + '%)';
      cells += '<div class="ci-heat" style="background:' + bg + '" title="' + (m + 1) + '月' + day + '日 完成 ' + c + ' 项"></div>';
    }
    var mdStr = String(days).padStart(2, '0');
    var me = y + '-' + String(m + 1).padStart(2, '0') + '-' + mdStr;
    var ms = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    return '<div class="ci-card">' +
      '<div class="ci-card-title">' + y + '年' + (m + 1) + '月 · 打卡热力</div>' +
      '<div class="ci-heat-grid">' + cells + '</div>' +
      '<div class="ci-card-sub">本月共打卡 ' + Store.Checkins.countInRange(ms, me) + ' 项 · 颜色越深完成越多</div>' +
      '</div>';
  }

  function yearView(y) {
    var trend = Store.Checkins.yearTrend(y);
    var max = 1; trend.forEach(function (v) { if (v > max) max = v; });
    var W = 300, H = 120, pad = 16;
    var pts = trend.map(function (v, i) {
      var x = pad + (W - 2 * pad) * (i / 11);
      var yy = H - pad - (H - 2 * pad) * (v / max);
      return [x, yy];
    });
    var line = pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var area = pad + ',' + (H - pad) + ' ' + line + ' ' + (W - pad) + ',' + (H - pad);
    var dots = pts.map(function (p, i) {
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" class="ci-dot"/>' +
        '<text x="' + p[0].toFixed(1) + '" y="' + (H - 2) + '" class="ci-mlbl">' + (i + 1) + '</text>';
    }).join('');
    var ov = Store.Checkins.yearOverview(y);
    return '<div class="ci-card">' +
      '<div class="ci-card-title">' + y + '年 · 打卡趋势</div>' +
      '<svg class="ci-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<polygon points="' + area + '" class="ci-area"/>' +
      '<polyline points="' + line + '" class="ci-poly"/>' + dots +
      '</svg>' +
      '<div class="ci-overview">' +
      '<div class="ci-ov"><div class="ci-ov-num">' + ov.total + '</div><div class="ci-ov-lbl">年度总打卡</div></div>' +
      '<div class="ci-ov"><div class="ci-ov-num">' + ov.activeDays + '</div><div class="ci-ov-lbl">打卡天数</div></div>' +
      '<div class="ci-ov"><div class="ci-ov-num">' + ov.longest + '</div><div class="ci-ov-lbl">最长连续</div></div>' +
      '</div>' +
      '</div>';
  }

  function todayList(items, dateStr) {
    var body;
    if (!items.length) {
      body = '<div class="ci-empty">还没有打卡项 🌱<br>点击下方「+ 新建打卡项」开始记录你的小习惯吧</div>';
    } else {
      body = items.map(function (it) {
        var done = Store.Checkins.isDone(it.id, dateStr);
        var handle = sortMode ? '<span class="ci-handle" draggable="true" data-id="' + it.id + '">⠿</span>' : '';
        var move = sortMode ? '<span class="ci-move"><button onclick="Checkin.move(\'' + it.id + '\',\'up\')">↑</button><button onclick="Checkin.move(\'' + it.id + '\',\'down\')">↓</button></span>' : '';
        return '<div class="ci-item ' + (done ? 'done' : '') + ' ' + (sortMode ? 'sorting' : '') + '" data-id="' + it.id + '">' +
          handle +
          '<span class="ci-emoji">' + (it.icon || '✅') + '</span>' +
          '<span class="ci-name">' + esc(it.name) + '</span>' +
          '<span class="ci-state">' + (done ? '✅' : '⬜') + '</span>' +
          move +
          '</div>';
      }).join('');
    }
    var addBtn = sortMode
      ? '<button class="ci-add" onclick="Checkin.exitSort()">完成排序</button>'
      : '<button class="ci-add" onclick="Checkin.openAdd()">+ 新建打卡项</button>';
    return '<div class="ci-card">' +
      '<div class="ci-card-title">今日打卡清单</div>' +
      '<div class="ci-list">' + body + '</div>' +
      addBtn +
      '</div>';
  }

  // ===== 事件绑定 =====
  function attachEvents() {
    var root = document.getElementById('checkinModule');
    if (!root) return;
    root.querySelectorAll('.ci-item').forEach(function (el) {
      var id = el.dataset.id;
      if (sortMode) { bindDrag(el, id); return; }
      var timer = null, longFired = false;
      var start = function () { longFired = false; timer = setTimeout(function () { longFired = true; if (navigator.vibrate) navigator.vibrate(12); openActionMenu(id); }, 480); };
      var cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchend', cancel);
      el.addEventListener('touchmove', cancel, { passive: true });
      el.addEventListener('mousedown', start);
      el.addEventListener('mouseup', cancel);
      el.addEventListener('mouseleave', cancel);
      el.addEventListener('click', function (e) {
        if (longFired) { longFired = false; e.preventDefault(); return; }
        Checkin.toggle(id);
      });
    });
  }

  function bindDrag(el, id) {
    el.draggable = true;
    el.addEventListener('dragstart', function () { dragId = id; el.classList.add('dragging'); });
    el.addEventListener('dragend', function () {
      el.classList.remove('dragging');
      document.querySelectorAll('.ci-item').forEach(function (x) { x.classList.remove('dragover'); });
    });
    el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('dragover'); });
    el.addEventListener('dragleave', function () { el.classList.remove('dragover'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault(); el.classList.remove('dragover');
      if (dragId && dragId !== id) {
        var items = Store.Checkins.getAll();
        var ids = items.map(function (c) { return c.id; });
        var a = ids.indexOf(dragId), b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          ids.splice(b, 0, ids.splice(a, 1)[0]);
          Store.Checkins.reorder(ids);
          render();
        }
      }
    });
  }

  // ===== 交互 =====
  function toggle(id) {
    var d = fmt(new Date());
    Store.Checkins.toggle(id, d);
    if (navigator.vibrate) navigator.vibrate(12);
    render();
  }

  function setView(v) { view = v; render(); }

  function openManage() {
    App.showModal(
      '<div class="ci-modal-title">管理打卡项</div>' +
      '<button class="ci-act-btn" onclick="Checkin.startSort()">⠿ 调整排序</button>' +
      '<button class="ci-act-btn cancel" onclick="App.closeModal()">取消</button>'
    );
  }
  function startSort() { sortMode = true; App.closeModal(); render(); }
  function exitSort() { sortMode = false; render(); }
  function move(id, dir) {
    var items = Store.Checkins.getAll();
    var idx = items.findIndex(function (c) { return c.id === id; });
    if (idx < 0) return;
    var j = dir === 'up' ? idx - 1 : idx + 1;
    if (j < 0 || j >= items.length) return;
    var ids = items.map(function (c) { return c.id; });
    var t = ids[idx]; ids[idx] = ids[j]; ids[j] = t;
    Store.Checkins.reorder(ids); render();
  }

  function openActionMenu(id) {
    var it = Store.Checkins.getById(id); if (!it) return;
    App.showModal(
      '<div class="ci-act-title">' + esc(it.icon || '✅') + ' ' + esc(it.name) + '</div>' +
      '<button class="ci-act-btn" onclick="Checkin.openEdit(\'' + id + '\')">✏️ 编辑</button>' +
      '<button class="ci-act-btn danger" onclick="Checkin.confirmDelete(\'' + id + '\')">🗑️ 删除</button>' +
      '<button class="ci-act-btn cancel" onclick="App.closeModal()">取消</button>'
    );
  }

  function emojiGrid() {
    return CI_EMOJIS.map(function (e) {
      return '<button class="ci-emoji-opt ' + (e === pickedEmoji ? 'sel' : '') + '" onclick="Checkin.pickEmoji(\'' + e + '\')">' + e + '</button>';
    }).join('');
  }

  function openAdd() {
    pickedEmoji = CI_EMOJIS[0];
    App.showModal(
      '<div class="ci-modal-title">新建打卡项</div>' +
      '<input class="ci-input" id="ciName" placeholder="输入打卡项名称（如“早起喝水”）" maxlength="20"/>' +
      '<div class="ci-emoji-grid">' + emojiGrid() + '</div>' +
      '<div class="ci-modal-actions">' +
      '<button class="btn btn-secondary" onclick="App.closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="Checkin.saveNew()">创建</button>' +
      '</div>'
    );
    setTimeout(function () { var n = document.getElementById('ciName'); if (n) n.focus(); }, 50);
  }
  function pickEmoji(e) {
    pickedEmoji = e;
    document.querySelectorAll('.ci-emoji-opt').forEach(function (b) { b.classList.toggle('sel', b.textContent === e); });
  }
  function saveNew() {
    var n = document.getElementById('ciName');
    var name = (n ? n.value : '').trim();
    if (!name) { if (n) n.focus(); return; }
    Store.Checkins.create({ name: name, icon: pickedEmoji });
    App.closeModal(); App.toast('已添加打卡项 ✨'); render();
  }

  function openEdit(id) {
    var it = Store.Checkins.getById(id); if (!it) return;
    pickedEmoji = it.icon || CI_EMOJIS[0];
    App.showModal(
      '<div class="ci-modal-title">编辑打卡项</div>' +
      '<input class="ci-input" id="ciName" value="' + esc(it.name) + '" maxlength="20"/>' +
      '<div class="ci-emoji-grid">' + emojiGrid() + '</div>' +
      '<div class="ci-modal-actions">' +
      '<button class="btn btn-secondary" onclick="App.closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="Checkin.saveEdit(\'' + id + '\')">保存</button>' +
      '</div>'
    );
    setTimeout(function () { var n = document.getElementById('ciName'); if (n) n.focus(); }, 50);
  }
  function saveEdit(id) {
    var n = document.getElementById('ciName');
    var name = (n ? n.value : '').trim();
    if (!name) return;
    Store.Checkins.update(id, { name: name, icon: pickedEmoji });
    App.closeModal(); App.toast('已更新 ✨'); render();
  }

  function confirmDelete(id) {
    var it = Store.Checkins.getById(id); if (!it) return;
    App.confirmDialog('删除打卡项', '确定删除「' + it.name + '」吗？删除后其打卡记录将一并移除。', function () {
      var el = document.querySelector('.ci-item[data-id="' + id + '"]');
      if (el) {
        el.classList.add('removing');
        setTimeout(function () { Store.Checkins.remove(id); App.toast('已删除'); render(); }, 220);
      } else {
        Store.Checkins.remove(id); App.toast('已删除'); render();
      }
    });
  }

  window.Checkin = {
    render: render,
    toggle: toggle,
    setView: setView,
    openManage: openManage,
    startSort: startSort,
    exitSort: exitSort,
    move: move,
    openActionMenu: openActionMenu,
    openAdd: openAdd,
    pickEmoji: pickEmoji,
    saveNew: saveNew,
    openEdit: openEdit,
    saveEdit: saveEdit,
    confirmDelete: confirmDelete,
  };
})();
