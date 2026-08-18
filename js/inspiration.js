/* =========================================================================
 * 灵感专区 — 交互逻辑 (Inspiration Zone UI)  v3  ·  小红书/Instagram 风格
 * 单一数据源、自注入完整 UI：列表(看板) + 编辑弹窗 + 合集管理 + 标签筛选
 * + 回收站 + 备份/导入(合并) + 草稿自动存 + 滚动恢复。
 * 依赖 InspirationDB（合集/笔记/图片均在独立 IndexedDB）。不引用平台其它代码。
 * ========================================================================= */
(function () {
  'use strict';

  var DB = window.InspirationDB;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function revokeAll(arr) { (arr || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} }); }
  function esc(s) { return (s == null ? '' : String(s)); }

  /* ---------- 模板（自注入，保证内嵌/独立页一致） ---------- */
  var TEMPLATE = [
    '<div class="insp-app" id="inspApp">',
    '  <header class="insp-header">',
    '    <button class="insp-home" id="inspHome" aria-label="返回">←</button>',
    '    <h1 class="insp-title">✨ 灵感</h1>',
    '    <div class="insp-header-actions">',
    '      <button class="insp-icon-btn" id="inspSearchBtn" aria-label="搜索">🔍</button>',
    '      <button class="insp-icon-btn" id="inspMore" aria-label="更多">⋯</button>',
    '    </div>',
    '    <div class="insp-more-menu" id="inspMoreMenu" hidden>',
    '      <button id="exportMenuItem">⬇ 导出备份</button>',
    '      <button id="importMenuItem">⬆ 导入备份</button>',
    '      <button id="trashMenuItem">🗑 回收站</button>',
    '      <button id="manageColMenuItem">🗂 管理合集</button>',
    '    </div>',
    '  </header>',
    '  <div class="insp-searchbar" id="inspSearchbar" hidden>',
    '    <input id="inspSearchInput" placeholder="搜索标题、内容、标签…" aria-label="搜索">',
    '    <button id="inspSearchClose" class="insp-search-close">取消</button>',
    '  </div>',
    '  <div class="insp-cat-bar" id="inspCatBar"></div>',
    '  <div class="insp-tag-bar" id="inspTagBar" hidden></div>',
    '  <main class="insp-main" id="inspMain">',
    '    <div class="insp-waterfall" id="inspWaterfall"></div>',
    '    <div class="insp-empty" id="inspEmpty" hidden>',
    '      <div class="insp-empty-emoji">🌿</div>',
    '      <p>这里收藏你的灵感</p>',
    '      <p class="insp-empty-sub">点击右下角「＋」开始记录</p>',
    '    </div>',
    '  </main>',
    '  <button class="insp-fab" id="inspFab" aria-label="新建灵感">＋</button>',
    '  <div class="insp-modal insp-modal--fullscreen" id="noteModal" hidden>',
    '    <div class="insp-modal-card">',
    '      <div class="insp-modal-head">',
    '        <button id="noteModalClose" aria-label="关闭">✕</button>',
    '        <span id="noteModalTitle">新建灵感</span>',
    '        <span style="width:28px"></span>',
    '      </div>',
    '      <div class="insp-modal-body">',
    '        <div class="insp-uploader">',
    '          <div class="insp-thumbs" id="noteThumbs"></div>',
    '          <label class="insp-add-thumb">＋ 图片<input type="file" accept="image/*" multiple id="noteImgInput" hidden></label>',
    '        </div>',
    '        <input class="insp-input" id="noteTitle" placeholder="标题（选填）" maxlength="60">',
    '        <textarea class="insp-textarea" id="noteBody" placeholder="记录搭配思路、妆容心得、色号、场景、季节、购买链接…" maxlength="2000"></textarea>',
    '        <div class="insp-field">',
    '          <span class="insp-label">合集（必选）</span>',
    '          <div class="insp-cat-options" id="noteColOptions"></div>',
    '          <button class="insp-text-btn" id="noteColManage">🗂 管理合集</button>',
    '        </div>',
    '        <div class="insp-field">',
    '          <span class="insp-label">标签（可多个，回车添加）</span>',
    '          <div class="insp-tag-chips" id="noteTagChips"></div>',
    '          <div class="insp-tag-add">',
    '            <input id="noteTagInput" placeholder="如 通勤 / 约会 / 黄皮">',
    '            <button class="insp-btn-primary insp-btn-sm" id="noteTagAdd">添加</button>',
    '          </div>',
    '          <div class="insp-tag-presets" id="noteTagPresets"></div>',
    '        </div>',
    '      </div>',
    '      <div class="insp-modal-foot">',
    '        <button class="insp-btn-ghost" id="noteSaveDraft">存草稿</button>',
    '        <button class="insp-btn-primary" id="notePublish">完成</button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <div class="insp-modal" id="colModal" hidden>',
    '    <div class="insp-modal-card">',
    '      <div class="insp-modal-head"><button id="colModalClose" aria-label="关闭">✕</button><span>管理合集</span><span style="width:28px"></span></div>',
    '      <div class="insp-modal-body"><div class="insp-col-list" id="colList"></div></div>',
    '      <div class="insp-modal-foot"><button class="insp-btn-primary" id="colModalAdd">＋ 新建合集</button></div>',
    '    </div>',
    '  </div>',
    '  <div class="insp-modal" id="colEditModal" hidden>',
    '    <div class="insp-modal-card insp-modal-card--sm">',
    '      <div class="insp-modal-head"><button id="colEditClose" aria-label="关闭">✕</button><span id="colEditTitle">新建合集</span><span style="width:28px"></span></div>',
    '      <div class="insp-modal-body">',
    '        <div class="insp-emoji-grid" id="colEditEmojiGrid"></div>',
    '        <input class="insp-input" id="colEditName" placeholder="合集名称" maxlength="12">',
    '      </div>',
    '      <div class="insp-modal-foot">',
    '        <button class="insp-btn-ghost" id="colEditDelete" hidden>删除</button>',
    '        <button class="insp-btn-primary" id="colEditSave">保存</button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <div class="insp-modal" id="tagModal" hidden>',
    '    <div class="insp-modal-card">',
    '      <div class="insp-modal-head"><button id="tagModalClose" aria-label="关闭">✕</button><span>按标签筛选</span><span style="width:28px"></span></div>',
    '      <div class="insp-modal-body"><div class="insp-tag-list" id="tagModalList"></div></div>',
    '      <div class="insp-modal-foot"><button class="insp-btn-primary" id="tagModalDone">完成</button></div>',
    '    </div>',
    '  </div>',
    '  <div class="insp-modal insp-modal--trash" id="trashModal" hidden>',
    '    <div class="insp-modal-card insp-modal-card--lg">',
    '      <div class="insp-modal-head"><button id="trashModalClose" aria-label="关闭">✕</button><span>回收站（30 天内可恢复）</span><span style="width:28px"></span></div>',
    '      <div class="insp-modal-body"><div class="insp-trash-list" id="trashList"></div></div>',
    '    </div>',
    '  </div>',
    '  <div class="insp-modal insp-modal--confirm" id="confirmModal" hidden>',
    '    <div class="insp-confirm-card">',
    '      <p id="confirmMsg"></p>',
    '      <p id="confirmSub" class="insp-confirm-sub" hidden></p>',
    '      <div class="insp-confirm-actions">',
    '        <button class="insp-btn-ghost" id="confirmCancel">取消</button>',
    '        <button class="insp-btn-primary" id="confirmOk">确定</button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <input type="file" id="importFile" accept="application/json" hidden>',
    '  <div class="insp-toast" id="inspToast" hidden></div>',
    '</div>'
  ].join('\n');

  /* ---------- 小工具 ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('inspToast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.hidden = true; }, 250); }, 1800);
  }
  function gentle(item) {
    var g = window.App;
    if (g && typeof g.feedback === 'function') { g.feedback(item); return; }
    toast(typeof item === 'string' ? item : ((item && item.title) || ''));
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateDot(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function dateZh(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function genId(prefix) { return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

  var EMOJI_CHOICES = ['👗','💄','🏠','✈️','🎨','🌸','🍜','🎵','📱','📚','💡','🌿','🐱','👟','👜','💍','🧴','☕','🍰','🌟','💼','🎬','🌈','🔥','🍃','🌷','🪴','🧥','👠','💅'];
  var PRESET_TAGS = ['通勤','校园','约会','秋冬','极简','法式','复古','运动','淡颜','日常妆','约会妆','伪素颜','复古妆','欧美妆','黄皮','显白','高级感','小个子'];

  /* ---------- 状态 ---------- */
  var EMBEDDED = false;
  var state = { cat: 'all', tag: '', q: '' };
  var collections = [];           // DB 合集
  var editing = null;
  var cardUrls = {};
  var thumbMap = {};            // {thumbId: blob} 列表渲染时一次性取出，避免逐卡读 IDB
  var thumbDims = {};           // {thumbId: {w, h}} 缩略图尺寸，用于提前预约卡片宽高比（防回流卡顿）
  var activeNotesCache = null;  // 活跃笔记缓存，避免重复全量读取
  var allNotes = [];
  var currentList = [];
  var PAGE = 24;
  var renderedCount = 0;
  var lastOpenTs = 0;
  var dragFrom = null;
  var editingCol = null;
  var colDragFrom = null;
  var SCROLL_KEY = 'wb_insp_scroll';

  function colInfo(id) { return DB.collectionInfo(id, collections); }

  /* ---------- 图片处理 ---------- */
  function readImageMeta(file) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = function () { res({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }
  function makeThumbnail(file, maxW) {
    maxW = maxW || 400;
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || maxW, h = img.naturalHeight || maxW;
        var tw = Math.min(maxW, w), th = Math.max(1, Math.round(h * (tw / w)));
        var canvas = document.createElement('canvas'); canvas.width = tw; canvas.height = th;
        try { canvas.getContext('2d').drawImage(img, 0, 0, tw, th); } catch (e) {}
        URL.revokeObjectURL(url);
        if (canvas.toBlob) canvas.toBlob(function (b) { if (b) res(b); else rej(new Error('thumb null')); }, 'image/webp', 0.82);
        else { try { canvas.toBlob(function (b) { if (b) res(b); else rej(new Error('thumb null')); }, 'image/png'); } catch (e) { rej(e); } }
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('thumb decode fail')); };
      img.src = url;
    });
  }
  function blobToThumb(blob, maxW) {
    maxW = maxW || 400;
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || maxW, h = img.naturalHeight || maxW;
        var tw = Math.min(maxW, w), th = Math.max(1, Math.round(h * (tw / w)));
        var canvas = document.createElement('canvas'); canvas.width = tw; canvas.height = th;
        try { canvas.getContext('2d').drawImage(img, 0, 0, tw, th); } catch (e) {}
        URL.revokeObjectURL(url);
        if (canvas.toBlob) canvas.toBlob(function (b) { if (b) res({ blob: b, w: tw, h: th }); else rej(new Error('thumb null')); }, 'image/webp', 0.82);
        else rej(new Error('no toBlob'));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('thumb decode fail')); };
      img.src = url;
    });
  }
  function addImageFromFile(file) {
    return readImageMeta(file).then(function (m) {
    return DB.addImage(file, file.type, m.w, m.h).then(function (id) {
        var info = { id: id, thumbId: null, url: null, thumbUrl: null, type: file.type, w: m.w, h: m.h };
        return DB.getImageBlob(id).then(function (blob) {
          info.url = URL.createObjectURL(blob);
          return makeThumbnail(file).then(function (tb) {
            info.thumbUrl = URL.createObjectURL(tb);
            return DB.addThumbnail(tb, tb.type || 'image/webp', m.w, m.h).then(function (tid) { info.thumbId = tid; return info; });
          }).catch(function () { info.thumbUrl = info.url; info.thumbId = null; return info; });
        });
      });
    });
  }
  function loadEditingImage(id) {
    return DB.getImageBlob(id).then(function (blob) {
      if (!blob) return null;
      return DB.getImageRecord(id).then(function (rec) {
        return { id: id, url: URL.createObjectURL(blob), type: rec ? rec.type : blob.type, w: rec ? rec.width : 0, h: rec ? rec.height : 0 };
      });
    });
  }

  /* ---------- 瀑布流 ---------- */
  function revokeCardUrls() { revokeAll(Object.keys(cardUrls).map(function (k) { return cardUrls[k]; })); cardUrls = {}; }

  function matchQuery(n, q) {
    if (!q) return true;
    q = q.toLowerCase();
    if ((n.title || '').toLowerCase().indexOf(q) >= 0) return true;
    if ((n.body || '').toLowerCase().indexOf(q) >= 0) return true;
    if ((n.tags || []).some(function (t) { return t.toLowerCase().indexOf(q) >= 0; })) return true;
    return false;
  }
  function filterNotes(notes) {
    return notes.filter(function (n) {
      if (state.cat !== 'all' && (n.category || 'uncategorized') !== state.cat) return false;
      if (state.tag && (!n.tags || n.tags.indexOf(state.tag) < 0)) return false;
      if (!matchQuery(n, state.q)) return false;
      return true;
    });
  }
  function tagsForCurrentCat() {
    var set = {};
    allNotes.forEach(function (n) {
      if (state.cat !== 'all' && (n.category || 'uncategorized') !== state.cat) return;
      (n.tags || []).forEach(function (t) { set[t] = 1; });
    });
    return Object.keys(set).sort();
  }

  function renderCatBar() {
    var bar = $('inspCatBar'); if (!bar) return; bar.innerHTML = '';
    var all = el('button', 'insp-cat-tab' + (state.cat === 'all' ? ' active' : ''));
    all.dataset.cat = 'all'; all.textContent = '全部'; bar.appendChild(all);
    collections.forEach(function (c) {
      var b = el('button', 'insp-cat-tab' + (state.cat === c.id ? ' active' : ''));
      b.dataset.cat = c.id; b.textContent = c.emoji + ' ' + c.name; bar.appendChild(b);
    });
    var add = el('button', 'insp-cat-tab insp-cat-tab-new'); add.dataset.cat = '__new'; add.textContent = '＋'; bar.appendChild(add);
  }
  function renderTagBar() {
    var bar = $('inspTagBar'); if (!bar) return; bar.innerHTML = '';
    var tags = tagsForCurrentCat();
    if (!tags.length) { bar.hidden = true; return; }
    bar.hidden = false;
    var all = el('button', 'insp-tag-tab' + (state.tag === '' ? ' active' : ''));
    all.dataset.tag = ''; all.textContent = '全部'; bar.appendChild(all);
    tags.forEach(function (t) {
      var b = el('button', 'insp-tag-tab' + (state.tag === t ? ' active' : ''));
      b.dataset.tag = t; b.textContent = '#' + t; bar.appendChild(b);
    });
  }

  /* ---------- 封面加载（性能优化：批量取缩略图 + 缺失自动生成） ---------- */
  function syncCoverUrl(n) {
    // 同步路径：缩略图已在 thumbMap 中，直接生成 objectURL，零异步等待
    var thumbRef = n.thumbRefs && n.thumbRefs[0];
    if (thumbRef && thumbMap[thumbRef]) return URL.createObjectURL(thumbMap[thumbRef]);
    return null;
  }
  function paintCover(n, waterfall, url) {
    if (!url) return;
    cardUrls[n.id] = url;
    var card = waterfall.querySelector('.insp-card[data-id="' + n.id + '"]');
    if (!card) return;
    var ph = card.querySelector('.insp-card-ph');
    if (!ph) return;
    var img = el('img', 'insp-card-cover');
    img.alt = ''; img.src = url; img.loading = 'lazy'; img.decoding = 'async';
    var tr = n.thumbRefs && n.thumbRefs[0];
    var dim = tr && thumbDims[tr];
    if (dim && dim.w && dim.h) img.style.aspectRatio = dim.w + '/' + dim.h;
    img.onload = function () { img.classList.add('loaded'); };
    ph.replaceWith(img);
    if ((n.imageRefs || []).length > 1) {
      var cnt = el('div', 'insp-card-count'); cnt.textContent = '1/' + n.imageRefs.length;
      card.appendChild(cnt);
    }
  }
  function asyncCoverFor(n, waterfall) {
    // 异步路径：仅对「没有缓存缩略图」的卡片（多为早期/导入笔记）补读原图，
    // 并即时生成 webp 缩略图持久化，之后再次进入即可同步秒开（数据层只增不删，安全）。
    var thumbRef = n.thumbRefs && n.thumbRefs[0];
    var imgRef = n.imageRefs && n.imageRefs[0];
    if (!imgRef) return;
    var p = thumbRef ? DB.getThumbnailBlob(thumbRef) : Promise.resolve(null);
    p.then(function (tb) {
      if (tb) { thumbMap[thumbRef] = tb; paintCover(n, waterfall, URL.createObjectURL(tb)); return; }
      DB.getImageBlob(imgRef).then(function (blob) {
        if (!blob) return;
        blobToThumb(blob, 400).then(function (r) {
          DB.addThumbnail(r.blob, r.blob.type || 'image/webp', r.w, r.h).then(function (tid) {
            thumbMap[tid] = r.blob;
            thumbDims[tid] = { w: r.w, h: r.h };
            if (!n.thumbRefs) n.thumbRefs = [];
            n.thumbRefs[0] = tid;
            DB.saveNote(n).catch(function () {}).then(function () { paintCover(n, waterfall, URL.createObjectURL(r.blob)); });
          }).catch(function () { paintCover(n, waterfall, URL.createObjectURL(blob)); });
        }).catch(function () { paintCover(n, waterfall, URL.createObjectURL(blob)); });
      }).catch(function () {});
    }).catch(function () {});
  }

  /* ---------- 缺图缩略图生成：限并发队列 ---------- */
  // 早期/导入的笔记可能还没有缩略图，首次进入需要读原图并生成 webp。
  // 若一次性对全部缺图卡片并发生成，主线程会被「解码大图 + canvas 编码」占满而卡死。
  // 这里用一个小并发池（最多 3 个）串行消化，保证页面始终可响应、首屏秒出。
  var _genQ = [], _genRun = 0, _GEN_MAX = 3;
  function queueCoverGen(n, waterfall) {
    _genQ.push([n, waterfall]);
    pumpCoverGen();
  }
  function pumpCoverGen() {
    if (_genRun >= _GEN_MAX) return;          // 已达上限，等当前任务结束再取
    var job = _genQ.shift();
    if (!job) return;
    _genRun++;
    var n = job[0], waterfall = job[1];
    asyncCoverFor(n, waterfall).then(finishGen, finishGen);
  }
  function finishGen() { _genRun--; pumpCoverGen(); }

  function loadActiveNotes() {
    if (activeNotesCache) return Promise.resolve(activeNotesCache);
    return DB.getActiveNotes().then(function (n) { activeNotesCache = n; return n; });
  }
  function invalidateNotes() { activeNotesCache = null; }

  function render() {
    Promise.all([loadActiveNotes(), DB.getAllThumbs()]).then(function (res) {
      allNotes = res[0];
      thumbMap = (res[1] && res[1].blobs) || {};
      thumbDims = (res[1] && res[1].dims) || {};
      var filtered = filterNotes(allNotes);
      currentList = filtered;
      renderCatBar(); renderTagBar();
      revokeCardUrls();
      var waterfall = $('inspWaterfall'); waterfall.innerHTML = '';
      renderedCount = 0;
      $('inspEmpty').hidden = filtered.length > 0;
      appendNextPage();
      // 从详情返回时恢复瀑布流滚动位置
      if (EMBEDDED) restoreInspScroll();
    });
  }
  function appendNextPage() {
    if (renderedCount >= currentList.length) return;
    var start = renderedCount, end = Math.min(start + PAGE, currentList.length);
    var page = currentList.slice(start, end);
    var waterfall = $('inspWaterfall');
    // 先同步把有缩略图的卡片画出来（零等待）
    page.forEach(function (n) { var u = syncCoverUrl(n); if (u) cardUrls[n.id] = u; });
    page.forEach(function (n) { waterfall.appendChild(cardEl(n)); });
    renderedCount = end;
    // 再异步补齐缺缩略图的卡片（限并发，避免一次性解码 N 张大图冻结主线程）
    page.forEach(function (n) { if (!cardUrls[n.id]) queueCoverGen(n, waterfall); });
  }

  function cardEl(note) {
    var card = el('div', 'insp-card'); card.dataset.id = note.id;
    if (cardUrls[note.id]) {
      var img = el('img', 'insp-card-cover');
      img.src = cardUrls[note.id]; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      var tr = note.thumbRefs && note.thumbRefs[0];
      var dim = tr && thumbDims[tr];
      if (dim && dim.w && dim.h) img.style.aspectRatio = dim.w + '/' + dim.h;
      img.onload = function () { img.classList.add('loaded'); };
      card.appendChild(img);
      if ((note.imageRefs || []).length > 1) {
        var cnt = el('div', 'insp-card-count'); cnt.textContent = '1/' + note.imageRefs.length; card.appendChild(cnt);
      }
    } else {
      var c = colInfo(note.category);
      var ph = el('div', 'insp-card-ph'); ph.textContent = c.emoji; card.appendChild(ph);
    }
    var body = el('div', 'insp-card-body');
    if (note.title) { var t = el('div', 'insp-card-title'); t.textContent = note.title; body.appendChild(t); }
    if (note.body) { var d = el('div', 'insp-card-desc'); d.textContent = note.body; body.appendChild(d); }
    var c2 = colInfo(note.category);
    var foot = el('div', 'insp-card-foot');
    var col = el('span', 'insp-pill'); col.textContent = c2.emoji + ' ' + c2.name; foot.appendChild(col);
    var date = el('span', 'insp-card-date'); date.textContent = dateDot(note.createdAt); foot.appendChild(date);
    body.appendChild(foot);
    if (note.tags && note.tags.length) {
      var tags = el('div', 'insp-card-tags');
      note.tags.slice(0, 3).forEach(function (tg) { var s = el('span', 'insp-mini-tag'); s.textContent = '#' + tg; tags.appendChild(s); });
      body.appendChild(tags);
    }
    card.appendChild(body);
    return card;
  }

  /* ---------- 编辑笔记 ---------- */
  function snapshotDraft() {
    return {
      title: $('noteTitle').value.trim(),
      body: $('noteBody').value.trim(),
      category: editing.category,
      tags: editing.tags.slice(),
      imageIds: editing.images.map(function (i) { return i.id; })
    };
  }
  function isDraftMeaningful(d) {
    return (d && (d.title || d.body || d.category || (d.tags && d.tags.length) || (d.imageIds && d.imageIds.length)));
  }
  var draftTimer = null;
  function saveDraftAuto() {
    if (!$('noteModal').hidden && isDraftMeaningful(snapshotDraft())) {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(function () { DB.saveDraft(snapshotDraft()).catch(function () {}); }, 600);
    }
  }
  function saveDraftNow() {
    if (!isDraftMeaningful(snapshotDraft())) { toast('还没有可保存的内容'); return; }
    DB.saveDraft(snapshotDraft()).then(function () { toast('草稿已保存'); }, function () { toast('草稿保存失败'); });
  }

  function renderThumbs() {
    var box = $('noteThumbs'); box.innerHTML = '';
    var total = editing.images.length;
    editing.images.forEach(function (im, idx) {
      var th = el('div', 'insp-thumb'); th.draggable = true;
      var img = el('img'); img.src = im.url; th.appendChild(img);
      var badge = el('span', 'insp-thumb-badge'); badge.textContent = (idx + 1) + '/' + total; th.appendChild(badge);
      var del = el('button', 'insp-thumb-del'); del.type = 'button'; del.textContent = '×';
      del.onclick = function (e) { e.stopPropagation(); URL.revokeObjectURL(im.url); editing.images.splice(idx, 1); renderThumbs(); saveDraftAuto(); };
      th.appendChild(del);
      th.addEventListener('dragstart', function (e) { dragFrom = idx; th.classList.add('dragging'); try { e.dataTransfer.effectAllowed = 'move'; } catch (err) {} });
      th.addEventListener('dragend', function () { th.classList.remove('dragging'); dragFrom = null; });
      th.addEventListener('dragover', function (e) { e.preventDefault(); });
      th.addEventListener('drop', function (e) {
        e.preventDefault();
        if (dragFrom === null || dragFrom === idx) return;
        var moved = editing.images.splice(dragFrom, 1)[0];
        editing.images.splice(idx, 0, moved); renderThumbs(); saveDraftAuto();
      });
      box.appendChild(th);
    });
  }
  function renderTagChips() {
    var box = $('noteTagChips'); box.innerHTML = '';
    editing.tags.forEach(function (t, idx) {
      var chip = el('span', 'insp-tag insp-tag-removable'); chip.textContent = '#' + t;
      var x = el('span', 'insp-tag-x'); x.textContent = '×';
      x.onclick = function () { editing.tags.splice(idx, 1); renderTagChips(); saveDraftAuto(); };
      chip.appendChild(x); box.appendChild(chip);
    });
  }
  function renderPresetTags() {
    var box = $('noteTagPresets'); if (!box) return; box.innerHTML = '';
    PRESET_TAGS.forEach(function (t) {
      var chip = el('button', 'insp-tag insp-tag-preset'); chip.type = 'button'; chip.textContent = '+' + t;
      chip.onclick = function () { if (editing.tags.indexOf(t) < 0) { editing.tags.push(t); renderTagChips(); saveDraftAuto(); } };
      box.appendChild(chip);
    });
  }
  function renderColOptions() {
    var box = $('noteColOptions'); if (!box) return; box.innerHTML = '';
    collections.forEach(function (c) {
      var lab = el('label', 'insp-cat-opt');
      var rb = el('input'); rb.type = 'radio'; rb.name = 'noteCol'; rb.value = c.id;
      if (editing.category === c.id) rb.checked = true;
      rb.addEventListener('change', function () { if (this.checked) { editing.category = c.id; saveDraftAuto(); } });
      lab.appendChild(rb);
      var span = el('span'); span.textContent = ' ' + c.emoji + ' ' + c.name; lab.appendChild(span);
      box.appendChild(lab);
    });
  }

  function openNoteModal(note) {
    editing = { id: null, title: '', body: '', category: collections.length ? collections[0].id : 'uncategorized', tags: [], images: [], isEdit: false, _originalRefs: [], _originalThumbRefs: [] };
    $('noteModalTitle').textContent = '新建灵感';
    $('noteTitle').value = ''; $('noteBody').value = '';
    renderTagChips(); renderThumbs(); renderPresetTags(); renderColOptions();
    if (note) {
      editing.isEdit = true; editing.id = note.id;
      editing._originalRefs = (note.imageRefs || []).slice();
      editing._originalThumbRefs = (note.thumbRefs || []).slice();
      $('noteModalTitle').textContent = '编辑灵感';
      $('noteTitle').value = note.title || '';
      $('noteBody').value = note.body || '';
      editing.category = note.category || (collections.length ? collections[0].id : 'uncategorized');
      editing.tags = (note.tags || []).slice();
      renderTagChips(); renderColOptions();
      Promise.all((note.imageRefs || []).map(loadEditingImage)).then(function (imgs) {
        editing.images = imgs.filter(Boolean).map(function (im, idx) { im.thumbId = (note.thumbRefs || [])[idx] || null; return im; });
        renderThumbs();
      });
    } else {
      DB.getDraft().then(function (d) {
        if (d && isDraftMeaningful(d)) {
          editing.title = d.title || ''; editing.body = d.body || '';
          editing.category = d.category || (collections.length ? collections[0].id : 'uncategorized');
          editing.tags = (d.tags || []).slice();
          $('noteTitle').value = editing.title; $('noteBody').value = editing.body;
          renderTagChips(); renderColOptions();
          Promise.all((d.imageIds || []).map(loadEditingImage)).then(function (imgs) {
            editing.images = imgs.filter(Boolean); renderThumbs();
          });
          toast('已恢复未发布的草稿');
        }
      });
    }
    $('noteModal').hidden = false;
    document.body.classList.add('insp-noscroll');
    setTimeout(function () { var f = $('noteImgInput'); if (f) f.focus && f.blur(); }, 50);
  }
  function closeNoteModal() {
    revokeAll(editing ? editing.images.map(function (i) { return i.url; }) : []);
    editing = null;
    $('noteModal').hidden = true;
    document.body.classList.remove('insp-noscroll');
  }

  function publishNote() {
    if (!editing) return;
    if (!editing.category) { toast('请先选择合集（必选）'); return; }
    var note = {
      id: editing.id || undefined,
      title: $('noteTitle').value.trim(),
      body: $('noteBody').value.trim(),
      category: editing.category,
      tags: editing.tags.slice(),
      imageRefs: editing.images.map(function (i) { return i.id; }),
      thumbRefs: editing.images.map(function (i) { return i.thumbId; }),
      trashed: false, trashedAt: null
    };
    var promise = Promise.resolve();
    if (editing.isEdit && editing._originalRefs) {
      var removedImgs = editing._originalRefs.filter(function (id) { return note.imageRefs.indexOf(id) < 0; });
      var removedThumbs = (editing._originalThumbRefs || []).filter(function (id) { return note.thumbRefs.indexOf(id) < 0; });
      promise = Promise.all(removedImgs.map(function (id) { return DB.deleteImage(id).catch(function () {}); })
        .concat(removedThumbs.map(function (id) { return DB.deleteThumbnail(id).catch(function () {}); })));
    }
    var wasEdit = editing.isEdit;
    promise.then(function () { return DB.saveNote(note); })
      .then(function (saved) { return DB.clearDraft().then(function () { return saved; }); })
      .then(function (saved) {
        var id = saved.id;
        closeNoteModal();
        invalidateNotes(); render();
        if (wasEdit) {
          markDirty();
          location.href = 'inspiration-detail.html?id=' + encodeURIComponent(id) + '&from=list';
          gentle({ icon: '✨', title: '更新成功～', sub: '灵感又变得更完整啦 🌸' });
        } else {
          state.cat = 'all'; renderCatBar(); renderTagBar();
          gentle({ icon: '✨', title: '太好啦，灵感已收藏！', sub: '今天也认真记录了呢 💕' });
        }
      })
      .catch(function () { toast('保存失败，请重试'); });
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) { return f.type.indexOf('image/') === 0; });
    var room = 9 - editing.images.length;
    if (files.length > room) { toast('最多 9 张图片，已截取前 ' + room + ' 张'); files = files.slice(0, room); }
    files.forEach(function (file) {
      addImageFromFile(file).then(function (im) { editing.images.push(im); renderThumbs(); saveDraftAuto(); })
        .catch(function () { toast('图片读取失败'); });
    });
  }

  /* ---------- 合集管理 ---------- */
  function openColModal() { renderColList(); $('colModal').hidden = false; }
  function closeColModal() { $('colModal').hidden = true; }
  function renderColList() {
    var list = $('colList'); list.innerHTML = '';
    collections.forEach(function (c, idx) {
      var row = el('div', 'insp-col-row'); row.draggable = !c.fixed; row.dataset.idx = idx;
      var handle = el('span', 'insp-col-handle'); handle.textContent = '⠿'; if (c.fixed) handle.style.visibility = 'hidden';
      row.appendChild(handle);
      var emoji = el('button', 'insp-col-emoji'); emoji.type = 'button'; emoji.textContent = c.emoji;
      emoji.onclick = function () { openColEdit(c); }; row.appendChild(emoji);
      var name = el('button', 'insp-col-name'); name.type = 'button'; name.textContent = c.name + (c.fixed ? '（预设）' : '');
      name.onclick = function () { openColEdit(c); }; row.appendChild(name);
      if (!c.fixed) {
        var del = el('button', 'insp-col-del'); del.type = 'button'; del.textContent = '🗑';
        del.onclick = function () { deleteCol(c); }; row.appendChild(del);
        row.addEventListener('dragstart', function () { colDragFrom = idx; row.classList.add('dragging'); });
        row.addEventListener('dragend', function () { row.classList.remove('dragging'); colDragFrom = null; });
        row.addEventListener('dragover', function (e) { e.preventDefault(); });
        row.addEventListener('drop', function (e) {
          e.preventDefault();
          if (colDragFrom === null || colDragFrom === idx) return;
          var moved = collections.splice(colDragFrom, 1)[0];
          collections.splice(idx, 0, moved);
          collections.forEach(function (cc, i) { cc.order = i + 1; DB.saveCollection(cc).catch(function () {}); });
          renderColList(); renderCatBar();
        });
      }
      list.appendChild(row);
    });
  }
  function deleteCol(c) {
    if (c.fixed) { toast('预设合集不可删除'); return; }
    confirmDialog('删除后「' + c.name + '」下的灵感将移至「未分类」，确认删除？').then(function (ok) {
      if (!ok) return;
      DB.deleteCollection(c.id).then(function () {
        return DB.getCollections();
      }).then(function (cols) {
        collections = cols; renderColList(); renderCatBar(); renderTagBar(); renderColOptions(); invalidateNotes(); render();
        toast('已删除合集，相关灵感移至「未分类」');
      }).catch(function () { toast('删除失败'); });
    });
  }
  function openColEdit(cat) {
    editingCol = cat ? Object.assign({}, cat) : { id: null, name: '', emoji: '✨', fixed: false };
    $('colEditTitle').textContent = cat ? '编辑合集' : '新建合集';
    $('colEditSave').textContent = cat ? '保存' : '创建';
    $('colEditName').value = cat ? cat.name : '';
    $('colEditDelete').hidden = !cat || !!cat.fixed;
    renderEmojiPicker($('colEditEmojiGrid'), editingCol.emoji);
    $('colEditModal').hidden = false;
  }
  function closeColEdit() { $('colEditModal').hidden = true; editingCol = null; }
  function renderEmojiPicker(container, selected) {
    container.innerHTML = '';
    EMOJI_CHOICES.forEach(function (em) {
      var b = el('button', 'insp-emoji-cell' + (em === selected ? ' active' : ''));
      b.type = 'button'; b.textContent = em;
      b.onclick = function () {
        if (editingCol) editingCol.emoji = em;
        Array.prototype.forEach.call(container.children, function (c) { c.classList.remove('active'); });
        b.classList.add('active');
      };
      container.appendChild(b);
    });
  }
  function saveColEdit() {
    if (!editingCol) return;
    var name = $('colEditName').value.trim();
    if (!name) { toast('请输入合集名称'); return; }
    var maxOrder = 0; collections.forEach(function (c) { if (c.order > maxOrder) maxOrder = c.order; });
    var rec = {
      id: editingCol.id || genId('cat'),
      name: name,
      emoji: editingCol.emoji || '✨',
      fixed: !!editingCol.fixed,
      order: editingCol.id ? (editingCol.order || maxOrder + 1) : (maxOrder + 1),
      createdAt: editingCol.createdAt || new Date().toISOString()
    };
    DB.saveCollection(rec).then(function () {
      return DB.getCollections();
    }).then(function (cols) {
      collections = cols; closeColEdit(); renderColList(); renderCatBar(); renderTagBar(); renderColOptions();
      toast(editingCol.id ? '已保存' : '已新建合集 ✨');
    }).catch(function () { toast('保存失败'); });
  }

  /* ---------- 标签筛选 ---------- */
  function openTagModal() {
    var list = $('tagModalList'); list.innerHTML = '';
    var tags = tagsForCurrentCat();
    if (!tags.length) { var e = el('div', 'insp-tag-empty'); e.textContent = '暂无标签'; list.appendChild(e); }
    tags.forEach(function (t) {
      var chip = el('button', 'insp-tag' + (state.tag === t ? ' insp-tag-active' : ''));
      chip.type = 'button'; chip.textContent = '#' + t;
      chip.onclick = function () { state.tag = (state.tag === t) ? '' : t; Array.prototype.forEach.call(list.children, function (c) { c.classList.remove('insp-tag-active'); }); if (state.tag) chip.classList.add('insp-tag-active'); };
      list.appendChild(chip);
    });
    $('tagModal').hidden = false;
  }

  /* ---------- 回收站 ---------- */
  function openTrash() {
    DB.purgeExpiredTrash().then(function () { return DB.getTrashedNotes(); }).then(function (list) {
      var box = $('trashList'); box.innerHTML = '';
      if (!list.length) { var e = el('div', 'insp-trash-empty'); e.textContent = '回收站是空的 🌿'; box.appendChild(e); }
      list.forEach(function (n) {
        var row = el('div', 'insp-trash-row');
        var info = el('div', 'insp-trash-info');
        var c = colInfo(n.category);
        var tt = el('div', 'insp-trash-title'); tt.textContent = (n.title || (c.emoji + ' ' + c.name));
        var sub = el('div', 'insp-trash-sub');
        var days = n.trashedAt ? Math.ceil((Date.now() - new Date(n.trashedAt).getTime()) / 86400000) : 0;
        sub.textContent = '还剩约 ' + Math.max(0, DB.TRASH_DAYS - days) + ' 天可恢复';
        info.appendChild(tt); info.appendChild(sub);
        var acts = el('div', 'insp-trash-acts');
        var rb = el('button', 'insp-btn-mini'); rb.textContent = '恢复';
        rb.onclick = function () { DB.restoreNote(n.id).then(function () { openTrash(); invalidateNotes(); render(); toast('已恢复'); }); };
        var db2 = el('button', 'insp-btn-mini insp-btn-danger'); db2.textContent = '彻底删除';
        db2.onclick = function () {
          confirmDialog('彻底删除后无法恢复，确定吗？').then(function (ok) {
            if (!ok) return;
            DB.deleteNotePermanent(n.id).then(function () { openTrash(); invalidateNotes(); render(); toast('已彻底删除'); });
          });
        };
        acts.appendChild(rb); acts.appendChild(db2);
        row.appendChild(info); row.appendChild(acts); box.appendChild(row);
      });
      $('trashModal').hidden = false;
    });
  }

  /* ---------- 备份 ---------- */
  function exportBackup() {
    DB.exportAll().then(function (data) {
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = '灵感备份-' + (new Date().getFullYear()) + ('0'+(new Date().getMonth()+1)).slice(-2) + ('0'+new Date().getDate()).slice(-2) + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('备份已导出（含图片与合集）');
    }).catch(function () { toast('导出失败'); });
  }
  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        confirmDialog('导入将「合并」到现有灵感（不覆盖、不删除已有内容），确定继续？', '合集与笔记都会追加进来').then(function (ok) {
          if (!ok) return;
          DB.importAll(data).then(function () {
            return DB.getCollections();
          }).then(function (cols) {
            collections = cols; renderCatBar(); renderTagBar(); renderColOptions(); invalidateNotes(); render();
            toast('导入完成 ✨（已合并）');
          }).catch(function () { toast('导入失败：文件损坏'); });
        });
      } catch (e) { toast('导入失败：不是有效的备份文件'); }
    };
    reader.readAsText(file);
  }

  /* ---------- 确认框 ---------- */
  function confirmDialog(msg, sub) {
    return new Promise(function (res) {
      var m = $('confirmModal'); $('confirmMsg').textContent = msg;
      var subEl = $('confirmSub'); if (subEl) { subEl.textContent = sub || ''; subEl.hidden = !sub; }
      m.hidden = false;
      function clean() { m.hidden = true; $('confirmOk').removeEventListener('click', onOk); $('confirmCancel').removeEventListener('click', onCancel); }
      function onOk() { clean(); res(true); }
      function onCancel() { clean(); res(false); }
      $('confirmOk').addEventListener('click', onOk);
      $('confirmCancel').addEventListener('click', onCancel);
    });
  }

  /* ---------- 滚动恢复（内嵌返回详情时） ---------- */
  function saveInspScroll() {
    try { var m = $('inspMain'); if (m) sessionStorage.setItem(SCROLL_KEY, String(m.scrollTop)); } catch (e) {}
  }
  function restoreInspScroll() {
    var saved = 0;
    try { saved = parseInt(sessionStorage.getItem(SCROLL_KEY), 10); } catch (e) {}
    if (!saved || saved <= 0) return;
    var m = $('inspMain'); if (!m) return;
    var tries = 0;
    (function poll() {
      if (m.scrollHeight >= saved + m.clientHeight || tries > 90) {
        try { m.scrollTop = Math.min(saved, Math.max(0, m.scrollHeight - m.clientHeight)); sessionStorage.removeItem(SCROLL_KEY); } catch (e) {}
        return;
      }
      tries++; requestAnimationFrame(poll);
    })();
  }
  window.InspirationScroll = { save: saveInspScroll, restore: restoreInspScroll };

  /* ---------- 跨页刷新（删除/编辑后返回列表时同步最新数据） ---------- */
  // 详情页删除/编辑会置脏标记并广播；列表页在返回(focus/pageshow)或收到广播时重渲染，
  // 避免「删除后卡片还在」的错觉。数据层只增不删，trashNote 仅软删除，回收站 30 天可恢复。
  var DIRTY_KEY = 'wb_insp_dirty';
  var _bc = null;
  function markDirty() {
    try { sessionStorage.setItem(DIRTY_KEY, '1'); } catch (e) {}
    try { (_bc || (_bc = new BroadcastChannel('wb_insp'))).postMessage('mutated'); } catch (e) {}
  }
  function onReturnFocus() {
    var dirty = false;
    try { dirty = !!sessionStorage.getItem(DIRTY_KEY); } catch (e) {}
    if (!dirty) return;
    try { sessionStorage.removeItem(DIRTY_KEY); } catch (e) {}
    invalidateNotes(); render();
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    $('inspHome').onclick = function () {
      if (EMBEDDED && window.App && typeof window.App.switchModule === 'function') window.App.switchModule('home');
      else location.href = 'index.html';
    };
    $('inspSearchBtn').onclick = function () { var s = $('inspSearchbar'); s.hidden = !s.hidden; if (!s.hidden) $('inspSearchInput').focus(); };
    $('inspSearchClose').onclick = function () { $('inspSearchbar').hidden = true; };
    $('inspSearchInput').addEventListener('input', function () { state.q = this.value.trim(); renderTagBar(); render(); });
    $('inspMore').onclick = function () { $('inspMoreMenu').hidden = !$('inspMoreMenu').hidden; };
    $('inspMoreMenu').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
    $('exportMenuItem').onclick = function () { $('inspMoreMenu').hidden = true; exportBackup(); };
    $('importMenuItem').onclick = function () { $('inspMoreMenu').hidden = true; $('importFile').click(); };
    $('trashMenuItem').onclick = function () { $('inspMoreMenu').hidden = true; openTrash(); };
    $('manageColMenuItem').onclick = function () { $('inspMoreMenu').hidden = true; openColModal(); };

    $('inspCatBar').addEventListener('click', function (e) {
      var btn = e.target.closest('.insp-cat-tab'); if (!btn) return;
      var cat = btn.dataset.cat;
      if (cat === '__new') { openColEdit(null); return; }
      state.cat = cat;
      var tags = tagsForCurrentCat();
      if (state.tag && tags.indexOf(state.tag) < 0) state.tag = '';
      Array.prototype.forEach.call(this.querySelectorAll('.insp-cat-tab'), function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      $('inspSearchInput').value = ''; state.q = ''; $('inspSearchbar').hidden = true;
      renderTagBar(); render();
    });
    $('inspTagBar').addEventListener('click', function (e) {
      var btn = e.target.closest('.insp-tag-tab'); if (!btn) return;
      var tag = btn.dataset.tag;
      state.tag = (state.tag === tag || tag === '') ? '' : tag;
      Array.prototype.forEach.call(this.querySelectorAll('.insp-tag-tab'), function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      render();
    });

    $('inspFab').onclick = function () { openNoteModal(null); };
    $('noteModalClose').onclick = closeNoteModal;
    $('notePublish').onclick = publishNote;
    $('noteSaveDraft').onclick = saveDraftNow;
    $('noteImgInput').addEventListener('change', function () { if (this.files) handleFiles(this.files); this.value = ''; });
    $('noteTitle').addEventListener('input', saveDraftAuto);
    $('noteBody').addEventListener('input', saveDraftAuto);
    $('noteColManage').onclick = openColModal;
    $('noteTagAdd').onclick = function () {
      var v = $('noteTagInput').value.trim();
      if (!v) return;
      if (editing.tags.indexOf(v) < 0) editing.tags.push(v);
      $('noteTagInput').value = ''; renderTagChips(); saveDraftAuto();
    };
    $('noteTagInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('noteTagAdd').click(); } });

    $('inspWaterfall').addEventListener('click', function (e) {
      var card = e.target.closest('.insp-card'); if (!card) return;
      var id = card.dataset.id;
      card.classList.add('pressing');
      setTimeout(function () { card.classList.remove('pressing'); }, 180);
      saveInspScroll();
      location.href = 'inspiration-detail.html?id=' + encodeURIComponent(id) + '&from=list';
    });
    var mainEl = $('inspMain');
    if (mainEl) mainEl.addEventListener('scroll', function () {
      if (mainEl.scrollTop + mainEl.clientHeight >= mainEl.scrollHeight - 600) appendNextPage();
    });

    $('colModalClose').onclick = closeColModal;
    $('colModalAdd').onclick = function () { openColEdit(null); };
    $('colEditClose').onclick = closeColEdit;
    $('colEditSave').onclick = saveColEdit;
    $('colEditDelete').onclick = function () { if (editingCol) deleteCol(editingCol); };

    $('tagModalClose').onclick = function () { $('tagModal').hidden = true; };
    $('tagModalDone').onclick = function () { $('tagModal').hidden = true; render(); };
    $('tagModalList').addEventListener('click', function () { /* 选择即时生效，done 关闭 */ });

    $('trashModalClose').onclick = function () { $('trashModal').hidden = true; };

    $('importFile').addEventListener('change', function () { if (this.files && this.files[0]) importBackup(this.files[0]); this.value = ''; });

    $('confirmCancel').onclick = function () { $('confirmModal').hidden = true; };
    $('confirmOk').onclick = function () { /* 由 confirmDialog 内部处理 */ };

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('confirmModal').hidden) $('confirmModal').hidden = true;
        else if (!$('colEditModal').hidden) closeColEdit();
        else if (!$('colModal').hidden) closeColModal();
        else if (!$('tagModal').hidden) $('tagModal').hidden = true;
        else if (!$('trashModal').hidden) $('trashModal').hidden = true;
        else if (!$('noteModal').hidden) closeNoteModal();
        else if (!$('inspMoreMenu').hidden) $('inspMoreMenu').hidden = true;
      }
    });
  }

  /* ---------- 启动 ---------- */
  function mount() {
    var host = document.getElementById('inspRoot');
    if (!host) {
      // 兜底：直接挂到 body
      host = document.createElement('div'); host.id = 'inspRoot'; document.body.appendChild(host);
    }
    host.innerHTML = TEMPLATE;
    EMBEDDED = !!document.getElementById('inspirationModule');
    var app = $('inspApp');
    if (app && EMBEDDED) app.classList.add('insp-embedded');
  }

  function init() {
    if (!DB) { toast('数据层加载失败'); return; }
    mount();
    DB.openDB().then(function () {
      return DB.getCollections();
    }).then(function (cols) {
      collections = cols || [];
      bind();
      // 返回列表时若发生过删除/编辑，自动重渲染以反映最新数据
      window.addEventListener('pageshow', onReturnFocus);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) onReturnFocus(); });
      try { _bc = new BroadcastChannel('wb_insp'); _bc.onmessage = function (e) { if (e.data === 'mutated') onReturnFocus(); }; } catch (e) {}
      renderCatBar(); renderTagBar();
      DB.purgeExpiredTrash().then(function () { invalidateNotes(); render(); });
    }).catch(function (e) {
      console.error(e);
      toast('灵感专区无法启动：' + (e && e.message ? e.message : '未知错误'));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
