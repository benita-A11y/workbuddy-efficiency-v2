/* =========================================================================
 * 灵感详情页（独立页面，小红书风格）
 * 完全不依赖列表页，仅通过 URL ?id=xxx 读取 InspirationDB 中的笔记。
 * ========================================================================= */
(function () {
  'use strict';

  var DB = window.InspirationDB;
  var note = null;
  var imgUrls = [];      // 每张原图 objectURL
  var isMine = true;
  var lbIndex = 0;
  var $ = function (id) { return document.getElementById(id); };

  function getParam(name) {
    var m = window.location.href.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function toast(msg) {
    var t = $('insdToast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.hidden = true; }, 250); }, 1800);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  var collections = [];
  // 合集信息全部来自数据层（支持用户自定义合集），不再硬编码穿搭/妆容
  function catInfo(c) { return DB.collectionInfo(c || 'uncategorized', collections); }

  // 将某张图写入 slide：先占位骨架，缩略图/原图到达即替换（缩略图优先，毫秒级显示，原图后台升级）
  function setSlideImg(slide, idx, url) {
    var ph = slide.querySelector('.insd-slide-ph'); if (ph) ph.remove();
    var img = document.createElement('img');
    img.className = 'insd-img'; img.src = url; img.alt = ''; img.decoding = 'async';
    img.onclick = function () { openLightbox(idx); };
    var old = slide.querySelector('.insd-img');
    if (old) old.replaceWith(img); else slide.appendChild(img);
  }

  /* ---------- 渲染 ---------- */
  function render(n) {
    isMine = !n.imported;
    // 释放上一条的 objectURL，避免内存泄漏与索引错乱
    imgUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    imgUrls = [];
    // 图片区
    var box = $('insdImgs');
    // 清掉旧 slides（保留 pager 由后面重建）
    Array.prototype.slice.call(box.querySelectorAll('.insd-slide')).forEach(function (s) { s.parentNode.removeChild(s); });
    var pager = $('insdPager');

    var refs = n.imageRefs || [];
    if (!refs.length) {
      var ph = document.createElement('div');
      ph.className = 'insd-slide insd-slide-ph';
      ph.textContent = catInfo(n.category).emoji;
      box.insertBefore(ph, pager);
      pager.hidden = true;
    } else {
      // 先建好每张 slide 的占位骨架（布局稳定、不跳动），再缩略图优先加载、原图后台升级
      refs.forEach(function (iid, idx) {
        var slide = document.createElement('div');
        slide.className = 'insd-slide';
        var ph2 = document.createElement('div');
        ph2.className = 'insd-slide-ph'; ph2.textContent = '🌿';
        slide.appendChild(ph2);
        box.insertBefore(slide, pager);
        var thumbRef = (n.thumbRefs && n.thumbRefs[idx]) || null;
        var thumbP = thumbRef ? DB.getThumbnailBlob(thumbRef) : Promise.resolve(null);
        thumbP.then(function (tb) {
          if (tb) { var u = URL.createObjectURL(tb); imgUrls[idx] = u; setSlideImg(slide, idx, u); }
          return DB.getImageBlob(iid);
        }).then(function (blob) {
          if (!blob) return;
          var fu = URL.createObjectURL(blob);
          if (imgUrls[idx]) { try { URL.revokeObjectURL(imgUrls[idx]); } catch (e) {} }
          imgUrls[idx] = fu; setSlideImg(slide, idx, fu);
        }).catch(function () {});
      });
      if (refs.length > 1) {
        pager.hidden = false;
        pager.textContent = '1/' + refs.length;
        box.onscroll = function () {
          var idx = Math.round(box.scrollLeft / box.clientWidth);
          pager.textContent = (idx + 1) + '/' + refs.length;
        };
      } else { pager.hidden = true; }
    }

    // 发布者
    if (isMine) {
      $('insdAvatar').textContent = '🙂';
      $('insdAuthorName').textContent = '我';
      $('insdAuthorSub').textContent = '我的灵感';
      $('insdFollow').hidden = true;
    } else {
      $('insdAvatar').textContent = '✨';
      $('insdAuthorName').textContent = n.authorName || '灵感作者';
      $('insdAuthorSub').textContent = '来自导入 / 其他来源';
      $('insdFollow').hidden = false;
      $('insdFollow').textContent = n.followed ? '已关注' : '关注';
      $('insdFollow').classList.toggle('followed', !!n.followed);
    }

    // 文案
    $('insdTitle').textContent = n.title || '';
    $('insdTitle').style.display = n.title ? '' : 'none';
    $('insdBodyText').textContent = n.body || '';
    $('insdBodyText').style.display = n.body ? '' : 'none';
    var tagsBox = $('insdTags'); tagsBox.innerHTML = '';
    (n.tags || []).forEach(function (tg) {
      var s = document.createElement('span'); s.className = 'insd-tag'; s.textContent = '#' + tg; tagsBox.appendChild(s);
    });
    tagsBox.style.display = (n.tags && n.tags.length) ? '' : 'none';

    var c = catInfo(n.category);
    $('insdTime').textContent = c.emoji + ' ' + c.name + ' · ' + fmtDate(n.createdAt);

    // 互动数据
    $('insdLikeCount').textContent = n.likes || 0;
    $('insdFavCount').textContent = n.favorites || 0;
    $('insdCmtCount').textContent = n.comments || 0;
    refreshLikeFav();
    applyPermission();
  }

  function refreshLikeFav() {
    var likeOn = !!note.liked, favOn = !!note.favorited;
    $('insdLike').querySelector('.ic').textContent = likeOn ? '❤️' : '🤍';
    $('insdLikeTx').textContent = likeOn ? '已赞' : '点赞';
    $('insdFav').querySelector('.ic').textContent = favOn ? '⭐' : '☆';
    $('insdFavTx').textContent = favOn ? '已收藏' : '收藏';
  }

  function applyPermission() {
    if (isMine) {
      $('insdEdit').hidden = false;
      $('insdEdit2').disabled = false;
      $('insdEdit2').classList.remove('disabled');
      $('insdDel').disabled = false;
      $('insdDel').classList.remove('disabled');
    } else {
      $('insdEdit').hidden = true;
      $('insdEdit2').disabled = true;
      $('insdEdit2').classList.add('disabled');
      $('insdDel').disabled = true;
      $('insdDel').classList.add('disabled');
    }
  }

  /* ---------- 互动 ---------- */
  function persist() { if (note) return DB.saveNote(note).catch(function () {}); return Promise.resolve(); }

  function toggleLike() {
    note.liked = !note.liked;
    note.likes = Math.max(0, (note.likes || 0) + (note.liked ? 1 : -1));
    refreshLikeFav(); $('insdLikeCount').textContent = note.likes;
    persist();
  }
  function toggleFav() {
    note.favorited = !note.favorited;
    note.favorites = Math.max(0, (note.favorites || 0) + (note.favorited ? 1 : -1));
    refreshLikeFav(); $('insdFavCount').textContent = note.favorites;
    persist();
  }
  function toggleFollow() {
    if (isMine) return;
    note.followed = !note.followed;
    $('insdFollow').textContent = note.followed ? '已关注' : '关注';
    $('insdFollow').classList.toggle('followed', note.followed);
    persist();
  }

  /* ---------- 分享 ---------- */
  function share() {
    var lines = [];
    if (note.title) lines.push('【' + note.title + '】');
    if (note.body) lines.push(note.body);
    (note.tags || []).forEach(function (t) { lines.push('#' + t); });
    lines.push('—— 来自「效率管理」灵感专区');
    var text = lines.join('\n');
    if (navigator.share) {
      navigator.share({ title: note.title || '灵感分享', text: text }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制，去分享吧 🔗'); },
        function () { toast('复制失败，请手动复制'); });
    } else { toast('当前环境不支持分享'); }
  }

  /* ---------- 删除 ---------- */
  function doDelete() {
    $('insdConfirm').hidden = true;
    if (!note) return;
    DB.trashNote(note.id).then(function () {
      // 通知列表页（跨页）删除后需重渲染，避免「删了但卡片还在」的错觉
      try { sessionStorage.setItem('wb_insp_dirty', '1'); } catch (e) {}
      try { var bc = new BroadcastChannel('wb_insp'); bc.postMessage('mutated'); } catch (e) {}
      goBack();
    }).catch(function () { toast('删除失败'); });
  }

  /* ---------- 灯箱（大图预览 + 缩放） ---------- */
  function openLightbox(i) {
    if (!imgUrls.length) return;
    lbIndex = i;
    var img = $('insdLbImg');
    img.src = imgUrls[i];
    resetLb();
    $('insdLightbox').hidden = false;
    if (imgUrls.length > 1) $('insdLbPager').textContent = (i + 1) + '/' + imgUrls.length;
    else $('insdLbPager').textContent = '1/1';
  }
  function closeLightbox() { $('insdLightbox').hidden = true; }
  function lbStep(d) {
    if (imgUrls.length < 2) return;
    lbIndex = (lbIndex + d + imgUrls.length) % imgUrls.length;
    $('insdLbImg').src = imgUrls[lbIndex];
    resetLb();
    $('insdLbPager').textContent = (lbIndex + 1) + '/' + imgUrls.length;
  }
  function resetLb() {
    var img = $('insdLbImg');
    img.style.transform = 'translate(0px,0px) scale(1)';
  }
  function bindLightboxZoom() {
    var stage = $('insdLbStage'), img = $('insdLbImg');
    var scale = 1, tx = 0, ty = 0, startScale = 1, startDist = 0, lastX = 0, lastY = 0;
    function apply() { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
    function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) { startDist = dist(e.touches); startScale = scale; }
      else if (e.touches.length === 1) { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var d = dist(e.touches);
        scale = Math.min(4, Math.max(1, startScale * d / (startDist || 1))); apply();
      } else if (e.touches.length === 1 && scale > 1) {
        e.preventDefault();
        tx += e.touches[0].clientX - lastX; ty += e.touches[0].clientY - lastY;
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; apply();
      }
    }, { passive: false });
    stage.addEventListener('touchend', function () { if (scale <= 1) { tx = 0; ty = 0; apply(); } });
    img.addEventListener('dblclick', function () { scale = scale > 1 ? 1 : 2.5; if (scale === 1) { tx = 0; ty = 0; } apply(); });
  }

  /* ---------- 返回 ---------- */
  function goBack() {
    var from = getParam('from');
    if (from === 'home') { location.href = 'index.html'; return; }            // 来自首页卡片 → 回首页
    // 来自灵感列表（含独立页 / 内嵌模块）→ 优先 history.back() 回到瀑布流并保留滚动位置；无历史兜底回灵感列表
    if (history.length > 1) { history.back(); return; }
    location.href = 'index.html#inspiration';                                  // 兜底：激活✨灵感 tab
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    $('insdBack').onclick = goBack;
    $('insdMore').onclick = function () { $('insdMask').hidden = false; $('insdMoreMenu').hidden = false; };
    $('insdMask').onclick = function () { $('insdMask').hidden = true; $('insdMoreMenu').hidden = true; };

    $('insdLike').onclick = toggleLike;
    $('insdFav').onclick = toggleFav;
    $('insdComment').onclick = function () { toast('评论功能后续开放 💬'); };
    $('insdShare').onclick = share;
    $('insdFollow').onclick = toggleFollow;
    $('insdEdit').onclick = function () { location.href = 'inspiration-edit.html?id=' + encodeURIComponent(note.id); };

    $('insdEdit2').onclick = function () {
      if (this.disabled) return;
      $('insdMask').hidden = true; $('insdMoreMenu').hidden = true;
      location.href = 'inspiration-edit.html?id=' + encodeURIComponent(note.id);
    };
    $('insdDel').onclick = function () {
      if (this.disabled) return;
      $('insdMask').hidden = true; $('insdMoreMenu').hidden = true;
      $('insdConfirm').hidden = false;
    };
    $('insdShare2').onclick = function () { $('insdMask').hidden = true; $('insdMoreMenu').hidden = true; share(); };

    $('insdConfirmCancel').onclick = function () { $('insdConfirm').hidden = true; };
    $('insdConfirmOk').onclick = doDelete;

    $('insdLbClose').onclick = closeLightbox;
    $('insdLbPrev').onclick = function () { lbStep(-1); };
    $('insdLbNext').onclick = function () { lbStep(1); };
    bindLightboxZoom();

    window.addEventListener('pagehide', function () {
      imgUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    if (!DB) { toast('数据层加载失败'); return; }
    bind();
    var id = getParam('id');
    if (!id) { toast('缺少灵感 id'); return; }
    // 同时加载笔记与合集，使合集名称/图标始终与数据层一致（自定义合集也可用）
    Promise.all([DB.getNote(id), DB.getCollections()]).then(function (res) {
      var n = res[0], cols = res[1];
      if (!n) { toast('未找到该灵感'); return; }
      collections = cols || [];
      note = n;
      render(n);
    }).catch(function () { toast('读取灵感失败'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
