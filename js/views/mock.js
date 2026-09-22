// 本番形式の模擬試験。答えを見ずに通して解き、最後にまとめて採点する。
// 即時採点する既存のテスト画面（quiz.js）とは別物として作る。
// 本番のCBT画面（ヘッダのページ表記と残り時間、フッタの5ボタン、解答状況のパネル）に合わせる。

import { buildExam, gradeExam } from '../lib/mockexam.js';
import { escapeHtml as esc } from '../lib/html.js';
import { openPlayerAt } from './player.js';

const TOTAL = 25;
const LIMIT_MS = 60 * 60 * 1000;

// 残りがこれを切ったら時計を赤くする。本番のCBTも残り時間を赤字で見せている。
const WARN_MS = 5 * 60 * 1000;

// 毎秒 localStorage に書くと重いので、この間隔でまとめて保存する。
const SAVE_EVERY_MS = 5000;

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

// 合格基準は非公開なので合否は出さない。目安であることを明示して添える。
const PASS_HINT = '合格基準は公開されていません。目安として8割（20問）を安定して超えられれば安心です。';

export function renderMock(root, ctx, nav) {
  const { book, mockState, settings, quizResults } = ctx;
  const questions = book.questions || [];

  // 解答中だけ中身が入る。{ active: 中断データ, qs: 出題中の問題 }
  // active は mockState から読んだものをそのまま持ち回り、変更のたびに保存する。
  let exam = null;
  let timer = null;
  let lastSaved = 0;

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
    // 裏で描画された場合（教材取り込み直後など）は、可視に戻ってから動かす。
    if (!document.hidden) startTimer();
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
    lastSaved = Date.now();
  }

  // ---- タイマー ------------------------------------------------------
  // 画面が見えている間だけ進める。Android では画面が消えるとページが裏に回るため、
  // 実時間で減らし続けると着信ひとつで模試が潰れてしまう。
  function startTimer() {
    stopTimer();
    timer = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function tick() {
    if (!exam) { stopTimer(); return; }

    exam.active.remainingMs = Math.max(0, exam.active.remainingMs - 1000);
    drawClock();
    if (Date.now() - lastSaved >= SAVE_EVERY_MS) save();

    if (exam.active.remainingMs === 0) {
      save();
      finish(true);
    }
  }

  // 他アプリへの切替・画面消灯・タブ移動のいずれでもここに来る。
  // 止めたうえで即座に保存しないと、そのまま終了されたとき解答が失われる。
  const onVisibility = () => {
    if (!exam) return;
    if (document.hidden) { stopTimer(); save(); }
    else startTimer();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ---- 採点 ----------------------------------------------------------
  function finish(timedOut) {
    stopTimer();
    const { qs, active } = exam;
    const graded = gradeExam(qs, active.answers);
    const elapsedMs = Math.max(0, LIMIT_MS - active.remainingMs);

    // 模試の正誤も既存の成績に記録する。
    // こうすると間違えた問題がそのまま「苦手な問題を解く」に流れる。
    for (const d of graded.details) quizResults.record(d.q.id, d.ok);

    mockState.pushHistory({
      finishedAt: new Date().toISOString(),
      score: graded.score,
      total: graded.total,
      elapsedMs,
      byChapter: graded.byChapter,
      questionIds: qs.map(q => q.id),
    });
    mockState.clearActive();
    exam = null;

    drawResult(graded, elapsedMs, timedOut);
  }

  function drawResult(graded, elapsedMs, timedOut) {
    const pct = Math.round(graded.rate * 100);
    const chTitle = no => {
      const ch = (book.chapters || []).find(c => c.no === no);
      return ch ? `第${ch.no}章 ${ch.title}` : `第${no}章`;
    };

    root.innerHTML = `
      <div class="card">
        ${timedOut ? '<div class="error">時間切れです。</div>' : ''}
        <div class="q-score">${esc(graded.score)} / ${esc(graded.total)} 問正解</div>
        <div class="bar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
        <div class="muted" style="margin-top:6px">正答率 ${pct}％／所要時間 ${esc(fmtElapsed(elapsedMs))}</div>
        <p class="muted">${PASS_HINT}</p>
      </div>

      <div class="card">
        <div class="muted">章別</div>
        <ul class="m-bych">
          ${graded.byChapter.map(c => `<li>
            <span>${esc(chTitle(c.chapterNo))}</span>
            <b class="${c.correct === c.total ? 'is-right' : ''}">${esc(c.correct)} / ${esc(c.total)}</b>
          </li>`).join('')}
        </ul>
      </div>

      <div class="card">
        <div class="muted">すべての問題を見直す</div>
        ${graded.details.map(reviewHtml).join('')}
      </div>

      <div class="s-btns">
        <button class="btn" id="m-again">もう一度挑戦</button>
        <button class="btn ghost" id="m-back">テストに戻る</button>
      </div>
    `;

    for (const b of root.querySelectorAll('[data-goto]')) {
      b.addEventListener('click', () => {
        openPlayerAt(b.dataset.goto, 0);
        nav.showTab('player');
      });
    }
    $('m-again').addEventListener('click', startExam);
    $('m-back').addEventListener('click', () => nav.showTab('quiz'));
  }

  // 見直し1件分。ここでは解答中と違い、章・ページ・正解・解説を全て出す。
  function reviewHtml(d, i) {
    const chosen = d.chosen === null ? '未解答' : d.q.choices[d.chosen];
    return `
      <div class="m-rev">
        <div class="m-rev-h">
          <span class="muted">問${i + 1}</span>
          <span class="q-verdict ${d.ok ? 'is-right' : 'is-wrong'}">${d.ok ? '正解' : '不正解'}</span>
        </div>
        <div class="m-qtext">${esc(d.q.question)}</div>
        <div class="muted">あなたの解答：${esc(chosen)}</div>
        ${d.ok ? '' : `<div class="muted">正解：${esc(d.q.choices[d.q.answer])}</div>`}
        <p>${esc(d.q.explanation)}</p>
        <div class="muted">第${esc(d.q.chapterNo)}章（p.${esc(d.q.page)}）</div>
        <div class="s-btns"><button class="btn ghost sm" data-goto="${esc(d.q.sectionId)}">この節を読む</button></div>
      </div>
    `;
  }

  drawHome();

  // app.js が画面を切り替える前に呼ぶ。止め忘れるとタブを移ったあとも
  // 残り時間が減り続け、模試が知らないうちに時間切れになる。
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    stopTimer();
    // タブ移動も中断として扱う。残り時間と解答をここで確定保存する。
    if (exam) save();
  };
}
