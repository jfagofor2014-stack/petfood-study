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
const QUIT_GUARD_MS = 400;

// 山の途中で画面を離れたとき（「この節を読む」・タブ移動）に預けておく場所。
// 画面を作り直すと renderFlash の中の変数は捨てられるので、モジュールの中に置く。
// js/views/player.js の pendingOpen と同じ流儀。再読み込みすると消えるが、
// 節を読みに行って戻る寄り道を救うのが目的なので、それで足りる。
// { deck, recorded }。recorded（記録済みのカードID）も一緒に預けないと、
// 再開後に同じカードを二重に成績へ記録してしまう。
let parked = null;

export function renderFlash(root, ctx, nav) {
  const { book, quizResults } = ctx;
  const questions = book.questions || [];

  const $ = id => root.querySelector('#' + id);

  let deck = null;
  let shown = false;        // 裏を見せているか
  let locked = false;       // 判定の二重タップ防止
  let recorded = new Set(); // この山で成績に記録済みのカードID
  let drawnAt = 0;          // カードを描いた時刻。直後の誤タップで「やめる」を通さないため

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
      ${parked ? `<div class="card">
        <button class="btn" id="f-resume">途中の山を続ける（残り${parked.deck.remaining()}枚）</button>
        <div class="s-btns"><button class="btn danger sm" id="f-discard">この山を捨てる</button></div>
      </div>` : ''}
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

    if ($('f-resume')) $('f-resume').addEventListener('click', resume);
    if ($('f-discard')) $('f-discard').addEventListener('click', () => { parked = null; menu(); });
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
    parked = null;   // 新しい山を始めたら、預けていた山は捨てる
    deck = createDeck(cards);
    shown = false;
    // 「あやしい」は山の最後に戻り、覚えるまで何度も出る。そのたびに成績へ
    // 記録すると、1枚で手こずっただけで attempts が膨らみ正答率が不自然に下がって、
    // テスト・模試と共有している苦手リストの上位をカードが占拠してしまう。
    // そこで1回の山につき1枚1回だけ記録し、最初の判断をその回の成績とする。
    recorded = new Set();
    drawCard();
  }

  // 預けた山を戻す。表から描き直す（裏を見ていた途中でも、もう一度めくってもらう）。
  function resume() {
    if (!parked) return;
    deck = parked.deck;
    recorded = parked.recorded;
    parked = null;
    shown = false;
    drawCard();
  }

  function drawCard() {
    if (deck.isDone()) { drawResult(); return; }
    locked = false;
    drawnAt = Date.now();

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
    // 判定の二重タップは、1回目で画面が差し替わるため2回目が新しい画面の
    // 「やめる」に当たる。locked だけでは（drawCard が解錠するので）防げないため、
    // 描いた直後の短い間は「やめる」を受け付けない。
    $('f-quit').addEventListener('click', () => {
      if (Date.now() - drawnAt < QUIT_GUARD_MS) return;
      // 「やめる」は意図して捨てる操作なので預けない。
      deck = null;
      parked = null;
      menu();
    });
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
    // 判定すると裏面が畳まれてボタンが上にずれる。素早い2回目のタップが
    // 「やめる」に当たって山ごと捨てられないよう、quiz.js と同じく錠をかける。
    if (locked) return;
    locked = true;
    // 自己申告を既存の成績に流す。テスト・模試・カードで同じ苦手リストを共有する。
    // 記録は1山につき1枚1回だけ（理由は start() のコメント）。山の進み方は毎回動かす。
    if (!recorded.has(card.id)) {
      quizResults.record(card.id, ok);
      recorded.add(card.id);
    }
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
        <button class="btn" id="f-again">別のカードを選ぶ</button>
        <button class="btn ghost" id="f-back">テストに戻る</button>
      </div>
    `;
    $('f-again').addEventListener('click', menu);
    $('f-back').addEventListener('click', () => nav.showTab('quiz'));
    window.scrollTo(0, 0);
  }

  // この画面のリスナーは全て root 配下の要素に直接付いているので、
  // app.js が innerHTML を空にすれば一緒に捨てられる。タイマーも持たない。
  // 山の途中で離れる（「この節を読む」・タブ移動）ときだけ、山を預けておく。
  return () => {
    if (deck && !deck.isDone()) parked = { deck, recorded };
  };
}
