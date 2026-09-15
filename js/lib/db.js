// 教材データは数MBあり localStorage の上限を超えるため IndexedDB に置く。
// 1レコードだけを持つ単純な作りにする。

const DB_NAME = 'petfood-study';
const DB_VERSION = 1;
const STORE = 'book';
const KEY = 'current';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

export const saveBook = data => tx('readwrite', s => s.put(data, KEY));
export const loadBook = () => tx('readonly', s => s.get(KEY)).then(v => v ?? null);
export const clearBook = () => tx('readwrite', s => s.delete(KEY));
