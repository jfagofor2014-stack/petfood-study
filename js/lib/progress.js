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

export function createProgress(storage) {
  const allProgress = () => readJSON(storage, K_PROG, {});

  const getSection = sectionId => {
    const rec = allProgress()[sectionId];
    return rec ? { state: rec.state, maxSent: rec.maxSent, doneAt: rec.doneAt ?? null } : UNREAD();
  };

  const putSection = (sectionId, rec) => {
    const all = allProgress();
    all[sectionId] = rec;
    writeJSON(storage, K_PROG, all);
  };

  const rateOf = sections => {
    if (!sections || sections.length === 0) return 0;
    const done = sections.filter(s => getSection(s.id).state === 'done').length;
    return done / sections.length;
  };

  return {
    getPosition() {
      const p = readJSON(storage, K_POS, null);
      if (!p || typeof p.sectionId !== 'string' || !Number.isInteger(p.sentIndex)) return null;
      return p;
    },

    setPosition(sectionId, sentIndex) {
      writeJSON(storage, K_POS, { sectionId, sentIndex, updatedAt: new Date().toISOString() });
    },

    clearPosition() {
      storage.removeItem(K_POS);
    },

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
      const valid = new Set(listSections(chapters).map(x => x.section.id));
      const all = allProgress();
      let kept = 0;
      const next = {};
      for (const [id, rec] of Object.entries(all)) {
        if (valid.has(id)) { next[id] = rec; kept++; }
      }
      writeJSON(storage, K_PROG, next);

      const pos = this.getPosition();
      if (pos && !valid.has(pos.sectionId)) this.clearPosition();
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
      if (!obj || typeof obj !== 'object') return;
      if (obj.position) writeJSON(storage, K_POS, obj.position);
      if (obj.progress) writeJSON(storage, K_PROG, obj.progress);
    },
  };
}
