# フラッシュカード 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存219問をカードにして、選択肢を見ずに思い出す練習（再生）ができるようにする。覚えるまで繰り返す。

**Architecture:** 山の進み方だけを `js/lib/flashcards.js` に純粋ロジックとして切り出し、出題の選び方は既存の `js/lib/quizpick.js` をそのまま使う。画面は `js/views/flash.js`。模擬試験と同じく、タブを増やさず独立画面として `app.js` に登録する。

**Tech Stack:** Vanilla JS（ES Modules）、ビルドなし、外部依存ゼロ、`node --test`。

**設計書:** `docs/superpowers/specs/2026-09-30-flashcards-design.md`

## Global Constraints

- ビルドステップなし・外部依存ゼロ。ライブラリを足さない
- `js/lib/` のモジュールは `window` / `document` / `localStorage` / `indexedDB` に直接触らない
- `js/views/` にはテストを書かない（既存方針）
- 教材由来の文字列は `innerHTML` に入れる前に必ず `escapeHtml` を通す（`textContent` 経由なら不要）
- コメントは日本語で書き、「なぜそうしたか」を書く
- 教材の本文（問題文・解説・選択肢）をコードやコメントに書かない
- **カードの表に選択肢・正解・解説・章番号・ページ番号を出さない。** これがこの機能の要点
- 対象端末は Pixel 8a / Android Chrome。幅 375px と 412px の両方で崩れないこと
- 主要ボタンは最小 48px（既存の `.btn` に準拠）
- **`display` を指定する CSS クラスには必ず `[hidden]` 版のルールも書く**（このコードベースで3回踏んだ罠）
- 教材データ（`petfood-data.json` / `*.pdf`）をコミットしない。`.gitignore` を編集しない
- テストは `node --test` で実行する
- コミットメッセージは日本語で書き、末尾に次の1行を入れる:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## File Structure

| ファイル | 責務 |
|---|---|
| `js/lib/flashcards.js`（新規） | 山の進み方。純粋関数 |
| `test/flashcards.test.js`（新規） | 上のテスト |
| `js/views/flash.js`（新規） | メニュー・カード・終わりの3状態 |
| `js/app.js`（変更） | `views.flash` 登録、`TAB_OF` に `flash: 'quiz'` |
| `js/views/quiz.js`（変更） | 模擬試験の下に入口 |
| `css/style.css`（変更） | カードのスタイル |
| `sw.js`（変更） | `CACHE` を上げ、新規2ファイルを `ASSETS` へ |

---

### Task 1: 山の進み方

**Files:**
- Create: `js/lib/flashcards.js`
- Test: `test/flashcards.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `createDeck(cards) -> { current, size, remaining, doneCount, againCount, firstTryCount, isDone, known, unsure }`

- [ ] **Step 1: Write the failing test**

`test/flashcards.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../js/lib/flashcards.js';

// カードは問題オブジェクト。この山のロジックが見るのは id だけ。
const cards = n => Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` }));

test('最初のカードは山の先頭', () => {
  const d = createDeck(cards(3));
  assert.equal(d.current().id, 'q1');
  assert.equal(d.size(), 3);
  assert.equal(d.remaining(), 3);
  assert.equal(d.isDone(), false);
});

test('わかったにすると山から消えて次へ進む', () => {
  const d = createDeck(cards(3));
  d.known();
  assert.equal(d.current().id, 'q2');
  assert.equal(d.remaining(), 2);
  assert.equal(d.doneCount(), 1);
});

test('あやしいにすると山の最後へ回る', () => {
  const d = createDeck(cards(3));
  d.unsure();
  assert.equal(d.current().id, 'q2');
  assert.equal(d.remaining(), 3);      // 減らない
  assert.equal(d.doneCount(), 0);
  d.known(); d.known();                // q2, q3 を覚える
  assert.equal(d.current().id, 'q1');  // 戻ってきた
});

test('全部わかったにすると終わる', () => {
  const d = createDeck(cards(3));
  d.known(); d.known(); d.known();
  assert.equal(d.isDone(), true);
  assert.equal(d.remaining(), 0);
  assert.equal(d.current(), null);
  assert.equal(d.doneCount(), 3);
});

test('あやしいを挟んでも、覚えるまで終わらない', () => {
  const d = createDeck(cards(2));
  d.unsure();            // q1 を後ろへ → [q2, q1]
  d.known();             // q2 覚えた → [q1]
  assert.equal(d.isDone(), false);
  assert.equal(d.current().id, 'q1');
  d.known();             // q1 覚えた → []
  assert.equal(d.isDone(), true);
  assert.equal(d.doneCount(), 2);
});

test('あやしいを押した延べ回数を数える', () => {
  const d = createDeck(cards(2));
  d.unsure();            // [q2, q1]
  d.unsure();            // [q1, q2]
  d.known(); d.known();
  assert.equal(d.againCount(), 2);
  assert.equal(d.isDone(), true);
});

test('1回で覚えた枚数を数える', () => {
  const d = createDeck(cards(3));
  d.known();             // q1 は一発
  d.unsure();            // q2 をあやしいに
  d.known();             // q3 は一発
  d.known();             // 戻ってきた q2 を覚えた（一発ではない）
  assert.equal(d.firstTryCount(), 2);
  assert.equal(d.doneCount(), 3);
});

test('山が1枚のときにあやしいを押すと同じカードが戻る', () => {
  const d = createDeck(cards(1));
  d.unsure();
  assert.equal(d.current().id, 'q1');
  assert.equal(d.remaining(), 1);
  assert.equal(d.isDone(), false);
});

test('空の山は最初から終わっている', () => {
  const d = createDeck([]);
  assert.equal(d.isDone(), true);
  assert.equal(d.current(), null);
  assert.equal(d.size(), 0);
  assert.equal(d.remaining(), 0);
  assert.equal(d.doneCount(), 0);
});

test('空の山で操作しても落ちない', () => {
  const d = createDeck([]);
  assert.doesNotThrow(() => { d.known(); d.unsure(); });
  assert.equal(d.isDone(), true);
  assert.equal(d.doneCount(), 0);
  assert.equal(d.againCount(), 0);
});

test('null を渡しても落ちない', () => {
  const d = createDeck(null);
  assert.equal(d.size(), 0);
  assert.equal(d.isDone(), true);
  assert.equal(d.current(), null);
});

test('元の配列を壊さない', () => {
  const src = cards(3);
  const d = createDeck(src);
  d.known(); d.unsure();
  assert.deepEqual(src.map(c => c.id), ['q1', 'q2', 'q3']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/taichi/petfood-study && node --test test/flashcards.test.js`
Expected: FAIL — `Cannot find module '.../js/lib/flashcards.js'`

- [ ] **Step 3: Write minimal implementation**

`js/lib/flashcards.js` を新規作成する。

```js
// カードの山の進み方。DOM も storage も触らない純粋ロジック。
//
// 「あやしい」にしたカードは山の最後へ戻す。1周して終わりではなく、
// 全部「わかった」になるまで回す形にしている。覚えるための反復が目的なので、
// 取りこぼしたまま終われないようにする。
//
// どのカードを出すかは既存の js/lib/quizpick.js が決める。ここは順番だけを持つ。

export function createDeck(cards) {
  // 呼び出し側の配列を壊さないよう複製する。
  const queue = Array.isArray(cards) ? [...cards] : [];
  const total = queue.length;

  const done = new Set();     // 「わかった」にしたカードのID
  const missed = new Set();   // 一度でも「あやしい」にしたカードのID
  let again = 0;              // 「あやしい」を押した延べ回数

  return {
    current() {
      return queue.length ? queue[0] : null;
    },

    size() { return total; },
    remaining() { return queue.length; },
    doneCount() { return done.size; },
    againCount() { return again; },

    // 一度も「あやしい」を押さずに覚えたカードの枚数。終了画面で出す。
    firstTryCount() {
      let n = 0;
      for (const id of done) if (!missed.has(id)) n += 1;
      return n;
    },

    isDone() { return queue.length === 0; },

    known() {
      const card = queue.shift();
      if (card) done.add(card.id);
    },

    unsure() {
      const card = queue.shift();
      if (!card) return;
      again += 1;
      missed.add(card.id);
      queue.push(card);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/taichi/petfood-study && node --test test/flashcards.test.js`
Expected: PASS（12テストすべて）

- [ ] **Step 5: 既存テストを壊していないことを確認**

Run: `cd /Users/taichi/petfood-study && node --test`
Expected: PASS（既存202件＋12件＝214件）

- [ ] **Step 6: Commit**

```bash
cd /Users/taichi/petfood-study
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
git add js/lib/flashcards.js test/flashcards.test.js
git commit -m "$(cat <<'MSG'
カードの山の進み方を追加

「あやしい」にしたカードは山の最後へ戻し、全部「わかった」になるまで終わらない。
覚えるための反復が目的なので、取りこぼしたまま1周で終われないようにする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: カードの画面

**Files:**
- Create: `js/views/flash.js`
- Modify: `js/app.js`
- Modify: `js/views/quiz.js`（`menu()` の模擬試験カードの直後）
- Modify: `css/style.css`（末尾に追記）
- Modify: `sw.js`（`CACHE` と `ASSETS`）

**Interfaces:**
- Consumes: `createDeck(cards)`（Task 1）、既存の `pickForSection` / `pickForChapter` / `pickWeak`（`js/lib/quizpick.js`）、`listSections`（`js/lib/book.js`）、`openPlayerAt`（`js/views/player.js`）、`escapeHtml`（`js/lib/html.js`）、`ctx.quizResults`
- Produces: `renderFlash(root, ctx, nav) -> teardown`

- [ ] **Step 1: `js/views/flash.js` を作る**

```js
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
```

- [ ] **Step 2: `js/app.js` に登録する**

import 群（`import { renderMock } from './views/mock.js';` の下）に足す。

```js
import { renderFlash } from './views/flash.js';
```

`views` と `TAB_OF` を差し替える。

変更前:

```js
const views = { player: renderPlayer, toc: renderToc, quiz: renderQuiz, settings: renderSettings, mock: renderMock };
```

変更後:

```js
const views = { player: renderPlayer, toc: renderToc, quiz: renderQuiz, settings: renderSettings, mock: renderMock, flash: renderFlash };
```

`TAB_OF` に1行足す。

変更前:

```js
const TAB_OF = { mock: 'quiz' };
```

変更後:

```js
const TAB_OF = { mock: 'quiz', flash: 'quiz' };
```

注: `js/app.js` の現在の書き方が上と細部で違う場合がある。**`views` に `flash: renderFlash` を、
`TAB_OF` に `flash: 'quiz'` を足すこと**が要件であり、既存の並びは変えなくてよい。

- [ ] **Step 3: `js/views/quiz.js` に入口を足す**

`menu()` の `root.innerHTML` にある模擬試験のカードの直後に足す。

変更前:

```js
      <div class="card">
        <button class="btn" id="q-mock">本番形式の模擬試験（25問・60分）</button>
        <p class="muted">答えを見ずに25問を通して解き、最後にまとめて採点します。</p>
      </div>
```

変更後:

```js
      <div class="card">
        <button class="btn" id="q-mock">本番形式の模擬試験（25問・60分）</button>
        <p class="muted">答えを見ずに25問を通して解き、最後にまとめて採点します。</p>
      </div>
      <div class="card">
        <button class="btn" id="q-flash">カードで覚える</button>
        <p class="muted">選択肢を見ずに思い出す練習です。覚えるまで繰り返します。</p>
      </div>
```

`root.querySelector('#q-mock').addEventListener(...)` の直後に1行足す。

```js
    root.querySelector('#q-flash').addEventListener('click', () => nav.showTab('flash'));
```

- [ ] **Step 4: `css/style.css` の末尾にスタイルを足す**

```css
/* フラッシュカード */
.f-card { min-height: 180px; }
.f-q { font-weight: 700; font-size: 17px; line-height: 1.7; }
.f-sep { border: 0; border-top: 1px solid var(--line); margin: 14px 0; }
.f-a { font-weight: 700; color: var(--accent); margin-bottom: 8px; }

#f-ctrl { margin-bottom: 12px; }
#f-ctrl .btn { width: 100%; }
.f-judge { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
```

- [ ] **Step 5: `sw.js` を更新する**

`CACHE` を上げる。

変更前:

```js
const CACHE = 'pfs-v4';
```

変更後:

```js
const CACHE = 'pfs-v5';
```

`ASSETS` に2行足す。`'js/lib/db.js',` の下に1行、`'js/views/mock.js',` の上に1行。

```js
  'js/lib/flashcards.js',
```

```js
  'js/views/flash.js',
```

- [ ] **Step 6: テストが通ることを確認**

Run: `cd /Users/taichi/petfood-study && node --test`
Expected: PASS（214件）

- [ ] **Step 7: ブラウザで確認する**

`preview_start` で dev サーバを起動する（`.claude/launch.json` の `petfood`。見つからなければ
グローバル登録の `petfood-study` を使う。ポートは結果に出る）。

教材が未取り込みなら、一時コピーを作ってから `javascript_tool` で IndexedDB に入れる:

```
cp /Users/taichi/Downloads/petfood-data.json /Users/taichi/petfood-study/petfood-data.json
```

```js
const data = await (await fetch('/petfood-data.json')).json();
await new Promise((resolve, reject) => {
  const req = indexedDB.open('petfood-study', 1);
  req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('book')) db.createObjectStore('book'); };
  req.onsuccess = () => { const db = req.result; const t = db.transaction('book','readwrite');
    t.objectStore('book').put(data,'current'); t.oncomplete = () => { db.close(); resolve('ok'); }; t.onerror = () => reject(t.error); };
  req.onerror = () => reject(req.error);
});
```

**確認が終わったら必ず `rm /Users/taichi/petfood-study/petfood-data.json` で消すこと。**

幅412pxと375pxの両方で確認する項目:

1. テストタブに「カードで覚える」が出て、押すとメニューが表示される。**タブバーの「テスト」が選択されたまま**である
2. 章を1つ選ぶとカードが出る。**表に問題文しか出ていない**。次で確かめる:

```js
({ text: document.querySelector('.f-card').innerText, backSideEmpty: document.getElementById('f-back-side').innerHTML === '' })
```

   `text` に選択肢・解説・「第◯章」「p.◯」が含まれていないこと、`backSideEmpty` が `true` であること

3. 「答えを見る」で正解・解説・章とページ・「この節を読む」が出る
4. 「わかった」で次のカードへ進み、枚数の表示が1つ進む
5. **「あやしい」にしたカードが山の最後に戻る。** 最初のカードの問題文を控えておき、
   「あやしい」を押してから残りを全部「わかった」にすると、最後にそのカードが戻ってくること
6. 全部「わかった」にすると終了画面が出て、「◯枚を覚えました」「1回で覚えたカード ◯ / ◯」が出る
7. 「この節を読む」で「きく」画面のその節が開く
8. カードで「あやしい」にした問題が、テストタブの「苦手な問題を解く」の対象に入る
   （実行前後で `Object.keys(JSON.parse(localStorage.getItem('pfs:quiz')||'{}')).length` を比べる）
9. 幅375pxで「あやしい」「わかった」の2ボタンが1行に収まり、横スクロールが出ない。
   ボタンの**縦中央のy座標**が同じであることで確認する（上端は使わない）
10. コンソールにエラーが出ていない

- [ ] **Step 8: Commit**

```bash
cd /Users/taichi/petfood-study
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
git status --short
git add js/views/flash.js js/app.js js/views/quiz.js css/style.css sw.js
git commit -m "$(cat <<'MSG'
カードで覚える画面を追加

表は問題文だけを出し、選択肢を見せない。4択が鍛えるのは再認だが、この試験は数値や
項目数が多く、何も見ずに思い出せる再生まで要る。「あやしい」は山の最後へ戻し、
覚えるまで繰り返す。自己申告は既存の成績に流し、同じ苦手リストを共有する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Self-Review

**Spec coverage:**

| 設計書の節 | 対応するタスク |
|---|---|
| 3. 出題の選び方 | Task 2 Step 1（既存 `quizpick.js` を使う） |
| 4. 山の進み方 | Task 1 |
| 5.1 メニュー | Task 2 Step 1 |
| 5.2 カード（表・裏） | Task 2 Step 1 |
| 5.3 終わり | Task 2 Step 1 |
| 6. 永続化（専用の保存なし） | Task 2 Step 1（`quizResults.record` のみ） |
| 7. エラー処理 | Task 2 Step 1（問題0件・0問の章節・苦手0枚） |
| 8. 構成 | Task 2 Step 2〜5 |
| 9. 受け入れ条件 | Task 2 Step 7 |

**Placeholder scan:** TBD・TODO の類は無く、コードを変える手順にはすべて実際のコードが入っている。

**Type consistency:**

- `createDeck(cards)` の戻り値 `current / size / remaining / doneCount / againCount / firstTryCount / isDone / known / unsure` — Task 1 で定義、Task 2 が使用
- `pickForChapter(questions, chapterNo, n)` / `pickForSection(questions, sectionId, n)` / `pickWeak(questions, results, n)` — 既存 `js/lib/quizpick.js`
- `listSections(chapters)` が返す `{ chapter, section, index }` — 既存 `js/lib/book.js`。`js/views/quiz.js` が同じ使い方をしている
- `openPlayerAt(sectionId, sentIndex)` — 既存 `js/views/player.js`
- `quizResults.record(questionId, ok)` / `quizResults.all()` — 既存 `js/lib/quizresults.js`
- `findSection` は使わないので import しない（Step 1 のコードもそうなっている）
