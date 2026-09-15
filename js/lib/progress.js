// 再生位置と節ごとの読了状態を localStorage に持つ。
// 「中断しても途中から再開できる」要件の中核。
// storage は引数で受け取り、テストではフェイクを差し込む。

import { listSections } from './book.js';

const K_POS = 'pfs:position';
const K_PROG = 'pfs:progress';

function readJSON(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;      // 壊れた値で起動できなくなるのを防ぐ
  }
}

function writeJSON(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

const UNREAD = () => ({ state: 'unread', maxSent: 0, doneAt: null });

// null でも配列でもない「プレーンオブジェクト」だけを true とする。
const isPlainObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);

const VALID_STATES = new Set(['unread', 'reading', 'done']);

// 節ごとの読了レコードとして妥当な形かを検査する。
const isValidSectionRecord = rec =>
  isPlainObject(rec) && VALID_STATES.has(rec.state) && Number.isInteger(rec.maxSent);

// 再生位置として妥当な形かを検査する。
const isValidPosition = pos =>
  isPlainObject(pos) && typeof pos.sectionId === 'string' && Number.isInteger(pos.sentIndex);

export function createProgress(storage) {
  const allProgress = () => readJSON(storage, K_PROG, {});

  const getSection = sectionId => {
    const rec = allProgress()[sectionId];
    return isValidSectionRecord(rec) ? { state: rec.state, maxSent: rec.maxSent, doneAt: rec.doneAt ?? null } : UNREAD();
  };

  const getPosition = () => {
    const p = readJSON(storage, K_POS, null);
    return isValidPosition(p) ? p : null;
  };

  const clearPosition = () => {
    storage.removeItem(K_POS);
  };

  const putSection = (sectionId, rec) => {
    let all = allProgress();
    // allProgress() が返したオブジェクトが壊れていたら（例: 文字列や配列）、
    // 空のオブジェクトから作り直す
    if (!isPlainObject(all)) {
      all = {};
    }
    all[sectionId] = rec;
    writeJSON(storage, K_PROG, all);
  };

  const rateOf = sections => {
    if (!sections || sections.length === 0) return 0;
    const done = sections.filter(s => getSection(s.id).state === 'done').length;
    return done / sections.length;
  };

  return {
    getPosition,

    setPosition(sectionId, sentIndex) {
      writeJSON(storage, K_POS, { sectionId, sentIndex, updatedAt: new Date().toISOString() });
    },

    clearPosition,

    getSection,

    markSentence(sectionId, sentIndex, total) {
      const cur = getSection(sectionId);
      const maxSent = Math.max(cur.maxSent, sentIndex);
      const reachedEnd = total > 0 && sentIndex >= total - 1;
      const done = cur.state === 'done' || reachedEnd;
      putSection(sectionId, {
        state: done ? 'done' : 'reading',
        maxSent,
        doneAt: done ? (cur.doneAt ?? new Date().toISOString()) : null,
      });
    },

    markDone(sectionId) {
      const cur = getSection(sectionId);
      putSection(sectionId, {
        state: 'done',
        maxSent: cur.maxSent,
        doneAt: cur.doneAt ?? new Date().toISOString(),
      });
    },

    chapterRate(chapter) {
      return rateOf(chapter && chapter.sections);
    },

    overallRate(chapters) {
      return rateOf(listSections(chapters).map(x => x.section));
    },

    doneCount(chapters) {
      const sections = listSections(chapters).map(x => x.section);
      return {
        done: sections.filter(s => getSection(s.id).state === 'done').length,
        total: sections.length,
      };
    },

    pruneTo(chapters) {
      const sections = listSections(chapters);
      const all = allProgress();
      // 教材の読み込みが失敗・遅延して節が0件のときは、
      // 既存の進捗・位置を消さずに現状の件数だけ返す。
      if (sections.length === 0) return Object.keys(all).length;

      const valid = new Set(sections.map(x => x.section.id));
      let kept = 0;
      const next = {};
      for (const [id, rec] of Object.entries(all)) {
        if (valid.has(id)) { next[id] = rec; kept++; }
      }
      writeJSON(storage, K_PROG, next);

      const pos = getPosition();
      if (pos && !valid.has(pos.sectionId)) clearPosition();
      return kept;
    },

    reset() {
      storage.removeItem(K_POS);
      storage.removeItem(K_PROG);
    },

    exportAll() {
      return { position: readJSON(storage, K_POS, null), progress: allProgress() };
    },

    importAll(obj) {
      if (!isPlainObject(obj)) return;
      // 形が妥当なものだけ書き込む。満たさなければ黙って無視し、既存値を保つ。
      if (isValidPosition(obj.position)) writeJSON(storage, K_POS, obj.position);
      if (isPlainObject(obj.progress)) writeJSON(storage, K_PROG, obj.progress);
    },
  };
}
