/* =========================================================================
 * 灵感专区 — 交互逻辑 (Inspiration Zone UI)  ·  小红书风格改版
 * 完全独立模块：仅依赖 InspirationDB 与自身 DOM，不引用平台原有任何代码。
 * 新增：自定义分类(emoji+管理页)、缩略图序号+拖拽排序、卡片胶囊/标签/日期、
 *       详情轮播圆点指示器、预设快捷标签、字数上限。
 * 图片仍以 Blob 存入 IndexedDB，与系统相册完全解耦（删原图不影响 App 内数据）。
 * ========================================================================= */
(function () {
  'use strict';

  var DB = window.InspirationDB;

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function revokeAll(arr) { (arr || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} }); }
  function esc(s) { return (s == null ? '' : String(s)); }

  var toastTimer = null;
  function toast(msg) {
    var t = $('inspToast'); if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.hidden = true; }, 250); }, 1800);
  }

  // 统一走全局温柔反馈横幅；若 App.feedback 不可用则回退到本地 toast
  function gentle(item) {
    var g = window.App;
    if (g && typeof g.feedback === 'function') { g.feedback(item); return; }
    toast(typeof item === 'string' ? item : ((item && item.title) || ''));
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateZh(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function dateDot(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function dateStr() {
    var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }
  function genId(prefix) { return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

  /* ---------- 分类数据（localStorage，独立于笔记） ---------- */
  var CAT_KEY = 'wb_insp_categories_v1';
  var DEFAULT_CATS = [
    { id: 'outfit', name: '穿搭灵感', emoji: '👗', fixed: true },
    { id: 'makeup', name: '妆容灵感', emoji: '💄', fixed: true }
  ];
  var EMOJI_CHOICES = ['👗','💄','🏠','✈️','🎨','🌸','🍜','🎵','📱','📚','💡','🌿','🐱','👟','👜','💍','🧴','☕','🍰','🌟','💼','🎬','🌈','🔥'];
  var cats = [];
  var UNCATEGORIZED = { id: 'uncategorized', name: '未分类', emoji: '📁', fixed: true };

  function loadCats() {
    try {
      var raw = localStorage.getItem(CAT_KEY);
      if (raw) { cats = JSON.parse(raw); return; }
    } catch (e) {}
    cats = DEFAULT_CATS.map(function (c) { return Object.assign({}, c); });
    persistCats();
  }
  function persistCats() {
    try { localStorage.setItem(CAT_KEY, JSON.stringify(cats)); } catch (e) {}
  }
  function getCats() { return cats.slice(); }
  function catInfo(id) {
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i];
    if (id === 'uncategorized') return UNCATEGORIZED;
    return UNCATEGORIZED;
  }
  function addCategory(name, emoji) {
    var c = { id: genId('cat'), name: name, emoji: emoji || '📁', fixed: false };
    cats.push(c); persistCats(); return c;
  }
  function updateCategory(id, name, emoji) {
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].id === id) { cats[i].name = name; if (emoji) cats[i].emoji = emoji; break; }
    }
    persistCats();
  }
  function removeCategory(id) {
    cats = cats.filter(function (c) { return c.id !== id; });
    persistCats();
  }

  /* ---------- 状态 ---------- */
  var state = { cat: 'all', tag: '', q: '' };
  var editing = null;            // 新建/编辑会话
  var cardUrls = {};             // noteId -> objectURL（瀑布流封面，缩略图）
  var detailUrls = [];           // 详情轮播 objectURL
  var lightboxIndex = 0;
  var currentDetail = null;
  var detailDots = [];           // 详情轮播圆点元素
  var dragFrom = null;           // 缩略图拖拽源索引
  var catDragFrom = null;        // 分类管理拖拽源索引
  var editingCat = null;         // 分类编辑会话 {id,name,emoji,fixed}

  /* ---------- 性能优化：内存缓存 + 分页 ---------- */
  var noteCache = {};            // id -> note（点击详情毫秒级读取）
  var allNotes = [];             // 最近一次全部有效笔记（标签聚合用）
  var currentList = [];          // 当前筛选后的列表（内存）
  var PAGE = 20;                 // 每批渲染数量
  var renderedCount = 0;         // 已渲染数量
  var lastOpenTs = 0;            // 点击防抖时间戳

  /* ---------- 图片处理 ---------- */
  function readImageMeta(file) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = function () { res({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }
  // 生成 200px 宽 WebP 缩略图（瀑布流封面用），失败回退原图
  function makeThumbnail(file, maxW) {
    maxW = maxW || 200;
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || maxW, h = img.naturalHeight || maxW;
        var tw = Math.min(maxW, w), th = Math.max(1, Math.round(h * (tw / w)));
        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        try { canvas.getContext('2d').drawImage(img, 0, 0, tw, th); } catch (e) {}
        URL.revokeObjectURL(url);
        var done = function (blob) { if (blob) res(blob); else rej(new Error('thumb null')); };
        if (canvas.toBlob) {
          canvas.toBlob(function (blob) {
            if (blob) res(blob);
            else canvas.toBlob(done, 'image/png');
          }, 'image/webp', 0.8);
        } else {
          try { canvas.toBlob(done, 'image/png'); } catch (e) { rej(e); }
        }
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
          }).catch(function () {
            info.thumbUrl = info.url; info.thumbId = null; return info;
          });
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

  /* ---------- 瀑布流渲染（筛选 + 分页 + 缩略图 + 内存缓存） ---------- */
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
      if (state.cat !== 'all' && n.category !== state.cat) return false;
      if (state.tag && (!n.tags || n.tags.indexOf(state.tag) < 0)) return false;
      if (!matchQuery(n, state.q)) return false;
      return true;
    });
  }
  function tagsForCurrentCat() {
    var set = {};
    allNotes.forEach(function (n) {
      if (state.cat !== 'all' && n.category !== state.cat) return;
      (n.tags || []).forEach(function (t) { set[t] = 1; });
    });
    return Object.keys(set).sort();
  }

  // 一级分类栏（横向滚动）
  function renderCatBar() {
    var bar = $('inspCatBar'); if (!bar) return; bar.innerHTML = '';
    var all = el('button', 'insp-cat-tab' + (state.cat === 'all' ? ' active' : ''));
    all.dataset.cat = 'all'; all.textContent = '全部'; bar.appendChild(all);
    getCats().forEach(function (c) {
      var b = el('button', 'insp-cat-tab' + (state.cat === c.id ? ' active' : ''));
      b.dataset.cat = c.id; b.textContent = c.emoji + ' ' + c.name; bar.appendChild(b);
    });
    var add = el('button', 'insp-cat-tab insp-cat-tab-new'); add.dataset.cat = '__new'; add.textContent = '＋'; bar.appendChild(add);
  }
  // 二级标签栏（横向滚动）
  function renderTagBar() {
    var bar = $('inspTagBar'); if (!bar) return; bar.innerHTML = '';
    var all = el('button', 'insp-tag-tab' + (state.tag === '' ? ' active' : ''));
    all.dataset.tag = ''; all.textContent = '全部'; bar.appendChild(all);
    tagsForCurrentCat().forEach(function (t) {
      var b = el('button', 'insp-tag-tab' + (state.tag === t ? ' active' : ''));
      b.dataset.tag = t; b.textContent = '#' + t; bar.appendChild(b);
    });
  }

  function loadCoverThumb(n) {
    var hasThumb = n.thumbRefs && n.thumbRefs[0];
    var ref = hasThumb ? n.thumbRefs[0] : (n.imageRefs && n.imageRefs[0]);
    if (!ref) return Promise.resolve(null);
    var getter = hasThumb ? DB.getThumbnailBlob(ref) : DB.getImageBlob(ref);
    return getter.then(function (blob) { return blob ? URL.createObjectURL(blob) : null; }).catch(function () { return null; });
  }

  function render() {
    DB.getActiveNotes().then(function (notes) {
      allNotes = notes;
      var filtered = filterNotes(notes);
      currentList = filtered;
      filtered.forEach(function (n) { noteCache[n.id] = n; });
      renderCatBar();
      renderTagBar();

      revokeCardUrls();
      var waterfall = $('inspWaterfall');
      waterfall.innerHTML = '';
      renderedCount = 0;
      if (!filtered.length) { $('inspEmpty').hidden = false; } else { $('inspEmpty').hidden = true; }
      appendNextPage();
      restoreInspScroll(); // 从详情返回时恢复瀑布流滚动位置
    });
  }

  function appendNextPage() {
    if (renderedCount >= currentList.length) return;
    var start = renderedCount;
    var end = Math.min(start + PAGE, currentList.length);
    var page = currentList.slice(start, end);
    Promise.all(page.map(function (n) {
      return loadCoverThumb(n).then(function (url) {
        if (url) cardUrls[n.id] = url;
        return n;
      }).catch(function () { return n; });
    })).then(function (list) {
      var waterfall = $('inspWaterfall');
      list.forEach(function (n) { waterfall.appendChild(cardEl(n)); });
      renderedCount = end;
    });
  }

  function cardEl(note) {
    var card = el('div', 'insp-card'); card.dataset.id = note.id;
    if (cardUrls[note.id]) {
      var img = el('img', 'insp-card-cover');
      img.src = cardUrls[note.id]; img.alt = ''; img.loading = 'lazy';
      img.onload = function () { img.classList.add('loaded'); };
      card.appendChild(img);
      if ((note.imageRefs || []).length > 1) {
        var cnt = el('div', 'insp-card-count'); cnt.textContent = '1/' + note.imageRefs.length; card.appendChild(cnt);
      }
    } else {
      var c = catInfo(note.category);
      var ph = el('div', 'insp-card-ph'); ph.textContent = c.emoji; card.appendChild(ph);
    }
    var body = el('div', 'insp-card-body');
    if (note.title) { var t = el('div', 'insp-card-title'); t.textContent = note.title; body.appendChild(t); }
    if (note.body) { var d = el('div', 'insp-card-desc'); d.textContent = note.body; body.appendChild(d); }
    var foot = el('div', 'insp-card-foot');
    var c2 = catInfo(note.category);
    var cat = el('span', 'insp-pill'); cat.textContent = c2.emoji + ' ' + c2.name; foot.appendChild(cat);
    body.appendChild(foot);
    if (note.tags && note.tags.length) {
      var tags = el('div', 'insp-card-tags');
      note.tags.slice(0, 4).forEach(function (tg) { var s = el('span', 'insp-mini-tag'); s.textContent = '#' + tg; tags.appendChild(s); });
      body.appendChild(tags);
    }
    var dt = el('div', 'insp-card-date'); dt.textContent = '📅 ' + dateDot(note.createdAt); body.appendChild(dt);
    card.appendChild(body);
    return card;
  }

  /* ---------- 新建 / 编辑 笔记 ---------- */
  var PRESET_TAGS = ['通勤', '校园', '约会', '秋冬', '极简', '法式', '复古', '运动', '淡颜', '日常妆', '约会妆', '伪素颜', '复古妆', '欧美妆'];

  function isDraftMeaningful(d) {
    return (d && (d.title || d.body || d.category || (d.tags && d.tags.length) || (d.imageIds && d.imageIds.length)));
  }
  function snapshotDraft() {
    return {
      title: $('noteTitle').value.trim(),
      body: $('noteBody').value.trim(),
      category: editing.category,
      tags: editing.tags.slice(),
      imageIds: editing.images.map(function (i) { return i.id; })
    };
  }
  var draftTimer = null;
  function saveDraftAuto() {
    if (!$('noteModal').hidden && isDraftMeaningful(snapshotDraft())) {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(function () { DB.saveDraft(snapshotDraft()); }, 600);
    }
  }
  function saveDraftNow() {
    if (!isDraftMeaningful(snapshotDraft())) { toast('还没有可保存的内容'); return; }
    DB.saveDraft(snapshotDraft()).then(function () { toast('草稿已保存'); });
  }

  function renderThumbs() {
    var box = $('noteThumbs'); box.innerHTML = '';
    var total = editing.images.length;
    editing.images.forEach(function (im, idx) {
      var th = el('div', 'insp-thumb');
      th.draggable = true;
      var img = el('img'); img.src = im.url; th.appendChild(img);
      var badge = el('span', 'insp-thumb-badge'); badge.textContent = (idx + 1) + '/' + total; th.appendChild(badge);
      var del = el('button', 'insp-thumb-del'); del.textContent = '×'; del.type = 'button';
      del.onclick = function (e) {
        e.stopPropagation();
        URL.revokeObjectURL(im.url);
        editing.images.splice(idx, 1);
        renderThumbs(); saveDraftAuto();
      };
      th.appendChild(del);
      // 拖拽排序
      th.addEventListener('dragstart', function (e) { dragFrom = idx; th.classList.add('dragging'); try { e.dataTransfer.effectAllowed = 'move'; } catch (err) {} });
      th.addEventListener('dragend', function () { th.classList.remove('dragging'); dragFrom = null; });
      th.addEventListener('dragover', function (e) { e.preventDefault(); });
      th.addEventListener('drop', function (e) {
        e.preventDefault();
        if (dragFrom === null || dragFrom === idx) return;
        var moved = editing.images.splice(dragFrom, 1)[0];
        editing.images.splice(idx, 0, moved);
        renderThumbs(); saveDraftAuto();
      });
      box.appendChild(th);
    });
  }
  function renderTagChips() {
    var box = $('noteTagChips'); box.innerHTML = '';
    editing.tags.forEach(function (t, idx) {
      var chip = el('span', 'insp-tag insp-tag-removable');
      chip.textContent = '#' + t;
      var x = el('span', 'insp-tag-x'); x.textContent = '×';
      x.onclick = function () { editing.tags.splice(idx, 1); renderTagChips(); saveDraftAuto(); };
      chip.appendChild(x); box.appendChild(chip);
    });
  }
  function renderPresetTags() {
    var box = $('noteTagPresets'); if (!box) return; box.innerHTML = '';
    PRESET_TAGS.forEach(function (t) {
      var chip = el('button', 'insp-tag insp-tag-preset'); chip.type = 'button';
      chip.textContent = '+' + t;
      chip.onclick = function () {
        if (editing.tags.indexOf(t) < 0) { editing.tags.push(t); renderTagChips(); saveDraftAuto(); }
      };
      box.appendChild(chip);
    });
  }
  function renderCatOptions() {
    var box = $('noteCatOptions'); if (!box) return; box.innerHTML = '';
    getCats().forEach(function (c) {
      var lab = el('label', 'insp-cat-opt');
      var rb = el('input'); rb.type = 'radio'; rb.name = 'noteCat'; rb.value = c.id;
      if (editing.category === c.id) rb.checked = true;
      rb.addEventListener('change', function () { if (this.checked) { editing.category = c.id; saveDraftAuto(); } });
      lab.appendChild(rb);
      var span = el('span'); span.textContent = ' ' + c.emoji + ' ' + c.name; lab.appendChild(span);
      box.appendChild(lab);
    });
    var mgmt = el('button', 'insp-cat-manage'); mgmt.type = 'button';
    mgmt.textContent = '⚙️ 管理分类';
    mgmt.onclick = openCatManage;
    box.appendChild(mgmt);
  }

  function openNoteModal(note) {
    editing = { id: null, title: '', body: '', category: '', tags: [], images: [], isEdit: false, _originalRefs: [] };
    $('noteModalTitle').textContent = '新建灵感笔记';
    $('noteTitle').value = ''; $('noteBody').value = '';
    renderTagChips(); renderThumbs(); renderPresetTags(); renderCatOptions();

    if (note) {
      editing.isEdit = true; editing.id = note.id;
      editing._originalRefs = (note.imageRefs || []).slice();
      editing._originalThumbRefs = (note.thumbRefs || []).slice();
      $('noteModalTitle').textContent = '编辑灵感笔记';
      $('noteTitle').value = note.title || '';
      $('noteBody').value = note.body || '';
      editing.category = note.category || '';
      editing.tags = (note.tags || []).slice();
      renderTagChips();
      Promise.all((note.imageRefs || []).map(loadEditingImage)).then(function (imgs) {
        editing.images = imgs.filter(Boolean).map(function (im, idx) {
          im.thumbId = (note.thumbRefs || [])[idx] || null;
          return im;
        });
        renderThumbs();
      });
    } else {
      DB.getDraft().then(function (d) {
        if (d && isDraftMeaningful(d)) {
          editing.title = d.title || ''; editing.body = d.body || '';
          editing.category = d.category || ''; editing.tags = (d.tags || []).slice();
          $('noteTitle').value = editing.title; $('noteBody').value = editing.body;
          renderTagChips(); renderCatOptions();
          Promise.all((d.imageIds || []).map(loadEditingImage)).then(function (imgs) {
            editing.images = imgs.filter(Boolean); renderThumbs();
          });
          toast('已恢复未发布的草稿');
        }
      });
    }
    $('noteModal').hidden = false;
    document.body.classList.add('insp-noscroll');
  }

  function closeNoteModal() {
    revokeAll(editing ? editing.images.map(function (i) { return i.url; }) : []);
    editing = null;
    $('noteModal').hidden = true;
    document.body.classList.remove('insp-noscroll');
  }

  function publishNote() {
    if (!editing) return;
    if (!editing.category) { toast('请先选择分类（必选）'); return; }
    if (!editing.images.length) { toast('请至少上传一张图片（必填）'); return; }
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
        render();
        if (wasEdit) {
          location.href = 'inspiration-detail.html?id=' + encodeURIComponent(id) + '&from=list';
          gentle({ icon: '✨', title: '更新成功～', sub: '灵感又变得更完整啦 🌸' });
        } else {
          state.cat = 'all'; renderCatBar(); renderTagBar(); window.scrollTo({ top: 0, behavior: 'smooth' });
          gentle({ icon: '✨', title: '太好啦，灵感已收藏！', sub: '今天也认真记录了呢 💕' });
        }
      });
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

  /* ---------- 详情 ---------- */
  function openDetail(id, noteOpt) {
    var proceed = function (note) {
      if (!note) return;
      currentDetail = note;
      revokeAll(detailUrls); detailUrls = []; detailDots = [];
      var body = $('detailBody'); body.innerHTML = '';
      var carousel = el('div', 'insp-carousel');
      var refs = note.imageRefs || [];
      var pageInd = null;
      if (refs.length > 1) {
        pageInd = el('div', 'insp-page-indicator'); pageInd.textContent = '1/' + refs.length; carousel.appendChild(pageInd);
      }
      var c = catInfo(note.category);
      if (!refs.length) {
        var ph = el('div', 'insp-detail-ph'); ph.textContent = c.emoji; carousel.appendChild(ph);
      }
      Promise.all(refs.map(function (iid) {
        return DB.getImageBlob(iid).then(function (blob) {
          if (!blob) return null;
          var u = URL.createObjectURL(blob); detailUrls.push(u);
          var slide = el('div', 'insp-slide');
          var sph = el('div', 'insp-slide-ph'); sph.textContent = c.emoji; slide.appendChild(sph);
          var img = el('img', 'insp-slide-img'); img.src = u;
          img.onload = function () { if (sph.parentNode) sph.parentNode.removeChild(sph); };
          img.onerror = function () { if (sph.parentNode) sph.parentNode.removeChild(sph); };
          img.onclick = function () { openLightbox(detailUrls.indexOf(u)); };
          slide.appendChild(img); return slide;
        }).catch(function () { return null; });
      })).then(function (slides) {
        slides.filter(Boolean).forEach(function (s) { carousel.appendChild(s); });
        body.appendChild(carousel);

        // 圆点指示器
        if (refs.length > 1) {
          var dots = el('div', 'insp-dots');
          refs.forEach(function (_, i) {
            var dot = el('span', 'insp-dot' + (i === 0 ? ' active' : ''));
            dots.appendChild(dot); detailDots.push(dot);
          });
          body.appendChild(dots);
          carousel.onscroll = function () {
            var idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
            detailDots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
            if (pageInd) pageInd.textContent = (idx + 1) + '/' + refs.length;
          };
        }

        var content = el('div', 'insp-detail-content');
        if (note.title) { var t = el('h2', 'insp-detail-title'); t.textContent = note.title; content.appendChild(t); }
        if (note.body) { var b = el('div', 'insp-detail-text'); b.textContent = note.body; content.appendChild(b); }
        var c2 = catInfo(note.category);
        var foot = el('div', 'insp-detail-foot');
        var cat = el('span', 'insp-detail-cat'); cat.textContent = '📂 ' + c2.name; foot.appendChild(cat);
        if (note.tags && note.tags.length) {
          var tags = el('div', 'insp-detail-tags');
          note.tags.forEach(function (tg) { var s = el('span', 'insp-tag'); s.textContent = '#' + tg; tags.appendChild(s); });
          foot.appendChild(tags);
        }
        content.appendChild(foot);
        var date = el('div', 'insp-detail-date'); date.textContent = '📅 收藏于 ' + dateZh(note.createdAt); content.appendChild(date);
        body.appendChild(content);
        $('detailView').hidden = false;
        document.body.classList.add('insp-noscroll');
      });
    };
    if (noteOpt) { proceed(noteOpt); }
    else { DB.getNote(id).then(proceed); }
  }
  function closeDetail() {
    revokeAll(detailUrls); detailUrls = []; detailDots = [];
    $('detailView').hidden = true;
    $('detailMoreMenu').hidden = true;
    document.body.classList.remove('insp-noscroll');
  }
  function copyNoteText(note) {
    var text = (note.title ? note.title + '\n' : '') + (note.body || '') + '\n标签：' + (note.tags || []).join('、');
    function fallback(s) {
      var ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('已复制全部文字'); } catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制全部文字'); }, function () { fallback(text); });
    } else fallback(text);
  }
  function deleteNote(id) {
    confirmDialog('确定要删除这条灵感吗？', '删除后无法恢复哦 💔').then(function (ok) {
      if (!ok) return;
      DB.deleteNotePermanent(id).then(function () { closeDetail(); render(); gentle({ icon: '🍃', title: '已删除', sub: '没关系，美好还在心里 💭' }); });
    });
  }

  /* ---------- 灯箱 ---------- */
  function openLightbox(i) {
    if (!detailUrls.length) return;
    lightboxIndex = (i + detailUrls.length) % detailUrls.length;
    var img = $('lightboxImg'); img.src = detailUrls[lightboxIndex];
    img.style.transform = ''; if (img.classList) img.classList.remove('zoomed');
    $('lightbox').hidden = false;
  }
  function closeLightbox() { $('lightbox').hidden = true; }
  function lightboxStep(d) { openLightbox(lightboxIndex + d); }

  // 灯箱双指缩放 / 双击放大（轻量实现，不依赖第三方库）
  function bindLightboxZoom() {
    var img = $('lightboxImg'); if (!img) return;
    var pointers = {};
    var startDist = 0, startScale = 1, scale = 1, lastX = 0, lastY = 0, tx = 0, ty = 0, startTx = 0, startTy = 0;
    function apply() { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; img.classList.toggle('zoomed', scale > 1.05); }
    img.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { img.setPointerCapture(e.pointerId); } catch (err) {}
      var ks = Object.keys(pointers);
      if (ks.length === 1) { lastX = e.clientX; lastY = e.clientY; startTx = tx; startTy = ty; }
      else if (ks.length === 2) { var p1 = pointers[ks[0]], p2 = pointers[ks[1]]; startDist = Math.hypot(p1.x - p2.x, p1.y - p2.y); startScale = scale; }
    });
    img.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ks = Object.keys(pointers);
      if (ks.length >= 2) {
        var p1 = pointers[ks[0]], p2 = pointers[ks[1]];
        var d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        scale = Math.min(4, Math.max(1, startScale * (startDist ? d / startDist : 1)));
      } else if (scale > 1.02) {
        tx = startTx + (e.clientX - lastX); ty = startTy + (e.clientY - lastY);
      }
      apply();
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length === 0 && scale <= 1.02) { tx = 0; ty = 0; apply(); }
    }
    img.addEventListener('pointerup', up);
    img.addEventListener('pointercancel', up);
    img.addEventListener('dblclick', function () { scale = scale > 1.02 ? 1 : 2.5; tx = 0; ty = 0; apply(); });
  }

  /* ---------- 分类管理 ---------- */
  function openCatManage() {
    renderCatManage();
    $('catManageModal').hidden = false;
  }
  function closeCatManage() { $('catManageModal').hidden = true; }

  function renderCatManage() {
    var list = $('catManageList'); list.innerHTML = '';
    getCats().forEach(function (c, idx) {
      var row = el('div', 'insp-cat-row');
      row.draggable = !c.fixed;
      row.dataset.idx = idx;
      var handle = el('span', 'insp-cat-handle'); handle.textContent = '⠿'; if (c.fixed) handle.style.visibility = 'hidden';
      row.appendChild(handle);
      var emoji = el('button', 'insp-cat-emoji'); emoji.type = 'button'; emoji.textContent = c.emoji;
      emoji.onclick = function () { openCatEdit(c); };
      row.appendChild(emoji);
      var name = el('button', 'insp-cat-name'); name.type = 'button'; name.textContent = c.name + (c.fixed ? '（预设）' : '');
      name.onclick = function () { openCatEdit(c); };
      row.appendChild(name);
      if (!c.fixed) {
        var del = el('button', 'insp-cat-del'); del.type = 'button'; del.textContent = '🗑';
        del.onclick = function () { deleteCat(c); };
        row.appendChild(del);
        row.addEventListener('dragstart', function () { catDragFrom = idx; row.classList.add('dragging'); });
        row.addEventListener('dragend', function () { row.classList.remove('dragging'); catDragFrom = null; });
        row.addEventListener('dragover', function (e) { e.preventDefault(); });
        row.addEventListener('drop', function (e) {
          e.preventDefault();
          if (catDragFrom === null || catDragFrom === idx) return;
          var moved = cats.splice(catDragFrom, 1)[0];
          cats.splice(idx, 0, moved); persistCats(); renderCatManage(); renderCatBar(); renderTagBar();
        });
      }
      list.appendChild(row);
    });
  }

  function deleteCat(cat) {
    if (cat.fixed) { toast('预设分类不可删除'); return; }
    confirmDialog('删除后该分类下的所有灵感将移至「未分类」，确认删除？').then(function (ok) {
      if (!ok) return;
      DB.getAllNotes().then(function (notes) {
        return Promise.all(notes.map(function (n) {
          if (n.category === cat.id) { n.category = 'uncategorized'; return DB.saveNote(n); }
          return null;
        }));
      }).then(function () {
        removeCategory(cat.id);
        renderCatManage(); renderCatBar(); renderTagBar(); renderCatOptions(); render();
        toast('已删除分类，相关灵感移至「未分类」');
      });
    });
  }

  function openCatEdit(cat) {
    editingCat = cat ? Object.assign({}, cat) : { id: null, name: '', emoji: '👗', fixed: false };
    $('catEditTitle').textContent = cat ? '编辑分类' : '新建分类';
    $('catEditSave').textContent = cat ? '保存' : '创建';
    $('catEditName').value = cat ? cat.name : '';
    renderEmojiPicker($('catEditEmojiGrid'), editingCat.emoji);
    $('catEditModal').hidden = false;
  }
  function closeCatEdit() { $('catEditModal').hidden = true; editingCat = null; }

  function renderEmojiPicker(container, selected) {
    container.innerHTML = '';
    EMOJI_CHOICES.forEach(function (em) {
      var b = el('button', 'insp-emoji-cell' + (em === selected ? ' active' : ''));
      b.type = 'button'; b.textContent = em;
      b.onclick = function () {
        if (editingCat) editingCat.emoji = em;
        Array.prototype.forEach.call(container.children, function (c) { c.classList.remove('active'); });
        b.classList.add('active');
      };
      container.appendChild(b);
    });
  }

  function saveCatEdit() {
    if (!editingCat) return;
    var name = $('catEditName').value.trim();
    if (!name) { toast('请输入分类名称'); return; }
    if (editingCat.id) {
      updateCategory(editingCat.id, name, editingCat.emoji);
    } else {
      addCategory(name, editingCat.emoji);
    }
    closeCatEdit();
    renderCatManage(); renderCatBar(); renderTagBar(); renderCatOptions();
    toast(editingCat.id ? '已保存' : '已新建分类 ✨');
  }

  /* ---------- 回收站 ---------- */
  function openTrash() {
    DB.purgeExpiredTrash().then(function () {
      return DB.getTrashedNotes();
    }).then(function (list) {
      var box = $('trashList'); box.innerHTML = '';
      if (!list.length) { var e = el('div', 'insp-trash-empty'); e.textContent = '回收站是空的 🌿'; box.appendChild(e); }
      list.forEach(function (n) {
        var row = el('div', 'insp-trash-row');
        var info = el('div', 'insp-trash-info');
        var c = catInfo(n.category);
        var tt = el('div', 'insp-trash-title'); tt.textContent = (n.title || (c.emoji + ' ' + c.name));
        var sub = el('div', 'insp-trash-sub');
        var days = n.trashedAt ? Math.ceil((Date.now() - new Date(n.trashedAt).getTime()) / 86400000) : 0;
        sub.textContent = '删除于 ' + formatTime(n.trashedAt) + ' · 还剩约 ' + Math.max(0, DB.TRASH_DAYS - days) + ' 天可恢复';
        info.appendChild(tt); info.appendChild(sub);
        var acts = el('div', 'insp-trash-acts');
        var rb = el('button', 'insp-btn-mini'); rb.textContent = '恢复'; rb.onclick = function () {
          DB.restoreNote(n.id).then(function () { openTrash(); render(); toast('已恢复'); });
        };
        var db2 = el('button', 'insp-btn-mini insp-btn-danger'); db2.textContent = '彻底删除'; db2.onclick = function () {
          confirmDialog('彻底删除后无法恢复，确定吗？').then(function (ok) {
            if (!ok) return;
            DB.deleteNotePermanent(n.id).then(function () { openTrash(); render(); toast('已彻底删除'); });
          });
        };
        acts.appendChild(rb); acts.appendChild(db2);
        row.appendChild(info); row.appendChild(acts); box.appendChild(row);
      });
      $('trashView').hidden = false;
    });
  }

  /* ---------- 备份 ---------- */
  function exportBackup() {
    DB.exportAll().then(function (data) {
      data.categories = getCats();
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = '灵感专区备份-' + dateStr() + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('备份已导出（含图片）');
    });
  }
  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        confirmDialog('导入将合并到现有灵感笔记，确定继续？').then(function (ok) {
          if (!ok) return;
          DB.importAll(data, 'merge').then(function () {
            if (data.categories && Array.isArray(data.categories)) {
              // 仅合并用户自定义分类（不动预设）
              data.categories.forEach(function (c) {
                if (!c.fixed && !cats.some(function (x) { return x.id === c.id; })) cats.push(Object.assign({}, c));
              });
              persistCats();
            }
            renderCatBar(); renderTagBar(); renderCatOptions(); render(); toast('导入完成 ✨');
          }).catch(function () { toast('导入失败：文件损坏'); });
        });
      } catch (e) { toast('导入失败：不是有效的备份文件'); }
    };
    reader.readAsText(file);
  }

  /* ---------- 通用确认框 ---------- */
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

  /* ---------- 事件绑定 ---------- */
  function bind() {
    $('inspHome').onclick = function () { location.href = 'index.html'; };
    $('inspSearchCurrent').onclick = function () { var s = $('inspSearchbar'); s.hidden = !s.hidden; if (!s.hidden) $('inspSearchInput').focus(); };
    $('inspSearchClose').onclick = function () { $('inspSearchbar').hidden = true; };
    $('inspSearchInput').addEventListener('input', function () {
      state.q = this.value.trim(); renderTagBar(); render();
    });
    $('inspMore').onclick = function () { $('inspMoreMenu').hidden = !$('inspMoreMenu').hidden; };
    $('inspMoreMenu').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
    $('exportMenuItem').onclick = function () { $('inspMoreMenu').hidden = true; exportBackup(); };
    $('importMenuItem').onclick = function () { $('inspMoreMenu').hidden = true; $('importFile').click(); };
    $('trashMenuItem').onclick = function () { $('inspMoreMenu').hidden = true; openTrash(); };
    $('importFile').addEventListener('change', function () {
      if (this.files && this.files[0]) importBackup(this.files[0]); this.value = '';
    });
    $('trashClose').onclick = function () { $('trashView').hidden = true; };

    $('inspCatBar').addEventListener('click', function (e) {
      var btn = e.target.closest('.insp-cat-tab'); if (!btn) return;
      var cat = btn.dataset.cat;
      if (cat === '__new') { openCatEdit(null); return; }
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
    $('notePublish').textContent = '添加';
    $('notePublish').onclick = publishNote;
    $('noteSaveDraft').onclick = saveDraftNow;
    $('noteImgInput').addEventListener('change', function () { if (this.files) handleFiles(this.files); this.value = ''; });
    $('noteTitle').addEventListener('input', saveDraftAuto);
    $('noteTitle').addEventListener('input', function () { var m = $('noteTitleCount'); if (m) m.textContent = this.value.length + '/30'; });
    $('noteBody').addEventListener('input', saveDraftAuto);
    $('noteBody').addEventListener('input', function () { var m = $('noteBodyCount'); if (m) m.textContent = this.value.length + '/500'; });
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
      saveInspScroll(); // 跳转详情前记录瀑布流滚动位置，返回时恢复（参考小红书）
      // 跳转独立详情页（全新页面，非本页弹层展开，整卡可点必跳）；from=list 用于返回时回到灵感列表
      location.href = 'inspiration-detail.html?id=' + encodeURIComponent(id) + '&from=list';
    });
    var mainEl = $('inspMain');
    if (mainEl) mainEl.addEventListener('scroll', function () {
      if (mainEl.scrollTop + mainEl.clientHeight >= mainEl.scrollHeight - 600) appendNextPage();
    });

    $('detailClose').onclick = closeDetail;
    $('detailMore').onclick = function () { $('detailMoreMenu').hidden = !$('detailMoreMenu').hidden; };
    $('detailMoreMenu').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
    $('detailEdit').onclick = function () { $('detailMoreMenu').hidden = true; if (currentDetail) openNoteModal(currentDetail); };
    $('detailDelete').onclick = function () { $('detailMoreMenu').hidden = true; if (currentDetail) deleteNote(currentDetail.id); };
    $('detailCancel').onclick = function () { $('detailMoreMenu').hidden = true; };

    $('lightboxClose').onclick = closeLightbox;
    $('lightboxPrev').onclick = function () { lightboxStep(-1); };
    $('lightboxNext').onclick = function () { lightboxStep(1); };
    bindLightboxZoom();

    // 分类管理
    $('catManageClose').onclick = closeCatManage;
    $('catManageAdd').onclick = function () { openCatEdit(null); };
    $('catEditClose').onclick = closeCatEdit;
    $('catEditSave').onclick = saveCatEdit;

    $('confirmCancel').onclick = function () { $('confirmModal').hidden = true; };
    $('confirmOk').onclick = function () { /* 由 confirmDialog 内部处理 */ };

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('lightbox').hidden) closeLightbox();
        else if (!$('catEditModal').hidden) closeCatEdit();
        else if (!$('catManageModal').hidden) closeCatManage();
        else if (!$('detailView').hidden) closeDetail();
        else if (!$('noteModal').hidden) closeNoteModal();
        else if (!$('tagModal').hidden) $('tagModal').hidden = true;
        else if (!$('trashView').hidden) $('trashView').hidden = true;
        else if (!$('inspMoreMenu').hidden) $('inspMoreMenu').hidden = true;
        else if (!$('detailMoreMenu').hidden) $('detailMoreMenu').hidden = true;
      }
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    if (!DB) { toast('数据层加载失败'); return; }
    loadCats();
    DB.openDB().then(function () {
      bind();
      renderCatBar(); renderTagBar();
      DB.purgeExpiredTrash().then(render);
    }).catch(function (e) {
      console.error(e);
      toast('灵感专区无法启动：' + (e && e.message ? e.message : '未知错误'));
    });
  }

  /* ---------- 瀑布流滚动位置记忆（详情返回时恢复，参考小红书） ---------- */
  var SCROLL_KEY = 'wb_insp_scroll';
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
