/* ===== 消费小记 独立页面逻辑（纯前端 / localStorage） ===== */
/* 设计：日 / 周 / 月 / 年 四视图小导航栏，以下所有模块（统计 / 明细 / 分类扇形图）
   全部联动当前所选视图与周期；点击分类扇形/图例可联动筛选明细。 */
(function () {
  'use strict';

  var LS_BILLS = 'workbuddy_finance_v1';
  var LS_CATS = 'workbuddy_finance_cats_v1';
  var LS_BUDGET = 'workbuddy_finance_budget_v1';

  // 莫兰迪 / 马卡龙 柔和配色（用于扇形图各分类，稳定映射）
  var COLOR_PALETTE = [
    '#B8C5D6', '#F5D9E7', '#C5E1D5', '#E8D5B7', '#D5C5E1',
    '#E1C5C5', '#C5D5E1', '#E1D5C5', '#D5E1C5', '#CDD5E1',
    '#E5D5B0', '#D8C5D1'
  ];

  var DEFAULT_EXPENSE_CATS = [
    { key: '饮食', icon: '🍜', type: '支出' },
    { key: '购物', icon: '🛍️', type: '支出' },
    { key: '路程', icon: '🚇', type: '支出' }
  ];
  var DEFAULT_INCOME_CATS = [
    { key: '工资', icon: '💰', type: '收入' },
    { key: '红包', icon: '🧧', type: '收入' },
    { key: '理财', icon: '📈', type: '收入' },
    { key: '其他收入', icon: '📦', type: '收入' }
  ];

  // ---------- 状态 ----------
  var view = 'day';           // day | week | moon | year
  var cursor = new Date();    // 当前所选周期的游标
  var filterDate = null;      // 按日期筛选（保留兼容）
  var filterCat = null;       // 按分类筛选（联动明细）
  var formMode = 'add';
  var editingId = null;
  var formType = '支出';
  var formCat = '饮食';

  // ---------- 存储 ----------
  function loadBills() { try { return JSON.parse(localStorage.getItem(LS_BILLS)) || null; } catch (e) { return null; } }
  function saveBills(b) { localStorage.setItem(LS_BILLS, JSON.stringify(b)); }
  function loadCats() { try { return JSON.parse(localStorage.getItem(LS_CATS)); } catch (e) { return null; } }
  function saveCats(c) { localStorage.setItem(LS_CATS, JSON.stringify(c)); }
  function loadBudget() { var v = parseFloat(localStorage.getItem(LS_BUDGET)); return isNaN(v) ? null : v; }
  function saveBudget(v) { localStorage.setItem(LS_BUDGET, String(v)); }

  var bills = loadBills();
  if (!bills) { bills = seedBills(); saveBills(bills); }
  var cats = loadCats();
  if (!cats || !cats.length) { cats = DEFAULT_EXPENSE_CATS.concat(DEFAULT_INCOME_CATS); }
  // 归一化：旧版本缓存的分类可能用英文 type('expense'/'income')，统一为中文 '支出'/'收入'
  cats.forEach(function (c) { if (c.type === 'expense') c.type = '支出'; else if (c.type === 'income') c.type = '收入'; });
  // 迁移：旧版默认支出分类(交通/学习文具/美妆护肤/生活物资/娱乐/其他)精简为 饮食/购物/路程，保留用户自定义分类
  var OLD_DEF = ['交通', '学习文具', '美妆护肤', '生活物资', '娱乐', '其他'];
  var NEW_DEF = [{ key: '饮食', icon: '🍜' }, { key: '购物', icon: '🛍️' }, { key: '路程', icon: '🚇' }];
  if (cats.some(function (c) { return c.type === '支出' && OLD_DEF.indexOf(c.key) >= 0; })) {
    cats = cats.filter(function (c) {
      return !(c.type === '支出' && (OLD_DEF.indexOf(c.key) >= 0 || NEW_DEF.some(function (n) { return n.key === c.key; })));
    });
    NEW_DEF.forEach(function (n) { cats.push({ key: n.key, icon: n.icon, type: '支出' }); });
    saveCats(cats);
  }

  function uid() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(date, h, m) { return date + 'T' + pad(h) + ':' + pad(m) + ':00'; }
  function seedBills() {
    return [
      { id: uid(), type: '支出', category: '饮食', amount: 28.5, date: '2026-08-02', time: '01:09', note: '早餐', createTime: iso('2026-08-02', 1, 9) },
      { id: uid(), type: '支出', category: '饮食', amount: 45, date: '2026-08-02', time: '00:09', note: '午餐外卖', createTime: iso('2026-08-02', 0, 9) },
      { id: uid(), type: '支出', category: '路程', amount: 12, date: '2026-08-02', time: '08:30', note: '地铁', createTime: iso('2026-08-02', 8, 30) },
      { id: uid(), type: '支出', category: '饮食', amount: 35, date: '2026-08-01', time: '19:30', note: '晚餐', createTime: iso('2026-08-01', 19, 30) }
    ];
  }

  // ---------- 日期工具 ----------
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  function weekStart(d) { var x = new Date(d); var day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
  function weekRange(d) { var s = weekStart(d); var e = new Date(s); e.setDate(s.getDate() + 6); return { start: s, end: e, label: fmt(s) + ' ～ ' + fmt(e) }; }
  function monthLabel(d) { return d.getFullYear() + '年' + (d.getMonth() + 1) + '月'; }
  function yearLabel(d) { return d.getFullYear() + '年'; }

  // ---------- 数据聚合（联动核心：所有模块都基于 periodBills） ----------
  function periodBills() {
    var list;
    if (view === 'day') {
      var ds = fmt(cursor);
      list = bills.filter(function (b) { return b.date === ds; });
    } else if (view === 'week') {
      var wr = weekRange(cursor);
      list = bills.filter(function (b) { var bd = parse(b.date); return bd >= wr.start && bd <= wr.end; });
    } else if (view === 'year') {
      var y = cursor.getFullYear();
      list = bills.filter(function (b) { return parse(b.date).getFullYear() === y; });
    } else { // moon
      var yy = cursor.getFullYear(), mm = cursor.getMonth();
      list = bills.filter(function (b) { var bd = parse(b.date); return bd.getFullYear() === yy && bd.getMonth() === mm; });
    }
    return list;
  }
  function stats() {
    var list = periodBills();
    var exp = 0, inc = 0;
    list.forEach(function (b) { if (b.type === '收入') inc += b.amount; else exp += b.amount; });
    return { expense: exp, income: inc, balance: inc - exp, count: list.length };
  }
  function catIcon(type, key) { var c = cats.find(function (x) { return x.type === type && x.key === key; }); return c ? c.icon : '📦'; }

  // ---------- 渲染：统计概览（随视图联动） ----------
  function card(val, label, bg) {
    return '<div class="fin-ov-card"' + (bg ? ' style="background:' + bg + '"' : '') + '><div class="fin-ov-val">' + val + '</div><div class="fin-ov-label">' + label + '</div></div>';
  }
  function renderOverview() {
    var s = stats();
    var balColor = s.balance < 0 ? '#F5D9E7' : '#C5E1D5';
    var balText = (s.balance < 0 ? '-' : '') + '¥' + Math.abs(s.balance).toFixed(2);
    document.getElementById('finOverview').innerHTML =
      card('¥' + s.expense.toFixed(2), '总支出') +
      card('¥' + s.income.toFixed(2), '总收入') +
      card(balText, '结余', balColor) +
      card(s.count + '笔', '记账笔数');
  }

  // ---------- 渲染：视图小导航 + 周期 ----------
  function renderPeriodBar() {
    document.querySelectorAll('.fin-viewbtn').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    var lbl = document.getElementById('finPeriodLabel');
    if (view === 'day') lbl.textContent = fmt(cursor) + ' 周' + WD[cursor.getDay()];
    else if (view === 'week') lbl.textContent = weekRange(cursor).label;
    else if (view === 'year') lbl.textContent = yearLabel(cursor);
    else lbl.textContent = monthLabel(cursor);
  }

  // ---------- 渲染：消费明细（按日期分组） ----------
  function renderDetail() {
    var list = periodBills().slice();
    if (filterDate) list = list.filter(function (b) { return b.date === filterDate; });
    if (filterCat) list = list.filter(function (b) { return b.category === filterCat; });
    list.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createTime || '').localeCompare(a.createTime || '');
    });

    var html = '<div class="fin-card-title">📋 消费明细';
    if (filterCat) html += ' <button class="fin-clear-filter" onclick="Finance.clearFilter()">清除筛选</button>';
    html += ' <span class="fin-detail-count">' + list.length + '笔</span></div>';

    if (list.length === 0) { html += '<div class="fin-empty">暂无记录，点击右下角 ✏️ 记一笔</div>'; document.getElementById('finDetail').innerHTML = html; renderBudgetPreviewInline(); return; }

    var groups = {};
    list.forEach(function (b) { (groups[b.date] = groups[b.date] || []).push(b); });
    var dates = Object.keys(groups).sort(function (a, b) { return b.localeCompare(a); });
    dates.forEach(function (d) {
      var recs = groups[d];
      var dayTotal = 0; recs.forEach(function (b) { dayTotal += b.amount; });
      var dt = parse(d);
      html += '<div class="fin-detail-group"><div class="fin-group-head"><span>' + d + ' 周' + WD[dt.getDay()] + '</span><span class="fin-group-total">¥' + dayTotal.toFixed(2) + '</span></div>';
      recs.sort(function (a, b) { return (b.createTime || '').localeCompare(a.createTime || ''); }).forEach(function (b) {
        var icon = catIcon(b.type, b.category);
        var amtColor = b.type === '收入' ? '#3a9d6e' : '#333';
        var sign = b.type === '收入' ? '+' : '-';
        html += '<div class="fin-rec" onclick="Finance.editBill(' + q(b.id) + ')">' +
          '<span class="fin-rec-icon">' + icon + '</span>' +
          '<span class="fin-rec-main"><span class="fin-rec-cat">' + b.category + '</span>' + (b.note ? '<span class="fin-rec-note">' + escapeHtml(b.note) + '</span>' : '') + '</span>' +
          '<span class="fin-rec-right"><span class="fin-rec-amt" style="color:' + amtColor + '">' + sign + '¥' + b.amount.toFixed(2) + '</span>' + (b.time ? '<span class="fin-rec-time">' + b.time + '</span>' : '') + '</span>' +
          '</div>';
      });
      html += '</div>';
    });
    document.getElementById('finDetail').innerHTML = html;
    renderBudgetPreviewInline();
  }

  // ---------- 渲染：分类统计（扇形图 + 图例，Excel 风，与明细联动） ----------
  function renderCatStats() {
    var list = periodBills().filter(function (b) { return b.type === '支出'; });
    var total = 0; list.forEach(function (b) { total += b.amount; });
    var map = {};
    list.forEach(function (b) { map[b.category] = (map[b.category] || 0) + b.amount; });
    var expCats = cats.filter(function (c) { return c.type === '支出'; });
    var rows = expCats.map(function (c, idx) {
      var a = map[c.key] || 0;
      return { cat: c.key, icon: c.icon, amount: a, pct: total > 0 ? a / total * 100 : 0, color: COLOR_PALETTE[idx % COLOR_PALETTE.length] };
    }).filter(function (r) { return r.amount > 0; }).sort(function (a, b) { return b.amount - a.amount; });

    var html = '<div class="fin-card-title">📊 分类统计';
    if (filterCat) html += ' <button class="fin-clear-filter" onclick="Finance.clearFilter()">清除筛选</button>';
    html += '</div>';

    if (total === 0 || rows.length === 0) {
      html += '<div class="fin-empty">本期暂无支出记录</div>';
    } else {
      html += '<div class="fin-cat-body">';
      html += '<div class="fin-pie-box">' + buildPie(rows, total) + '</div>';
      html += '<div class="fin-legend">';
      rows.forEach(function (r) {
        var active = filterCat === r.cat ? ' active' : '';
        html += '<div class="fin-legend-item' + active + '" onclick="Finance.filterByCat(' + q(r.cat) + ')">' +
          '<span class="fin-swatch" style="background:' + r.color + '"></span>' +
          '<span class="fin-legend-name">' + r.icon + ' ' + r.cat + '</span>' +
          '<span class="fin-legend-val">¥' + r.amount.toFixed(2) + '</span>' +
          '<span class="fin-legend-pct">' + r.pct.toFixed(1) + '%</span></div>';
      });
      html += '</div></div>';
    }
    document.getElementById('finCatStats').innerHTML = html;
  }

  // 扇形图（SVG）
  function buildPie(rows, total) {
    var cx = 60, cy = 60, r = 52;
    if (rows.length === 1) {
      return '<svg class="fin-pie" viewBox="0 0 120 120" role="img" aria-label="分类占比">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + rows[0].color + '" stroke="#fff" stroke-width="2"></circle></svg>';
    }
    var ang = 0, svg = '<svg class="fin-pie" viewBox="0 0 120 120" role="img" aria-label="分类占比">';
    rows.forEach(function (row, i) {
      var sweep = row.amount / total * 360;
      var a0 = ang, a1 = ang + sweep;
      if (i === rows.length - 1) a1 = 360;
      ang += sweep;
      var op = (filterCat && filterCat !== row.cat) ? 0.35 : 1;
      var sel = (filterCat === row.cat) ? ' fin-slice-sel' : '';
      svg += '<path d="' + slicePathD(cx, cy, r, a0, a1) + '" fill="' + row.color + '" stroke="#fff" stroke-width="2" opacity="' + op + '" class="fin-slice' + sel + '" onclick="Finance.filterByCat(' + q(row.cat) + ')"></path>';
    });
    svg += '</svg>';
    return svg;
  }
  function slicePathD(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return 'M ' + cx + ' ' + cy + ' L ' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
      ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + ' Z';
  }
  function polar(cx, cy, r, deg) {
    var a = (deg - 90) * Math.PI / 180; // 0deg = 顶部，顺时针
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function renderBudgetPreviewInline() {
    var el = document.getElementById('finBudgetPreview');
    if (!el) return;
    var b = loadBudget();
    if (b == null) { el.textContent = '未设置预算'; return; }
    var m = cursor.getFullYear() + '-' + pad(cursor.getMonth() + 1);
    var exp = 0;
    bills.forEach(function (x) { if (x.type === '支出' && x.date.indexOf(m) === 0) exp += x.amount; });
    var pct = Math.min(100, exp / b * 100);
    el.innerHTML = '本月已支出 ¥' + exp.toFixed(2) + ' / ¥' + b.toFixed(2) +
      '<div class="fin-bar"><div class="fin-bar-fill" style="width:' + pct + '%"></div></div>';
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function q(s) { return "'" + String(s).replace(/'/g, "\\'") + "'"; }

  // ---------- 记一笔表单 ----------
  function renderCatChips() {
    var list = cats.filter(function (c) { return c.type === formType; });
    if (!list.some(function (c) { return c.key === formCat; })) formCat = list[0].key;
    var html = list.map(function (c) {
      return '<button class="fin-chip ' + (formCat === c.key ? 'active' : '') + '" onclick="Finance.setFormCat(' + q(c.key) + ')">' + c.icon + ' ' + c.key + '</button>';
    }).join('');
    // 末尾加号：用户自行输入自定义分类
    html += '<button class="fin-chip fin-chip-add" type="button" onclick="Finance.startAddCat()">＋</button>';
    html += '<div class="fin-cat-add-inline" id="finCatAddInline" style="display:none">' +
      '<input id="finCatAddInput" class="fin-cat-add-input" placeholder="输入分类名" maxlength="6">' +
      '<button class="fin-cat-add-ok" type="button" onclick="Finance.confirmAddCat()">添加</button>' +
      '<button class="fin-cat-add-cancel" type="button" onclick="Finance.cancelAddCat()">取消</button>' +
      '</div>';
    document.getElementById('finCatChips').innerHTML = html;
    var inp = document.getElementById('finCatAddInput');
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') Finance.confirmAddCat(); });
  }
  function startAddCat() {
    var box = document.getElementById('finCatAddInline');
    if (box) { box.style.display = 'flex'; var inp = document.getElementById('finCatAddInput'); if (inp) { inp.value = ''; inp.focus(); } }
  }
  function cancelAddCat() {
    var box = document.getElementById('finCatAddInline');
    if (box) box.style.display = 'none';
  }
  function confirmAddCat() {
    var inp = document.getElementById('finCatAddInput');
    if (!inp) return;
    var name = inp.value.trim();
    if (!name) { toast('请输入分类名称'); return; }
    if (cats.some(function (c) { return c.type === formType && c.key === name; })) { toast('分类已存在'); inp.value = ''; inp.focus(); return; }
    cats.push({ key: name, icon: '📦', type: formType });
    saveCats(cats);
    formCat = name;
    renderCatChips();
    renderAll(); // 复盘（扇形图 / 明细 / 图例）跟随更新
    toast('已添加分类「' + name + '」');
  }
  function openForm() {
    formMode = 'add'; editingId = null; formType = '支出'; formCat = '饮食';
    document.getElementById('finSheetTitle').textContent = '记一笔账';
    document.getElementById('finSheetDel').style.display = 'none';
    document.getElementById('finAmount').value = '';
    document.getElementById('finFormDate').value = fmt(new Date());
    document.getElementById('finFormNote').value = '';
    document.querySelectorAll('.fin-type-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.type === '支出'); });
    renderCatChips();
    show('finSheetMask'); show('finSheet');
  }
  function editBill(id) {
    var b = bills.find(function (x) { return x.id === id; }); if (!b) return;
    formMode = 'edit'; editingId = id; formType = b.type; formCat = b.category;
    document.getElementById('finSheetTitle').textContent = '编辑记录';
    document.getElementById('finSheetDel').style.display = 'inline-flex';
    document.getElementById('finAmount').value = b.amount;
    document.getElementById('finFormDate').value = b.date;
    document.getElementById('finFormNote').value = b.note || '';
    document.querySelectorAll('.fin-type-btn').forEach(function (x) { x.classList.toggle('active', x.dataset.type === b.type); });
    renderCatChips();
    show('finSheetMask'); show('finSheet');
  }
  function setFormType(t) {
    formType = t;
    if (!cats.some(function (c) { return c.type === t && c.key === formCat; })) formCat = cats.filter(function (c) { return c.type === t; })[0].key;
    renderCatChips();
    document.querySelectorAll('.fin-type-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.type === t); });
  }
  function setFormCat(k) { formCat = k; renderCatChips(); }
  function saveForm() {
    var amt = parseFloat(document.getElementById('finAmount').value);
    if (isNaN(amt) || amt <= 0) { toast('请输入有效金额'); return; }
    var date = document.getElementById('finFormDate').value || fmt(new Date());
    var note = document.getElementById('finFormNote').value.trim();
    var now = new Date();
    var time = pad(now.getHours()) + ':' + pad(now.getMinutes());
    if (formMode === 'edit') {
      var b = bills.find(function (x) { return x.id === editingId; });
      if (b) { b.type = formType; b.category = formCat; b.amount = amt; b.date = date; b.note = note; b.time = time; }
    } else {
      bills.push({ id: uid(), type: formType, category: formCat, amount: amt, date: date, time: time, note: note, createTime: iso(date, now.getHours(), now.getMinutes()) });
    }
    saveBills(bills); closeForm(); renderAll();
  }
  function deleteCurrent() {
    if (!editingId) return;
    if (!confirm('确定删除这条记录？')) return;
    bills = bills.filter(function (x) { return x.id !== editingId; });
    saveBills(bills); closeForm(); renderAll();
  }

  // ---------- 筛选（联动明细；扇形图高亮） ----------
  function filterByCat(c) { filterCat = (filterCat === c) ? null : c; filterDate = null; renderAll(); }
  function clearFilter() { filterDate = null; filterCat = null; renderAll(); }

  // ---------- 视图 / 周期 ----------
  function setView(v) { view = v; filterDate = null; filterCat = null; renderAll(); }
  function changePeriod(dir) {
    if (view === 'day') { cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + dir); }
    else if (view === 'week') { var s = weekStart(cursor); s.setDate(s.getDate() + dir * 7); cursor = s; }
    else if (view === 'year') { cursor = new Date(cursor.getFullYear() + dir, 0, 1); }
    else { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1); } // moon
    renderAll();
  }
  function pickDate() {
    if (view === 'day' || view === 'week') {
      var d = document.getElementById('finDatePicker'); d.value = fmt(cursor);
      if (d.showPicker) d.showPicker(); else d.click();
    } else {
      var m = document.getElementById('finMonthPicker'); m.value = cursor.getFullYear() + '-' + pad(cursor.getMonth() + 1);
      if (m.showPicker) m.showPicker(); else m.click();
    }
  }
  function onPickDate(e) { var v = e.target.value; if (v) { cursor = parse(v); renderAll(); } }
  function onPickMonth(e) {
    var v = e.target.value; if (!v) return;
    var p = v.split('-'); var y = +p[0], mo = +p[1] - 1;
    cursor = new Date(y, mo, 1); renderAll();
  }

  // ---------- 更多菜单 ----------
  function toggleMenu(force) {
    var m = document.getElementById('finMenu'), mask = document.getElementById('finMenuMask');
    var open = force === undefined ? !m.classList.contains('open') : force;
    m.classList.toggle('open', open); mask.classList.toggle('open', open);
  }

  // ---------- 分类管理 ----------
  function openCatManage() { toggleMenu(false); renderCatList(); show('finCatMask'); show('finCatModal'); }
  function renderCatList() {
    document.getElementById('finCatList').innerHTML = cats.map(function (c) {
      return '<div class="fin-cat-item"><span>' + c.icon + ' ' + c.key + '</span><span class="fin-cat-type">' + (c.type === '收入' ? '收入' : '支出') + '</span><button onclick="Finance.delCategory(' + q(c.key) + ',' + q(c.type) + ')">🗑️</button></div>';
    }).join('');
  }
  function addCategory() {
    var icon = (document.getElementById('finNewCatIcon').value || '').trim() || '📦';
    var name = (document.getElementById('finNewCatName').value || '').trim();
    var type = document.getElementById('finNewCatType').value;
    if (!name) { toast('请输入分类名称'); return; }
    if (cats.some(function (c) { return c.key === name && c.type === type; })) { toast('分类已存在'); return; }
    cats.push({ key: name, icon: icon, type: type });
    saveCats(cats);
    document.getElementById('finNewCatName').value = '';
    document.getElementById('finNewCatIcon').value = '';
    renderCatList(); renderAll();
  }
  function delCategory(key, type) {
    if (!confirm('删除分类「' + key + '」？已有该分类的记录会保留（显示默认图标）。')) return;
    cats = cats.filter(function (c) { return !(c.key === key && c.type === type); });
    saveCats(cats); renderCatList(); renderAll();
  }

  // ---------- 预算 ----------
  function openBudget() { toggleMenu(false); document.getElementById('finBudgetInput').value = loadBudget() != null ? loadBudget() : ''; renderBudgetPreviewInline(); show('finBudgetMask'); show('finBudgetModal'); }
  function saveBudget() {
    var v = parseFloat(document.getElementById('finBudgetInput').value);
    if (isNaN(v) || v < 0) { toast('请输入有效预算'); return; }
    saveBudget(v); closeBudget(); toast('预算已保存');
  }

  // ---------- 导出 / 导入 ----------
  function exportData() {
    toggleMenu(false);
    var data = { bills: bills, cats: cats, budget: loadBudget(), exportTime: new Date().toISOString(), app: 'workbuddy-finance' };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '消费小记-' + fmt(new Date()) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast('已导出');
  }
  function importData() { toggleMenu(false); document.getElementById('finFileInput').click(); }
  function onImportFile(e) {
    var f = e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        if (d.bills && d.bills.length) {
          if (!confirm('导入将合并到现有记录（按ID去重），确定？')) { e.target.value = ''; return; }
          var exist = {}; bills.forEach(function (b) { exist[b.id] = 1; });
          d.bills.forEach(function (b) { if (!exist[b.id]) bills.push(b); });
          saveBills(bills);
        }
        if (d.cats && d.cats.length) { cats = d.cats; saveCats(cats); }
        if (d.budget != null) saveBudget(parseFloat(d.budget));
        renderAll(); toast('导入完成');
      } catch (err) { toast('文件格式错误'); }
      e.target.value = '';
    };
    rd.readAsText(f);
  }

  // ---------- 杂项 ----------
  function goHome() { location.href = 'index.html'; }
  function show(id) { var el = document.getElementById(id); if (el) el.classList.add('open'); }
  function hide(id) { var el = document.getElementById(id); if (el) el.classList.remove('open'); }
  function closeForm() { hide('finSheetMask'); hide('finSheet'); }
  function closeCatManage() { hide('finCatMask'); hide('finCatModal'); }
  function closeBudget() { hide('finBudgetMask'); hide('finBudgetModal'); }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('finToast');
    if (!t) { t = document.createElement('div'); t.id = 'finToast'; t.className = 'fin-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function renderAll() {
    renderOverview(); renderPeriodBar(); renderDetail(); renderCatStats();
  }

  // ---------- 暴露接口 ----------
  window.Finance = {
    setView: setView, changePeriod: changePeriod, pickDate: pickDate, onPickDate: onPickDate, onPickMonth: onPickMonth,
    filterByCat: filterByCat, clearFilter: clearFilter,
    toggleMenu: toggleMenu, goHome: goHome,
    openForm: openForm, editBill: editBill, setFormType: setFormType, setFormCat: setFormCat,
    startAddCat: startAddCat, confirmAddCat: confirmAddCat, cancelAddCat: cancelAddCat,
    saveForm: saveForm, closeForm: closeForm, deleteCurrent: deleteCurrent,
    openCatManage: openCatManage, renderCatList: renderCatList, addCategory: addCategory, delCategory: delCategory, closeCatManage: closeCatManage,
    openBudget: openBudget, saveBudget: saveBudget, closeBudget: closeBudget,
    exportData: exportData, importData: importData, onImportFile: onImportFile, toast: toast
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll);
  else renderAll();
})();
