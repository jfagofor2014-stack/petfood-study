# 残課題の解消 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保存できない端末でも模擬試験を受けられ、カードの山が寄り道で消えず、スクリーンリーダーの利用者が画面の切り替えで迷子にならないようにする。

**Architecture:** 3件とも `js/views/` の中で閉じる。`js/lib/` は一切変更しない。フォーカス移動の共通処理だけを新規の `js/views/a11y.js` に置く。

**Tech Stack:** Vanilla JS（ES Modules）、ビルドなし、外部依存ゼロ。

**設計書:** `docs/superpowers/specs/2026-10-06-leftovers-design.md`

## Global Constraints

- ビルドステップなし・外部依存ゼロ。ライブラリを足さない
- **`js/lib/` を一切変更しない**
- `js/views/` にはテストを書かない（既存方針）。テスト件数は214件のまま
- 教材由来の文字列は `innerHTML` に入れる前に必ず `escapeHtml` を通す（`textContent` 経由なら不要）
- コメントは日本語で書き、「なぜそうしたか」を書く
- 教材の本文（問題文・解説・選択肢）をコードやコメントに書かない
- 対象端末は Pixel 8a / Android Chrome。幅 375px と 412px の両方で崩れないこと
- **`display` を指定する CSS クラスには必ず `[hidden]` 版のルールも書く**（このコードベースで3回踏んだ罠）
- 模擬試験の解答中の画面に章番号・ページ番号・正誤・解説を出さない（既存の制約。崩さないこと）
- カードの表に選択肢・正解・解説・章番号・ページ番号を出さない（既存の制約。崩さないこと）
- 教材データ（`petfood-data.json` / `*.pdf`）をコミットしない。`.gitignore` を編集しない
- テストは `node --test` で実行する
- コミットメッセージは日本語で書き、末尾に次の1行を入れる:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| ファイル | 変更するタスク |
|---|---|
| `js/views/mock.js` | Task 1・Task 3 |
| `js/views/flash.js` | Task 2・Task 3 |
| `js/views/quiz.js` | Task 3 |
| `js/views/a11y.js`（新規） | Task 3 |
| `js/app.js` | Task 3 |
| `index.html` | Task 3 |
| `css/style.css` | Task 3 |
| `sw.js` | Task 3 |

---

### Task 1: 保存できないときでも模擬試験を受けられるようにする

**Files:**
- Modify: `js/views/mock.js`

**Interfaces:**
- Consumes: 既存の `mockState.saveActive(state)`（形が妥当なら保存を試みて `{ ...state, v: 1 }` を返す。保存の成否は返さない）、`mockState.getActive()`
- Produces: `drawExam(active = mockState.getActive())`（`mock.js` の内部関数）

**背景:** 保存に失敗している端末で「模試を開始する」を押すと、何も起きずにトップへ戻る。`startExam()` が保存したあと `drawExam()` が `mockState.getActive()` で保存内容を読み直し、保存が失敗していると `null` が返って `drawHome()` に戻るため。

- [ ] **Step 1: `drawExam` が中断データを引数で受け取れるようにする**

変更前:

```js
  function drawExam() {
    const active = mockState.getActive();
    const qs = resolveActive(active);
```

変更後:

```js
  // 開始直後は startExam が作った状態を受け取り、保存を読み直さない。保存に失敗している
  // 端末では読み直すと null になり、開始を押しても何も起きずトップへ戻ってしまうため。
  // 保存できないのは「中断して後で再開できない」だけで、目の前の60分を解けない理由にはならない。
  // 再開のときは引数なしで呼び、保存済みのものを読む。
  function drawExam(active = mockState.getActive()) {
    const qs = resolveActive(active);
```

- [ ] **Step 2: `startExam` が作った状態をそのまま渡す**

`startExam()` の末尾を変える。

変更前:

```js
    if (!saved) return;

    drawExam();
  }
```

変更後:

```js
    if (!saved) return;

    drawExam(saved);
  }
```

- [ ] **Step 3: 再開ボタンを引数なしで呼ぶようにする**

`addEventListener('click', drawExam)` のままだと、`drawExam` の第1引数にクリックの `Event` が入ってしまう。

変更前:

```js
    if ($('m-resume')) $('m-resume').addEventListener('click', drawExam);
```

変更後:

```js
    // drawExam を直接渡すと第1引数にクリックの Event が入ってしまうので、引数なしで呼ぶ。
    if ($('m-resume')) $('m-resume').addEventListener('click', () => drawExam());
```

`drawExam` を呼んでいる箇所は上の2つ（`startExam` の末尾と再開ボタン）だけのはずである。`grep -n drawExam js/views/mock.js` で他に無いことを確かめること。

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /Users/taichi/petfood-study && node --test`
Expected: PASS（214件）

- [ ] **Step 5: ブラウザで確認する**

（dev サーバと教材の入れ方はディスパッチの指示に従う）

1. **保存が失敗していても開始できる。** `javascript_tool` で書き込みを失敗させる:

```js
window.__origSet = Storage.prototype.setItem;
Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); };
```

   テストタブ →「本番形式の模擬試験」→「模試を開始する」で**解答画面に入る**こと。
   `document.getElementById('m-page').textContent` が「25ページ中 1ページ目」であること

2. **最後まで解いて採点できる。** 1問だけ選択肢を選び、「試験終了」→「OK」で結果画面が出ること。
   `document.body.innerText.includes('問正解')` が `true`

3. 書き込みを戻す: `Storage.prototype.setItem = window.__origSet;`

4. **保存が正常なときの開始と再開は従来どおり。** 模試を開始して2問解き、もくじタブへ移って戻り、
   「中断した模試を再開する」を押すと**同じ問題・同じ解答**で再開すること

- [ ] **Step 6: Commit**

```bash
cd /Users/taichi/petfood-study
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
git add js/views/mock.js
git commit -m "$(cat <<'MSG'
保存できないときでも模擬試験を受けられるようにする

開始直後に保存内容を読み直していたため、保存に失敗している端末では null が返り、
開始を押しても何も起きずトップへ戻っていた。開始直後は作った状態をそのまま使う。
中断して再開はできないが、そのことは画面上部の帯が既に伝えている。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: カードの山を、寄り道しても失わない

**Files:**
- Modify: `js/views/flash.js`

**Interfaces:**
- Consumes: 既存の `createDeck` の戻り値（`remaining()` / `isDone()`）
- Produces: なし（画面内の振る舞い）

**背景:** カード学習中に「この節を読む」を押したりタブを移ったりすると、`app.js` の `showTab` が画面を作り直し、`renderFlash` の中の `deck` が捨てられる。1つの山が14〜30枚以上あるので失うものが大きい。

- [ ] **Step 1: 預け先をモジュールの中に置く**

`const QUIT_GUARD_MS = 400;` の下に足す。

```js
// 山の途中で画面を離れたとき（「この節を読む」・タブ移動）に預けておく場所。
// 画面を作り直すと renderFlash の中の変数は捨てられるので、モジュールの中に置く。
// js/views/player.js の pendingOpen と同じ流儀。再読み込みすると消えるが、
// 節を読みに行って戻る寄り道を救うのが目的なので、それで足りる。
// { deck, recorded }。recorded（記録済みのカードID）も一緒に預けないと、
// 再開後に同じカードを二重に成績へ記録してしまう。
let parked = null;
```

- [ ] **Step 2: メニューに「途中の山を続ける」を出す**

`menu()` の `root.innerHTML` で、最初のカード（「カードで覚える」の見出しと説明）の直後に足す。

変更前（最初のカードの終わりと、苦手カードのカードの始まり）:

```js
        <p>選択肢を見ずに思い出す練習です。「あやしい」にしたカードは山の最後に戻り、覚えるまで繰り返します。</p>
      </div>
      <div class="card">
        <button class="btn" id="f-weak"
```

変更後:

```js
        <p>選択肢を見ずに思い出す練習です。「あやしい」にしたカードは山の最後に戻り、覚えるまで繰り返します。</p>
      </div>
      ${parked ? `<div class="card">
        <button class="btn" id="f-resume">途中の山を続ける（残り${parked.deck.remaining()}枚）</button>
        <div class="s-btns"><button class="btn danger sm" id="f-discard">この山を捨てる</button></div>
      </div>` : ''}
      <div class="card">
        <button class="btn" id="f-weak"
```

注: 現在の `flash.js` の文面が上と一字一句同じでない場合は、**「カードで覚える」の見出しを含む最初のカードの直後**に挿入すること。

`menu()` のリスナー登録（`$('f-weak').addEventListener(...)` の直前）に足す。

```js
    if ($('f-resume')) $('f-resume').addEventListener('click', resume);
    if ($('f-discard')) $('f-discard').addEventListener('click', () => { parked = null; menu(); });
```

- [ ] **Step 3: 再開する関数を足す**

`start(cards)` の直後に足す。

```js
  // 預けた山を戻す。表から描き直す（裏を見ていた途中でも、もう一度めくってもらう）。
  function resume() {
    if (!parked) return;
    deck = parked.deck;
    recorded = parked.recorded;
    parked = null;
    shown = false;
    drawCard();
  }
```

- [ ] **Step 4: 新しい山を始めたら預けた山を捨てる**

`start(cards)` の中、`deck = createDeck(cards);` の直前に1行足す。

```js
    parked = null;   // 新しい山を始めたら、預けていた山は捨てる
```

- [ ] **Step 5: 「やめる」で預けた山を残さない**

「やめる」のハンドラを変える。

変更前:

```js
    $('f-quit').addEventListener('click', () => {
      if (Date.now() - drawnAt < QUIT_GUARD_MS) return;
      menu();
    });
```

変更後:

```js
    $('f-quit').addEventListener('click', () => {
      if (Date.now() - drawnAt < QUIT_GUARD_MS) return;
      // 「やめる」は意図して捨てる操作なので預けない。
      deck = null;
      parked = null;
      menu();
    });
```

- [ ] **Step 6: 画面を離れるときに山を預ける**

ファイル末尾の teardown を変える。

変更前:

```js
  // この画面のリスナーは全て root 配下の要素に直接付いているので、
  // app.js が innerHTML を空にすれば一緒に捨てられる。タイマーも持たない。
  return () => {};
}
```

変更後:

```js
  // この画面のリスナーは全て root 配下の要素に直接付いているので、
  // app.js が innerHTML を空にすれば一緒に捨てられる。タイマーも持たない。
  // 山の途中で離れる（「この節を読む」・タブ移動）ときだけ、山を預けておく。
  return () => {
    if (deck && !deck.isDone()) parked = { deck, recorded };
  };
}
```

- [ ] **Step 7: テストが通ることを確認**

Run: `cd /Users/taichi/petfood-study && node --test`
Expected: PASS（214件）

- [ ] **Step 8: ブラウザで確認する**

（dev サーバと教材の入れ方はディスパッチの指示に従う）

確認の前に `localStorage.removeItem('pfs:quiz')` で成績を空にしておく。

1. 3枚以上ある章を選ぶ。1枚目を「答えを見る」→「わかった」。2枚目で「答えを見る」→「あやしい」。
   3枚目の問題文を控え（`document.getElementById('f-q').textContent`）、「答えを見る」→「この節を読む」で「きく」画面へ移る
2. テストタブ →「カードで覚える」で、メニューの先頭近くに「途中の山を続ける（残り◯枚）」が出る。
   残り枚数が `全体 - 1`（1枚目だけ覚えた）であること
3. 「途中の山を続ける」を押すと、**控えた3枚目の問題文**が表で出る
4. その3枚目を「わかった」、続けて戻ってくる2枚目を「わかった」にする。
   `pfs:quiz` で**どのカードも `attempts` が1**であること（再開で二重に記録されていない）:

```js
Object.entries(JSON.parse(localStorage.getItem('pfs:quiz') || '{}')).map(([id, r]) => `${id}:${r.attempts}/${r.correct}`)
```

5. 別の章で山を始め、1枚判定してから「やめる」を押す。メニューに「途中の山を続ける」が**出ない**こと
   （「やめる」は描画直後400ミリ秒は受け付けないので、少し待ってから押す）
6. 山を始めて「この節を読む」で離れ、戻って「この山を捨てる」を押すと、「途中の山を続ける」が消えること
7. 山を最後まで終えてからタブを移り、戻ってもメニューに「途中の山を続ける」が出ないこと
8. コンソールにエラーが出ていない

- [ ] **Step 9: Commit**

```bash
cd /Users/taichi/petfood-study
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
git add js/views/flash.js
git commit -m "$(cat <<'MSG'
カードの山を寄り道しても失わないようにする

「この節を読む」やタブ移動で画面を離れると山が丸ごと消えていた。1つの山が14〜30枚以上
あるので失うものが大きい。離れるときに途中の山をモジュールの中に預け、戻ったら
メニューの先頭から続けられるようにする。記録済みのカードIDも一緒に預け、二重記録を防ぐ。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: フォーカスを次に読む場所へ動かす

**Files:**
- Create: `js/views/a11y.js`
- Modify: `js/app.js`、`js/views/flash.js`、`js/views/quiz.js`、`js/views/mock.js`、`index.html`、`css/style.css`、`sw.js`

**Interfaces:**
- Consumes: Task 1 の `drawExam(active)`、Task 2 の `menu()` / `drawCard()` の構造
- Produces: `moveFocus(el)`（`js/views/a11y.js`）

**背景:** 画面の中身を `innerHTML` で差し替える作りのため、押したボタンが消えるとフォーカスが `body` に落ち、スクリーンリーダーの利用者が迷子になる。

- [ ] **Step 1: `js/views/a11y.js` を作る**

```js
// 画面の中身を innerHTML で差し替える作りのため、押したボタンが消えると
// フォーカスが body に落ち、スクリーンリーダーの利用者が迷子になる。
// 次に読むべき場所へフォーカスを移す。目で見ている人の読み位置は動かさない。

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

export function moveFocus(el) {
  if (!el) return;
  // もともとフォーカスできない要素（div など）は、プログラムからだけ移せるようにする。
  if (!el.matches(FOCUSABLE)) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}
```

- [ ] **Step 2: `css/style.css` の末尾に足す**

```css
/* プログラムからフォーカスを移した読み物（問題文・答え・見出しなど）には枠線を出さない。
   操作する対象ではなく、読み上げの位置を合わせるためだけに移しているので。 */
[tabindex="-1"]:focus { outline: none; }
```

- [ ] **Step 3: `index.html` の帯に `role="alert"` を付ける**

変更前:

```html
  <div id="storage-warn" class="warn-bar" hidden>
```

変更後:

```html
  <div id="storage-warn" class="warn-bar" role="alert" hidden>
```

- [ ] **Step 4: `js/app.js` の `showTab` で画面の先頭へフォーカスを移す**

import 群に足す（`import { renderFlash } from './views/flash.js';` の下）。

```js
import { moveFocus } from './views/a11y.js';
```

`showTab` の末尾を変える。

変更前:

```js
  el.view.innerHTML = '';
  const render = views[name];
  if (render) teardown = render(el.view, ctx, { showTab }) || null;
  else el.view.innerHTML = '<div class="card muted">この画面はまだありません。</div>';
}
```

変更後:

```js
  el.view.innerHTML = '';
  const render = views[name];
  if (render) teardown = render(el.view, ctx, { showTab }) || null;
  else el.view.innerHTML = '<div class="card muted">この画面はまだありません。</div>';
  // 画面が自分でより具体的な場所（問題文など）へフォーカスを移さなかったときだけ、
  // 画面の先頭へ移す。タブのボタンにフォーカスが残ったままだと、新しい画面が読まれない。
  if (!el.view.contains(document.activeElement)) moveFocus(el.view);
}
```

- [ ] **Step 5: `js/views/flash.js` にフォーカス移動を足す**

import 群に足す。

```js
import { moveFocus } from './a11y.js';
```

`menu()` の**問題がある場合の**描画のあと（リスナー登録の最後、`$('f-back').addEventListener(...)` の直後）に足す。

```js
    // 「やめる」「別のカードを選ぶ」で戻ってくると押したボタンが消えるので、画面の先頭へ移す。
    moveFocus(root.firstElementChild);
```

`drawCard()` で、`window.scrollTo(0, 0);` の直前に足す。

```js
    moveFocus($('f-q'));
```

`drawControls(card)` の**裏を出す側**の最後（`$('f-unsure').addEventListener(...)` の直後）に足す。

```js
    // 「答えを見る」を押すとそのボタン自体が消えるので、めくった答えへ移す。
    moveFocus($('f-back-side'));
```

`drawResult()` の「◯枚を覚えました」に id を付け、そこへ移す。

変更前:

```js
        <div class="q-score">${total}枚を覚えました</div>
```

変更後:

```js
        <div class="q-score" id="f-score">${total}枚を覚えました</div>
```

`drawResult()` の `window.scrollTo(0, 0);` の直前に足す。

```js
    moveFocus($('f-score'));
```

- [ ] **Step 6: `js/views/quiz.js` にフォーカス移動を足す**

import 群に足す。

```js
import { moveFocus } from './a11y.js';
```

`show()` の最後（選択肢のリスナー登録の `for` 文の直後）に足す。

```js
      moveFocus(root.querySelector('.q-text'));
```

`answer()` の最後（`root.querySelector('#q-after').scrollIntoView(...)` の直後）に足す。

```js
      // 選んだ選択肢は disabled になってフォーカスが外れるので、正誤と解説へ移す。
      moveFocus(root.querySelector('#q-after'));
```

`result()` の最後（`root.querySelector('#q-back').addEventListener('click', menu);` の直後）に足す。

```js
      moveFocus(root.querySelector('.q-score'));
```

`menu()` の最後（リスナー登録がすべて終わった後）に足す。

```js
    // 「テストの選択に戻る」で戻ってくると押したボタンが消えるので、画面の先頭へ移す。
    moveFocus(root.firstElementChild);
```

注: `menu()` の冒頭に「問題が0問」のときの早期 return がある場合、その分岐には足さなくてよい。

- [ ] **Step 7: `js/views/mock.js` にフォーカス移動とダイアログ化を足す**

import 群に足す。

```js
import { moveFocus } from './a11y.js';
```

**(a) トップ画面:** `drawHome()` の最後（`$('m-back').addEventListener(...)` の直後）に足す。

```js
    // 「破棄して最初から」で描き直すと押したボタンが消えるので、画面の先頭へ移す。
    moveFocus(root.firstElementChild);
```

**(b) 問題文:** `drawQuestion()` の `window.scrollTo(0, 0);` の直前に足す。

```js
    moveFocus($('m-qtext'));
```

**(c) 結果:** `drawResult()` の「◯ / ◯ 問正解」の `div` を探し、`window.scrollTo(0, 0);` の直前に足す。

```js
    moveFocus(root.querySelector('.q-score'));
```

**(d) パネルをダイアログとして名乗らせる。** `drawExam` の `root.innerHTML` の2つのオーバーレイを変える。

変更前:

```html
      <div class="m-ov" id="m-status-ov" hidden>
        <div class="m-ov-panel">
          <div class="m-h1">解答状況</div>
```

変更後:

```html
      <div class="m-ov" id="m-status-ov" role="dialog" aria-modal="true" aria-labelledby="m-status-title" hidden>
        <div class="m-ov-panel">
          <div class="m-h1" id="m-status-title">解答状況</div>
```

変更前:

```html
      <div class="m-ov" id="m-confirm" hidden>
        <div class="m-ov-panel">
          <p>試験を終了します。よろしいですか？</p>
```

変更後:

```html
      <div class="m-ov" id="m-confirm" role="dialog" aria-modal="true" aria-labelledby="m-confirm-title" hidden>
        <div class="m-ov-panel">
          <p id="m-confirm-title">試験を終了します。よろしいですか？</p>
```

**(e) 開閉の関数を足す。** `renderMock` の中、`let exam = null;` の近く（状態変数の並び）に足す。

```js
  // パネル（解答状況・終了確認）を開く前にフォーカスがあった要素。閉じたらそこへ戻す。
  let returnFocus = null;
```

`drawFontButtons()` の直前（関数定義の並び）に足す。

```js
  // パネルをダイアログとして開閉する。開いたらパネルの中へ、閉じたら開く前の場所
  // （押したボタン）へフォーカスを戻す。解答状況は今の問題のマスへ移すと位置が分かりやすい。
  function openPanel(ov) {
    returnFocus = document.activeElement;
    ov.hidden = false;
    moveFocus(ov.querySelector('.is-now') || ov.querySelector('button'));
  }

  function closePanel(ov) {
    ov.hidden = true;
    if (returnFocus && root.contains(returnFocus)) moveFocus(returnFocus);
    returnFocus = null;
  }
```

**(f) 開閉をこの関数に置き換える。** `drawExam` の中のリスナーを変える。

変更前:

```js
    $('m-status').addEventListener('click', () => {
      drawStatus();
      $('m-status-ov').hidden = false;
    });
    $('m-status-close').addEventListener('click', () => { $('m-status-ov').hidden = true; });
```

変更後:

```js
    $('m-status').addEventListener('click', () => {
      drawStatus();
      openPanel($('m-status-ov'));
    });
    $('m-status-close').addEventListener('click', () => closePanel($('m-status-ov')));
```

`$('m-grid')` のクリックハンドラの中:

変更前:

```js
      $('m-status-ov').hidden = true;
      drawQuestion();
```

変更後:

```js
      closePanel($('m-status-ov'));
      drawQuestion();   // フォーカスは新しい問題文へ移る（drawQuestion の中で移す）
```

`$('m-end')` のハンドラの中:

変更前:

```js
      $('m-confirm').hidden = false;
```

変更後:

```js
      openPanel($('m-confirm'));
```

`$('m-cancel')`:

変更前:

```js
    $('m-cancel').addEventListener('click', () => { $('m-confirm').hidden = true; });
```

変更後:

```js
    $('m-cancel').addEventListener('click', () => closePanel($('m-confirm')));
```

**(g) Escape で閉じる。** `$('m-ok').addEventListener(...)` の直後に足す。

```js
    for (const ov of [$('m-status-ov'), $('m-confirm')]) {
      ov.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(ov); });
    }
```

- [ ] **Step 8: `sw.js` を更新する**

変更前:

```js
const CACHE = 'pfs-v5';
```

変更後:

```js
const CACHE = 'pfs-v6';
```

`ASSETS` の `'js/views/flash.js',` の直前に1行足す（アルファベット順で `a11y` は views の先頭）。

```js
  'js/views/a11y.js',
```

- [ ] **Step 9: テストが通ることを確認**

Run: `cd /Users/taichi/petfood-study && node --test`
Expected: PASS（214件）

- [ ] **Step 10: ブラウザで確認する**

（dev サーバと教材の入れ方はディスパッチの指示に従う）

フォーカスの位置は次で調べる:

```js
(() => { const a = document.activeElement; return { tag: a.tagName, id: a.id, cls: a.className, text: (a.textContent || '').trim().slice(0, 30) }; })()
```

**注意: JS の `.click()` はボタンにフォーカスを移さない。** 「閉じたら押したボタンへ戻る」を確かめるときは、
先に `el.focus()` してから `el.click()` すること（あるいは `computer` で実際にクリックする）。

1. タブを切り替えると、フォーカスが `#view` の中にある（タブのボタンに残っていない）
2. カード: 表を描くと `#f-q`、「答えを見る」で `#f-back-side`、判定すると次の `#f-q`、終わると `#f-score`
3. カード: 「やめる」でメニューへ戻ると、フォーカスがメニューの先頭のカード
4. テスト: 問題を描くと `.q-text`、解答すると `#q-after`、結果で `.q-score`
5. 模試: 問題を描くと `#m-qtext`。「次の問題」で次の `#m-qtext`。**「後で見直す」を押してもフォーカスは「後で見直す」のボタンのまま**
6. 模試: 「解答状況」を押すと `role="dialog"` のパネルの中の今の問題のマスへ。「閉じる」で「解答状況」のボタンへ戻る
7. 模試: 「試験終了」でパネル内の「キャンセル」へ。Escape キーで閉じると「試験終了」のボタンへ戻る:

```js
document.getElementById('m-confirm').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
```

8. 模試: マスを押して問題へ移ると、フォーカスがその問題の `#m-qtext`
9. 帯が `role="alert"` を持つ（`document.getElementById('storage-warn').getAttribute('role')`）
10. **目で見ている人の見た目が変わっていない。** フォーカスした読み物に枠線が出ていないこと
    （`getComputedStyle(document.activeElement).outlineStyle` が `none`）、
    フォーカス移動でスクロール位置が飛んでいないこと（`window.scrollY` が各操作の前後で既存の挙動どおり）
11. 幅375pxで崩れがない。コンソールにエラーが出ていない

- [ ] **Step 11: Commit**

```bash
cd /Users/taichi/petfood-study
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
git status --short
git add js/views/a11y.js js/app.js js/views/flash.js js/views/quiz.js js/views/mock.js index.html css/style.css sw.js
git commit -m "$(cat <<'MSG'
フォーカスを次に読む場所へ動かす

画面の中身を innerHTML で差し替える作りのため、押したボタンが消えるとフォーカスが
body に落ち、スクリーンリーダーの利用者が迷子になっていた。新しい問題文・めくった答え・
正誤・画面の先頭へフォーカスを移す。模試のパネルはダイアログとして名乗らせ、開閉で
フォーカスを出し入れする。保存失敗の帯は出たときに読み上げられるようにする。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

---

## Self-Review

**Spec coverage:**

| 設計書の節 | 対応するタスク |
|---|---|
| 1. 保存できないときでも模擬試験を受けられる | Task 1 |
| 2. カードの山を寄り道しても失わない | Task 2 |
| 3. アクセシビリティ（各画面の移す先・パネル・帯） | Task 3 |
| 4. 構成 | Task 1〜3 |
| 5. 受け入れ条件 | Task 1 Step 5、Task 2 Step 8、Task 3 Step 10 |

**Placeholder scan:** TBD・TODO の類は無く、コードを変える手順にはすべて実際のコードが入っている。

**Type consistency:**

- `drawExam(active = mockState.getActive())` — Task 1 で定義。Task 3 は `drawExam` 自体を変えず、中の HTML とリスナーだけを変える
- `parked = { deck, recorded }` — Task 2 で定義、Task 2 の中だけで使う
- `moveFocus(el)` — Task 3 Step 1 で定義、Task 3 の各 Step が使う
- `openPanel(ov)` / `closePanel(ov)` / `returnFocus` — Task 3 Step 7 で定義、同 Step で使う
