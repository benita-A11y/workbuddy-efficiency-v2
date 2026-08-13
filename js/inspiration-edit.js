/* =========================================================================
 * 灵感编辑页（独立页面）
 * 复用 InspirationDB；读取 ?id= 对应的笔记，可改图片/标题/正文/合集/标签，
 * 保存回详情页。合集动态渲染（与列表页同一套自定义合集），并支持内联新建合集。
 * ========================================================================= */
(function () {
  'use strict';

  var DB = window.InspirationDB;
  var note = null;
  var images = [];          // [{ id, url, thumbId }]
  var originalRefs = [];
  var originalThumbRefs = [];
  var collections = [];
  var editing = { category: 'uncategorized', tags: [] };
  var editingCol = { id: null, name: '', emoji: '✨' };
  var $ = function (id) { return document.getElementById(id); };

  var EMOJI_CHOICES = ['👗','💄','🏠','✈️','🎨','🌸','🍜','🎵','📱','📚','💡','🌿','🐱','👟','👜','💍','🧴','☕','🍰','🌟','💼','🎬','🌈','🔥','🍃','🌷','🪴','🧥','👠','💅'];
  var PRESET_TAGS = ['通勤','校园','约会','秋冬','极简','法式','复古','运动','淡颜','日常妆','约会妆','伪素颜','复古妆','欧美妆','黄皮','显白','高级感','小个子'];

  function getParam(name) {
    var m = window.location.href.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function toast(msg) {
    var t = $('inseToast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.hidden = true; }, 250); }, 1800);
  }

  function readMeta(file) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = function () { res({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }
  function makeThumb(file, maxW) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxW / (w || 1));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) { if (b) res(b); else rej(new Error('thumb fail')); }, 'image/webp', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode fail')); };
      img.src = url;
    });
  }

  /* ---------- 图片网格 ---------- */
  function renderThumbs() {
    var box = $('inseThumbs'); box.innerHTML = '';
    var total = images.length;
    images.forEach(function (im, idx) {
      var th = document.createElement('div'); th.className = 'inse-thumb'; th.draggable = true;
      var img = document.createElement('img'); img.src = im.url; th.appendChild(img);
      var badge = document.createElement('span'); badge.className = 'inse-thumb-badge';
      badge.textContent = (idx + 1) + '/' + total; th.appendChild(badge);
      var del = document.createElement('button'); del.className = 'inse-thumb-del';
      del.type = 'button'; del.textContent = '×'; del.setAttribute('aria-label', '删除');
      del.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        if (im._urlObj) URL.revokeObjectURL(im._urlObj);
        URL.revokeObjectURL(im.url);
        images.splice(idx, 1); renderThumbs();
      };
      th.appendChild(del);
      th.addEventListener('dragstart', function (e) { th.draggable = true; th.classList.add('dragging'); window.__dragFrom = idx; try { e.dataTransfer.effectAllowed = 'move'; } catch (err) {} });
      th.addEventListener('dragend', function () { th.classList.remove('dragging'); window.__dragFrom = null; });
      th.addEventListener('dragover', function (e) { e.preventDefault(); });
      th.addEventListener('drop', function (e) {
        e.preventDefault();
        var from = window.__dragFrom;
        if (from === null || from === undefined || from === idx) return;
        var moved = images.splice(from, 1)[0];
        images.splice(idx, 0, moved); renderThumbs();
      });
      box.appendChild(th);
    });
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) { return f.type.indexOf('image/') === 0; });
    var room = 9 - images.length;
    if (files.length > room) { toast('最多 9 张图片，已截取前 ' + room + ' 张'); files = files.slice(0, room); }
    files.forEach(function (file) {
      readMeta(file).then(function (m) {
        return DB.addImage(file, file.type, m.w, m.h).then(function (id) {
          return makeThumb(file, 400).then(function (tb) {
            return DB.addThumbnail(tb, tb.type || 'image/webp', m.w, m.h).then(function (tid) {
              return { id: id, thumbId: tid };
            });
          }).catch(function () { return { id: id, thumbId: null }; });
        }).then(function (ref) {
          var u = URL.createObjectURL(file);
          var item = { id: ref.id, thumbId: ref.thumbId, url: u, _urlObj: u };
          images.push(item); renderThumbs();
        });
      }).catch(function () { toast('图片读取失败'); });
    });
  }

  /* ---------- 标签 ---------- */
  function renderTagChips() {
    var box = $('inseTagChips'); box.innerHTML = '';
    editing.tags.forEach(function (t, idx) {
      var chip = document.createElement('span'); chip.className = 'insp-tag insp-tag-removable'; chip.textContent = '#' + t;
      var x = document.createElement('span'); x.className = 'insp-tag-x'; x.textContent = '×';
      x.onclick = function () { editing.tags.splice(idx, 1); renderTagChips(); };
      chip.appendChild(x); box.appendChild(chip);
    });
  }
  function renderPresetTags() {
    var box = $('inseTagPresets'); if (!box) return; box.innerHTML = '';
    PRESET_TAGS.forEach(function (t) {
      var chip = document.createElement('button'); chip.type = 'button'; chip.className = 'insp-tag insp-tag-preset'; chip.textContent = '+' + t;
      chip.onclick = function () { if (editing.tags.indexOf(t) < 0) { editing.tags.push(t); renderTagChips(); } };
      box.appendChild(chip);
    });
  }

  /* ---------- 合集 ---------- */
  function renderColOptions() {
    var box = $('inseColOptions'); if (!box) return; box.innerHTML = '';
    collections.forEach(function (c) {
      var lab = document.createElement('label'); lab.className = 'insp-cat-opt';
      var rb = document.createElement('input'); rb.type = 'radio'; rb.name = 'inseCol'; rb.value = c.id;
      if (editing.category === c.id) rb.checked = true;
      rb.addEventListener('change', function () { if (this.checked) editing.category = c.id; });
      lab.appendChild(rb);
      var span = document.createElement('span'); span.textContent = ' ' + c.emoji + ' ' + c.name; lab.appendChild(span);
      box.appendChild(lab);
    });
  }
  function openColModal() {
    renderEmojiPicker();
    $('inseColName').value = '';
    $('inseColModal').hidden = false;
  }
  function renderEmojiPicker() {
    var grid = $('inseColEmoji'); grid.innerHTML = '';
    EMOJI_CHOICES.forEach(function (em) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'insp-emoji-cell' + (em === editingCol.emoji ? ' active' : ''); b.textContent = em;
      b.onclick = function () {
        editingCol.emoji = em;
        Array.prototype.forEach.call(grid.children, function (c) { c.classList.remove('active'); });
        b.classList.add('active');
      };
      grid.appendChild(b);
    });
  }
  function saveCol() {
    var name = $('inseColName').value.trim();
    if (!name) { toast('请输入合集名称'); return; }
    var maxOrder = 0; collections.forEach(function (c) { if (c.order > maxOrder) maxOrder = c.order; });
    DB.saveCollection({
      id: undefined, name: name, emoji: editingCol.emoji || '✨', fixed: false,
      order: maxOrder + 1, createdAt: new Date().toISOString()
    }).then(function (saved) {
      editing.category = saved.id;
      return DB.getCollections();
    }).then(function (cols) {
      collections = cols || [];
      $('inseColModal').hidden = true;
      renderColOptions();
      toast('已新建合集 ✨');
    }).catch(function () { toast('保存失败'); });
  }

  /* ---------- 保存 ---------- */
  function save() {
    if (!note) return;
    var title = $('inseTitle').value.trim();
    var body = $('inseBody').value.trim();
    var catEl = document.querySelector('input[name="inseCol"]:checked');
    var cat = catEl ? catEl.value : (editing.category || 'uncategorized');
    if (!title && !body && images.length === 0) { toast('还没有可保存的内容'); return; }

    note.title = title;
    note.body = body;
    note.category = cat;
    note.tags = editing.tags.slice();
    note.imageRefs = images.map(function (i) { return i.id; });
    note.thumbRefs = images.map(function (i) { return i.thumbId; }).filter(Boolean);

    // 清理被移除的图片 / 缩略图（仅删除用户主动移除的，绝不误删）
    var newIds = note.imageRefs, newThumbs = note.thumbRefs;
    var removedImgs = originalRefs.filter(function (id) { return newIds.indexOf(id) < 0; });
    var removedThumbs = originalThumbRefs.filter(function (tid) { return newThumbs.indexOf(tid) < 0; });
    Promise.all(removedImgs.map(function (id) { return DB.deleteImage(id).catch(function () {}); })
      .concat(removedThumbs.map(function (tid) { return DB.deleteThumbnail(tid).catch(function () {}); })))
      .then(function () { return DB.saveNote(note); })
      .then(function () { location.href = 'inspiration-detail.html?id=' + encodeURIComponent(note.id) + '&from=list'; })
      .catch(function () { toast('保存失败，请重试'); });
  }

  /* ---------- 启动 ---------- */
  function init() {
    if (!DB) { toast('数据层加载失败'); return; }
    $('inseCancel').onclick = function () {
      if (history.length > 1) history.back();
      else location.href = 'inspiration-detail.html?id=' + encodeURIComponent(getParam('id') || '') + '&from=list';
    };
    $('inseSave').onclick = save;
    $('inseImgInput').addEventListener('change', function (e) {
      handleFiles(e.target.files); e.target.value = '';
    });
    $('inseTagAdd').onclick = function () {
      var v = $('inseTagInput').value.trim();
      if (!v) return;
      if (editing.tags.indexOf(v) < 0) editing.tags.push(v);
      $('inseTagInput').value = ''; renderTagChips();
    };
    $('inseTagInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('inseTagAdd').click(); } });
    $('inseColAdd').onclick = openColModal;
    $('inseColClose').onclick = function () { $('inseColModal').hidden = true; };
    $('inseColSave').onclick = saveCol;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('inseColModal').hidden) $('inseColModal').hidden = true;
    });

    var id = getParam('id');
    if (!id) { toast('缺少灵感 id'); return; }
    Promise.all([DB.getNote(id), DB.getCollections()]).then(function (res) {
      var n = res[0], cols = res[1];
      if (!n) { toast('未找到该灵感'); return; }
      note = n;
      collections = cols || [];
      // 若笔记的合集已不存在（例如被删），回退到第一个可用合集
      var exists = collections.some(function (c) { return c.id === (n.category || 'uncategorized'); });
      editing = { category: exists ? (n.category || 'uncategorized') : (collections[0] ? collections[0].id : 'uncategorized'), tags: (n.tags || []).slice() };
      originalRefs = (n.imageRefs || []).slice();
      originalThumbRefs = (n.thumbRefs || []).slice();
      $('inseTitle').value = n.title || '';
      $('inseBody').value = n.body || '';
      renderColOptions(); renderTagChips(); renderPresetTags();

      // 载入已有图片
      var refs = n.imageRefs || [];
      Promise.all(refs.map(function (iid, i) {
        return DB.getImageBlob(iid).then(function (blob) {
          if (!blob) return null;
          var u = URL.createObjectURL(blob);
          return { id: iid, thumbId: (n.thumbRefs && n.thumbRefs[i]) || null, url: u };
        }).catch(function () { return null; });
      })).then(function (list) {
        images = list.filter(Boolean);
        renderThumbs();
      });
    }).catch(function () { toast('读取灵感失败'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
