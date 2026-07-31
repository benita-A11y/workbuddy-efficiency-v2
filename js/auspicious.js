// 吉日查询模块
// 数据：复用 almanac-data.js（cnlunar 预计算，离线查表）
// 黄道吉日：建除十二神吉凶（除/定/执/危/成/开 为黄道吉神日）
// 杨公忌日 / 月德：传统静态表推算；吉神展示取 建除神/月德/二十八宿/纳音
// 全部本地计算，无外部 API，与今日宜忌共用同一份权威数据
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var ZODIAC = { '子': '鼠', '丑': '牛', '寅': '虎', '卯': '兔', '辰': '龙', '巳': '蛇', '午': '马', '未': '羊', '申': '猴', '酉': '鸡', '戌': '狗', '亥': '猪' };
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  var CHONG = { '子': '午', '丑': '未', '寅': '申', '卯': '酉', '辰': '戌', '巳': '亥', '午': '子', '未': '丑', '申': '寅', '酉': '卯', '戌': '辰', '亥': '巳' };
  var SHA = { '子': '南', '丑': '东', '寅': '北', '卯': '西', '辰': '南', '巳': '东', '午': '北', '未': '西', '申': '南', '酉': '东', '戌': '北', '亥': '西' };

  // 建除十二神 → 黄道吉神日（除定执危成开）
  var HUANGDAO_OFFICER = { '除': 1, '定': 1, '执': 1, '危': 1, '成': 1, '开': 1 };
  // 杨公忌日（农历 月-日）
  var YANGGONG = { '1-13': 1, '2-11': 1, '3-9': 1, '4-7': 1, '5-5': 1, '6-3': 1, '7-1': 1, '7-29': 1, '8-27': 1, '9-25': 1, '10-23': 1, '11-21': 1, '12-19': 1 };
  // 月德（农历月支 → 天干）
  var YUEDE = { '寅': '丙', '午': '丙', '戌': '丙', '申': '壬', '子': '壬', '辰': '壬', '亥': '甲', '卯': '甲', '未': '甲', '巳': '庚', '酉': '庚', '丑': '庚' };
  var MONTH_ZHI = { '正': '寅', '二': '卯', '三': '辰', '四': '巳', '五': '午', '六': '未', '七': '申', '八': '酉', '九': '戌', '十': '亥', '冬': '子', '腊': '丑' };
  // 场景标签 → 宜关键词
  var SCENES = {
    '💒 结婚': ['嫁娶', '婚嫁', '纳采', '订婚'],
    '🏠 搬家': ['入宅', '移徙', '搬迁'],
    '🚀 开业': ['开市', '开业', '开张'],
    '🏗️ 动土': ['动土', '破土'],
    '✈️ 出行': ['出行', '旅游'],
    '🔨 装修': ['修造', '装修'],
    '🙏 祈福': ['祈福', '祭祀'],
    '📚 入学': ['入学', '开笔', '考试']
  };

  var state = { scene: null, page: 0, last: [] };
  var PAGE = 30;

  function keyOf(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function parseK(key) { var p = String(key).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); }
  function fmtDate(d) { return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + WEEK[d.getDay()]; }
  function lunarOf(raw) { return '农历' + (raw.leap ? '闰' : '') + raw.lmCn + raw.ldCn; }
  function gzYear(raw) { return raw.ygz + '年 · ' + (ZODIAC[raw.ygz.charAt(0)] || '') + '年'; }

  // 吉神列表（基于可用数据推算，真实可核验）
  function jiShenList(raw) {
    var list = [];
    if (HUANGDAO_OFFICER[raw.officer]) list.push('建除·' + raw.officer + '(黄道)');
    var mc = (raw.lmCn || '').replace('闰', '')[0];
    var mz = MONTH_ZHI[mc];
    var yd = mz ? YUEDE[mz] : '';
    if (yd) list.push('月德·' + yd);
    if (raw.xiu) list.push('宿·' + raw.xiu);
    if (raw.nayin) list.push('纳音·' + raw.nayin);
    return list;
  }

  function scoreOf(match, raw, jsCount) {
    var huang = HUANGDAO_OFFICER[raw.officer] ? 1 : 0;
    if (match >= 3 && jsCount >= 3 && huang) return 5;
    if (match >= 2 && jsCount >= 2) return 4;
    if (match >= 1 && jsCount >= 1) return 3;
    if (match >= 1) return 2;
    return 1;
  }
  function starLabel(s) {
    return ['', '普通', '可用', '吉日', '大吉之日', '上上吉日'][s] || '';
  }
  function stars(s) { return '⭐'.repeat(s) + '☆'.repeat(5 - s); }

  function getFavs() {
    try { return JSON.parse(localStorage.getItem('aus_favs') || '{}'); } catch (e) { return {}; }
  }
  function toggleFav(key) {
    var f = getFavs();
    if (f[key]) delete f[key]; else f[key] = 1;
    try { localStorage.setItem('aus_favs', JSON.stringify(f)); } catch (e) {}
    return !!f[key];
  }

  function init() {
    // 场景标签
    var sc = $('ausScenes');
    if (sc) {
      sc.innerHTML = '';
      Object.keys(SCENES).forEach(function (k) {
        var b = document.createElement('button');
        b.className = 'aus-scene';
        b.textContent = k;
        b.setAttribute('data-scene', k);
        b.addEventListener('click', function () {
          state.scene = (state.scene === k) ? null : k;
          Array.prototype.forEach.call(sc.children, function (c) { c.classList.remove('active'); });
          if (state.scene) b.classList.add('active');
          $('ausKeyword').value = state.scene ? k.replace(/^[^ ]+ /, '') : '';
          query();
        });
        sc.appendChild(b);
      });
    }
    // 默认时间范围：今天 ~ 今天+3月
    var today = new Date();
    $('ausFrom').value = keyOf(today);
    $('ausTo').value = keyOf(addMonths(today, 3));
    // 快捷范围
    Array.prototype.forEach.call(document.querySelectorAll('.aus-quick button'), function (btn) {
      btn.addEventListener('click', function () {
        var n = +btn.getAttribute('data-range');
        var base = new Date();
        $('ausFrom').value = keyOf(base);
        if (n === 1) { $('ausTo').value = keyOf(new Date(base.getFullYear(), base.getMonth() + 1, 0)); }
        else if (n === 2) { var nm = new Date(base.getFullYear(), base.getMonth() + 1, 1); $('ausFrom').value = keyOf(nm); $('ausTo').value = keyOf(new Date(nm.getFullYear(), nm.getMonth() + 1, 0)); }
        else { $('ausTo').value = keyOf(addMonths(base, n)); }
        query();
      });
    });
    // 高级筛选展开
    var tog = $('ausAdvToggle');
    if (tog) tog.addEventListener('click', function () {
      var adv = $('ausAdv');
      var show = adv.style.display === 'none';
      adv.style.display = show ? 'block' : 'none';
      tog.querySelector('.aus-chev').textContent = show ? '▾' : '▸';
    });
    // 搜索
    $('ausSearch').addEventListener('click', function () { state.page = 0; query(); });
    $('ausKeyword').addEventListener('keydown', function (e) { if (e.key === 'Enter') { state.page = 0; query(); } });
    // 加载更多
    $('ausMore').addEventListener('click', function () { state.page++; renderList(); });
  }

  function query() {
    state.page = 0;
    var kwRaw = ($('ausKeyword').value || '').trim();
    var kw = state.scene ? SCENES[state.scene] : (kwRaw ? [kwRaw] : []);
    var from = parseK($('ausFrom').value || keyOf(new Date()));
    var to = parseK($('ausTo').value || keyOf(addMonths(new Date(), 3)));
    if (isNaN(from.getTime())) from = new Date();
    if (isNaN(to.getTime())) to = addMonths(new Date(), 3);
    if (from > to) { var t = from; from = to; to = t; }

    var avoidZ = $('ausAvoidZodiac').value;
    var onlyHuang = $('ausOnlyHuang').checked;
    var avoidYang = $('ausAvoidYang').checked;
    var minJi = parseInt($('ausMinJi').value || '0', 10);

    var RAW = window.ALMANAC_RAW || {};
    var out = [];
    for (var key in RAW) {
      if (!RAW.hasOwnProperty(key)) continue;
      var kd = parseK(key);
      if (isNaN(kd.getTime())) continue;
      if (kd < from || kd > to) continue;
      var raw = RAW[key];
      var yj = (window.Almanac && Almanac.officerYiJi) ? Almanac.officerYiJi(raw.officer) : { yi: [], ji: [] };
      var yi = yj.yi, ji = yj.ji;
      // 关键词匹配（宜中包含）
      var match = 0;
      if (kw.length) {
        match = kw.filter(function (k) { return yi.indexOf(k) >= 0; }).length;
        if (match === 0) continue;
      }
      // 避开冲煞生肖
      var zhi = (raw.dgz || '').charAt(1);
      var chongZhi = CHONG[zhi];
      if (avoidZ && ZODIAC[chongZhi] === avoidZ) continue;
      // 仅黄道吉日
      if (onlyHuang && !HUANGDAO_OFFICER[raw.officer]) continue;
      // 避开杨公忌日
      if (avoidYang && YANGGONG[raw.lm + '-' + raw.ld] && !raw.leap) continue;
      // 吉神数量
      var jsList = jiShenList(raw);
      if (jsList.length < minJi) continue;

      var sc = scoreOf(match, raw, jsList.length);
      out.push({ key: key, raw: raw, yi: yi, ji: ji, match: match, score: sc, js: jsList });
    }
    // 排序：有关键词按推荐度（含匹配/评分）降序；无关键词按日期升序
    if (kw.length) {
      out.sort(function (a, b) { return (b.score - a.score) || (parseK(a.key) - parseK(b.key)); });
    } else {
      out.sort(function (a, b) { return parseK(a.key) - parseK(b.key); });
    }
    state.last = out;
    var head = $('ausResultHead');
    head.textContent = '📋 共找到 ' + out.length + ' 个' + (kw.length ? '吉日' : '日期');
    $('ausEmpty').style.display = out.length ? 'none' : 'block';
    renderList();
  }

  function renderList() {
    var list = $('ausList');
    if (!list) return;
    var slice = state.last.slice(0, (state.page + 1) * PAGE);
    var favs = getFavs();
    list.innerHTML = slice.map(function (it) {
      var d = parseK(it.key);
      var zhi = (it.raw.dgz || '').charAt(1);
      var chongZhi = CHONG[zhi];
      var chong = chongZhi ? ZODIAC[chongZhi] : '';
      var yiShow = it.yi.slice(0, 4).join('、');
      var faved = favs[it.key] ? ' faved' : '';
      return '<div class="aus-item">' +
        '<div class="aus-item-date"><b>' + fmtDate(d) + '</b><span class="aus-item-lunar">' + lunarOf(it.raw) + ' · ' + gzYear(it.raw) + '</span></div>' +
        '<div class="aus-item-yi">宜：' + yiShow + (it.match ? '（含目标 ✦）' : '') + '</div>' +
        (chong ? '<div class="aus-item-chong">冲' + chong + '煞' + (SHA[zhi] || '') + '</div>' : '') +
        '<div class="aus-item-js">' + it.js.slice(0, 3).map(function (s) { return '<span class="aus-js-chip">' + s + '</span>'; }).join('') + '</div>' +
        '<div class="aus-item-foot"><span class="aus-stars">' + stars(it.score) + ' <i>' + starLabel(it.score) + '</i></span>' +
        '<span class="aus-item-acts"><button class="aus-fav' + faved + '" onclick="Auspicious.fav(\'' + it.key + '\')">' + (favs[it.key] ? '❤️' : '🤍') + '</button>' +
        '<button class="aus-detail-btn" onclick="Auspicious.detail(\'' + it.key + '\')">查看详情</button></span></div>' +
        '</div>';
    }).join('');
    $('ausMore').style.display = state.last.length > slice.length ? 'block' : 'none';
  }

  function fav(key) {
    toggleFav(key);
    renderList();
    if (window.App && App.toast) App.toast('已更新收藏 ❤️');
  }

  function detail(key) {
    var RAW = window.ALMANAC_RAW || {};
    var raw = RAW[key];
    if (!raw) return;
    var d = parseK(key);
    var yj = (window.Almanac && Almanac.officerYiJi) ? Almanac.officerYiJi(raw.officer) : { yi: [], ji: [] };
    var zhi = (raw.dgz || '').charAt(1);
    var chongZhi = CHONG[zhi];
    var chong = chongZhi ? ZODIAC[chongZhi] : '';
    var jsList = jiShenList(raw);
    var yiHtml = yj.yi.map(function (w) { return '<li><span class="alm-emoji">' + (EMOJI_YI[w] || '🌟') + '</span><span class="alm-word">' + w + '</span></li>'; }).join('');
    var jiHtml = yj.ji.map(function (w) { return '<li><span class="alm-emoji">🚫</span><span class="alm-word">' + w + '</span></li>'; }).join('');
    var desc = OFFICER_DESC[raw.officer] || '';
    var card = $('ausDetailCard');
    card.innerHTML =
      '<div class="aus-detail-head"><button class="aus-detail-close" onclick="Auspicious.closeDetail()">✕</button>' +
      '<div class="aus-detail-date">📅 ' + fmtDate(d) + '</div>' +
      '<div class="aus-detail-lunar">' + lunarOf(raw) + ' · ' + gzYear(raw) + '</div></div>' +
      '<div class="alm-cols"><div class="alm-col alm-yi-col"><div class="alm-col-title alm-yi-title">宜 ❤️</div><ul class="alm-list">' + yiHtml + '</ul></div>' +
      '<div class="alm-col alm-ji-col"><div class="alm-col-title alm-ji-title">忌 💔</div><ul class="alm-list">' + jiHtml + '</ul></div></div>' +
      '<div class="aus-detail-row">✨ 吉神：' + jsList.join('、') + '</div>' +
      (chong ? '<div class="aus-detail-row">🧭 冲煞：冲' + chong + '（' + (raw.dgz || '') + '）煞' + (SHA[zhi] || '') + '</div>' : '') +
      '<div class="aus-detail-row">🧧 今日宜：' + yj.yi.slice(0, 6).join('、') + '</div>' +
      (desc ? '<div class="aus-detail-note">📝 ' + desc + '</div>' : '') +
      (chong ? '<div class="aus-detail-tip">💡 小贴士：此日与属' + chong + '之人相冲，建议避开。</div>' : '') +
      '<div class="aus-detail-acts"><button class="alm-act-btn" onclick="Auspicious.fav(\'' + key + '\')">❤️ 收藏此日</button>' +
      '<button class="alm-act-btn alm-act-share" onclick="Auspicious.shareDay(\'' + key + '\')">📤 分享</button></div>';
    $('auspiciousDetail').style.display = 'flex';
  }
  function closeDetail() { $('auspiciousDetail').style.display = 'none'; }

  function shareDay(key) {
    var RAW = window.ALMANAC_RAW || {};
    var raw = RAW[key]; if (!raw) return;
    var yj = (window.Almanac && Almanac.officerYiJi) ? Almanac.officerYiJi(raw.officer) : { yi: [], ji: [] };
    var d = parseK(key);
    var text = '🔍 吉日 · ' + fmtDate(d) + '\n' + lunarOf(raw) + ' · ' + gzYear(raw) +
      '\n宜：' + yj.yi.join('、') + '\n忌：' + yj.ji.join('、') + '\n✨ 来自「效率管理」吉日查询';
    if (navigator.share) navigator.share({ title: '吉日', text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { if (window.App && App.toast) App.toast('吉日已复制 🔗'); });
    else if (window.App && App.toast) App.toast('已生成吉日卡片 ✨');
  }

  // 建除十二神说明（吉日详情用）
  var OFFICER_DESC = {
    '建': '建日为一月之始，宜打基础、立规矩，诸事待兴。',
    '除': '除日为除旧布新之吉日，宜扫除、解除、疗病、出行。',
    '满': '满日丰收圆满，宜纳财、开市，然忌动土栽种。',
    '平': '平日平稳，宜嫁娶修造，诸事按部就班。',
    '定': '定日安定，宜定约、上任、安床、入学。',
    '执': '执日执守，宜造屋、捕捉、立契，忌开市出行。',
    '破': '破日破旧，宜破屋坏垣、求医，大事不宜。',
    '危': '危日谨慎，宜安床拆卸，慢一步更稳。',
    '成': '成日诸事可成，为上吉之日，宜嫁娶开市动土。',
    '收': '收日收敛，宜收纳、嫁娶、入学，忌出行安葬。',
    '开': '开日开通，宜开市、求医、出行，忌安葬。',
    '闭': '闭日闭合，宜内省沉淀、安葬塞穴，忌开市动土。'
  };
  // 宜 emoji 映射（与 almanac.js 同源，供详情页点缀）
  var EMOJI_YI = {
    '安葬': '🪦', '祭祀': '🕯️', '祈福': '🙏', '出行': '🚶', '动土': '🏗️', '修造': '🔧', '装修': '🔧',
    '嫁娶': '💍', '婚嫁': '💒', '开市': '🏪', '开业': '🏪', '开张': '🏪', '纳财': '💰', '求财': '💰',
    '交易': '💱', '入学': '📚', '安床': '🛏️', '沐浴': '🛁', '求医': '🩺', '疗病': '💊', '治病': '💊',
    '捕捉': '🪤', '打猎': '🏹', '牧养': '🐾', '饲养': '🐾', '塞穴': '🕳️', '筑堤': '🌊', '修仓': '🏬',
    '收纳': '📦', '解除': '🧹', '破土': '⛏️', '移徙': '📦', '搬迁': '📦', '上梁': '🏗️', '立碑': '🪨',
    '开渠': '💧', '立约': '📝', '签约': '📝', '收账': '🧾', '拆卸': '🔨', '纳畜': '🐄',
    '求嗣': '🤱', '冠带': '👑', '安门': '🚪', '作灶': '🍳', '伐木': '🌲', '开光': '✨', '盖屋': '🏠',
    '入宅': '🏠', '词讼': '⚖️', '诉讼': '⚖️', '栽种': '🌱', '补垣': '🧱', '立券': '📜', '纳采': '💐',
    '入殓': '💀', '除服': '🕯️', '成服': '🕯️', '移柩': '⚰️', '启钻': '⛏️', '断蚁': '🐜', '结网': '🕸️',
    '置业': '🏠', '赴任': '🏢', '交涉': '🤝', '造屋': '🏠', '修路': '🛣️', '上任': '🏢', '考试': '📝',
    '扫舍': '🧹', '破屋': '🏚️', '坏垣': '🧱', '造葬': '⚰️', '掘井': '💧', '放债': '💸', '结亲': '💞',
    '收购': '🛒', '出货': '📤', '入宅': '🏠', '订婚': '💍', '旅游': '✈️', '会友': '☕', '交际': '☕', '交友': '☕'
  };

  function open() {
    if (window.App && App.switchModule) App.switchModule('auspicious');
    if (!state.inited) { init(); state.inited = true; }
    // 进入时跑一次默认查询（本月范围，无关键词）
    query();
  }

  window.Auspicious = { open: open, query: query, fav: fav, detail: detail, closeDetail: closeDetail, shareDay: shareDay };
})();
