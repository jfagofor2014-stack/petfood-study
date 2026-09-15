// 確認テストの成績を localStorage に持つ。
// 「進捗をリセット」から localStorage を直接触らずに済むよう、
// 保存の後始末をこのモジュールに閉じ込める。
// storage は引数で受け取り、テストではフェイクを差し込む。

const K_QUIZ = 'pfs:quiz';

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

const UNANSWERED = () => ({ attempts: 0, correct: 0, lastResult: null, lastAt: null });

// null でも配列でもない「プレーンオブジェクト」だけを true とする。
const isPlainObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);

// 1件の成績レコードとして妥当な形かを検査する。
const isValidRecord = rec =>
  isPlainObject(rec) &&
  Number.isInteger(rec.attempts) &&
  Number.isInteger(rec.correct) &&
  (rec.lastResult === null || typeof rec.lastResult === 'boolean') &&
  (rec.lastAt === null || typeof rec.lastAt === 'string');

export function createQuizResults(storage) {
  const allResults = () => readJSON(storage, K_QUIZ, {});

  const get = questionId => {
    const rec = allResults()[questionId];
    return isValidRecord(rec)
      ? { attempts: rec.attempts, correct: rec.correct, lastResult: rec.lastResult, lastAt: rec.lastAt }
      : UNANSWERED();
  };

  const putRecord = (questionId, rec) => {
    let all = allResults();
    // allResults() が返した値が壊れていたら（例: 文字列や配列）、
    // 空のオブジェクトから作り直す
    if (!isPlainObject(all)) {
      all = {};
    }
    all[questionId] = rec;
    writeJSON(storage, K_QUIZ, all);
  };

  return {
    all: allResults,

    get,

    record(questionId, ok) {
      const cur = get(questionId);
      const rec = {
        attempts: cur.attempts + 1,
        correct: cur.correct + (ok ? 1 : 0),
        lastResult: Boolean(ok),
        lastAt: new Date().toISOString(),
      };
      putRecord(questionId, rec);
      return rec;
    },

    reset() {
      storage.removeItem(K_QUIZ);
    },

    pruneTo(questions) {
      const all = allResults();
      // 教材の読み込みが失敗・遅延して問題が0件のときは、
      // 既存の成績を消さずに現状の件数だけ返す。
      if (!Array.isArray(questions) || questions.length === 0) {
        return Object.keys(isPlainObject(all) ? all : {}).length;
      }

      const valid = new Set(questions.map(q => q.id));
      let kept = 0;
      const next = {};
      for (const [id, rec] of Object.entries(isPlainObject(all) ? all : {})) {
        if (valid.has(id)) { next[id] = rec; kept++; }
      }
      writeJSON(storage, K_QUIZ, next);
      return kept;
    },
  };
}
