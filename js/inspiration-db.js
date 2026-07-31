/* =========================================================================
 * 灵感专区 — 数据层 (Inspiration Zone Data Layer)
 * 完全独立：使用独立 IndexedDB 数据库，不触碰平台原有 Store / storage.js。
 * 图片以 Blob 形式存入本地，不依赖系统相册，删除相册原图不影响本专区。
 * ========================================================================= */
(function (global) {
  'use strict';

  var DB_NAME = 'workbuddy_inspiration';
  var DB_VERSION = 2;
  var STORE_NOTES = 'notes';
  var STORE_IMAGES = 'images';
  var STORE_THUMBS = 'thumbs';
  var STORE_DRAFTS = 'drafts';
  var DRAFT_KEY = 'current';
  var TRASH_DAYS = 30;

  var _db = null;

  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('当前环境不支持 IndexedDB')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          var s = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt', { unique: false });
          s.createIndex('trashed', 'trashed', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
          db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_THUMBS)) {
          db.createObjectStore(STORE_THUMBS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          db.createObjectStore(STORE_DRAFTS, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function store(name, mode) {
    return openDB().then(function (db) {
      return db.transaction(name, mode).objectStore(name);
    });
  }

  function reqP(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function genId(prefix) {
    return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- 图片 ---------- */
  function addImage(blob, type, width, height) {
    var id = genId('img');
    return store(STORE_IMAGES, 'readwrite').then(function (st) {
      return reqP(st.put({ id: id, blob: blob, type: type || (blob && blob.type) || 'image/png', width: width || 0, height: height || 0 }));
    }).then(function () { return id; });
  }

  function addImageRecord(id, blob, type, width, height) {
    return store(STORE_IMAGES, 'readwrite').then(function (st) {
      return reqP(st.put({ id: id, blob: blob, type: type || (blob && blob.type) || 'image/png', width: width || 0, height: height || 0 }));
    });
  }

  function getImageRecord(id) {
    return store(STORE_IMAGES, 'readonly').then(function (st) { return reqP(st.get(id)); });
  }

  function getImageBlob(id) {
    return getImageRecord(id).then(function (rec) { return rec ? rec.blob : null; });
  }

  function deleteImage(id) {
    return store(STORE_IMAGES, 'readwrite').then(function (st) { return reqP(st.delete(id)); });
  }

  /* ---------- 缩略图（瀑布流封面，宽 200px WebP，与原图解耦） ---------- */
  function addThumbnail(blob, type, width, height) {
    var id = genId('thumb');
    return store(STORE_THUMBS, 'readwrite').then(function (st) {
      return reqP(st.put({ id: id, blob: blob, type: type || (blob && blob.type) || 'image/webp', width: width || 0, height: height || 0 }));
    }).then(function () { return id; });
  }

  function getThumbnailBlob(id) {
    return store(STORE_THUMBS, 'readonly').then(function (st) {
      return reqP(st.get(id));
    }).then(function (rec) { return rec ? rec.blob : null; });
  }

  function deleteThumbnail(id) {
    return store(STORE_THUMBS, 'readwrite').then(function (st) { return reqP(st.delete(id)); });
  }

  /* ---------- 笔记 ---------- */
  function saveNote(note) {
    if (!note.id) note.id = genId('note');
    if (!note.createdAt) note.createdAt = new Date().toISOString();
    note.updatedAt = new Date().toISOString();
    return store(STORE_NOTES, 'readwrite').then(function (st) {
      return reqP(st.put(note));
    }).then(function () { return note; });
  }

  function getNote(id) {
    return store(STORE_NOTES, 'readonly').then(function (st) { return reqP(st.get(id)); });
  }

  function getAllNotes() {
    return store(STORE_NOTES, 'readonly').then(function (st) { return reqP(st.getAll()); });
  }

  function getActiveNotes() {
    return getAllNotes().then(function (list) {
      return list.filter(function (n) { return !n.trashed; })
        .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    });
  }

  function getTrashedNotes() {
    return getAllNotes().then(function (list) {
      return list.filter(function (n) { return n.trashed; })
        .sort(function (a, b) { return (b.trashedAt || '').localeCompare(a.trashedAt || ''); });
    });
  }

  function trashNote(id) {
    return getNote(id).then(function (n) {
      if (!n) return;
      n.trashed = true;
      n.trashedAt = new Date().toISOString();
      return saveNote(n);
    });
  }

  function restoreNote(id) {
    return getNote(id).then(function (n) {
      if (!n) return;
      n.trashed = false;
      n.trashedAt = null;
      return saveNote(n);
    });
  }

  function deleteNotePermanent(id) {
    return getNote(id).then(function (n) {
      return store(STORE_NOTES, 'readwrite').then(function (st) {
        return reqP(st.delete(id));
      }).then(function () {
        if (n && n.imageRefs) {
          return Promise.all(n.imageRefs.map(function (iid) {
            return deleteImage(iid).catch(function () {});
          }).concat((n.thumbRefs || []).map(function (iid) {
            return deleteThumbnail(iid).catch(function () {});
          })));
        }
      });
    });
  }

  // 清理超过 30 天的回收站笔记
  function purgeExpiredTrash() {
    var cutoff = Date.now() - TRASH_DAYS * 24 * 3600 * 1000;
    return getTrashedNotes().then(function (list) {
      var expired = list.filter(function (n) {
        return n.trashedAt && new Date(n.trashedAt).getTime() < cutoff;
      });
      return Promise.all(expired.map(function (n) { return deleteNotePermanent(n.id); }));
    });
  }

  /* ---------- 草稿 ---------- */
  function saveDraft(draft) {
    return store(STORE_DRAFTS, 'readwrite').then(function (st) {
      return reqP(st.put(Object.assign({ id: DRAFT_KEY }, draft)));
    });
  }

  function getDraft() {
    return store(STORE_DRAFTS, 'readonly').then(function (st) {
      return reqP(st.get(DRAFT_KEY));
    }).then(function (d) { return d || null; });
  }

  function clearDraft() {
    return store(STORE_DRAFTS, 'readwrite').then(function (st) {
      return reqP(st.delete(DRAFT_KEY));
    }).catch(function () {});
  }

  /* ---------- 备份 / 导出 / 导入 ---------- */
  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataUrl) {
    if (global.fetch) {
      return fetch(dataUrl).then(function (r) { return r.blob(); });
    }
    // 兜底：手动解析
    return new Promise(function (res) {
      var parts = dataUrl.split(',');
      var mime = parts[0].match(/:(.*?);/)[1];
      var bstr = atob(parts[1]);
      var arr = new Uint8Array(bstr.length);
      for (var i = 0; i < bstr.length; i++) arr[i] = bstr.charCodeAt(i);
      res(new Blob([arr], { type: mime }));
    });
  }

  function exportAll() {
    return getAllNotes().then(function (notes) {
      var out = {
        meta: { app: 'workbuddy-inspiration', version: 1, exportedAt: new Date().toISOString() },
        notes: []
      };
      return Promise.all(notes.map(function (n) {
        var imgs = [];
        var refs = n.imageRefs || [];
        return Promise.all(refs.map(function (iid) {
          return getImageRecord(iid).then(function (rec) {
            if (!rec) return;
            return blobToDataURL(rec.blob).then(function (url) {
              return getThumbnailBlob(iid).then(function (tb) {
                return (tb ? blobToDataURL(tb) : Promise.resolve(null));
              }).then(function (turl) {
                imgs.push({ id: iid, dataUrl: url, thumbDataUrl: turl, type: rec.type, width: rec.width, height: rec.height });
              });
            });
          });
        })).then(function () {
          var copy = {};
          for (var k in n) if (n.hasOwnProperty(k)) copy[k] = n[k];
          copy._images = imgs;
          out.notes.push(copy);
        });
      })).then(function () { return out; });
    });
  }

  function clearAll() {
    return Promise.all([
      store(STORE_NOTES, 'readwrite').then(function (st) { return reqP(st.clear()); }),
      store(STORE_IMAGES, 'readwrite').then(function (st) { return reqP(st.clear()); }),
      store(STORE_DRAFTS, 'readwrite').then(function (st) { return reqP(st.clear()); })
    ]);
  }

  function importAll(data, mode) {
    if (!data || !Array.isArray(data.notes)) return Promise.reject(new Error('备份文件格式不正确'));
    var tasks = [];
    if (mode === 'replace') tasks.push(clearAll());
    return Promise.all(tasks).then(function () {
      return Promise.all(data.notes.map(function (n) {
        var imgs = n._images || [];
        return Promise.all(imgs.map(function (im) {
          var p = dataURLToBlob(im.dataUrl).then(function (blob) {
            return addImageRecord(im.id, blob, im.type, im.width, im.height);
          }).catch(function () {});
          var tp = (im.thumbDataUrl ? dataURLToBlob(im.thumbDataUrl).then(function (tb) {
            return addThumbnail(tb, im.type || 'image/webp', im.width, im.height);
          }).catch(function () { return null; }) : Promise.resolve(null));
          return Promise.all([p, tp]).then(function (r) { return r[1]; });
        })).then(function (thumbIds) {
          var note = {};
          for (var k in n) if (n.hasOwnProperty(k) && k !== '_images') note[k] = n[k];
          if (!note.imageRefs) note.imageRefs = imgs.map(function (i) { return i.id; });
          note.thumbRefs = thumbIds.filter(Boolean);
          if (!note.thumbRefs.length && Array.isArray(n.thumbRefs)) note.thumbRefs = n.thumbRefs;
          return saveNote(note);
        });
      }));
    });
  }

  var API = {
    openDB: openDB,
    addImage: addImage,
    getImageBlob: getImageBlob,
    getImageRecord: getImageRecord,
    deleteImage: deleteImage,
    addThumbnail: addThumbnail,
    getThumbnailBlob: getThumbnailBlob,
    deleteThumbnail: deleteThumbnail,
    saveNote: saveNote,
    getNote: getNote,
    getAllNotes: getAllNotes,
    getActiveNotes: getActiveNotes,
    getTrashedNotes: getTrashedNotes,
    trashNote: trashNote,
    restoreNote: restoreNote,
    deleteNotePermanent: deleteNotePermanent,
    purgeExpiredTrash: purgeExpiredTrash,
    saveDraft: saveDraft,
    getDraft: getDraft,
    clearDraft: clearDraft,
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll,
    TRASH_DAYS: TRASH_DAYS
  };

  global.InspirationDB = API;
})(window);
