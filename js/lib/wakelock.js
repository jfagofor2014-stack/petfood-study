// Android Chrome は画面が消えると読み上げを止める。
// バックグラウンド再生はできないため、再生中は画面を点けたままにする。

export function createWakeLock(nav) {
  let sentinel = null;

  return {
    async enable() {
      if (sentinel || !nav || !nav.wakeLock) return;
      try {
        sentinel = await nav.wakeLock.request('screen');
        sentinel.addEventListener('release', () => { sentinel = null; });
      } catch {
        sentinel = null;      // 取得できなくても再生は続ける
      }
    },
    async disable() {
      const s = sentinel;
      sentinel = null;
      if (s) { try { await s.release(); } catch { /* 解放失敗は無視してよい */ } }
    },
    isActive() { return sentinel !== null; },
  };
}
