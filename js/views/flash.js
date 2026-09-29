// フラッシュカード。表は問題文だけを出し、選択肢を見せない。
// 4択（テスト画面）が鍛えるのは「選択肢を見て選べる」再認だが、
// この試験は数値や項目数が多く、何も見ずに思い出せる再生まで要る。
// 自己申告は既存の成績に流すので、テスト・模試・カードが同じ苦手リストを共有する。

import { createDeck } from '../lib/flashcards.js';
import { pickForSection, pickForChapter, pickWeak } from '../lib/quizpick.js';
import { listSections } from '../lib/book.js';
import { openPlayerAt } from './player.js';
import { escapeHtml as esc } from '../lib/html.js';

const WEAK_MAX = 20;

export function renderFlash(root, ctx, nav) {
  const { book, quizResults } = ctx;
  const questions = book.questions || [];

  const $ = id => root.querySelector('#' + id);

  let deck = null;
  let shown = false;        // 裏を見せているか

  menu();

  // ---- メニュー ------------------------------------------------------
  function menu() {
    deck = null;
    const results = quizResults.all();
    const weak = pickWeak(questions, results, WEAK_MAX);
    // 問題が1問も無い節・章はボタンを出さない。空の山に入らないようにする。
    const sections = listSections(book.chapters)
      .filter(x => questions.some(q => q.sectionId === x.section.id));

    if (questions.length === 0) {
      root.innerHTML = `<div class="card">
        <div>この教材には問題が入っていません。</div>
        <p class="muted">教材ファイルに questions を入れると、ここでカード学習ができます。</p>
      </div>
      <button class="btn ghost" id="f-back">テストに戻る</button>`;
      $('f-back').addEventListener('click', () => nav.showTab('quiz'));
      return;
    }

    root.innerHTML = `
      <div class="card">
        <div class="m-h1">カードで覚える</div>
        <p>選択肢を見ずに思い出す練習です。「あやしい」にしたカードは山の最後に戻り、覚えるまで繰り返します。</p>
      </div>
      <div class="card">
        <button class="btn" id="f-weak" ${weak.length ? '' : 'disabled'}>
          苦手なカードを覚える（${weak.length}枚）
        </button>
        <p class="muted">間違えた問題と未挑戦の問題から出します。</p>
      </div>
      <div class="card">
        <div class="muted">章まとめ</div>
        ${book.chapters.map(ch => {
          const n = questions.filter(q => q.chapterNo === ch.no).length;
          return n ? `<button class="q-pick" data-kind="chapter" data-key="${esc(ch.no)}">
            第${esc(ch.no)}章 ${esc(ch.title)}<span class="muted">${n}枚</span></button>` : '';
        }).join('')}
      </div>
      <div class="card">
        <div class="muted">節ごと</div>
        ${sections.map(x => {
          const n = questions.filter(q => q.sectionId === x.section.id).length;
          return `<button class="q-pick" data-kind="section" data-key="${esc(x.section.id)}">
            ${esc(x.chapter.no)}-${esc(x.section.no)} ${esc(x.section.title)}<span class="muted">${n}枚</span></button>`;
        }).join('')}
      </div>
      <button class="btn ghost" id="f-back">テストに戻る</button>
    `;

    $('f-weak').addEventListener('click', () => start(weak));
    for (const b of root.querySelectorAll('.q-pick')) {
      b.addEventListener('click', () => {
        // 章・節は全問を出す。覚えるための反復なので取りこぼしを作らない。
        const set = b.dataset.kind === 'chapter'
          ? pickForChapter(questions, Number(b.dataset.key), questions.length)
          : pickForSection(questions, b.dataset.key, questions.length);
        start(set);
      });
    }
    $('f-back').addEventListener('click', () => nav.showTab('quiz'));
  }

  // ---- カード --------------------------------------------------------
  function start(cards) {
    if (!cards.length) return;
    deck = createDeck(cards);
    shown = false;
    drawCard();
  }

  function drawCard() {
    if (deck.isDone()) { drawResult(); return; }

    const card = deck.current();
    const total = deck.size();
    const left = deck.remaining();
    const pct = total ? Math.round(((total - left) / total) * 100) : 0;

    root.innerHTML = `
      <div class="card">
        <div class="muted">${total - left} / ${total} 枚${deck.againCount() ? `　あやしい ${deck.againCount()}回` : ''}</div>
        <div class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></div>
      </div>

      <div class="card f-card">
        <div class="f-q" id="f-q"></div>
        <div id="f-back-side"></div>
      </div>

      <div id="f-ctrl"></div>
      <button class="btn ghost" id="f-quit">やめる</button>
    `;

    // 教材由来の文字列は textContent で入れる。エスケープの取りこぼしが起きない。
    $('f-q').textContent = card.question;
    drawControls(card);
    $('f-quit').addEventListener('click', menu);
    window.scrollTo(0, 0);
  }

  function drawControls(card) {
    if (!shown) {
      // 表の間は裏の中身を DOM に入れない。開発者ツールを開かなくても
      // 見えてしまう事故を防ぐ。
      $('f-back-side').innerHTML = '';
      $('f-ctrl').innerHTML = `<button class="btn" id="f-show">答えを見る</button>`;
      $('f-show').addEventListener('click', () => { shown = true; drawControls(card); });
      return;
    }

    $('f-back-side').innerHTML = `
      <hr class="f-sep">
      <div class="f-a">${esc(card.choices[card.answer])}</div>
      <p>${esc(card.explanation)}</p>
      <div class="muted">第${esc(card.chapterNo)}章（p.${esc(card.page)}）</div>
      <div class="s-btns"><button class="btn ghost sm" id="f-goto">この節を読む</button></div>
    `;
    $('f-ctrl').innerHTML = `
      <div class="f-judge">
        <button class="btn ghost" id="f-unsure">あやしい</button>
        <button class="btn" id="f-known">わかった</button>
      </div>
    `;

    $('f-goto').addEventListener('click', () => {
      openPlayerAt(card.sectionId, 0);
      nav.showTab('player');
    });
    $('f-known').addEventListener('click', () => judge(card, true));
    $('f-unsure').addEventListener('click', () => judge(card, false));
  }

  function judge(card, ok) {
    // 自己申告を既存の成績に流す。テスト・模試・カードで同じ苦手リストを共有する。
    quizResults.record(card.id, ok);
    if (ok) deck.known(); else deck.unsure();
    shown = false;
    drawCard();
  }

  // ---- 終わり --------------------------------------------------------
  function drawResult() {
    const total = deck.size();
    const first = deck.firstTryCount();

    root.innerHTML = `
      <div class="card">
        <div class="q-score">${total}枚を覚えました</div>
        <div class="muted" style="margin-top:6px">1回で覚えたカード ${first} / ${total}</div>
      </div>
      <div class="s-btns">
        <button class="btn" id="f-again">もう一度</button>
        <button class="btn ghost" id="f-back">テストに戻る</button>
      </div>
    `;
    $('f-again').addEventListener('click', menu);
    $('f-back').addEventListener('click', () => nav.showTab('quiz'));
    window.scrollTo(0, 0);
  }

  // この画面のリスナーは全て root 配下の要素に直接付いているので、
  // app.js が innerHTML を空にすれば一緒に捨てられる。タイマーも持たない。
  return () => {};
}
