import { RATE_MIN, RATE_MAX, RATE_STEP } from '../lib/settings.js';
import { summarize } from '../lib/schema.js';
import { clearBook } from '../lib/db.js';
import { escapeHtml as esc } from '../lib/html.js';

export function renderSettings(root, ctx, nav) {
  const { book, settings, speech, progress, quizResults } = ctx;
  const cfg = settings.get();
  const info = summarize(book);

  // japaneseVoices() は Promise。設定タブを離れたあとや、何度も出入りしたあとに
  // 古い Promise が解決すると、その時点で root の中身は別の描画に入れ替わっている
  // 可能性がある。teardown で false にして、その後の .then 内の処理を止める。
  let alive = true;

  root.innerHTML = `
    <div class="card">
      <div class="s-row">
        <label for="s-rate">読み上げの速さ</label>
        <output id="s-rate-out">${cfg.rate.toFixed(1)}倍</output>
      </div>
      <input type="range" id="s-rate" min="${RATE_MIN}" max="${RATE_MAX}" step="${RATE_STEP}" value="${cfg.rate}">

      <div class="s-row" style="margin-top:16px">
        <label for="s-pause">文と文の間</label>
        <output id="s-pause-out">${cfg.pauseMs}ミリ秒</output>
      </div>
      <input type="range" id="s-pause" min="0" max="1000" step="50" value="${cfg.pauseMs}">

      <div class="s-row" style="margin-top:16px">
        <label for="s-voice">声</label>
      </div>
      <select id="s-voice"><option value="">読み込み中…</option></select>
      <button class="btn ghost sm" id="s-test" style="margin-top:8px">この声で試す</button>
    </div>

    <div class="card">
      <label class="s-check"><input type="checkbox" id="s-awake" ${cfg.keepAwake ? 'checked' : ''}>
        再生中は画面を消さない</label>
      <p class="muted">Android では画面が消えると読み上げが止まります。オフにすると、画面が消えたときに再生も止まります。</p>

      <label class="s-check"><input type="checkbox" id="s-auto" ${cfg.autoNextSection ? 'checked' : ''}>
        節の終わりで次の節へ進む</label>
    </div>

    <div class="card">
      <div class="muted">取り込み済みの教材</div>
      <div>${esc(info.title)} ${esc(info.edition)}</div>
      <div class="muted">${info.chapters}章 ${info.sections}節 問題${info.questions}問／作成 ${esc(info.generatedAt)}</div>
      <div class="s-btns">
        <button class="btn ghost sm" id="s-export">学習データを書き出す</button>
        <button class="btn ghost sm" id="s-import">学習データを読み込む</button>
        <input type="file" id="s-import-file" accept="application/json,.json" hidden>
      </div>
      <div class="s-btns">
        <button class="btn danger sm" id="s-reset">進捗をリセット</button>
        <button class="btn danger sm" id="s-clear">教材を入れ替える</button>
      </div>
      <p class="muted" id="s-msg"></p>
    </div>
  `;

  const $ = id => root.querySelector('#' + id);

  $('s-rate').addEventListener('input', e => {
    const v = settings.set({ rate: Number(e.target.value) }).rate;
    $('s-rate-out').textContent = `${v.toFixed(1)}倍`;
    document.getElementById('topbar-rate').textContent = `${v.toFixed(1)}倍`;
  });

  $('s-pause').addEventListener('input', e => {
    const v = settings.set({ pauseMs: Number(e.target.value) }).pauseMs;
    $('s-pause-out').textContent = `${v}ミリ秒`;
  });

  $('s-awake').addEventListener('change', e => settings.set({ keepAwake: e.target.checked }));
  $('s-auto').addEventListener('change', e => settings.set({ autoNextSection: e.target.checked }));

  speech.japaneseVoices().then(voices => {
    // 画面を離れたあと（何度も出入りしたあとを含む）に解決した場合は、
    // 今の DOM は別の描画のものなので何もしない。
    if (!alive) return;

    const sel = $('s-voice');
    sel.innerHTML = '<option value="">端末の既定</option>' +
      voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)}（${esc(v.lang)}）</option>`).join('');
    sel.value = settings.get().voiceURI || '';
    sel.addEventListener('change', e => settings.set({ voiceURI: e.target.value || null }));

    $('s-test').addEventListener('click', () => {
      speech.unlock();
      const c = settings.get();
      speech.speak('ペットフードの表示に関する公正競争規約について説明します。',
        { rate: c.rate, voice: speech.pickVoice(voices, c.voiceURI) });
    });
  });

  $('s-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(progress.exportAll(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `petfood-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    // click() 直後に revoke すると、ダウンロードが始まる前に Blob URL が
    // 無効化される端末がある（特に Android Chrome）。次のティックまで遅らせる。
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('s-import').addEventListener('click', () => $('s-import-file').click());
  $('s-import-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      progress.importAll(JSON.parse(await f.text()));
      progress.pruneTo(book.chapters);
      $('s-msg').textContent = '学習データを読み込みました。';
    } catch {
      $('s-msg').textContent = '読み込めませんでした。';
    }
  });

  $('s-reset').addEventListener('click', () => {
    if (!confirm('すべての進捗とテスト成績を消します。よろしいですか。')) return;
    progress.reset();
    quizResults.reset();
    $('s-msg').textContent = '進捗をリセットしました。';
  });

  $('s-clear').addEventListener('click', async () => {
    if (!confirm('教材を削除して選び直します。学習の進捗は残ります。よろしいですか。')) return;
    await clearBook();
    location.reload();
  });

  // この画面が登録するリスナーは全て root 配下の要素に直接付いているので
  // innerHTML = '' で一緒に捨てられるが、japaneseVoices() の Promise は
  // 画面を離れたあとも生き続けるため、alive フラグで後始末する。
  return () => {
    alive = false;
  };
}
