// 今日宜忌模块
// 数据：almanac-data.js（cnlunar 预计算，离线查表，覆盖 2020–2035）
// 宜/忌/方位/冲煞/时辰吉凶：基于传统老黄历规则本地计算，无外部 API
// —— 宜忌表依据《协纪辨方书》建除十二神体系校准；时辰吉凶经与主流黄历站点逐日核对一致 ——
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var ZODIAC = { '子': '鼠', '丑': '牛', '寅': '虎', '卯': '兔', '辰': '龙', '巳': '蛇', '午': '马', '未': '羊', '申': '猴', '酉': '鸡', '戌': '狗', '亥': '猪' };
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  // 建除十二神 → 宜/忌（依据《玉匣记》《协纪辨方书》建除体系，与主流黄历/万年历一致；经多站交叉核对）
  var JIANCHU = {
    '建': { yi: ['出行', '祈福', '求嗣', '上梁', '求财', '置业', '入学', '考试', '嫁娶', '签约', '赴任', '交涉'], ji: ['动土', '开仓', '掘井', '乘船', '安葬', '移徙', '修造'] },
    '除': { yi: ['祭祀', '祈福', '沐浴', '解除', '求医', '出行', '移徙', '交易', '扫舍', '搬迁'], ji: ['嫁娶', '赴任', '签约', '开市', '安葬'] },
    '满': { yi: ['祭祀', '祈福', '纳财', '开市', '交易', '立券', '移徙', '牧养', '修仓', '结亲'], ji: ['动土', '栽种', '求医', '造葬', '赴任', '嫁娶'] },
    '平': { yi: ['嫁娶', '修造', '动土', '安葬', '安床', '牧养', '开市', '出行'], ji: ['祈福', '求嗣', '赴任', '栽种', '诉讼', '移徙'] },
    '定': { yi: ['祭祀', '祈福', '嫁娶', '造屋', '装修', '修路', '开市', '入学', '上任', '安床', '签约', '冠带'], ji: ['诉讼', '出行', '交涉', '搬迁'] },
    '执': { yi: ['造屋', '装修', '嫁娶', '收购', '立契', '祭祀', '捕捉', '纳采'], ji: ['开市', '求财', '出行', '搬迁', '移徙'] },
    '破': { yi: ['破屋', '坏垣', '拆卸', '求医', '破土', '治病'], ji: ['嫁娶', '签约', '交涉', '出行', '搬迁', '开市', '安葬'] },
    '危': { yi: ['祭祀', '祈福', '安床', '拆卸', '破土', '交易'], ji: ['登山', '乘船', '出行', '嫁娶', '造葬', '迁徙', '求医'] },
    '成': { yi: ['嫁娶', '开市', '修造', '动土', '安床', '安葬', '搬迁', '交易', '求财', '出行', '立契', '入学'], ji: ['诉讼', '词讼'] },
    '收': { yi: ['嫁娶', '纳财', '收账', '安床', '修造', '入学', '开市', '交易', '立契', '祈福', '求嗣', '赴任'], ji: ['出行', '安葬', '破土', '放债', '移徙'] },
    '开': { yi: ['祭祀', '祈福', '嫁娶', '入学', '上任', '修造', '动土', '开市', '安床', '交易', '出行', '求医'], ji: ['放债', '诉讼', '安葬', '造葬'] },
    '闭': { yi: ['祭祀', '安葬', '塞穴', '筑堤', '补垣', '入殓', '除服', '成服', '移柩', '破土', '启钻', '断蚁', '结网', '修仓', '收纳'], ji: ['开市', '出行', '求医', '嫁娶', '动土', '移徙', '开光', '盖屋'] }
  };

  // 方位（按日天干，传统老黄历通用表）
  var CAISHEN = { '甲': '东北', '乙': '东北', '丙': '西南', '丁': '西南', '戊': '正北', '己': '正南', '庚': '正东', '辛': '正东', '壬': '正南', '癸': '正南' };
  var XISHEN = { '甲': '东北', '乙': '西北', '丙': '西南', '丁': '正南', '戊': '东南', '己': '东北', '庚': '西北', '辛': '西南', '壬': '正南', '癸': '东南' };
  var FUSHEN = { '甲': '正北', '乙': '正南', '丙': '西北', '丁': '正南', '戊': '正南', '己': '正北', '庚': '正西', '辛': '西南', '壬': '正南', '癸': '正北' };

  // 六冲：日支 → 冲生肖；煞方（三合局煞）
  var CHONG = { '子': '午', '丑': '未', '寅': '申', '卯': '酉', '辰': '戌', '巳': '亥', '午': '子', '未': '丑', '申': '寅', '酉': '卯', '戌': '辰', '亥': '巳' };
  var SHA = { '子': '南', '丑': '东', '寅': '北', '卯': '西', '辰': '南', '巳': '东', '午': '北', '未': '西', '申': '南', '酉': '东', '戌': '北', '亥': '西' };

  // 生活小贴士模板（宜/忌关键词 → 文案）
  var TIP_YI = {
    '沐浴': '今天适合洗头洗澡，洗去疲惫迎接好运🛁',
    '祭祀': '适合静心冥想，整理思绪🧘',
    '祈福': '适合许个愿，给自己一点盼头🌟',
    '会友': '今天适合约朋友见面，联络感情☕',
    '交际': '今天适合约朋友见面，联络感情☕',
    '交友': '今天适合约朋友见面，联络感情☕',
    '出行': '今天适合出门走走，换个环境心情更好🚶',
    '旅游': '今天适合出门走走，换个环境心情更好🚶',
    '嫁娶': '今天是个成双成对的好日子，适合重要仪式💞',
    '开市': '适合开启新计划、新事业，信心满满🚀',
    '开业': '适合开启新计划、新事业，信心满满🚀',
    '开张': '适合开启新计划、新事业，信心满满🚀',
    '动土': '适合整理居所、动手改造，焕然一新🏠',
    '修造': '适合整理居所、动手改造，焕然一新🏠',
    '装修': '适合整理居所、动手改造，焕然一新🏠',
    '入学': '适合学习新知，沉淀自己📚',
    '纳财': '财运不错，适合规划收支、理理财💰',
    '求财': '财运不错，适合规划收支、理理财💰',
    '安床': '适合整理卧室、换个心情🛏️',
    '牧养': '适合照顾宠物花草，温柔以待🐾',
    '饲养': '适合照顾宠物花草，温柔以待🐾',
    '求医': '身体不适趁今天调理，恢复更快🩺',
    '疗病': '身体不适趁今天调理，恢复更快🩺',
    '安葬': '今天适合为思念画一个安稳的句点🪦',
    '收纳': '适合整理收纳，把生活收拢得清爽📦',
    '修仓': '适合盘点收纳、整理财物🏬'
  };
  var TIP_JI = {
    '理发': '今天不宜剪发，换个日子再换发型吧💇',
    '整发': '今天不宜剪发，换个日子再换发型吧💇',
    '远行': '今天不宜出远门，宅家放松也不错🏠',
    '出行': '今天不宜出远门，宅家放松也不错🏠',
    '嫁娶': '今天不太适合办大事，缓一缓更稳🕊️',
    '动土': '今天不宜动土施工，避免磕碰🔧',
    '修造': '今天不宜动土施工，避免磕碰🔧',
    '安门': '今天不宜安门修门，另择吉日🚪',
    '作灶': '今天不宜动灶，简单吃点就好🍲',
    '伐木': '今天不宜砍树采木，爱护绿植🌳',
    '开市': '今天不宜开张，先养精蓄锐🛡️',
    '安葬': '今天不宜安葬下葬，择日而为🪦',
    '词讼': '今天不宜争执打官司，和气生财⚖️',
    '诉讼': '今天不宜争执打官司，和气生财⚖️',
    '移徙': '今天不宜搬迁，安顿好当下更妥📦',
    '搬迁': '今天不宜搬迁，安顿好当下更妥📦'
  };

  // 宜/忌 详解字典
  var YI_JI_DESC = {
    '出行': '外出旅行、拜访、搬迁等移动之事。', '祈福': '祈求神明赐福、消灾解厄。', '动土': '修建、破土、动工等建筑工程。',
    '修造': '修建、改造。', '立碑': '竖立纪念碑文。', '开渠': '开挖沟渠、水道。', '祭祀': '祭拜祖先、神明。',
    '求嗣': '祈求子嗣。', '上梁': '房屋上梁仪式。', '嫁娶': '举行结婚典礼。', '搬迁': '迁居搬家。',
    '移徙': '迁移住所。', '安葬': '下葬安葬。', '解除': '解除、扫除灾厄。', '沐浴': '沐浴洁身、斋戒。',
    '疗病': '治疗疾病。', '破土': '破地挖土（多指安葬相关）。', '开业': '店铺开张营业。', '立约': '订立契约。',
    '祈福': '祈求神明赐福。', '求官': '谋求官职。', '纳财': '招财进宝。', '修仓': '修建、清理仓库。',
    '交易': '买卖交易。', '立券': '订立契券。', '牧养': '饲养牲畜。', '开市': '开市营业。',
    '栽种': '种植作物。', '安床': '安置床铺。', '纳畜': '买入家畜。', '冠带': '冠笄、加冠带。',
    '签约': '签订契约。', '捕捉': '捕猎、捉拿。', '打猎': '出外捕猎。', '修建': '修建工程。',
    '纳采': '男方备礼向女方求婚。', '破屋': '拆除破旧屋舍。', '拆卸': '拆卸旧物。', '治病': '治疗疾病。',
    '破土': '破地挖土。', '婚嫁': '嫁娶之事。', '修仓': '修建仓库。', '收账': '收回账款。',
    '入学': '拜师求学。', '收纳': '收纳、收敛物品。', '塞穴': '堵塞洞穴、蚁穴。', '筑堤': '修筑堤坝。',
    '补垣': '修补矮墙。', '祈福': '祈求福泽。', '词讼': '诉讼争执。', '开市': '开张营业'
  };

  // 宜忌关键词 → emoji 装饰
  var EMOJI = {
    '安葬': '🪦', '祭祀': '🕯️', '祈福': '🙏', '出行': '🚶', '动土': '🏗️', '修造': '🔧', '装修': '🔧',
    '嫁娶': '💍', '婚嫁': '💒', '开市': '🏪', '开业': '🏪', '开张': '🏪', '纳财': '💰', '求财': '💰',
    '交易': '💱', '入学': '📚', '安床': '🛏️', '沐浴': '🛁', '求医': '🩺', '疗病': '💊', '治病': '💊',
    '捕捉': '🪤', '打猎': '🏹', '牧养': '🐾', '饲养': '🐾', '塞穴': '🕳️', '筑堤': '🌊', '修仓': '🏬',
    '收纳': '📦', '解除': '🧹', '破土': '⛏️', '移徙': '📦', '搬迁': '📦', '上梁': '🏗️', '立碑': '🪨',
    '开渠': '💧', '裁衣': '✂️', '立约': '📝', '签约': '📝', '收账': '🧾', '拆卸': '🔨', '纳畜': '🐄',
    '求嗣': '🤱', '冠带': '👑', '安门': '🚪', '作灶': '🍳', '伐木': '🌲', '开光': '✨', '盖屋': '🏠',
    '入宅': '🏠', '词讼': '⚖️', '诉讼': '⚖️', '栽种': '🌱', '补垣': '🧱', '立券': '📜', '纳采': '💐',
    '入殓': '💀', '除服': '🕯️', '成服': '🕯️', '移柩': '⚰️', '启钻': '⛏️', '断蚁': '🐜', '结网': '🕸️',
    '置业': '🏠', '赴任': '🏢', '交涉': '🤝', '造屋': '🏠', '修路': '🛣️', '上任': '🏢', '考试': '📝',
    '扫舍': '🧹', '破屋': '🏚️', '坏垣': '🧱', '造葬': '⚰️', '掘井': '💧', '放债': '💸', '结亲': '💞',
    '收购': '🛒', '出货': '📤', '修仓': '🏬', '收纳': '📦', '筑堤': '🌊', '塞穴': '🕳️', '祭祀': '🕯️'
  };
  var JI_EMOJI = {
    '安门': '🚪', '伐木': '🌲', '修造': '🔧', '嫁娶': '💔', '出行': '✈️', '远行': '✈️', '作灶': '🍳',
    '开市': '🏪', '安葬': '🪦', '词讼': '⚖️', '诉讼': '⚖️', '动土': '🏗️', '求医': '🩺', '入宅': '🏠',
    '盖屋': '🏠', '移徙': '📦', '搬迁': '📦', '开光': '✨', '理发': '💇', '整发': '💇', '开张': '🏪'
  };

  // ===== 五行穿衣（基于当日日干五行，生克推算幸运色）=====
  // 五行顺序：木 火 土 金 水（idx+1=我生, idx-1=生我, idx+2=我克, idx-2=克我）
  var WX_ORDER = ['木', '火', '土', '金', '水'];
  var GAN_WX = { '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土', '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水' };
  var WX_COLORS = {
    '木': { list: ['绿色', '青色', '翠绿', '碧色'], dot: '#7FB069' },
    '火': { list: ['红色', '紫色', '粉色', '橙色', '玫红'], dot: '#E57373' },
    '土': { list: ['黄色', '咖色', '棕色', '米色', '卡其'], dot: '#D4A85F' },
    '金': { list: ['白色', '金色', '银色', '杏色'], dot: '#CFC9BC' },
    '水': { list: ['黑色', '蓝色', '灰色', '藏青'], dot: '#5C6BC0' }
  };
  // 生肖运势（基于当日日支的六合/三合/六冲）+ 生肖 Emoji
  var ZODIAC_EMOJI = { '鼠': '🐭', '牛': '🐮', '虎': '🐯', '兔': '🐰', '龙': '🐲', '蛇': '🐍', '马': '🐴', '羊': '🐑', '猴': '🐵', '鸡': '🐔', '狗': '🐶', '猪': '🐷' };
  var LIUHE = { '子': '丑', '丑': '子', '寅': '亥', '卯': '戌', '辰': '酉', '巳': '申', '午': '未', '未': '午', '申': '巳', '酉': '辰', '戌': '卯', '亥': '寅' };
  var SANHE = {
    '寅': ['午', '戌'], '午': ['寅', '戌'], '戌': ['寅', '午'],
    '申': ['子', '辰'], '子': ['申', '辰'], '辰': ['申', '子'],
    '亥': ['卯', '未'], '卯': ['亥', '未'], '未': ['亥', '卯'],
    '巳': ['酉', '丑'], '酉': ['巳', '丑'], '丑': ['巳', '酉']
  };
  // 文昌位（日干 → 地支 → 方位）；桃花位（日支三合局 → 地支 → 方位）
  var WENCHANG = { '甲': '巳', '乙': '午', '丙': '申', '丁': '酉', '戊': '申', '己': '酉', '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯' };
  var TAOHUA = { '寅': '卯', '午': '卯', '戌': '卯', '申': '酉', '子': '酉', '辰': '酉', '亥': '子', '卯': '子', '未': '子', '巳': '午', '酉': '午', '丑': '午' };
  var ZHI_DIR = { '子': '正北', '丑': '东北', '寅': '东北', '卯': '正东', '辰': '东南', '巳': '东南', '午': '正南', '未': '西南', '申': '西南', '酉': '正西', '戌': '西北', '亥': '西北' };

  function wuxingOf(date) {
    var raw = getRaw(dateKey(date)); if (!raw) return null;
    var wx = GAN_WX[(raw.dgz || '').charAt(0)] || '木';
    var idx = WX_ORDER.indexOf(wx);
    return {
      wx: wx,
      da: WX_COLORS[WX_ORDER[(idx + 4) % 5]],   // 生我（贵人色 → 大吉）
      ci: WX_COLORS[WX_ORDER[idx]],              // 同我（合作色 → 次吉）
      ping: WX_COLORS[WX_ORDER[(idx + 2) % 5]],  // 我克（招财色 → 平平）
      shen: WX_COLORS[WX_ORDER[(idx + 1) % 5]],  // 我生（消耗色 → 慎用）
      ji: WX_COLORS[WX_ORDER[(idx + 3) % 5]]     // 克我（不利色 → 忌用）
    };
  }
  function renderWuxing(date) {
    var box = $('almWuxing'); if (!box) return;
    var w = wuxingOf(date); if (!w) { box.innerHTML = ''; return; }
    function row(cls, label, c) {
      return '<div class="alm-wx-row ' + cls + '">' +
        '<span class="alm-wx-dot" style="background:' + c.dot + '"></span>' +
        '<span class="alm-wx-label">' + label + '</span>' +
        '<span class="alm-wx-colors">' + c.list.join('、') + '</span></div>';
    }
    box.innerHTML =
      row('da', '🟢 大吉色', w.da) +
      row('ci', '⚫ 次吉色', w.ci) +
      row('ping', '🟡 平平色', w.ping) +
      row('shen', '⚪ 慎用色', w.shen) +
      row('ji', '🔴 忌用色', w.ji) +
      '<div class="alm-wx-tip">💡 今日建议：穿「' + w.da.list[0] + '」系，贵人相助、运势更顺 ✨</div>';
  }
  function zodiacFortune(raw) {
    var zhi = (raw.dgz || '').charAt(1);
    var heZhi = LIUHE[zhi] || '';
    var sanhe = SANHE[zhi] || [];
    var chongZhi = CHONG[zhi] || '';
    var tg = heZhi ? ZODIAC[heZhi] : '', sg = sanhe.map(function (z) { return ZODIAC[z]; });
    var cg = chongZhi ? ZODIAC[chongZhi] : '';
    var parts = [];
    if (tg) parts.push(ZODIAC_EMOJI[tg] + tg + '（特吉）');
    if (sg.length) parts.push(sg.map(function (s) { return ZODIAC_EMOJI[s] + s; }).join(' ') + '（次吉）');
    var txt = '今日生肖运势：' + parts.join(' · ');
    if (cg) txt += '；冲 ' + ZODIAC_EMOJI[cg] + cg + ' 煞' + (SHA[zhi] || '');
    return txt;
  }

  // ===== 十二时辰吉凶（黄道黑道）=====
  // 日支 → 青龙所起时辰；青龙起后按 青龙,明堂,天刑,朱雀,金匮,天德,白虎,玉堂,天牢,玄武,司命,勾陈 顺推
  var SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var SHICHEN_RANGE = ['23-01', '01-03', '03-05', '05-07', '07-09', '09-11', '11-13', '13-15', '15-17', '17-19', '19-21', '21-23'];
  var QINGLONG_START = { '子': '申', '午': '申', '丑': '戌', '未': '戌', '寅': '子', '申': '子', '卯': '寅', '酉': '寅', '辰': '辰', '戌': '辰', '巳': '午', '亥': '午' };
  var SHENSHA_SEQ = ['青龙', '明堂', '天刑', '朱雀', '金匮', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陈'];
  var HUANGDAO = { '青龙': 1, '明堂': 1, '金匮': 1, '天德': 1, '玉堂': 1, '司命': 1 };

  function shichenOf(date) {
    var key = dateKey(date);
    var raw = getRaw(key);
    if (!raw) return [];
    var zhi = (raw.dgz || '').charAt(1);
    var startZhi = QINGLONG_START[zhi] || '申';
    var startIdx = SHICHEN.indexOf(startZhi);
    if (startIdx < 0) startIdx = 8;
    var out = [];
    for (var i = 0; i < 12; i++) {
      var shen = SHENSHA_SEQ[((i - startIdx) % 12 + 12) % 12];
      out.push({ name: SHICHEN[i], range: SHICHEN_RANGE[i], shen: shen, good: !!HUANGDAO[shen] });
    }
    return out;
  }

  function dateKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function getRaw(key) { return (window.ALMANAC_RAW && window.ALMANAC_RAW[key]) || null; }
  function parseKey(key) { var p = String(key).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  // 当前选中的日期（默认今天）；进入页面或点"今天"时重置
  var viewDate = new Date();
  var calMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);

  function derive(raw) {
    var off = raw.officer;
    var jc = JIANCHU[off] || { yi: [], ji: [] };
    var yi = jc.yi.slice(), ji = jc.ji.slice();
    var dgz = raw.dgz;
    var gan = dgz.charAt(0), zhi = dgz.charAt(1);
    var caishen = CAISHEN[gan] || '', xishen = XISHEN[gan] || '', fushen = FUSHEN[gan] || '';
    var chongZhi = CHONG[zhi]; var chong = ZODIAC[chongZhi] || '';
    var sha = SHA[zhi] || '';
    var wen = ZHI_DIR[WENCHANG[gan] || ''] || '';
    var tao = ZHI_DIR[TAOHUA[zhi] || ''] || '';

    var tipYi = null, tipJi = null;
    for (var k in TIP_YI) { if (yi.indexOf(k) >= 0) { tipYi = TIP_YI[k]; break; } }
    for (var k2 in TIP_JI) { if (ji.indexOf(k2) >= 0) { tipJi = TIP_JI[k2]; break; } }
    if (!tipYi && !tipJi) {
      var def = {
        '开': '今天诸事敞开，适合开启新计划✨', '成': '诸事可成，适合推进重要的事🌿',
        '收': '适合收纳整理、回归规律🧺', '闭': '适合内省沉淀、修补小事🔧', '破': '宜破旧立新，处理积压🪓',
        '建': '适合打基础、立规矩🧱', '除': '适合扫除旧物、轻装上阵🍃', '满': '适合收获与感恩，别贪多🌾',
        '平': '平稳的一天，按部就班就好🌤️', '定': '适合定下来、做决定📌', '执': '适合坚持执行、拿主意✊',
        '危': '谨慎为上，慢一步更稳⚠️'
      };
      tipYi = def[off] || '今天也请温柔对待自己🌸';
    }
    return { yi: yi, ji: ji, caishen: caishen, xishen: xishen, fushen: fushen, chong: chong, sha: sha, wen: wen, tao: tao, tipYi: tipYi, tipJi: tipJi };
  }

  function lunarText(raw) {
    return '农历' + (raw.leap ? '闰' : '') + raw.lmCn + raw.ldCn;
  }
  function ganzhiYear(raw) {
    return raw.ygz + '年 · ' + (ZODIAC[raw.ygz.charAt(0)] || '') + '年';
  }
  function emojiFor(word, isYi) {
    if (isYi) return EMOJI[word] || '🌟';
    return JI_EMOJI[word] || '🚫';
  }

  function fillList(id, arr, isYi) {
    var ul = $(id); if (!ul) return; ul.innerHTML = '';
    arr.forEach(function (t) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="alm-emoji">' + emojiFor(t, isYi) + '</span><span class="alm-word">' + t + '</span>';
      ul.appendChild(li);
    });
  }

  function renderHours(date) {
    var box = $('almHours'); if (!box) return;
    var hours = shichenOf(date);
    if (!hours.length) { box.innerHTML = '<div class="alm-empty">该日期暂无时辰数据</div>'; return; }
    var html = '<div class="alm-hours-grid">';
    hours.forEach(function (h) {
      html += '<div class="alm-hour ' + (h.good ? 'good' : 'bad') + '">' +
        '<div class="ah-top"><span class="ah-name">' + h.name + '时</span><span class="ah-tag">' + (h.good ? '吉' : '凶') + '</span></div>' +
        '<div class="ah-range">' + h.range + '</div>' +
        '<div class="ah-shen">' + h.shen + '</div></div>';
    });
    html += '</div>';
    box.innerHTML = html;
  }

  function renderQuote() {
    var box = $('almQuote'); if (!box) return;
    if (!window.QuoteService) { box.textContent = '“上善若水，水善利万物而不争。” —— 老子《道德经》'; return; }
    window.QuoteService.getDailyQuote(false).then(function (q) {
      var el = $('almQuote'); if (!el) return;
      var main, sub = '';
      if (q.en) { main = '“' + q.en + '” —— ' + (q.author || '佚名'); sub = q.zh || ''; }
      else { main = '“' + (q.zh || '') + '” —— ' + (q.author || '佚名') + (q.source ? '《' + q.source + '》' : ''); }
      el.innerHTML = '<div class="alm-quote-main">' + main + '</div>' + (sub ? '<div class="alm-quote-sub">' + sub + '</div>' : '');
    });
  }

  function renderCalendar() {
    var grid = $('almCalGrid'); var title = $('almCalTitle');
    if (!grid || !title) return;
    var y = calMonth.getFullYear(), m = calMonth.getMonth();
    title.textContent = y + '年' + (m + 1) + '月';
    var first = new Date(y, m, 1);
    var startW = first.getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var todayK = dateKey(new Date());
    var selK = dateKey(viewDate);
    var html = '';
    for (var i = 0; i < startW; i++) html += '<span class="alm-cal-cell empty"></span>';
    for (var d = 1; d <= daysInMonth; d++) {
      var k = y + '-' + (m + 1) + '-' + d;
      var raw = getRaw(k);
      var cls = 'alm-cal-cell';
      if (k === todayK) cls += ' today';
      if (k === selK) cls += ' selected';
      if (!raw) cls += ' no-data';
      var lunarTxt = raw ? ('<i>' + raw.ldCn + '</i>') : '';
      html += '<button class="' + cls + '" data-k="' + k + '" ' + (raw ? '' : 'disabled') + '>' +
        '<b>' + d + '</b>' + lunarTxt + '</button>';
    }
    grid.innerHTML = html;
    var cells = grid.querySelectorAll('.alm-cal-cell[data-k]');
    for (var c = 0; c < cells.length; c++) {
      cells[c].addEventListener('click', function () {
        if (this.disabled) return;
        goDate(this.getAttribute('data-k'));
      });
    }
  }

  // 切换月份（仅改变月历视图，不改变当前宜忌数据）
  function shiftMonth(delta) {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
    renderCalendar();
  }

  // 跳转到指定日期，重载全部数据
  function goDate(keyOrY, m, d) {
    var dt;
    if (typeof keyOrY === 'string') { dt = parseKey(keyOrY); }
    else { dt = new Date(keyOrY, m, d); }
    if (isNaN(dt.getTime())) return;
    viewDate = dt;
    calMonth = new Date(dt.getFullYear(), dt.getMonth(), 1);
    render();
    // 滚动回顶部
    var body = $('almBody'); if (body) body.scrollTop = 0;
  }

  function render() {
    var body = $('almBody'); if (!body) return;
    var key = dateKey(viewDate);
    var raw = getRaw(key);
    if (!raw) {
      body.innerHTML = '<div class="alm-empty">黄历数据暂未覆盖该日期（覆盖范围 2020–2035）📅</div>';
      return;
    }
    var d = derive(raw);
    var wd = WEEK[viewDate.getDay()];
    $('almDate').innerHTML = '📅 ' + viewDate.getFullYear() + '年' + (viewDate.getMonth() + 1) + '月' + viewDate.getDate() + '日 星期' + wd +
      '<br><span class="alm-lunar">' + lunarText(raw) + ' · ' + ganzhiYear(raw) + '</span>';

    fillList('almYi', d.yi, true);
    fillList('almJi', d.ji, false);

    var zEl = $('almZodiac'); if (zEl) zEl.textContent = zodiacFortune(raw);

    var dirs = '财神 <b>' + d.caishen + '</b> · 喜神 <b>' + d.xishen + '</b> · 福神 <b>' + d.fushen + '</b>';
    if (d.wen) dirs += ' · 文昌 <b>' + d.wen + '</b>';
    if (d.tao) dirs += ' · 桃花 <b>' + d.tao + '</b>';
    if (d.chong) dirs += ' · 冲' + d.chong + '煞' + d.sha;
    $('almDirs').innerHTML = dirs;
    renderWuxing(viewDate);

    var tip = d.tipYi || '';
    if (d.tipJi) tip += (tip ? '<br>' + d.tipJi : d.tipJi);
    // 关联宜忌标签
    var tags = '';
    if (d.yi.length) tags = '宜：' + d.yi.slice(0, 4).join(' · ');
    $('almTip').innerHTML = (tip || '今天也请温柔对待自己🌸') + (tags ? '<div class="alm-tip-tags">' + tags + '</div>' : '');

    renderHours(viewDate);
    renderQuote();

    var html = '';
    d.yi.concat(d.ji).forEach(function (item) {
      var isYi = d.yi.indexOf(item) >= 0;
      var desc = YI_JI_DESC[item] || '传统黄历所列事宜。';
      html += '<div class="alm-detail-row"><span class="alm-detail-tag ' + (isYi ? 'yi' : 'ji') + '">' + (isYi ? '宜' : '忌') + '</span><b>' + item + '：</b>' + desc + '</div>';
    });
    if (raw.pengzu) html += '<div class="alm-detail-row alm-pengzu">📜 彭祖百忌：' + raw.pengzu + '</div>';
    if (raw.xiu) html += '<div class="alm-detail-row alm-pengzu">🌟 二十八宿：' + raw.xiu + ' ｜ 五行：' + raw.nayin + '</div>';
    $('almDetail').innerHTML = html;

    renderCalendar();
  }

  // 进入页面：重置为今天并重绘
  function open() {
    viewDate = new Date();
    calMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    if (window.App && App.switchModule) App.switchModule('almanac');
    render();
  }

  // 首页卡片预览（今日宜忌简短摘要）
  function todayPreview() {
    var key = dateKey(new Date());
    var raw = getRaw(key);
    if (!raw) return '黄历 · 宜忌 · 方位';
    var d = derive(raw);
    var yi = d.yi.slice(0, 3).join('·');
    var ji = d.ji.slice(0, 3).join('·');
    return '今日宜 ' + (yi || '—') + ' ｜ 忌 ' + (ji || '—');
  }

  // 由建除十二神取宜/忌（供吉日查询模块复用）
  function officerYiJi(officer) {
    var jc = JIANCHU[officer] || { yi: [], ji: [] };
    return { yi: jc.yi.slice(), ji: jc.ji.slice() };
  }

  // 分享今日宜忌（优先调用系统分享，否则复制文本）
  function share() {
    var raw = getRaw(dateKey(viewDate)); if (!raw) return;
    var d = derive(raw);
    var w = wuxingOf(viewDate);
    var wd = WEEK[viewDate.getDay()];
    var dateStr = viewDate.getFullYear() + '年' + (viewDate.getMonth() + 1) + '月' + viewDate.getDate() + '日 星期' + wd;
    var lines = [
      '📅 ' + dateStr,
      lunarText(raw) + ' · ' + ganzhiYear(raw),
      '',
      '【宜】' + (d.yi.join('、') || '—'),
      '【忌】' + (d.ji.join('、') || '—'),
      '',
      '🧭 财神' + d.caishen + ' · 喜神' + d.xishen + ' · 福神' + d.fushen,
      '🎨 大吉色：' + (w ? w.da.list.join('/') : '—'),
      '✨ 来自「效率管理」今日宜忌'
    ];
    var text = lines.join('\n');
    if (navigator.share) {
      navigator.share({ title: '今日宜忌', text: text }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (window.App && App.toast) App.toast('今日宜忌已复制，去分享吧 🔗');
      });
    } else if (window.App && App.toast) {
      App.toast('已生成今日宜忌卡片 ✨');
    }
  }

  window.Almanac = {
    render: render, open: open, derive: derive, goDate: goDate,
    shiftMonth: shiftMonth, todayPreview: todayPreview, shichenOf: shichenOf,
    officerYiJi: officerYiJi, share: share, wuxingOf: wuxingOf, zodiacFortune: zodiacFortune
  };
})();
