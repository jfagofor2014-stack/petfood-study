// 読み上げ設定の既定値と保存。範囲外の値はここで丸め、
// 画面側が変な値を持ち回らないようにする。

const KEY = 'pfs:settings';

export const RATE_MIN = 0.5;
export const RATE_MAX = 2.0;
export const RATE_STEP = 0.1;
const PAUSE_MAX = 2000;

export const DEFAULTS = Object.freeze({
  rate: 1.0,
  voiceURI: null,
  pauseMs: 200,
  keepAwake: true,
  autoNextSection: true,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// null でも配列でもない「プレーンオブジェクト」だけを true とする。
const isPlainObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);

function normalize(patch, base) {
  const out = { ...base };

  if ('rate' in patch) {
    const n = Number(patch.rate);
    out.rate = Number.isFinite(n) ? Math.round(clamp(n, RATE_MIN, RATE_MAX) * 10) / 10 : DEFAULTS.rate;
  }
  if ('pauseMs' in patch) {
    const n = Number(patch.pauseMs);
    out.pauseMs = Number.isFinite(n) ? Math.round(clamp(n, 0, PAUSE_MAX)) : DEFAULTS.pauseMs;
  }
  if ('voiceURI' in patch) {
    out.voiceURI = patch.voiceURI ? String(patch.voiceURI) : null;
  }
  if ('keepAwake' in patch) out.keepAwake = Boolean(patch.keepAwake);
  if ('autoNextSection' in patch) out.autoNextSection = Boolean(patch.autoNextSection);

  return out;
}

export function createSettings(storage) {
  const read = () => {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      return normalize(JSON.parse(raw) || {}, DEFAULTS);
    } catch {
      return { ...DEFAULTS };
    }
  };

  return {
    get: read,
    set(patch) {
      // オブジェクト以外の値が渡されたときは無視し、現在の設定を返す
      if (!isPlainObject(patch)) {
        return read();
      }
      const next = normalize(patch, read());
      storage.setItem(KEY, JSON.stringify(next));
      return next;
    },
    reset() {
      storage.removeItem(KEY);
      return { ...DEFAULTS };
    },
  };
}
