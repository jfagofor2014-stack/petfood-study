// 中断中の模試と受験履歴を localStorage に持つ。
// 保存の後始末をこのモジュールに閉じ込め、画面側が localStorage を直接触らずに済むようにする。
// storage は引数で受け取り、テストではフェイクを差し込む（quizresults.js と同じ流儀）。

const K_ACTIVE = 'pfs:mock';
const K_HIST = 'pfs:mockhist';
const HISTORY_MAX = 10;
const STATE_VERSION = 1;

// null でも配列でもない「プレーンオブジェクト」だけを true とする。
const isPlainObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);

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

// 中断データとして妥当な形かを検査する。
// 3つの配列の長さが食い違うと画面側が範囲外を読んで落ちるため、ここで弾く。
// startedAt は ISO 8601 形式の文字列で、時刻の解析に使われるため必須で検査する。
function isValidActive(a) {
  if (!isPlainObject(a) || a.v !== STATE_VERSION) return false;
  if (typeof a.startedAt !== 'string') return false;
  if (!Array.isArray(a.questionIds) || a.questionIds.length === 0) return false;
  const n = a.questionIds.length;
  if (!Array.isArray(a.answers) || a.answers.length !== n) return false;
  if (!Array.isArray(a.flags) || a.flags.length !== n) return false;
  if (!Number.isFinite(a.remainingMs) || a.remainingMs < 0) return false;
  if (!Number.isInteger(a.at) || a.at < 0 || a.at >= n) return false;
  return true;
}

// elapsedMs は「学習データを読み込む」で外部JSONから取り込まれうるため、
// 欠けている・数値でない・NaN/Infinity といった壊れた値をここで弾く。
// 弾かずに通すと表示側（mock.js の fmtElapsed）が「NaN分」を出してしまう。
const isValidEntry = e =>
  isPlainObject(e) &&
  Number.isInteger(e.score) &&
  Number.isInteger(e.total) &&
  typeof e.finishedAt === 'string' &&
  Array.isArray(e.questionIds) &&
  Number.isFinite(e.elapsedMs);

export function createMockState(storage) {
  const readHistory = () => {
    const v = readJSON(storage, K_HIST, []);
    // 壊れた要素だけを落とし、残りは使えるようにする。
    return Array.isArray(v) ? v.filter(isValidEntry) : [];
  };

  return {
    getActive() {
      const a = readJSON(storage, K_ACTIVE, null);
      return isValidActive(a) ? a : null;
    },

    // 妥当でない状態は保存しない。保存できなかったことを呼び出し側が分かるよう null を返す。
    saveActive(state) {
      const next = { ...state, v: STATE_VERSION };
      if (!isValidActive(next)) return null;
      storage.setItem(K_ACTIVE, JSON.stringify(next));
      return next;
    },

    clearActive() { storage.removeItem(K_ACTIVE); },

    history: readHistory,

    pushHistory(entry) {
      if (!isValidEntry(entry)) return readHistory();
      const next = [entry, ...readHistory()].slice(0, HISTORY_MAX);
      storage.setItem(K_HIST, JSON.stringify(next));
      return next;
    },

    // 直近n件で出題された問題IDの和集合。出題の重複を避けるために使う。
    recentQuestionIds(n = 3) {
      const ids = new Set();
      for (const e of readHistory().slice(0, n)) {
        for (const id of e.questionIds) ids.add(id);
      }
      return [...ids];
    },

    reset() {
      storage.removeItem(K_ACTIVE);
      storage.removeItem(K_HIST);
    },

    exportAll() {
      // active も history と同じく、読み出し値を検査してから返す。
      // 壊れた中断データがストレージにあれば null として外へ出す。
      const a = readJSON(storage, K_ACTIVE, null);
      return { active: isValidActive(a) ? a : null, history: readHistory() };
    },

    // 妥当な部分だけを取り込む。オブジェクト以外なら何も書かず既存を保つ。
    importAll(obj) {
      if (!isPlainObject(obj)) return;
      if (Array.isArray(obj.history)) {
        // 取り込む履歴にも HISTORY_MAX を適用する。外部ファイル由来で
        // pfs:mockhist が無制限に膨らまないようにするため。
        storage.setItem(K_HIST, JSON.stringify(obj.history.filter(isValidEntry).slice(0, HISTORY_MAX)));
      }
      if (isValidActive(obj.active)) {
        storage.setItem(K_ACTIVE, JSON.stringify(obj.active));
      }
    },
  };
}
