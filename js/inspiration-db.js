/* =========================================================================
 * 灵感专区 — 数据层 (Inspiration Zone Data Layer)  v3
 * 完全独立：使用独立 IndexedDB 数据库，不触碰平台原有 Store / storage.js。
 * 图片以 Blob 形式存入本地，不依赖系统相册，删除相册原图不影响本专区。
 *
 * v3 变化：
 *  - 新增「合集(collections)」store —— 用户可自定义分类（emoji/名称/排序），
 *    与笔记同库存储，导出/导入一并带走，绝不丢失。
 *  - 升级策略：onupgradeneeded 只会「新增」store/index，绝不删除笔记或图片。
 *  - 旧版 localStorage 分类（wb_insp_categories_v1）首次打开自动迁移进 IndexedDB。
 *  - 导入(importAll) 仅「合并」，绝不覆盖/删除已有笔记。
 * ========================================================================= */
(function (global) {
  'use strict';

  var DB_NAME = 'workbuddy_inspiration';
  var DB_VERSION = 3;
  var STORE_NOTES = 'notes';
  var STORE_IMAGES = 'images';
  var STORE_THUMBS = 'thumbs';
  var STORE_DRAFTS = 'drafts';
  var STORE_COLLECTIONS = 'collections';
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
        // 仅新增，绝不删除已有 store（数据安全第一原则）
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
        if (!db.objectStoreNames.contains(STORE_COLLECTIONS)) {
          db.createObjectStore(STORE_COLLECTIONS, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () {
        _db = req.result;
        // 打开后做一次合集播种/迁移（不影响笔记与图片）
        seedCollections().then(function () { resolve(_db); }, function () { resolve(_db); });
      };
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

  // 一次性取出当前库内全部缩略图，返回 {id: blob} 映射。
  // 用于列表渲染时把「N 张卡片 × 各自一次 IDB 事务」合并为「1 次事务」，
  // 大幅缩短点入灵感区的等待时间（缩略图本身很小，全量读取代价极低）。
  function getAllThumbsMap() {
    return store(STORE_THUMBS, 'readonly').then(function (st) {
      return reqP(st.getAll());
    }).then(function (list) {
      var m = {};
      (list || []).forEach(function (r) { if (r && r.id) m[r.id] = r.blob; });
      return m;
    });
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

  /* ---------- 合集（collections）---------- */
  var DEFAULT_COLLECTIONS = [
    { id: 'outfit', name: '穿搭灵感', emoji: '👗', fixed: true, order: 1 },
    { id: 'makeup', name: '妆容灵感', emoji: '💄', fixed: true, order: 2 },
    { id: 'uncategorized', name: '未分类', emoji: '📁', fixed: true, order: 999 }
  ];

  function getCollectionsStore() { return store(STORE_COLLECTIONS, 'readwrite'); }

  function getCollections() {
    return store(STORE_COLLECTIONS, 'readonly').then(function (st) {
      return reqP(st.getAll());
    }).then(function (list) {
      if (!list || !list.length) return DEFAULT_COLLECTIONS.slice();
      list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      return list;
    });
  }

  // 首次打开：若合集为空，播种默认合集；并把旧 localStorage 分类迁移进来
  function seedCollections() {
    return store(STORE_COLLECTIONS, 'readonly').then(function (st) {
      return reqP(st.getAll());
    }).then(function (existing) {
      var tasks = [];
      if (!existing || !existing.length) {
        DEFAULT_COLLECTIONS.forEach(function (c, i) {
          tasks.push(store(STORE_COLLECTIONS, 'readwrite').then(function (s) {
            return reqP(s.put(Object.assign({}, c, { createdAt: new Date().toISOString() })));
          }));
        });
      }
      // 迁移旧 localStorage 分类（wb_insp_categories_v1）
      try {
        var raw = global.localStorage && global.localStorage.getItem('wb_insp_categories_v1');
        if (raw) {
          var old = JSON.parse(raw);
          if (Array.isArray(old)) {
            var existIds = {};
            (existing || []).forEach(function (c) { existIds[c.id] = 1; });
            // 默认合集可能被上方刚写；补一个最新 order
            var maxOrder = 10;
            (existing || []).forEach(function (c) { if (c.order > maxOrder) maxOrder = c.order; });
            old.forEach(function (c) {
              if (c.fixed) return;                       // 预设已覆盖
              if (existIds[c.id]) return;               // 已存在
              maxOrder += 1;
              tasks.push(store(STORE_COLLECTIONS, 'readwrite').then(function (s) {
                return reqP(s.put({
                  id: c.id || genId('cat'),
                  name: c.name || '合集',
                  emoji: c.emoji || '📁',
                  fixed: false,
                  order: maxOrder,
                  createdAt: new Date().toISOString(),
                  migrated: true
                }));
              }));
            });
          }
          // 迁移完成后清掉旧 key，避免重复迁移
          if (global.localStorage) global.localStorage.removeItem('wb_insp_categories_v1');
        }
      } catch (e) {}
      return Promise.all(tasks);
    });
  }

  function saveCollection(c) {
    if (!c.id) c.id = genId('cat');
    if (typeof c.order !== 'number') c.order = Date.now();
    return store(STORE_COLLECTIONS, 'readwrite').then(function (st) {
      return reqP(st.put(c));
    }).then(function () { return c; });
  }

  function putCollectionRaw(c) { return saveCollection(c); }

  // 删除合集：其下笔记移至「未分类」，绝不删除笔记与图片
  function deleteCollection(id) {
    if (id === 'uncategorized' || id === 'outfit' || id === 'makeup') {
      return Promise.reject(new Error('预设合集不可删除'));
    }
    return getAllNotes().then(function (notes) {
      return Promise.all(notes.map(function (n) {
        if (n.category === id) { n.category = 'uncategorized'; return saveNote(n); }
        return null;
      }));
    }).then(function () {
      return store(STORE_COLLECTIONS, 'readwrite').then(function (st) { return reqP(st.delete(id)); });
    });
  }

  // 合集信息（带兜底，避免未知 id 显示空白）
  function collectionInfo(id, all) {
    if (all && Array.isArray(all)) {
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    }
    if (id === 'outfit') return DEFAULT_COLLECTIONS[0];
    if (id === 'makeup') return DEFAULT_COLLECTIONS[1];
    if (id === 'uncategorized') return DEFAULT_COLLECTIONS[2];
    return { id: id, name: '灵感', emoji: '✨', fixed: false };
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
      return getCollections().then(function (cols) {
        var out = {
          meta: { app: 'workbuddy-inspiration', version: 3, exportedAt: new Date().toISOString() },
          collections: cols,
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
    });
  }

  function clearAll() {
    return Promise.all([
      store(STORE_NOTES, 'readwrite').then(function (st) { return reqP(st.clear()); }),
      store(STORE_IMAGES, 'readwrite').then(function (st) { return reqP(st.clear()); }),
      store(STORE_DRAFTS, 'readwrite').then(function (st) { return reqP(st.clear()); })
    ]);
  }

  // 导入：仅合并（mode 固定为 'merge'），绝不覆盖/删除已有笔记与图片
  function importAll(data) {
    if (!data || !Array.isArray(data.notes)) return Promise.reject(new Error('备份文件格式不正确'));
    // 合并合集（仅非预设、且不与现有冲突）
    var colTask = Promise.resolve();
    if (Array.isArray(data.collections)) {
      colTask = getCollections().then(function (existing) {
        var existIds = {};
        existing.forEach(function (c) { existIds[c.id] = 1; });
        var maxOrder = 10;
        existing.forEach(function (c) { if (c.order > maxOrder) maxOrder = c.order; });
        return Promise.all(data.collections.map(function (c) {
          if (c.fixed) return null;
          if (existIds[c.id]) return null;
          maxOrder += 1;
          return saveCollection({
            id: c.id || genId('cat'), name: c.name || '合集', emoji: c.emoji || '📁',
            fixed: false, order: maxOrder, createdAt: new Date().toISOString()
          });
        }));
      });
    }
    return colTask.then(function () {
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
          note.imported = true;
          for (var k in n) if (n.hasOwnProperty(k) && k !== '_images') note[k] = n[k];
          if (!note.id) note.id = genId('note');
          if (!note.imageRefs) note.imageRefs = imgs.map(function (i) { return i.id; });
          note.thumbRefs = thumbIds.filter(Boolean);
          if (!note.thumbRefs.length && Array.isArray(n.thumbRefs)) note.thumbRefs = n.thumbRefs;
          if (!note.category) note.category = 'uncategorized';
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
    getAllThumbsMap: getAllThumbsMap,
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
    getCollections: getCollections,
    saveCollection: saveCollection,
    putCollectionRaw: putCollectionRaw,
    deleteCollection: deleteCollection,
    collectionInfo: collectionInfo,
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
