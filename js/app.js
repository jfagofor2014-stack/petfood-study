import { loadBook } from './lib/db.js';
import { createProgress } from './lib/progress.js';
import { createSettings } from './lib/settings.js';
import { createQuizResults } from './lib/quizresults.js';
import { createSpeech } from './lib/speech.js';
import { createWakeLock } from './lib/wakelock.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderPlayer } from './views/player.js';
import { renderToc } from './views/toc.js';
import { renderQuiz } from './views/quiz.js';
import { renderSettings } from './views/settings.js';

const el = {
  onboarding: document.getElementById('onboarding'),
  main: document.getElementById('main'),
  view: document.getElementById('view'),
  tabs: document.getElementById('tabs'),
  rate: document.getElementById('topbar-rate'),
};

const ctx = {
  book: null,
  progress: createProgress(localStorage),
  settings: createSettings(localStorage),
  quizResults: createQuizResults(localStorage),
  speech: createSpeech({ synth: window.speechSynthesis, UtteranceCtor: window.SpeechSynthesisUtterance }),
  wakeLock: createWakeLock(navigator),
  tab: 'player',
};

// 画面モジュールは後続タスクで実装する。未実装のタブは案内だけ出す。
// 後続タスクはこのオブジェクトに直接キーを足していく（registerView のような
// 登録用エクスポートは、呼び出し元が存在しないため作らない）。
const views = { player: renderPlayer, toc: renderToc, quiz: renderQuiz, settings: renderSettings };

let teardown = null;

function showTab(name) {
  // 前の画面の後始末。これを怠ると、もくじタブに移っても読み上げが鳴り続ける。
  if (teardown) { teardown(); teardown = null; }

  ctx.tab = name;
  for (const b of el.tabs.querySelectorAll('.tab')) {
    b.setAttribute('aria-current', String(b.dataset.tab === name));
  }
  el.view.innerHTML = '';
  const render = views[name];
  if (render) teardown = render(el.view, ctx, { showTab }) || null;
  else el.view.innerHTML = '<div class="card muted">この画面はまだありません。</div>';
}

function startMain(book) {
  ctx.book = book;
  ctx.progress.pruneTo(book.chapters);
  el.onboarding.hidden = true;
  el.main.hidden = false;
  el.rate.textContent = `${ctx.settings.get().rate.toFixed(1)}倍`;
  showTab('player');
}

el.tabs.addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (b) showTab(b.dataset.tab);
});

(async function boot() {
  let book = null;
  try {
    book = await loadBook();
  } catch (err) {
    // IndexedDB が使えない環境でも、白い画面のまま固まらせず
    // オンボーディングへフォールバックする。
    console.error('教材の読み込みに失敗しました', err);
  }
  if (book) {
    startMain(book);
  } else {
    el.main.hidden = true;
    el.onboarding.hidden = false;
    renderOnboarding(el.onboarding, { onLoaded: startMain });
  }
})();

window.__pfs = ctx;   // 実機での動作確認用
