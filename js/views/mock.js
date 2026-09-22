// 本番形式の模擬試験。答えを見ずに通して解き、最後にまとめて採点する。
// 即時採点する既存のテスト画面（quiz.js）とは別物として作る。
// 本番のCBT画面（ヘッダのページ表記と残り時間、フッタの5ボタン、解答状況のパネル）に合わせる。

import { buildExam } from '../lib/mockexam.js';
import { escapeHtml as esc } from '../lib/html.js';

const TOTAL = 25;
const LIMIT_MS = 60 * 60 * 1000;

const minutesLeft = ms => Math.max(0, Math.ceil(ms / 60000));

const fmtDate = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};

const fmtElapsed = ms => `${Math.max(0, Math.round(ms / 60000))}分`;

export function renderMock(root, ctx, nav) {
  const { book, mockState } = ctx;
  const questions = book.questions || [];

  const $ = id => root.querySelector('#' + id);

  // 中断データの問題IDを今の教材の問題に対応づける。
  // 教材を差し替えたあとでIDが見つからない場合、その中断データはもう使えない。
  function resolveActive(active) {
    if (!active) return null;
    const byId = new Map(questions.map(q => [q.id, q]));
    const qs = active.questionIds.map(id => byId.get(id));
    return qs.every(Boolean) ? qs : null;
  }

  function drawHome() {
    const active = mockState.getActive();
    const resolved = resolveActive(active);
    // 教材が入れ替わって問題が見つからないときは、黙って古い中断データを捨てる。
    const stale = Boolean(active) && !resolved;
    if (stale) mockState.clearActive();

    const hist = mockState.history().slice(0, 5);
    const short = questions.length > 0 && questions.length < TOTAL;

    root.innerHTML = `
      <div class="card">
        <div class="m-h1">本番形式の模擬試験</div>
        <p>${TOTAL}問・60分・四肢択一。本番と同じ形式で、答えを見ずに通して解きます。</p>
        <div class="q-note">この問題は公式の過去問ではありません。テキストの範囲から作成した予想問題です。</div>
      </div>

      ${stale ? '<div class="card"><div class="error">教材が変わったため、中断していた模試を破棄しました。</div></div>' : ''}

      ${questions.length === 0
        ? '<div class="card">この教材には問題が入っていません。</div>'
        : `<div class="card">
            ${resolved
              ? `<button class="btn" id="m-resume">中断した模試を再開する（残り${minutesLeft(active.remainingMs)}分）</button>
                 <div class="s-btns"><button class="btn danger sm" id="m-discard">破棄して最初から</button></div>`
              : `<button class="btn" id="m-start">模試を開始する</button>
                 ${short ? `<p class="muted">この教材には${questions.length}問しかないため、${questions.length}問で出題します。</p>` : ''}`}
          </div>`}

      ${hist.length ? `<div class="card">
        <div class="muted">これまでの成績</div>
        <ul class="m-hist">
          ${hist.map(e => `<li>
            <span class="muted">${esc(fmtDate(e.finishedAt))}</span>
            <b>${esc(e.score)} / ${esc(e.total)}</b>
            <span class="muted">${esc(fmtElapsed(e.elapsedMs))}</span>
          </li>`).join('')}
        </ul>
      </div>` : ''}

      <button class="btn ghost" id="m-back">テストに戻る</button>
    `;

    if ($('m-start')) $('m-start').addEventListener('click', startExam);
    if ($('m-resume')) $('m-resume').addEventListener('click', drawHome);
    if ($('m-discard')) $('m-discard').addEventListener('click', () => {
      if (!confirm('中断した模試を破棄します。よろしいですか。')) return;
      mockState.clearActive();
      drawHome();
    });
    $('m-back').addEventListener('click', () => nav.showTab('quiz'));
  }

  // 新しい模試を組み立てて中断データとして保存する。
  // 保存できたものだけを正とするので、以後の画面は必ず mockState 経由で読む。
  function startExam() {
    const set = buildExam(questions, book.chapters, {
      total: TOTAL,
      recentIds: mockState.recentQuestionIds(3),
    });
    if (set.length === 0) return;

    const saved = mockState.saveActive({
      startedAt: new Date().toISOString(),
      remainingMs: LIMIT_MS,
      questionIds: set.map(q => q.id),
      answers: set.map(() => null),
      flags: set.map(() => false),
      at: 0,
    });
    if (!saved) return;

    drawHome();
  }

  drawHome();

  // この画面が登録するリスナーは全て root 配下の要素に直接付いているので、
  // app.js が innerHTML を空にすれば一緒に捨てられる。
  // タイマーを持つようになったら、ここで必ず止めること。
  return () => {};
}
