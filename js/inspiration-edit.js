/* =========================================================================
 * 灵感编辑页（独立页面）
 * 复用 InspirationDB；读取 ?id= 对应的笔记，可改图片/标题/正文/分类，保存回详情页。
 * ========================================================================= */
(function () {
  'use strict';

  var DB = window.InspirationDB;
  var note = null;
  var images = [];          // [{ id, url, thumbId }]
  var originalRefs = [];
  var originalThumbRefs = [];
  var $ = function (id) { return document.getElementById(id); };

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

  /* ---------- 渲染图片网格 ---------- */
  function renderThumbs() {
    var box = $('inseThumbs'); box.innerHTML = '';
    images.forEach(function (im, idx) {
      var th = document.createElement('div'); th.className = 'inse-thumb';
      var img = document.createElement('img'); img.src = im.url; th.appendChild(img);
      var badge = document.createElement('span'); badge.className = 'inse-thumb-badge';
      badge.textContent = (idx + 1) + '/' + images.length; th.appendChild(badge);
      var del = document.createElement('button'); del.className = 'inse-thumb-del';
      del.type = 'button'; del.textContent = '×'; del.setAttribute('aria-label', '删除');
      del.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        if (im._urlObj) URL.revokeObjectURL(im._urlObj);
        images.splice(idx, 1); renderThumbs();
      };
      th.appendChild(del);
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

  /* ---------- 保存 ---------- */
  function save() {
    if (!note) return;
    var title = $('inseTitle').value.trim();
    var body = $('inseBody').value.trim();
    var catEl = document.querySelector('input[name="inseCat"]:checked');
    var cat = catEl ? catEl.value : 'outfit';
    if (!title && !body && images.length === 0) { toast('还没有可保存的内容'); return; }

    note.title = title;
    note.body = body;
    note.category = cat;
    note.imageRefs = images.map(function (i) { return i.id; });
    note.thumbRefs = images.map(function (i) { return i.thumbId; }).filter(Boolean);

    // 清理被移除的图片 / 缩略图
    var newIds = note.imageRefs, newThumbs = note.thumbRefs;
    var removedImgs = originalRefs.filter(function (id) { return newIds.indexOf(id) < 0; });
    var removedThumbs = originalThumbRefs.filter(function (tid) { return newThumbs.indexOf(tid) < 0; });
    Promise.all(removedImgs.map(function (id) { return DB.deleteImage(id).catch(function () {}); })
      .concat(removedThumbs.map(function (tid) { return DB.deleteThumbnail(tid).catch(function () {}); })))
      .then(function () { return DB.saveNote(note); })
      .then(function () { location.href = 'inspiration-detail.html?id=' + encodeURIComponent(note.id); })
      .catch(function () { toast('保存失败，请重试'); });
  }

  /* ---------- 启动 ---------- */
  function init() {
    if (!DB) { toast('数据层加载失败'); return; }
    $('inseCancel').onclick = function () {
      if (history.length > 1) history.back();
      else location.href = 'inspiration-detail.html?id=' + encodeURIComponent(getParam('id') || '');
    };
    $('inseSave').onclick = save;
    $('inseImgInput').addEventListener('change', function (e) {
      handleFiles(e.target.files); e.target.value = '';
    });

    var id = getParam('id');
    if (!id) { toast('缺少灵感 id'); return; }
    DB.getNote(id).then(function (n) {
      if (!n) { toast('未找到该灵感'); return; }
      note = n;
      originalRefs = (n.imageRefs || []).slice();
      originalThumbRefs = (n.thumbRefs || []).slice();
      $('inseTitle').value = n.title || '';
      $('inseBody').value = n.body || '';
      var radio = document.querySelector('input[name="inseCat"][value="' + (n.category || 'outfit') + '"]');
      if (radio) radio.checked = true;

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
