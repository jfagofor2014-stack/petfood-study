# 保存失敗対策 設計書

作成日: 2026-09-29
対象: ペットフード販売士 学習アプリ（`/Users/taichi/petfood-study`）
前提となる設計書: `2026-09-15-petfood-study-design.md` / `2026-09-22-mock-exam-design.md`

## 1. 背景

模擬試験のブランチ全体レビュー（2026-09-23）で持ち越した論点である。

このアプリは進捗・設定・テスト成績・模試の中断データを全て `localStorage` に置く。
どのモジュールも `storage.setItem` を裸で呼んでおり、例外が投げられた場合の備えがない。

`setItem` は次の場合に投げる。

- 保存領域が上限に達している（`QuotaExceededError`）
- ブラウザの設定やプライベートモードでサイトデータが拒否されている（`SecurityError`）
- 端末やOSの管理ポリシーでサイトデータが禁止されている

現状の書き込み箇所は15。

| ファイル | 書き込み |
|---|---|
| `js/lib/progress.js` | `setItem` 1 / `removeItem` 3 |
| `js/lib/quizresults.js` | `setItem` 1 / `removeItem` 1 |
| `js/lib/settings.js` | `setItem` 1 / `removeItem` 1 |
| `js/lib/mockstate.js` | `setItem` 4 / `removeItem` 3 |

### 現状で起きること

**起動できない。** `js/app.js` の `startMain` は教材を読み込んだ直後に
`progress.pruneTo` と `quizResults.pruneTo` を無条件で呼び、どちらも書き込む。
保存が完全に塞がれた端末では、ここで例外が上がってアプリが白画面のまま止まる。

**黙って記録が消える。** 起動できる程度に空きがある状態で上限に達した場合、
読み上げ中の位置保存・テスト成績・模試の解答が例外で落ちる。画面は何も変わらないため、
利用者は1時間学習したあとで初めて何も残っていないことに気づく。

**模試が最も痛い。** 採点は27回の同期書き込みを連続で行う。
（結果表示が消える経路は模試側で `try`/`catch` を入れて塞いだが、
書き込み自体が失敗していることは依然として利用者に伝わらない。）

## 2. 方針

4モジュールはいずれも `storage` を引数で受け取る設計になっている
（`createProgress(storage)` / `createSettings(storage)` / `createQuizResults(storage)` /
`createMockState(storage)`）。したがって **`localStorage` を安全な包みで1回だけラップし、
`app.js` からそれを渡せば、4モジュールには一切触れずに済む。**

4箇所へ個別に `try`/`catch` を撒く案と比べて、直す面が小さく、
テストが1箇所にまとまり、将来モジュールが増えても自動的に守られる。

### 作らないもの

- 保存先のフォールバック（IndexedDB や sessionStorage への退避）。
  失敗する端末では IndexedDB も同時に塞がれていることが多く、複雑さに見合わない
- 書き込みの再試行。容量超過は待っても解消しない
- 失敗した書き込みの再送キュー。次の書き込みが同じ値を上書きするため意味がない

## 3. 設計

### 3.1 `js/lib/safestorage.js`（新規）

```js
export function createSafeStorage(storage, onChange) { ... }
```

`Storage` と同じ形（`getItem` / `setItem` / `removeItem`）を持つオブジェクトを返す。
どのメソッドも**例外を投げない**。

| メソッド | ふるまい |
|---|---|
| `getItem(key)` | 失敗したら `null` を返す。読み出し側は既に「値が無い＝既定値」を扱えるため |
| `setItem(key, value)` | 失敗しても投げない。成功／失敗の状態が前回から変わったときだけ `onChange(failing)` を呼ぶ |
| `removeItem(key)` | 失敗しても投げない。消せなくても読み出し側の妥当性検査が壊れた値を弾く |
| `isFailing()` | 直近の書き込みが失敗した状態なら `true` |

`onChange` は**状態が変わったときだけ**呼ぶ。模試は5秒ごとに書くため、
毎回呼ぶと画面側が不必要に再描画される。

`removeItem` の失敗は `failing` の状態を変えない。容量超過では `removeItem` は成功するのが普通で、
`removeItem` だけが失敗する状況は保存が完全に塞がれている場合であり、
その場合は直前か直後の `setItem` が失敗して状態が立つ。

`onChange` が渡されなかった場合も落ちない（何もしない関数を既定とする）。

### 3.2 `js/app.js`（変更）

```js
const store = createSafeStorage(localStorage, showStorageWarning);

const ctx = {
  progress:    createProgress(store),
  settings:    createSettings(store),
  quizResults: createQuizResults(store),
  mockState:   createMockState(store),
  ...
};
```

`showStorageWarning(failing)` は帯の表示を切り替えるだけの関数。

### 3.3 帯

`index.html` にトップバーの直下、タブの内容より上に置く。全タブで見える。

```html
<div id="storage-warn" class="warn-bar" hidden>
  保存できていません。学習内容がこの端末に残りません。空き容量をご確認ください。
</div>
```

- 失敗している間はずっと出す
- 次の書き込みが成功したら自動的に消す（空き容量を作れば気づける）
- 利用者が消すボタンは付けない。消せてしまうと、本当に消える記録に気づけない

`css/style.css` に `.warn-bar` を足す。**`display` を指定するクラスには必ず
`[hidden]` 版も書くこと**（このコードベースで既に3回踏んでいる罠。
作成者スタイルの `display` はブラウザ既定の `[hidden] { display: none }` に勝つ）。

## 4. エラー処理

| 状況 | ふるまい |
|---|---|
| `setItem` が投げる | 投げ直さない。帯を出す |
| `getItem` が投げる | `null` を返す。呼び出し側は既定値で動く |
| `removeItem` が投げる | 何もしない。帯の状態は変えない |
| `storage` 自体が `null` / 未定義 | `getItem` は `null`、`setItem` は失敗として扱い帯を出す |
| 書き込みが成功に戻る | 帯を消す |

## 5. テスト

`test/safestorage.test.js`（`node --test`）。

- `getItem` / `setItem` / `removeItem` が素の `storage` へ正しく委譲する
- `setItem` が投げても例外が外に出ない
- `getItem` が投げても例外が外に出ず `null` を返す
- `removeItem` が投げても例外が外に出ない
- 失敗したとき `onChange(true)` が**1回だけ**呼ばれる（連続失敗で何度も呼ばない）
- 失敗のあと成功したとき `onChange(false)` が呼ばれる
- 成功が続く間は `onChange` が呼ばれない
- `removeItem` の失敗では `onChange` が呼ばれない
- `isFailing()` が状態を正しく返す
- `onChange` を渡さなくても落ちない
- `storage` が `null` でも落ちない

既存の4モジュールのテストは変更しない。素の `storage` を渡す既存の使い方は壊れない。

## 6. 受け入れ条件

- 保存が完全に塞がれた状態でもアプリが起動し、帯が出る
- 読み上げ・テスト・模試のいずれも、保存に失敗しても操作を続けられる
- 空き容量ができて書き込みが成功したら帯が消える
- 既存の185件を含め `npm test` が全件通る
- `sw.js` の `CACHE` が上がり、`js/lib/safestorage.js` が `ASSETS` に入っている
- オフラインで動作する
