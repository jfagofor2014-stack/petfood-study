# 保存失敗対策 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `localStorage` の書き込みが失敗する端末でもアプリが起動して動き続け、記録が残っていないことが利用者に伝わるようにする。

**Architecture:** 既存4モジュール（`progress` / `settings` / `quizresults` / `mockstate`）はいずれも `storage` を引数で受け取る。したがって `localStorage` を安全な包み（`js/lib/safestorage.js`）で1回だけラップし、`js/app.js` からそれを渡す。4モジュールには一切触れない。

**Tech Stack:** Vanilla JS（ES Modules）、ビルドなし、外部依存ゼロ、`node --test`、localStorage、Service Worker。

**設計書:** `docs/superpowers/specs/2026-09-29-safe-storage-design.md`

## Global Constraints

- ビルドステップなし・外部依存ゼロ。ライブラリを足さない
- `js/lib/` のモジュールは `window` / `document` / `localStorage` / `indexedDB` に直接触らない。必要なものは引数で受け取る
- `js/views/` にはテストを書かない（既存方針）
- コメントは日本語で書き、「なぜそうしたか」を書く
- **`js/lib/progress.js` / `js/lib/quizresults.js` / `js/lib/settings.js` / `js/lib/mockstate.js` を変更しない**
- 教材データをコミットしない。`.gitignore` の除外（`*.pdf` / `*-data.json` / `petfood-data*.json` / `tools/_work/` / `tools/png/` / `tools/pages/`）を外さない
- 教材の本文（問題文・解説・選択肢）をコードやコメントに書かない
- 対象端末は Pixel 8a / Android Chrome。幅 375px と 412px の両方で崩れないこと
- **`display` を指定する CSS クラスには必ず `[hidden]` 版のルールも書く。** 作成者スタイルの `display` はブラウザ既定の `[hidden] { display: none }` に勝つ（このコードベースで既に3回踏んでいる）
- テストは `node --test` で実行する
- コミットメッセージは日本語で書き、末尾に次の1行を入れる:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## File Structure

| ファイル | 責務 |
|---|---|
| `js/lib/safestorage.js`（新規） | `Storage` と同じ形で、例外を投げない包み。失敗状態の変化を通知する |
| `test/safestorage.test.js`（新規） | 上のテスト |
| `js/app.js`（変更） | `localStorage` をラップして4モジュールへ渡す。帯の表示を切り替える |
| `index.html`（変更） | 帯の要素 |
| `css/style.css`（変更） | 帯のスタイル |
| `sw.js`（変更） | `CACHE` を上げ、`js/lib/safestorage.js` を `ASSETS` へ |

---

### Task 1: 例外を投げない storage の包み

**Files:**
- Create: `js/lib/safestorage.js`
- Test: `test/safestorage.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `createSafeStorage(storage, onChange) -> { getItem, setItem, removeItem, isFailing }`

- [ ] **Step 1: Write the failing test**

`test/safestorage.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSafeStorage } from '../js/lib/safestorage.js';

// 素の Storage のかわり。どのメソッドを投げさせるかを個別に切り替えられる。
function fake({ throwOn = [] } = {}) {
  const map = new Map();
  const guard = name => { if (throwOn.includes(name)) throw new Error(`${name} blocked`); };
  return {
    getItem(k) { guard('getItem'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { guard('setItem'); map.set(k, String(v)); },
    removeItem(k) { guard('removeItem'); map.delete(k); },
    _dump: () => Object.fromEntries(map),
  };
}

// onChange の呼ばれ方を記録する
function recorder() {
  const calls = [];
  const fn = v => calls.push(v);
  fn.calls = calls;
  return fn;
}

test('素の storage へ委譲する', () => {
  const raw = fake();
  const s = createSafeStorage(raw);
  s.setItem('a', '1');
  assert.equal(s.getItem('a'), '1');
  assert.deepEqual(raw._dump(), { a: '1' });
  s.removeItem('a');
  assert.equal(s.getItem('a'), null);
  assert.deepEqual(raw._dump(), {});
});

test('無い鍵は null', () => {
  assert.equal(createSafeStorage(fake()).getItem('nope'), null);
});

test('setItem が投げても例外が外に出ない', () => {
  const s = createSafeStorage(fake({ throwOn: ['setItem'] }));
  assert.doesNotThrow(() => s.setItem('a', '1'));
});

test('getItem が投げても例外が外に出ず null を返す', () => {
  const s = createSafeStorage(fake({ throwOn: ['getItem'] }));
  let got;
  assert.doesNotThrow(() => { got = s.getItem('a'); });
  assert.equal(got, null);
});

test('removeItem が投げても例外が外に出ない', () => {
  const s = createSafeStorage(fake({ throwOn: ['removeItem'] }));
  assert.doesNotThrow(() => s.removeItem('a'));
});

test('書き込みに失敗すると onChange(true) が1回だけ呼ばれる', () => {
  const on = recorder();
  const s = createSafeStorage(fake({ throwOn: ['setItem'] }), on);
  s.setItem('a', '1');
  s.setItem('b', '2');
  s.setItem('c', '3');
  assert.deepEqual(on.calls, [true]);
  assert.equal(s.isFailing(), true);
});

test('失敗のあと成功すると onChange(false) が呼ばれる', () => {
  const on = recorder();
  // 最初は投げる storage、途中で投げなくする
  let blocked = true;
  const raw = {
    getItem: () => null,
    setItem: () => { if (blocked) throw new Error('blocked'); },
    removeItem: () => {},
  };
  const s = createSafeStorage(raw, on);
  s.setItem('a', '1');
  assert.deepEqual(on.calls, [true]);
  blocked = false;
  s.setItem('a', '1');
  assert.deepEqual(on.calls, [true, false]);
  assert.equal(s.isFailing(), false);
});

test('成功が続く間は onChange が呼ばれない', () => {
  const on = recorder();
  const s = createSafeStorage(fake(), on);
  s.setItem('a', '1');
  s.setItem('b', '2');
  assert.deepEqual(on.calls, []);
  assert.equal(s.isFailing(), false);
});

test('removeItem の失敗では onChange が呼ばれない', () => {
  const on = recorder();
  const s = createSafeStorage(fake({ throwOn: ['removeItem'] }), on);
  s.removeItem('a');
  assert.deepEqual(on.calls, []);
  assert.equal(s.isFailing(), false);
});

test('getItem の失敗では onChange が呼ばれない', () => {
  const on = recorder();
  const s = createSafeStorage(fake({ throwOn: ['getItem'] }), on);
  s.getItem('a');
  assert.deepEqual(on.calls, []);
  assert.equal(s.isFailing(), false);
});

test('onChange を渡さなくても落ちない', () => {
  const s = createSafeStorage(fake({ throwOn: ['setItem'] }));
  assert.doesNotThrow(() => s.setItem('a', '1'));
  assert.equal(s.isFailing(), true);
});

test('storage が null でも落ちない', () => {
  const on = recorder();
  const s = createSafeStorage(null, on);
  assert.doesNotThrow(() => s.setItem('a', '1'));
  assert.equal(s.getItem('a'), null);
  assert.doesNotThrow(() => s.removeItem('a'));
  assert.equal(s.isFailing(), true);
  assert.deepEqual(on.calls, [true]);
});

test('onChange が投げても書き込み側に影響しない', () => {
  // 画面側の不具合で保存が壊れることを防ぐ
  const s = createSafeStorage(fake({ throwOn: ['setItem'] }), () => { throw new Error('ui bug'); });
  assert.doesNotThrow(() => s.setItem('a', '1'));
  assert.equal(s.isFailing(), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/taichi/petfood-study && node --test test/safestorage.test.js`
Expected: FAIL — `Cannot find module '.../js/lib/safestorage.js'`

- [ ] **Step 3: Write minimal implementation**

`js/lib/safestorage.js` を新規作成する。

```js
// localStorage は上限超過・プライベートモード・端末のポリシーで例外を投げる。
// 進捗・設定・成績・模試のモジュールはいずれも storage を引数で受け取る作りなので、
// ここで1回だけ包んで渡せば、4モジュールに手を入れずに全ての書き込みを守れる。
//
// どのメソッドも例外を投げない。書き込みが失敗したことは onChange で画面へ知らせ、
// 「保存できていない」ことを利用者が分かるようにする。黙って記録が消えるのが最悪の結末。

const NOOP = () => {};

export function createSafeStorage(storage, onChange = NOOP) {
  let failing = false;

  // 状態が変わったときだけ知らせる。模試は5秒ごとに書くため、
  // 毎回知らせると画面側が不必要に描き直される。
  function setFailing(next) {
    if (next === failing) return;
    failing = next;
    // 画面側の不具合で保存の流れを止めないよう、通知の失敗は握りつぶす。
    try { onChange(failing); } catch { /* 通知できなくても保存は続ける */ }
  }

  return {
    getItem(key) {
      // 読み出しの失敗は「値が無い」と同じ扱いでよい。呼び出し側は既定値で動ける。
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },

    setItem(key, value) {
      try {
        storage.setItem(key, value);
        setFailing(false);
      } catch {
        setFailing(true);
      }
    },

    removeItem(key) {
      // 消せなくても読み出し側の妥当性検査が壊れた値を弾くため、失敗を状態に反映しない。
      // 容量超過では removeItem は成功するのが普通で、これだけが失敗する状況では
      // 前後の setItem が失敗して状態が立つ。
      try {
        storage.removeItem(key);
      } catch { /* 消せなくても先へ進む */ }
    },

    isFailing() {
      return failing;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/taichi/petfood-study && node --test test/safestorage.test.js`
Expected: PASS（13テストすべて）

- [ ] **Step 5: 既存テストを壊していないことを確認**

Run: `cd /Users/taichi/petfood-study && node --test`
Expected: PASS（既存189件＋13件＝202件）

- [ ] **Step 6: Commit**

```bash
cd /Users/taichi/petfood-study
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
git add js/lib/safestorage.js test/safestorage.test.js
git commit -m "$(cat <<'MSG'
例外を投げない storage の包みを追加

localStorage は上限超過・プライベートモード・端末のポリシーで例外を投げる。
4モジュールはいずれも storage を注入で受け取るため、ここで1回包めば本体に触れずに守れる。
書き込みの失敗は状態が変わったときだけ通知する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: アプリに組み込んで帯を出す

**Files:**
- Modify: `js/app.js`
- Modify: `index.html`
- Modify: `css/style.css`（末尾に追記）
- Modify: `sw.js`（`CACHE` と `ASSETS`）

**Interfaces:**
- Consumes: `createSafeStorage(storage, onChange)`（Task 1）
- Produces: なし（アプリの完成）

- [ ] **Step 1: `index.html` に帯の要素を足す**

`<header id="topbar">` の閉じタグ `</header>` の直後、`<main id="view"></main>` の直前に足す。

```html
  <div id="storage-warn" class="warn-bar" hidden>
    保存できていません。学習内容がこの端末に残りません。空き容量をご確認ください。
  </div>
```

- [ ] **Step 2: `js/app.js` で localStorage をラップする**

import 群の先頭付近（`import { loadBook } from './lib/db.js';` の下）に足す。

```js
import { createSafeStorage } from './lib/safestorage.js';
```

`el` の定義に1行足す。

変更前:

```js
const el = {
  onboarding: document.getElementById('onboarding'),
  main: document.getElementById('main'),
  view: document.getElementById('view'),
  tabs: document.getElementById('tabs'),
  rate: document.getElementById('topbar-rate'),
};
```

変更後:

```js
const el = {
  onboarding: document.getElementById('onboarding'),
  main: document.getElementById('main'),
  view: document.getElementById('view'),
  tabs: document.getElementById('tabs'),
  rate: document.getElementById('topbar-rate'),
  storageWarn: document.getElementById('storage-warn'),
};

// 保存に失敗している間だけ帯を出す。次の書き込みが成功したら自動的に消えるので、
// 空き容量を作れば利用者が自分で気づける。
function showStorageWarning(failing) {
  if (el.storageWarn) el.storageWarn.hidden = !failing;
}

// localStorage は上限超過やプライベートモードで例外を投げる。ここで1回包んでおくと、
// 進捗・設定・成績・模試の全てが守られ、起動時の pruneTo で白画面になることも防げる。
const store = createSafeStorage(localStorage, showStorageWarning);
```

`ctx` の4モジュールへ渡す storage を `store` に差し替える。

変更前:

```js
const ctx = {
  book: null,
  progress: createProgress(localStorage),
  settings: createSettings(localStorage),
  quizResults: createQuizResults(localStorage),
  mockState: createMockState(localStorage),
  speech: createSpeech({ synth: window.speechSynthesis, UtteranceCtor: window.SpeechSynthesisUtterance }),
  wakeLock: createWakeLock(navigator),
  tab: 'player',
};
```

変更後:

```js
const ctx = {
  book: null,
  progress: createProgress(store),
  settings: createSettings(store),
  quizResults: createQuizResults(store),
  mockState: createMockState(store),
  speech: createSpeech({ synth: window.speechSynthesis, UtteranceCtor: window.SpeechSynthesisUtterance }),
  wakeLock: createWakeLock(navigator),
  tab: 'player',
};
```

注: `js/app.js` の現在の `ctx` は上と並びが違う可能性がある。**`createProgress` / `createSettings` / `createQuizResults` / `createMockState` に渡している `localStorage` を `store` に変えること**が要件であり、並び順は現状のままでよい。

- [ ] **Step 3: `css/style.css` の末尾に帯のスタイルを足す**

```css
/* 保存できていないことを知らせる帯 */
.warn-bar {
  display: block;
  position: sticky; top: 44px; z-index: 9;
  padding: 10px 16px;
  background: #fbeae6; color: var(--warn);
  border-bottom: 1px solid var(--warn);
  font-size: 13px; font-weight: 700; line-height: 1.5;
}
.warn-bar[hidden] { display: none; }
```

- [ ] **Step 4: `sw.js` を更新する**

`CACHE` を上げる。

変更前:

```js
const CACHE = 'pfs-v3';
```

変更後:

```js
const CACHE = 'pfs-v4';
```

`ASSETS` の `'js/lib/quizresults.js',` の下に1行足す（アルファベット順に `safestorage` は `quizresults` と `schema` の間）。

```js
  'js/lib/safestorage.js',
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd /Users/taichi/petfood-study && node --test`
Expected: PASS（202件）

- [ ] **Step 6: ブラウザで確認する**

`preview_start` で dev サーバを起動する（`.claude/launch.json` の `petfood`、ポート8765。
グローバルに `petfood-study` という別名の登録がある環境ではそちらを使ってもよい）。

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

確認する項目:

1. **通常時は帯が出ていない。** `document.getElementById('storage-warn').hidden` が `true`

2. **書き込みが失敗すると帯が出る。** `setItem` を投げるようにしてから設定を変える:

```js
const orig = Storage.prototype.setItem;
Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); };
```

   設定タブで読み上げ速度のスライダを動かし、帯が出ることを確認する。
   `({ hidden: document.getElementById('storage-warn').hidden, text: document.getElementById('storage-warn').textContent.trim() })`
   で `hidden: false` と文面を示すこと。

3. **失敗中でも操作が続けられる。** 帯が出た状態でタブを移動でき、模試を開始でき、
   コンソールに未捕捉の例外が出ないこと（`read_console_messages` で `onlyErrors: true`）

4. **成功に戻ると帯が消える。** `Storage.prototype.setItem = orig;` に戻してから
   もう一度設定を変え、`hidden` が `true` に戻ることを確認する

5. **保存が完全に塞がれていても起動する。** 次を実行してから**再読み込み**し、
   白画面にならず起動して帯が出ることを確認する:

```js
const origSet = Storage.prototype.setItem;
Storage.prototype.setItem = function () { throw new Error('blocked'); };
location.reload();
```

   （再読み込み後は `Storage.prototype` の差し替えが失われるため、
   代わりに `sessionStorage` にフラグを置いて再現するか、
   `javascript_tool` で読み込み直後に差し替えられない場合はこの項目を
   「確認できなかった」と正直に報告すること。**確認していないことを確認したと書かない。**）

6. **幅375pxで帯が2行までに収まり、横スクロールが出ない。**
   `resize_window` で `{width: 375, height: 812}` にして測る:

```js
const b = document.getElementById('storage-warn').getBoundingClientRect();
({ h: Math.round(b.height), lines: Math.round(b.height / parseFloat(getComputedStyle(document.getElementById('storage-warn')).lineHeight)), overflowX: document.documentElement.scrollWidth > window.innerWidth })
```

7. **帯が出ている間、その下の内容が隠れていない。** タブの内容の先頭が帯に重なっていないこと

- [ ] **Step 7: Commit**

```bash
cd /Users/taichi/petfood-study
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
git status --short
git add js/app.js index.html css/style.css sw.js
git commit -m "$(cat <<'MSG'
保存に失敗していることを帯で知らせる

localStorage を安全な包みでラップして4モジュールへ渡す。書き込みが失敗している間は
トップバーの下に帯を出し、成功に戻ったら消す。黙って記録が消えるのを防ぐ。
起動時の pruneTo で例外が上がって白画面になる問題も同時に解消する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Self-Review

**Spec coverage:**

| 設計書の節 | 対応するタスク |
|---|---|
| 3.1 `js/lib/safestorage.js` | Task 1 |
| 3.2 `js/app.js` | Task 2 Step 2 |
| 3.3 帯 | Task 2 Step 1・3 |
| 4. エラー処理 | Task 1（`storage` が null、`onChange` が投げる場合を含む） |
| 5. テスト | Task 1 Step 1 |
| 6. 受け入れ条件 | Task 2 Step 5・6 |

**Placeholder scan:** TBD・TODO の類は無く、コードを変える手順にはすべて実際のコードが入っている。

**Type consistency:**

- `createSafeStorage(storage, onChange)` — Task 1 で定義、Task 2 が使用
- 返り値の `getItem` / `setItem` / `removeItem` は素の `Storage` と同じ形なので、
  既存4モジュール（`createProgress` / `createSettings` / `createQuizResults` / `createMockState`）が
  そのまま受け取れる。4モジュールは変更しない
- `isFailing()` は現時点で画面から使わない。`onChange` で足りるため。
  デバッグと将来のために公開するが、呼び出し元を増やさない
