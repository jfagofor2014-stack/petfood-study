// 本番形式の模擬試験。答えを見ずに通して解き、最後にまとめて採点する。
// 即時採点する既存のテスト画面（quiz.js）とは別物として作る。
// 本番のCBT画面（ヘッダのページ表記と残り時間、フッタの5ボタン、解答状況のパネル）に合わせる。

import { buildExam, gradeExam } from '../lib/mockexam.js';
import { escapeHtml as esc } from '../lib/html.js';

const TOTAL = 25;
const LIMIT_MS = 60 * 60 * 1000;

// 残りがこれを切ったら時計を赤くする。本番のCBTも残り時間を赤字で見せている。
const WARN_MS = 5 * 60 * 1000;

const mmss = ms => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
};

const minutesLeft = ms => Math.max(0, Math.ceil(ms / 60000));

const fmtDate = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};

const fmtElapsed = ms => `${Math.max(0, Math.round(ms / 60000))}分`;

export function renderMock(root, ctx, nav) {
  const { book, mockState, settings } = ctx;
  const questions = book.questions || [];

  // 解答中だけ中身が入る。{ active: 中断データ, qs: 出題中の問題 }
  // active は mockState から読んだものをそのまま持ち回り、変更のたびに保存する。
  let exam = null;

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
    if ($('m-resume')) $('m-resume').addEventListener('click', drawExam);
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

    drawExam();
  }

  // ---- 解答中 --------------------------------------------------------
  function drawExam() {
    const active = mockState.getActive();
    const qs = resolveActive(active);
    // 中断データが無い・使えないときはトップへ戻す。ここで落とさない。
    if (!qs) { drawHome(); return; }
    exam = { active, qs };

    root.innerHTML = `
      <div id="m-exam" class="m-fs-${esc(settings.get().mockFontSize)}">
        <div id="m-head">
          <div class="m-head-cell"><span class="muted">現在</span><b id="m-page"></b></div>
          <div class="m-head-cell"><span class="muted">残り時間</span><b id="m-clock"></b></div>
          <div class="m-head-cell">
            <span class="muted">文字サイズ</span>
            <span id="m-fs">
              <button class="m-fs-btn" data-fs="sm">小</button
              ><button class="m-fs-btn" data-fs="md">中</button
              ><button class="m-fs-btn" data-fs="lg">大</button>
            </span>
          </div>
        </div>

        <div class="card" id="m-qcard">
          <div class="m-flagmark" id="m-flagmark" hidden>後で見直す</div>
          <div class="m-qtext" id="m-qtext"></div>
          <div id="m-choices"></div>
        </div>

        <div id="m-foot">
          <button class="m-fbtn" id="m-status">解答状況</button>
          <button class="m-fbtn is-end" id="m-end">試験終了</button>
          <button class="m-fbtn" id="m-flag">後で見直す</button>
          <button class="m-fbtn" id="m-prev">前の問題</button>
          <button class="m-fbtn" id="m-next">次の問題</button>
        </div>
      </div>

      <div class="m-ov" id="m-status-ov" hidden>
        <div class="m-ov-panel">
          <div class="m-h1">解答状況</div>
          <div class="m-ov-grid" id="m-grid"></div>
          <div class="m-legend">
            <span><i class="m-sw is-done"></i>解答済み</span>
            <span><i class="m-sw"></i>未解答</span>
            <span><i class="m-sw is-flag"></i>後で見直す</span>
          </div>
          <div class="s-btns"><button class="btn ghost sm" id="m-status-close">閉じる</button></div>
        </div>
      </div>

      <div class="m-ov" id="m-confirm" hidden>
        <div class="m-ov-panel">
          <p>試験を終了します。よろしいですか？</p>
          <p class="muted" id="m-confirm-note"></p>
          <div class="s-btns">
            <button class="btn ghost sm" id="m-cancel">キャンセル</button>
            <button class="btn sm" id="m-ok">OK</button>
          </div>
        </div>
      </div>
    `;

    $('m-choices').addEventListener('change', e => {
      const r = e.target.closest('input[type="radio"]');
      if (!r) return;
      exam.active.answers[exam.active.at] = Number(r.value);
      save();
    });

    $('m-prev').addEventListener('click', () => move(-1));
    $('m-next').addEventListener('click', () => move(1));

    $('m-flag').addEventListener('click', () => {
      const i = exam.active.at;
      exam.active.flags[i] = !exam.active.flags[i];
      save();
      drawQuestion();
    });

    for (const b of root.querySelectorAll('.m-fs-btn')) {
      b.addEventListener('click', () => {
        const fs = settings.set({ mockFontSize: b.dataset.fs }).mockFontSize;
        $('m-exam').className = `m-fs-${fs}`;
        drawFontButtons();
      });
    }

    $('m-status').addEventListener('click', () => {
      drawStatus();
      $('m-status-ov').hidden = false;
    });
    $('m-status-close').addEventListener('click', () => { $('m-status-ov').hidden = true; });

    $('m-grid').addEventListener('click', e => {
      const cell = e.target.closest('[data-i]');
      if (!cell) return;
      exam.active.at = Number(cell.dataset.i);
      save();
      $('m-status-ov').hidden = true;
      drawQuestion();
    });

    $('m-end').addEventListener('click', () => {
      const blank = exam.active.answers.filter(a => !Number.isInteger(a)).length;
      $('m-confirm-note').textContent = blank ? `未解答が${blank}問あります。` : '';
      $('m-confirm').hidden = false;
    });
    $('m-cancel').addEventListener('click', () => { $('m-confirm').hidden = true; });
    $('m-ok').addEventListener('click', () => finish(false));

    drawFontButtons();
    drawQuestion();
  }

  function drawFontButtons() {
    const now = settings.get().mockFontSize;
    for (const b of root.querySelectorAll('.m-fs-btn')) {
      b.classList.toggle('is-on', b.dataset.fs === now);
    }
  }

  function drawClock() {
    const el = $('m-clock');
    if (!el) return;
    el.textContent = mmss(exam.active.remainingMs);
    el.classList.toggle('is-warn', exam.active.remainingMs <= WARN_MS);
  }

  function drawQuestion() {
    const { active, qs } = exam;
    const i = active.at;
    const q = qs[i];

    $('m-page').textContent = `${qs.length}ページ中 ${i + 1}ページ目`;
    $('m-flagmark').hidden = !active.flags[i];
    // 章番号もページ番号も出さない。本番では得られない情報であり、ヒントになってしまう。
    $('m-qtext').textContent = q.question;
    $('m-choices').innerHTML = q.choices.map((c, k) => `
      <label class="m-choice">
        <input type="radio" name="m-a" value="${k}" ${active.answers[i] === k ? 'checked' : ''}>
        <span>${esc(c)}</span>
      </label>`).join('');

    $('m-prev').disabled = i === 0;
    $('m-next').disabled = i === qs.length - 1;
    $('m-flag').classList.toggle('is-on', Boolean(active.flags[i]));

    drawClock();
    window.scrollTo(0, 0);
  }

  // 解答状況のマス目。出題数ぶん並べ、解答済み・後で見直す・現在位置を見分けられるようにする。
  function drawStatus() {
    const { active, qs } = exam;
    $('m-grid').innerHTML = qs.map((_, i) => {
      const cls = [
        'm-cell',
        Number.isInteger(active.answers[i]) ? 'is-done' : '',
        active.flags[i] ? 'is-flag' : '',
        i === active.at ? 'is-now' : '',
      ].filter(Boolean).join(' ');
      return `<button class="${cls}" data-i="${i}">${i + 1}</button>`;
    }).join('');
  }

  function move(delta) {
    const next = exam.active.at + delta;
    if (next < 0 || next >= exam.qs.length) return;
    exam.active.at = next;
    save();
    drawQuestion();
  }

  function save() {
    mockState.saveActive(exam.active);
  }

  // ---- 採点 ----------------------------------------------------------
  function finish(timedOut) {
    const graded = gradeExam(exam.qs, exam.active.answers);
    mockState.clearActive();
    exam = null;
    drawResult(graded, timedOut);
  }

  function drawResult(graded, timedOut) {
    root.innerHTML = `
      <div class="card">
        ${timedOut ? '<div class="error">時間切れです。</div>' : ''}
        <div class="q-score">${esc(graded.score)} / ${esc(graded.total)} 問正解</div>
        <div class="bar" style="margin-top:10px"><i style="width:${Math.round(graded.rate * 100)}%"></i></div>
      </div>
      <div class="s-btns">
        <button class="btn" id="m-again">もう一度挑戦</button>
        <button class="btn ghost" id="m-back">テストに戻る</button>
      </div>
    `;
    $('m-again').addEventListener('click', startExam);
    $('m-back').addEventListener('click', () => nav.showTab('quiz'));
  }

  drawHome();

  // この画面が登録するリスナーは全て root 配下の要素に直接付いているので、
  // app.js が innerHTML を空にすれば一緒に捨てられる。
  // タイマーを持つようになったら、ここで必ず止めること。
  return () => {};
}
