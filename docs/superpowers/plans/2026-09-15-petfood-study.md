# ペットフード販売士 学習アプリ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ペットフード販売士認定試験のテキスト全文を、速度調整・一時停止・中断再開つきで読み上げ、節ごとの確認テストまでできる無料のPWAを作る。

**Architecture:** ビルドステップなしの Vanilla JS ESM。純粋ロジックを `js/lib/` に置いて `node --test` で検証し、DOM描画は `js/views/` に隔離する。教材データは著作物のためリポジトリに含めず、利用者が初回に1ファイルを選択して IndexedDB に保存する。学習状態は localStorage、アプリ本体は Service Worker でキャッシュする。

**Tech Stack:** Vanilla JS (ES Modules), Web Speech API (`speechSynthesis`), IndexedDB, localStorage, Wake Lock API, Service Worker, node:test, Python 3 + macOS Vision Framework（教材生成ツール）

設計書: `docs/superpowers/specs/2026-09-15-petfood-study-design.md`

## Global Constraints

- ビルドステップを入れない。`index.html` をブラウザで開けば動く構成を維持する。
- 外部ライブラリ・CDN・npm依存をアプリ本体に一切入れない（`package.json` の `dependencies` は空のまま）。
- ES Modules を使う。`package.json` に `"type": "module"` を指定する。
- テストは `node --test` のみ。テストファイルは `test/*.test.js`。
- 純粋ロジックは `js/lib/` に置き、必ずテストを書く。DOM を触るコードは `js/views/` に置き、テストを書かない。
- `js/lib/` のモジュールは `window` / `document` / `localStorage` / `indexedDB` をグローバル参照しない。必要なものは引数で受け取る。
- UI の文言はすべて日本語。
- 対象端末は Pixel 8a / Android Chrome。iOS 対応は考慮しない。
- localStorage のキーはすべて `pfs:` 接頭辞を付ける。
- **教材データ（本文・図表・問題）を絶対にコミットしない。** `.gitignore` の `*-data.json` / `petfood-data*.json` / `tools/_work/` を外さない。
- 教材ファイル名は `petfood-data.json`、教材スキーマ版は `1`。
- ブロック種別は `p` / `list` / `note` / `figure` の4種。`p` `list` `note` は文の配列 `sents` を持ち、`figure` は `img`（data URI）、`caption`、`speak`（読み上げ用要約）を持つ。
- Git コミットメッセージは日本語。末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける。

## ファイル構成

| ファイル | 責務 |
|---|---|
| `package.json` | `type: module`、`npm test` = `node --test` |
| `index.html` | アプリの外枠。タブ、各画面のコンテナ |
| `css/style.css` | 全スタイル |
| `js/app.js` | 起動、教材の有無で画面分岐、タブ切替 |
| `js/lib/html.js` | HTML エスケープ。全画面で共有する |
| `js/lib/sentences.js` | 文字列を文の配列に分割する純粋関数 |
| `js/lib/schema.js` | 教材データの検証と正規化 |
| `js/lib/book.js` | 章節の走査、節を読み上げ単位の配列に平坦化 |
| `js/lib/progress.js` | 再生位置・節の読了状態・達成率 |
| `js/lib/settings.js` | 設定値の既定と保存 |
| `js/lib/quizpick.js` | 出題する問題を選ぶ |
| `js/lib/quizresults.js` | テストの成績（挑戦回数・正答数）の保存と読み出し |
| `js/lib/db.js` | IndexedDB への教材データの保存と読み出し |
| `js/lib/speech.js` | `speechSynthesis` のラッパ。Android Chrome 対策をここに閉じ込める |
| `js/lib/wakelock.js` | Wake Lock の取得と解放 |
| `js/views/onboarding.js` | 初回の教材取り込み画面 |
| `js/views/player.js` | 「きく」画面 |
| `js/views/toc.js` | 「もくじ」画面 |
| `js/views/quiz.js` | 「テスト」画面 |
| `js/views/settings.js` | 「設定」画面 |
| `sw.js` | アプリ本体のオフラインキャッシュ |
| `manifest.json` | PWA マニフェスト |
| `tools/ocr.py` | ページ画像をOCRする |
| `tools/build_data.py` | 校正済みテキストから `petfood-data.json` を組み立てる |
| `test/*.test.js` | `js/lib/` のユニットテスト |

---

### Task 1: プロジェクト土台と文分割

読み上げの最小単位を決める関数。ここが全体の基礎になる。プロジェクトの雛形もこのタスクに含める。

**Files:**
- Create: `package.json`
- Create: `js/lib/sentences.js`
- Test: `test/sentences.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `splitSentences(text: string) => string[]`

- [ ] **Step 1: package.json を作る**

```json
{
  "name": "petfood-study",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 失敗するテストを書く**

`test/sentences.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../js/lib/sentences.js';

test('句点で文に分割する', () => {
  assert.deepEqual(
    splitSentences('犬の先祖は野生動物である。オオカミは捕食する。'),
    ['犬の先祖は野生動物である。', 'オオカミは捕食する。']
  );
});

test('感嘆符と疑問符でも分割する', () => {
  assert.deepEqual(
    splitSentences('本当か？そうだ！'),
    ['本当か？', 'そうだ！']
  );
});

test('鉤括弧の中の句点では分割しない', () => {
  assert.deepEqual(
    splitSentences('「これは重要である。」と記されている。'),
    ['「これは重要である。」と記されている。']
  );
});

test('丸括弧の中の句点では分割しない', () => {
  assert.deepEqual(
    splitSentences('総合栄養食（主食となる。水と併せて与える）は重要である。'),
    ['総合栄養食（主食となる。水と併せて与える）は重要である。']
  );
});

test('句点の直後の閉じ括弧は前の文に含める', () => {
  assert.deepEqual(
    splitSentences('注意が必要である（詳細は後述する。）次に進む。'),
    ['注意が必要である（詳細は後述する。）', '次に進む。']
  );
});

test('末尾に句点がなくても最後の文を落とさない', () => {
  assert.deepEqual(splitSentences('句点のない行'), ['句点のない行']);
});

test('空文字と空白のみは空配列を返す', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('   '), []);
  assert.deepEqual(splitSentences(null), []);
});

test('連続する空白を1つに畳む', () => {
  assert.deepEqual(
    splitSentences('前半である。   後半である。'),
    ['前半である。', '後半である。']
  );
});

test('括弧が閉じられていなくても最後まで返す', () => {
  assert.deepEqual(
    splitSentences('未閉じ（のまま終わる。'),
    ['未閉じ（のまま終わる。']
  );
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: FAIL。`Cannot find module '../js/lib/sentences.js'`

- [ ] **Step 4: 実装を書く**

`js/lib/sentences.js`:

```js
// 本文を読み上げの最小単位である「文」に分割する。
// 括弧の内側の句点では切らない。句点の直後に続く閉じ括弧は前の文に含める。

const ENDERS = new Set(['。', '！', '？', '!', '?']);
const PAIRS = { '（': '）', '(': ')', '「': '」', '『': '』', '【': '】', '［': '］', '[': ']' };
const TRAILERS = new Set(['」', '』', '）', ')', '】', '］', ']', '…']);

export function splitSentences(text) {
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!src) return [];

  const out = [];
  const stack = [];
  let buf = '';

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    buf += ch;

    if (PAIRS[ch]) { stack.push(PAIRS[ch]); continue; }
    if (stack.length && ch === stack[stack.length - 1]) { stack.pop(); continue; }
    if (stack.length) continue;           // 括弧の内側では切らない
    if (!ENDERS.has(ch)) continue;

    while (i + 1 < src.length && TRAILERS.has(src[i + 1])) buf += src[++i];

    const s = buf.trim();
    if (s) out.push(s);
    buf = '';
  }

  const rest = buf.trim();
  if (rest) out.push(rest);
  return out;
}
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。追加したテストが全て通ること

- [ ] **Step 6: コミット**

```bash
cd /Users/taichi/petfood-study
git add package.json js/lib/sentences.js test/sentences.test.js
git commit -m "$(cat <<'MSG'
文分割ユーティリティを追加

読み上げの最小単位を決める。括弧の内側の句点では切らない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: 教材データの検証

利用者が選んだファイルが本当に教材データかを確かめる。壊れたデータで先に進むと原因の分からない不具合になるため、入口で弾く。

**Files:**
- Create: `js/lib/schema.js`
- Test: `test/schema.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `SCHEMA_VERSION: number`（値は `1`）
  - `validateData(obj: unknown) => { ok: true, data: object } | { ok: false, errors: string[] }`
  - `summarize(data: object) => { title, edition, schema, chapters, sections, questions, generatedAt }`

- [ ] **Step 1: 失敗するテストを書く**

`test/schema.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData, summarize, SCHEMA_VERSION } from '../js/lib/schema.js';

function validData() {
  return {
    meta: { schema: 1, title: 'ペットフード販売士認定講習会テキスト', edition: '第5版', generatedAt: '2026-09-15' },
    chapters: [{
      id: 'ch01', no: 1, title: '概要', page: 4,
      sections: [{
        id: 'ch01-s01', no: 1, title: '設立趣旨', page: 4,
        blocks: [
          { type: 'p', sents: ['家族の一員であるペットと暮らす。'] },
          { type: 'figure', img: 'data:image/png;base64,AAA', caption: '図1', speak: '図1の説明。' }
        ]
      }]
    }],
    questions: []
  };
}

test('正しいデータを受け入れる', () => {
  const r = validateData(validData());
  assert.equal(r.ok, true);
  assert.equal(r.data.chapters.length, 1);
});

test('オブジェクトでない入力を拒否する', () => {
  assert.equal(validateData(null).ok, false);
  assert.equal(validateData('文字列').ok, false);
  assert.equal(validateData([]).ok, false);
});

test('スキーマ版が違うと拒否し、理由を返す', () => {
  const d = validData();
  d.meta.schema = 99;
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('スキーマ')));
});

test('章が空だと拒否する', () => {
  const d = validData();
  d.chapters = [];
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('章')));
});

test('節IDが重複していると拒否する', () => {
  const d = validData();
  d.chapters[0].sections.push({ ...d.chapters[0].sections[0] });
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('重複')));
});

test('未知のブロック種別を拒否する', () => {
  const d = validData();
  d.chapters[0].sections[0].blocks.push({ type: 'unknown', sents: ['x'] });
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('unknown')));
});

test('figure に speak も caption もないと拒否する', () => {
  const d = validData();
  d.chapters[0].sections[0].blocks[1] = { type: 'figure', img: 'data:image/png;base64,AAA' };
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('figure')));
});

test('questions がなくても受け入れ、空配列を補う', () => {
  const d = validData();
  delete d.questions;
  const r = validateData(d);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.questions, []);
});

test('問題の answer が選択肢の範囲外だと拒否する', () => {
  const d = validData();
  d.questions = [{ id: 'q1', sectionId: 'ch01-s01', chapterNo: 1, type: 'choice4',
    question: '問', choices: ['a', 'b', 'c', 'd'], answer: 4, explanation: '解説', page: 4 }];
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('q1')));
});

test('存在しない節を指す問題を拒否する', () => {
  const d = validData();
  d.questions = [{ id: 'q1', sectionId: 'ch99-s01', chapterNo: 99, type: 'choice4',
    question: '問', choices: ['a', 'b', 'c', 'd'], answer: 0, explanation: '解説', page: 4 }];
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('ch99-s01')));
});

test('エラーは最大10件までにまとめる', () => {
  const d = validData();
  d.chapters[0].sections[0].blocks = Array.from({ length: 30 }, () => ({ type: 'bad' }));
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length <= 10);
});

test('summarize が取り込み結果の要約を返す', () => {
  const s = summarize(validData());
  assert.equal(s.chapters, 1);
  assert.equal(s.sections, 1);
  assert.equal(s.questions, 0);
  assert.equal(s.edition, '第5版');
  assert.equal(s.schema, SCHEMA_VERSION);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: FAIL。`Cannot find module '../js/lib/schema.js'`

- [ ] **Step 3: 実装を書く**

`js/lib/schema.js`:

```js
// 取り込まれた教材データが使える形かを入口で検証する。
// 壊れたデータで先に進むと原因の分からない不具合になるため、ここで弾く。

export const SCHEMA_VERSION = 1;

const BLOCK_TYPES = new Set(['p', 'list', 'note', 'figure']);
const MAX_ERRORS = 10;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateData(obj) {
  const errors = [];
  const add = m => { if (errors.length < MAX_ERRORS) errors.push(m); };

  if (!isObj(obj)) return { ok: false, errors: ['教材ファイルの形式が正しくありません。'] };

  const meta = obj.meta;
  if (!isObj(meta)) add('meta がありません。');
  else if (meta.schema !== SCHEMA_VERSION) {
    add(`スキーマの版が違います（期待 ${SCHEMA_VERSION}、実際 ${meta.schema}）。`);
  }

  const chapters = obj.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    add('章が1つもありません。');
    return { ok: false, errors };
  }

  const sectionIds = new Set();

  for (const ch of chapters) {
    if (!isObj(ch) || !ch.id) { add('章に id がありません。'); continue; }
    if (!Array.isArray(ch.sections) || ch.sections.length === 0) {
      add(`${ch.id} に節がありません。`);
      continue;
    }
    for (const sec of ch.sections) {
      if (!isObj(sec) || !sec.id) { add(`${ch.id} の節に id がありません。`); continue; }
      if (sectionIds.has(sec.id)) add(`節IDが重複しています: ${sec.id}`);
      sectionIds.add(sec.id);

      if (!Array.isArray(sec.blocks)) { add(`${sec.id} に blocks がありません。`); continue; }
      for (const b of sec.blocks) {
        if (!isObj(b) || !BLOCK_TYPES.has(b.type)) {
          add(`${sec.id} に未知のブロック種別があります: ${isObj(b) ? b.type : String(b)}`);
          continue;
        }
        if (b.type === 'figure') {
          if (!b.speak && !b.caption) add(`${sec.id} の figure に speak も caption もありません。`);
        } else if (!Array.isArray(b.sents) || b.sents.length === 0) {
          add(`${sec.id} の ${b.type} に sents がありません。`);
        }
      }
    }
  }

  const questions = Array.isArray(obj.questions) ? obj.questions : [];
  for (const q of questions) {
    if (!isObj(q) || !q.id) { add('問題に id がありません。'); continue; }
    if (!Array.isArray(q.choices) || q.choices.length < 2) { add(`${q.id} の選択肢が足りません。`); continue; }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) {
      add(`${q.id} の answer が選択肢の範囲外です。`);
    }
    if (q.sectionId && !sectionIds.has(q.sectionId)) {
      add(`${q.id} が存在しない節を指しています: ${q.sectionId}`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { meta: obj.meta, chapters, questions } };
}

export function summarize(data) {
  const chapters = data.chapters || [];
  const sections = chapters.reduce((n, c) => n + (c.sections ? c.sections.length : 0), 0);
  return {
    title: data.meta?.title ?? '',
    edition: data.meta?.edition ?? '',
    schema: data.meta?.schema ?? null,
    generatedAt: data.meta?.generatedAt ?? '',
    chapters: chapters.length,
    sections,
    questions: (data.questions || []).length,
  };
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 5: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/lib/schema.js test/schema.test.js
git commit -m "$(cat <<'MSG'
教材データの検証を追加

取り込み時に章節・ブロック種別・問題の整合性を確かめ、
壊れたデータを入口で弾く。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: 章節の走査と節の平坦化

再生位置を `{節ID, 文index}` の2値で表すための土台。節の中の全ブロックを、読み上げ単位の1次元配列に潰す。

**Files:**
- Create: `js/lib/book.js`
- Test: `test/book.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `flattenSection(section) => Utterance[]`
    ここで `Utterance = { i: number, blockIndex: number, type: 'p'|'list'|'note'|'figure', text: string, img?: string, caption?: string }`。`i` は節内の通し番号（0始まり）。
  - `sectionLength(section) => number`
  - `listSections(chapters) => Array<{ chapter, section, index }>`（本全体の並び順）
  - `findSection(chapters, sectionId) => { chapter, section, index } | null`
  - `neighborSection(chapters, sectionId, delta: number) => { chapter, section, index } | null`
  - `firstSectionId(chapters) => string | null`

- [ ] **Step 1: 失敗するテストを書く**

`test/book.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  flattenSection, sectionLength, listSections,
  findSection, neighborSection, firstSectionId
} from '../js/lib/book.js';

const section = {
  id: 'ch01-s01', no: 1, title: '設立趣旨', page: 4,
  blocks: [
    { type: 'p', sents: ['一文目である。', '二文目である。'] },
    { type: 'figure', img: 'data:image/png;base64,AAA', caption: '図1 組織図', speak: '図1、組織図の説明。' },
    { type: 'list', sents: ['項目ア', '項目イ'] }
  ]
};

const chapters = [
  { id: 'ch01', no: 1, title: '概要', sections: [section, { id: 'ch01-s02', no: 2, title: '設置', blocks: [] }] },
  { id: 'ch02', no: 2, title: '構造', sections: [{ id: 'ch02-s01', no: 1, title: '外形', blocks: [] }] }
];

test('ブロックをまたいで通し番号を振る', () => {
  const u = flattenSection(section);
  assert.equal(u.length, 5);
  assert.deepEqual(u.map(x => x.i), [0, 1, 2, 3, 4]);
});

test('figure は speak を読み上げ文として使う', () => {
  const u = flattenSection(section);
  assert.equal(u[2].type, 'figure');
  assert.equal(u[2].text, '図1、組織図の説明。');
  assert.equal(u[2].img, 'data:image/png;base64,AAA');
  assert.equal(u[2].caption, '図1 組織図');
});

test('speak がない figure は caption を読み上げる', () => {
  const u = flattenSection({ blocks: [{ type: 'figure', img: 'x', caption: '図2' }] });
  assert.equal(u[0].text, '図2');
});

test('元のブロック位置を保持する', () => {
  const u = flattenSection(section);
  assert.deepEqual(u.map(x => x.blockIndex), [0, 0, 1, 2, 2]);
});

test('空の節は空配列になる', () => {
  assert.deepEqual(flattenSection({ blocks: [] }), []);
  assert.deepEqual(flattenSection({}), []);
});

test('sectionLength が文数を返す', () => {
  assert.equal(sectionLength(section), 5);
  assert.equal(sectionLength({ blocks: [] }), 0);
});

test('listSections が本全体の並び順を返す', () => {
  const all = listSections(chapters);
  assert.deepEqual(all.map(x => x.section.id), ['ch01-s01', 'ch01-s02', 'ch02-s01']);
  assert.deepEqual(all.map(x => x.index), [0, 1, 2]);
  assert.equal(all[2].chapter.id, 'ch02');
});

test('findSection が章ごと返す', () => {
  const f = findSection(chapters, 'ch01-s02');
  assert.equal(f.section.title, '設置');
  assert.equal(f.chapter.id, 'ch01');
  assert.equal(f.index, 1);
});

test('findSection は見つからないと null', () => {
  assert.equal(findSection(chapters, 'ch99-s99'), null);
});

test('neighborSection が章をまたいで次へ進む', () => {
  assert.equal(neighborSection(chapters, 'ch01-s02', 1).section.id, 'ch02-s01');
});

test('neighborSection が章をまたいで前へ戻る', () => {
  assert.equal(neighborSection(chapters, 'ch02-s01', -1).section.id, 'ch01-s02');
});

test('neighborSection は端では null を返す', () => {
  assert.equal(neighborSection(chapters, 'ch01-s01', -1), null);
  assert.equal(neighborSection(chapters, 'ch02-s01', 1), null);
});

test('firstSectionId が最初の節を返す', () => {
  assert.equal(firstSectionId(chapters), 'ch01-s01');
  assert.equal(firstSectionId([]), null);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: FAIL。`Cannot find module '../js/lib/book.js'`

- [ ] **Step 3: 実装を書く**

`js/lib/book.js`:

```js
// 節の中のブロックを読み上げ単位の1次元配列に潰し、章節を走査する。
// 再生位置を {節ID, 文index} の2値だけで表せるようにするための土台。

export function flattenSection(section) {
  const blocks = (section && section.blocks) || [];
  const out = [];

  blocks.forEach((b, blockIndex) => {
    if (b.type === 'figure') {
      out.push({
        i: out.length, blockIndex, type: 'figure',
        text: b.speak || b.caption || '',
        img: b.img, caption: b.caption,
      });
      return;
    }
    (b.sents || []).forEach(text => {
      out.push({ i: out.length, blockIndex, type: b.type, text });
    });
  });

  return out;
}

export function sectionLength(section) {
  return flattenSection(section).length;
}

export function listSections(chapters) {
  const out = [];
  for (const chapter of chapters || []) {
    for (const section of chapter.sections || []) {
      out.push({ chapter, section, index: out.length });
    }
  }
  return out;
}

export function findSection(chapters, sectionId) {
  return listSections(chapters).find(x => x.section.id === sectionId) || null;
}

export function neighborSection(chapters, sectionId, delta) {
  const all = listSections(chapters);
  const at = all.findIndex(x => x.section.id === sectionId);
  if (at < 0) return null;
  return all[at + delta] || null;
}

export function firstSectionId(chapters) {
  const all = listSections(chapters);
  return all.length ? all[0].section.id : null;
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 5: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/lib/book.js test/book.test.js
git commit -m "$(cat <<'MSG'
章節の走査と節の平坦化を追加

節内の全ブロックを読み上げ単位の1次元配列に潰し、
再生位置を {節ID, 文index} で表せるようにする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: 進捗と再生位置

「アプリを中断しても途中から再開できる」という要件の中核。localStorage は引数で注入し、テストではフェイクを使う。

**Files:**
- Create: `js/lib/progress.js`
- Test: `test/progress.test.js`

**Interfaces:**
- Consumes: `js/lib/book.js` の `listSections`, `sectionLength`
- Produces: `createProgress(storage) => Progress`。`storage` は `getItem` / `setItem` / `removeItem` を持つオブジェクト。`Progress` のメソッドは以下。
  - `getPosition() => { sectionId, sentIndex, updatedAt } | null`
  - `setPosition(sectionId, sentIndex) => void`
  - `clearPosition() => void`
  - `getSection(sectionId) => { state: 'unread'|'reading'|'done', maxSent: number, doneAt: string|null }`
  - `markSentence(sectionId, sentIndex, total) => void`
  - `markDone(sectionId) => void`
  - `chapterRate(chapter) => number`（0〜1）
  - `overallRate(chapters) => number`（0〜1）
  - `doneCount(chapters) => { done: number, total: number }`
  - `pruneTo(chapters) => number`（教材入れ替え時、存在しない節の記録を捨てて件数を返す）
  - `reset() => void`
  - `exportAll() => object` / `importAll(obj) => void`

- [ ] **Step 1: 失敗するテストを書く**

`test/progress.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../js/lib/progress.js';

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}

const chapters = [
  { id: 'ch01', no: 1, sections: [
    { id: 'ch01-s01', blocks: [{ type: 'p', sents: ['あ。', 'い。', 'う。', 'え。'] }] },
    { id: 'ch01-s02', blocks: [{ type: 'p', sents: ['か。', 'き。'] }] },
  ]},
  { id: 'ch02', no: 2, sections: [
    { id: 'ch02-s01', blocks: [{ type: 'p', sents: ['さ。', 'し。'] }] },
  ]},
];

test('位置が未保存なら null', () => {
  const p = createProgress(fakeStorage());
  assert.equal(p.getPosition(), null);
});

test('位置を保存して読み戻せる', () => {
  const p = createProgress(fakeStorage());
  p.setPosition('ch01-s01', 12);
  const pos = p.getPosition();
  assert.equal(pos.sectionId, 'ch01-s01');
  assert.equal(pos.sentIndex, 12);
  assert.ok(pos.updatedAt);
});

test('位置を消せる', () => {
  const p = createProgress(fakeStorage());
  p.setPosition('ch01-s01', 3);
  p.clearPosition();
  assert.equal(p.getPosition(), null);
});

test('壊れたJSONが入っていても null を返して落ちない', () => {
  const p = createProgress(fakeStorage({ 'pfs:position': '{壊れている' }));
  assert.equal(p.getPosition(), null);
});

test('未読の節の既定状態を返す', () => {
  const p = createProgress(fakeStorage());
  assert.deepEqual(p.getSection('ch01-s01'), { state: 'unread', maxSent: 0, doneAt: null });
});

test('文を読むと reading になり maxSent が伸びる', () => {
  const p = createProgress(fakeStorage());
  p.markSentence('ch01-s01', 2, 4);
  const s = p.getSection('ch01-s01');
  assert.equal(s.state, 'reading');
  assert.equal(s.maxSent, 2);
});

test('maxSent は後戻りしない', () => {
  const p = createProgress(fakeStorage());
  p.markSentence('ch01-s01', 3, 4);
  p.markSentence('ch01-s01', 1, 4);
  assert.equal(p.getSection('ch01-s01').maxSent, 3);
});

test('最終文に達すると done になる', () => {
  const p = createProgress(fakeStorage());
  p.markSentence('ch01-s01', 3, 4);
  const s = p.getSection('ch01-s01');
  assert.equal(s.state, 'done');
  assert.ok(s.doneAt);
});

test('done になった節は読み直しても done のまま', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  p.markSentence('ch01-s01', 0, 4);
  assert.equal(p.getSection('ch01-s01').state, 'done');
});

test('章の達成率は読了節の割合', () => {
  const p = createProgress(fakeStorage());
  assert.equal(p.chapterRate(chapters[0]), 0);
  p.markDone('ch01-s01');
  assert.equal(p.chapterRate(chapters[0]), 0.5);
  p.markDone('ch01-s02');
  assert.equal(p.chapterRate(chapters[0]), 1);
});

test('節のない章の達成率は0', () => {
  const p = createProgress(fakeStorage());
  assert.equal(p.chapterRate({ id: 'chX', sections: [] }), 0);
});

test('全体の達成率と読了数', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  assert.equal(p.overallRate(chapters), 1 / 3);
  assert.deepEqual(p.doneCount(chapters), { done: 1, total: 3 });
});

test('pruneTo が存在しない節の記録を捨てる', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  p.markDone('古い-s99');
  assert.equal(p.pruneTo(chapters), 1);
  assert.equal(p.getSection('古い-s99').state, 'unread');
  assert.equal(p.getSection('ch01-s01').state, 'done');
});

test('pruneTo は存在しない節を指す位置も消す', () => {
  const p = createProgress(fakeStorage());
  p.setPosition('古い-s99', 4);
  p.pruneTo(chapters);
  assert.equal(p.getPosition(), null);
});

test('reset で全部消える', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  p.setPosition('ch01-s01', 2);
  p.reset();
  assert.equal(p.getPosition(), null);
  assert.equal(p.getSection('ch01-s01').state, 'unread');
});

test('書き出して読み込み直せる', () => {
  const a = createProgress(fakeStorage());
  a.markDone('ch01-s01');
  a.setPosition('ch01-s02', 1);
  const dump = a.exportAll();

  const b = createProgress(fakeStorage());
  b.importAll(dump);
  assert.equal(b.getSection('ch01-s01').state, 'done');
  assert.equal(b.getPosition().sectionId, 'ch01-s02');
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: FAIL。`Cannot find module '../js/lib/progress.js'`

- [ ] **Step 3: 実装を書く**

`js/lib/progress.js`:

```js
// 再生位置と節ごとの読了状態を localStorage に持つ。
// 「中断しても途中から再開できる」要件の中核。
// storage は引数で受け取り、テストではフェイクを差し込む。

import { listSections } from './book.js';

const K_POS = 'pfs:position';
const K_PROG = 'pfs:progress';

function readJSON(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;      // 壊れた値で起動できなくなるのを防ぐ
  }
}

function writeJSON(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

const UNREAD = () => ({ state: 'unread', maxSent: 0, doneAt: null });

export function createProgress(storage) {
  const allProgress = () => readJSON(storage, K_PROG, {});

  const getSection = sectionId => {
    const rec = allProgress()[sectionId];
    return rec ? { state: rec.state, maxSent: rec.maxSent, doneAt: rec.doneAt ?? null } : UNREAD();
  };

  const putSection = (sectionId, rec) => {
    const all = allProgress();
    all[sectionId] = rec;
    writeJSON(storage, K_PROG, all);
  };

  const rateOf = sections => {
    if (!sections || sections.length === 0) return 0;
    const done = sections.filter(s => getSection(s.id).state === 'done').length;
    return done / sections.length;
  };

  return {
    getPosition() {
      const p = readJSON(storage, K_POS, null);
      if (!p || typeof p.sectionId !== 'string' || !Number.isInteger(p.sentIndex)) return null;
      return p;
    },

    setPosition(sectionId, sentIndex) {
      writeJSON(storage, K_POS, { sectionId, sentIndex, updatedAt: new Date().toISOString() });
    },

    clearPosition() {
      storage.removeItem(K_POS);
    },

    getSection,

    markSentence(sectionId, sentIndex, total) {
      const cur = getSection(sectionId);
      const maxSent = Math.max(cur.maxSent, sentIndex);
      const reachedEnd = total > 0 && sentIndex >= total - 1;
      const done = cur.state === 'done' || reachedEnd;
      putSection(sectionId, {
        state: done ? 'done' : 'reading',
        maxSent,
        doneAt: done ? (cur.doneAt ?? new Date().toISOString()) : null,
      });
    },

    markDone(sectionId) {
      const cur = getSection(sectionId);
      putSection(sectionId, {
        state: 'done',
        maxSent: cur.maxSent,
        doneAt: cur.doneAt ?? new Date().toISOString(),
      });
    },

    chapterRate(chapter) {
      return rateOf(chapter && chapter.sections);
    },

    overallRate(chapters) {
      return rateOf(listSections(chapters).map(x => x.section));
    },

    doneCount(chapters) {
      const sections = listSections(chapters).map(x => x.section);
      return {
        done: sections.filter(s => getSection(s.id).state === 'done').length,
        total: sections.length,
      };
    },

    pruneTo(chapters) {
      const valid = new Set(listSections(chapters).map(x => x.section.id));
      const all = allProgress();
      let kept = 0;
      const next = {};
      for (const [id, rec] of Object.entries(all)) {
        if (valid.has(id)) { next[id] = rec; kept++; }
      }
      writeJSON(storage, K_PROG, next);

      const pos = this.getPosition();
      if (pos && !valid.has(pos.sectionId)) this.clearPosition();
      return kept;
    },

    reset() {
      storage.removeItem(K_POS);
      storage.removeItem(K_PROG);
    },

    exportAll() {
      return { position: readJSON(storage, K_POS, null), progress: allProgress() };
    },

    importAll(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.position) writeJSON(storage, K_POS, obj.position);
      if (obj.progress) writeJSON(storage, K_PROG, obj.progress);
    },
  };
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 5: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/lib/progress.js test/progress.test.js
git commit -m "$(cat <<'MSG'
進捗と再生位置の永続化を追加

中断再開の中核。教材を入れ替えても進捗を保ち、
存在しない節の記録だけを捨てる pruneTo を持つ。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: 設定

**Files:**
- Create: `js/lib/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `DEFAULTS: { rate: 1.0, voiceURI: null, pauseMs: 200, keepAwake: true, autoNextSection: true }`
  - `RATE_MIN: 0.5`, `RATE_MAX: 2.0`, `RATE_STEP: 0.1`
  - `createSettings(storage) => { get(), set(patch), reset() }`

- [ ] **Step 1: 失敗するテストを書く**

`test/settings.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, DEFAULTS, RATE_MIN, RATE_MAX } from '../js/lib/settings.js';

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

test('初期状態では既定値を返す', () => {
  assert.deepEqual(createSettings(fakeStorage()).get(), DEFAULTS);
});

test('一部だけ変えても他は既定のまま', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 1.5 });
  assert.equal(s.get().rate, 1.5);
  assert.equal(s.get().pauseMs, DEFAULTS.pauseMs);
  assert.equal(s.get().keepAwake, DEFAULTS.keepAwake);
});

test('速度は下限と上限に丸める', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 0.1 });
  assert.equal(s.get().rate, RATE_MIN);
  s.set({ rate: 9 });
  assert.equal(s.get().rate, RATE_MAX);
});

test('速度に数値でない値が来たら既定に戻す', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 'はやく' });
  assert.equal(s.get().rate, DEFAULTS.rate);
});

test('文間の間は0〜2000msに丸める', () => {
  const s = createSettings(fakeStorage());
  s.set({ pauseMs: -100 });
  assert.equal(s.get().pauseMs, 0);
  s.set({ pauseMs: 99999 });
  assert.equal(s.get().pauseMs, 2000);
});

test('真偽値は真偽値に正規化する', () => {
  const s = createSettings(fakeStorage());
  s.set({ keepAwake: 0 });
  assert.equal(s.get().keepAwake, false);
  s.set({ keepAwake: 'はい' });
  assert.equal(s.get().keepAwake, true);
});

test('壊れたJSONが入っていても既定値を返す', () => {
  const s = createSettings(fakeStorage({ 'pfs:settings': '{壊れている' }));
  assert.deepEqual(s.get(), DEFAULTS);
});

test('未知のキーは保存しない', () => {
  const s = createSettings(fakeStorage());
  s.set({ 謎: 1 });
  assert.equal(s.get().謎, undefined);
});

test('reset で既定値に戻る', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 1.8, voiceURI: 'ja-JP-voice' });
  s.reset();
  assert.deepEqual(s.get(), DEFAULTS);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: FAIL。`Cannot find module '../js/lib/settings.js'`

- [ ] **Step 3: 実装を書く**

`js/lib/settings.js`:

```js
// 読み上げ設定の既定値と保存。範囲外の値はここで丸め、
// 画面側が変な値を持ち回らないようにする。

const KEY = 'pfs:settings';

export const RATE_MIN = 0.5;
export const RATE_MAX = 2.0;
export const RATE_STEP = 0.1;
const PAUSE_MAX = 2000;

export const DEFAULTS = Object.freeze({
  rate: 1.0,
  voiceURI: null,
  pauseMs: 200,
  keepAwake: true,
  autoNextSection: true,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function normalize(patch, base) {
  const out = { ...base };

  if ('rate' in patch) {
    const n = Number(patch.rate);
    out.rate = Number.isFinite(n) ? Math.round(clamp(n, RATE_MIN, RATE_MAX) * 10) / 10 : DEFAULTS.rate;
  }
  if ('pauseMs' in patch) {
    const n = Number(patch.pauseMs);
    out.pauseMs = Number.isFinite(n) ? Math.round(clamp(n, 0, PAUSE_MAX)) : DEFAULTS.pauseMs;
  }
  if ('voiceURI' in patch) {
    out.voiceURI = patch.voiceURI ? String(patch.voiceURI) : null;
  }
  if ('keepAwake' in patch) out.keepAwake = Boolean(patch.keepAwake);
  if ('autoNextSection' in patch) out.autoNextSection = Boolean(patch.autoNextSection);

  return out;
}

export function createSettings(storage) {
  const read = () => {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      return normalize(JSON.parse(raw) || {}, DEFAULTS);
    } catch {
      return { ...DEFAULTS };
    }
  };

  return {
    get: read,
    set(patch) {
      const next = normalize(patch || {}, read());
      storage.setItem(KEY, JSON.stringify(next));
      return next;
    },
    reset() {
      storage.removeItem(KEY);
      return { ...DEFAULTS };
    },
  };
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 5: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/lib/settings.js test/settings.test.js
git commit -m "$(cat <<'MSG'
読み上げ設定の保存を追加

速度・文間の間・画面点灯維持を保持し、範囲外の値はここで丸める。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: 出題の選択

テストで出す問題を選ぶ純粋ロジック。乱数は引数で注入し、テストを決定的にする。

**Files:**
- Create: `js/lib/quizpick.js`
- Test: `test/quizpick.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `shuffle(arr, rnd = Math.random) => Array`（新しい配列を返す）
  - `pickForSection(questions, sectionId, n, rnd) => Question[]`
  - `pickForChapter(questions, chapterNo, n, rnd) => Question[]`
  - `pickWeak(questions, results, n, rnd) => Question[]`
    `results` は `{ [questionId]: { attempts, correct, lastResult, lastAt } }`
  - `scoreOf(results, questionId) => number`（小さいほど苦手。未挑戦は 0.5）

- [ ] **Step 1: 失敗するテストを書く**

`test/quizpick.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, pickForSection, pickForChapter, pickWeak, scoreOf } from '../js/lib/quizpick.js';

// 決定的な擬似乱数
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const Q = [
  { id: 'q1', sectionId: 'ch01-s01', chapterNo: 1 },
  { id: 'q2', sectionId: 'ch01-s01', chapterNo: 1 },
  { id: 'q3', sectionId: 'ch01-s02', chapterNo: 1 },
  { id: 'q4', sectionId: 'ch02-s01', chapterNo: 2 },
  { id: 'q5', sectionId: 'ch02-s01', chapterNo: 2 },
];

test('shuffle は元の配列を壊さない', () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src, seeded(1));
  assert.deepEqual(src, [1, 2, 3, 4, 5]);
  assert.equal(out.length, 5);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
});

test('節を指定して出題を選ぶ', () => {
  const got = pickForSection(Q, 'ch01-s01', 5, seeded(1));
  assert.deepEqual(got.map(q => q.id).sort(), ['q1', 'q2']);
});

test('要求数より多い問題があれば要求数だけ返す', () => {
  assert.equal(pickForSection(Q, 'ch01-s01', 1, seeded(1)).length, 1);
});

test('該当がなければ空配列', () => {
  assert.deepEqual(pickForSection(Q, 'ch99-s99', 5, seeded(1)), []);
});

test('章を指定して出題を選ぶ', () => {
  const got = pickForChapter(Q, 2, 5, seeded(1));
  assert.deepEqual(got.map(q => q.id).sort(), ['q4', 'q5']);
});

test('未挑戦の問題のスコアは0.5', () => {
  assert.equal(scoreOf({}, 'q1'), 0.5);
});

test('正答率がスコアになる', () => {
  const r = { q1: { attempts: 4, correct: 1 }, q2: { attempts: 2, correct: 2 } };
  assert.equal(scoreOf(r, 'q1'), 0.25);
  assert.equal(scoreOf(r, 'q2'), 1);
});

test('苦手な順に選ぶ', () => {
  const results = {
    q1: { attempts: 4, correct: 0 },   // 0.00 最も苦手
    q2: { attempts: 4, correct: 4 },   // 1.00 得意
    q3: { attempts: 4, correct: 1 },   // 0.25
    q4: { attempts: 4, correct: 2 },   // 0.50
  };                                   // q5 は未挑戦 0.50
  assert.deepEqual(pickWeak(Q, results, 2, seeded(1)).map(q => q.id), ['q1', 'q3']);
});

test('全問正解なら苦手リストは空', () => {
  const results = Object.fromEntries(Q.map(q => [q.id, { attempts: 1, correct: 1 }]));
  assert.deepEqual(pickWeak(Q, results, 5, seeded(1)), []);
});

test('苦手リストは要求数を超えない', () => {
  const results = Object.fromEntries(Q.map(q => [q.id, { attempts: 1, correct: 0 }]));
  assert.equal(pickWeak(Q, results, 3, seeded(1)).length, 3);
});

test('n が0以下なら空配列', () => {
  assert.deepEqual(pickForSection(Q, 'ch01-s01', 0, seeded(1)), []);
  assert.deepEqual(pickWeak(Q, {}, -1, seeded(1)), []);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: FAIL。`Cannot find module '../js/lib/quizpick.js'`

- [ ] **Step 3: 実装を書く**

`js/lib/quizpick.js`:

```js
// 出題する問題を選ぶ。乱数は引数で受け取り、テストを決定的にできるようにする。

export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const take = (arr, n) => (n > 0 ? arr.slice(0, n) : []);

export function pickForSection(questions, sectionId, n, rnd = Math.random) {
  return take(shuffle((questions || []).filter(q => q.sectionId === sectionId), rnd), n);
}

export function pickForChapter(questions, chapterNo, n, rnd = Math.random) {
  return take(shuffle((questions || []).filter(q => q.chapterNo === chapterNo), rnd), n);
}

export function scoreOf(results, questionId) {
  const r = results && results[questionId];
  if (!r || !r.attempts) return 0.5;          // 未挑戦は中間に置く
  return r.correct / r.attempts;
}

export function pickWeak(questions, results, n, rnd = Math.random) {
  if (n <= 0) return [];
  const weak = (questions || [])
    .map(q => ({ q, score: scoreOf(results, q.id) }))
    .filter(x => x.score < 1);                // 全問正解のものは出さない

  // 同点は乱数で散らしてから苦手な順に並べる
  return take(
    shuffle(weak, rnd).sort((a, b) => a.score - b.score).map(x => x.q),
    n
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 5: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/lib/quizpick.js test/quizpick.test.js
git commit -m "$(cat <<'MSG'
出題選択ロジックを追加

節別・章別・苦手順の抽出。乱数を注入可能にしてテストを決定的にする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: 読み上げエンジン

Android Chrome の癖をこのファイルに閉じ込める。`speechSynthesis` は注入し、フェイクでテストする。

**Files:**
- Create: `js/lib/speech.js`
- Test: `test/speech.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `createSpeech({ synth, UtteranceCtor }) => Speech`
  - `synth` は `speak` / `cancel` / `getVoices` / `addEventListener` を持つ（`window.speechSynthesis`）
  - `UtteranceCtor` は `new UtteranceCtor(text)` で `{ text, rate, voice, lang, onend, onerror }` を持つオブジェクトを作る（`window.SpeechSynthesisUtterance`）
  - `speak(text, { rate, voice }) => Promise<'done'|'cancelled'>`
  - `cancel() => void`
  - `japaneseVoices() => Promise<Voice[]>`（`lang` が `ja` で始まるもの。なければ全件）
  - `pickVoice(voices, voiceURI) => Voice | null`
  - `unlock() => void`（無音の発話で音声を解禁する）

- [ ] **Step 1: 失敗するテストを書く**

`test/speech.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech } from '../js/lib/speech.js';

class FakeUtterance {
  constructor(text) { this.text = text; this.rate = 1; this.voice = null; this.lang = ''; }
}

function fakeSynth(voices = []) {
  const s = {
    spoken: [],
    cancelled: 0,
    _pending: null,
    _voices: voices,
    _listeners: {},
    speak(u) { s.spoken.push(u); s._pending = u; },
    cancel() { s.cancelled++; const u = s._pending; s._pending = null; if (u && u.onend) u.onend(); },
    getVoices() { return s._voices; },
    addEventListener(name, fn) { s._listeners[name] = fn; },
    finish() { const u = s._pending; s._pending = null; if (u && u.onend) u.onend(); },
    fail(msg) { const u = s._pending; s._pending = null; if (u && u.onerror) u.onerror({ error: msg }); },
    emitVoicesChanged(v) { s._voices = v; if (s._listeners.voiceschanged) s._listeners.voiceschanged(); },
  };
  return s;
}

const make = (synth) => createSpeech({ synth, UtteranceCtor: FakeUtterance });

test('文を1つ発話し、終了で解決する', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const p = sp.speak('こんにちは。', { rate: 1.2 });
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].text, 'こんにちは。');
  assert.equal(synth.spoken[0].rate, 1.2);
  assert.equal(synth.spoken[0].lang, 'ja-JP');
  synth.finish();
  assert.equal(await p, 'done');
});

test('cancel すると cancelled で解決する', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const p = sp.speak('長い文。', {});
  sp.cancel();
  assert.equal(await p, 'cancelled');
  assert.equal(synth.cancelled, 1);
});

test('エラーは reject になる', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const p = sp.speak('文。', {});
  synth.fail('synthesis-failed');
  await assert.rejects(p, /synthesis-failed/);
});

test('interrupted エラーは cancelled として扱う', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const p = sp.speak('文。', {});
  synth.fail('interrupted');
  assert.equal(await p, 'cancelled');
});

test('空文字は発話せずすぐ解決する', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  assert.equal(await sp.speak('   ', {}), 'done');
  assert.equal(synth.spoken.length, 0);
});

test('新しい発話の前に前の発話を打ち切る', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const first = sp.speak('一つ目。', {});
  const second = sp.speak('二つ目。', {});
  assert.equal(await first, 'cancelled');
  synth.finish();
  assert.equal(await second, 'done');
});

test('日本語の声だけを抜き出す', async () => {
  const synth = fakeSynth([
    { voiceURI: 'a', lang: 'en-US', name: 'English' },
    { voiceURI: 'b', lang: 'ja-JP', name: '日本語' },
  ]);
  const vs = await make(synth).japaneseVoices();
  assert.deepEqual(vs.map(v => v.voiceURI), ['b']);
});

test('日本語の声がなければ全件を返す', async () => {
  const synth = fakeSynth([{ voiceURI: 'a', lang: 'en-US', name: 'English' }]);
  const vs = await make(synth).japaneseVoices();
  assert.deepEqual(vs.map(v => v.voiceURI), ['a']);
});

test('getVoices が最初は空でも voiceschanged を待つ', async () => {
  const synth = fakeSynth([]);
  const p = make(synth).japaneseVoices();
  synth.emitVoicesChanged([{ voiceURI: 'b', lang: 'ja-JP', name: '日本語' }]);
  assert.deepEqual((await p).map(v => v.voiceURI), ['b']);
});

test('pickVoice が voiceURI で選ぶ', () => {
  const sp = make(fakeSynth());
  const vs = [{ voiceURI: 'a', lang: 'ja-JP' }, { voiceURI: 'b', lang: 'ja-JP' }];
  assert.equal(sp.pickVoice(vs, 'b').voiceURI, 'b');
  assert.equal(sp.pickVoice(vs, 'なし'), null);
  assert.equal(sp.pickVoice(vs, null), null);
});

test('指定した声を utterance に載せる', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const voice = { voiceURI: 'b', lang: 'ja-JP' };
  const p = sp.speak('文。', { voice });
  assert.equal(synth.spoken[0].voice, voice);
  synth.finish();
  await p;
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: FAIL。`Cannot find module '../js/lib/speech.js'`

- [ ] **Step 3: 実装を書く**

`js/lib/speech.js`:

```js
// speechSynthesis のラッパ。Android Chrome の癖をこのファイルに閉じ込める。
//  - 長文を渡すと途中で止まるため、呼び出し側が1文ずつ渡す前提にする
//  - getVoices() は初回に空配列を返すことがあるため voiceschanged を待つ
//  - cancel() 由来の onerror('interrupted') は異常ではないので正常終了として扱う

const VOICE_WAIT_MS = 2000;

export function createSpeech({ synth, UtteranceCtor }) {
  let current = null;         // { utter, settle }

  function settleCurrent(result) {
    const c = current;
    current = null;
    if (c) c.settle(result);
  }

  return {
    speak(text, { rate = 1.0, voice = null } = {}) {
      const body = String(text ?? '').trim();
      if (current) { settleCurrent('cancelled'); synth.cancel(); }
      if (!body) return Promise.resolve('done');

      return new Promise((resolve, reject) => {
        const utter = new UtteranceCtor(body);
        utter.rate = rate;
        utter.lang = 'ja-JP';
        if (voice) utter.voice = voice;

        const settle = result => resolve(result);
        current = { utter, settle };

        utter.onend = () => { if (current && current.utter === utter) settleCurrent('done'); };
        utter.onerror = e => {
          if (!current || current.utter !== utter) return;
          const err = (e && e.error) || 'unknown';
          current = null;
          // cancel() を呼んだときにも interrupted / canceled が飛ぶ。異常ではない。
          if (err === 'interrupted' || err === 'canceled') resolve('cancelled');
          else reject(new Error(err));
        };

        synth.speak(utter);
      });
    },

    cancel() {
      if (current) settleCurrent('cancelled');
      synth.cancel();
    },

    async japaneseVoices() {
      let all = synth.getVoices() || [];
      if (all.length === 0) {
        all = await new Promise(resolve => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(synth.getVoices() || []); } };
          synth.addEventListener('voiceschanged', finish);
          setTimeout(finish, VOICE_WAIT_MS);
        });
      }
      const ja = all.filter(v => String(v.lang || '').toLowerCase().startsWith('ja'));
      return ja.length ? ja : all;
    },

    pickVoice(voices, voiceURI) {
      if (!voiceURI) return null;
      return (voices || []).find(v => v.voiceURI === voiceURI) || null;
    },

    // 初回の発話がユーザー操作なしだと無音になるため、
    // 最初のタップのタイミングで無音の発話を1つ流して解禁する。
    unlock() {
      const u = new UtteranceCtor(' ');
      u.lang = 'ja-JP';
      u.volume = 0;
      synth.speak(u);
    },
  };
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 5: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/lib/speech.js test/speech.test.js
git commit -m "$(cat <<'MSG'
読み上げエンジンのラッパを追加

Android Chrome の癖（声リストの遅延、cancel時のerror発火）を
このファイルに閉じ込め、1文ずつ発話する Promise API を提供する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: 教材の保管と画面の外枠

IndexedDB への保存と、アプリの外枠・タブ・オンボーディングを作る。ここで初めてブラウザで動く形になる。

**Files:**
- Create: `js/lib/db.js`
- Create: `js/lib/wakelock.js`
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/views/onboarding.js`
- Create: `js/app.js`

**Interfaces:**
- Consumes: `schema.js` の `validateData`, `summarize`；`progress.js` の `createProgress`；`settings.js` の `createSettings`
- Produces:
  - `db.js`: `saveBook(data) => Promise<void>` / `loadBook() => Promise<object|null>` / `clearBook() => Promise<void>`
  - `wakelock.js`: `createWakeLock(nav) => { enable(): Promise<void>, disable(): Promise<void>, isActive(): boolean }`
  - `onboarding.js`: `renderOnboarding(root, { onLoaded })`
  - `app.js`: 起動時に教材の有無で分岐し、`window.__pfs` に `{ book, progress, settings, speech }` を持たせる

- [ ] **Step 1: IndexedDB ラッパを書く**

`js/lib/db.js`:

```js
// 教材データは数MBあり localStorage の上限を超えるため IndexedDB に置く。
// 1レコードだけを持つ単純な作りにする。

const DB_NAME = 'petfood-study';
const DB_VERSION = 1;
const STORE = 'book';
const KEY = 'current';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

export const saveBook = data => tx('readwrite', s => s.put(data, KEY));
export const loadBook = () => tx('readonly', s => s.get(KEY)).then(v => v ?? null);
export const clearBook = () => tx('readwrite', s => s.delete(KEY));
```

- [ ] **Step 2: Wake Lock ラッパを書く**

`js/lib/wakelock.js`:

```js
// Android Chrome は画面が消えると読み上げを止める。
// バックグラウンド再生はできないため、再生中は画面を点けたままにする。

export function createWakeLock(nav) {
  let sentinel = null;

  return {
    async enable() {
      if (sentinel || !nav || !nav.wakeLock) return;
      try {
        sentinel = await nav.wakeLock.request('screen');
        sentinel.addEventListener('release', () => { sentinel = null; });
      } catch {
        sentinel = null;      // 取得できなくても再生は続ける
      }
    },
    async disable() {
      const s = sentinel;
      sentinel = null;
      if (s) { try { await s.release(); } catch { /* 解放失敗は無視してよい */ } }
    },
    isActive() { return sentinel !== null; },
  };
}
```

- [ ] **Step 3: index.html を書く**

`index.html`:

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2f6f4e">
<title>ペットフード販売士 学習</title>
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icons/icon-192.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div id="onboarding" class="screen"></div>

<div id="main" class="screen" hidden>
  <header id="topbar">
    <div id="topbar-title">ペットフード販売士 学習</div>
    <div id="topbar-rate"></div>
  </header>

  <main id="view"></main>

  <nav id="tabs">
    <button class="tab" data-tab="player" aria-label="きく">きく</button>
    <button class="tab" data-tab="toc" aria-label="もくじ">もくじ</button>
    <button class="tab" data-tab="quiz" aria-label="テスト">テスト</button>
    <button class="tab" data-tab="settings" aria-label="設定">設定</button>
  </nav>
</div>

<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: css/style.css を書く**

```css
:root {
  --bg: #f7f6f2;
  --surface: #ffffff;
  --ink: #1d2320;
  --muted: #6b7570;
  --line: #e2e0d8;
  --accent: #2f6f4e;
  --accent-ink: #ffffff;
  --warn: #b3452f;
  --tabh: 60px;
  color-scheme: light;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.75 system-ui, -apple-system, "Noto Sans JP", sans-serif;
  -webkit-text-size-adjust: 100%;
}

.screen[hidden] { display: none; }

#topbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px;
  background: var(--accent); color: var(--accent-ink);
}
#topbar-title { font-weight: 700; font-size: 15px; }
#topbar-rate { font-size: 13px; opacity: .9; font-variant-numeric: tabular-nums; }

#view { padding: 16px 16px calc(var(--tabh) + 24px); }

#tabs {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
  display: grid; grid-template-columns: repeat(4, 1fr);
  height: var(--tabh);
  background: var(--surface); border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom);
}
.tab {
  border: 0; background: none; color: var(--muted);
  font: inherit; font-size: 13px; font-weight: 600;
  cursor: pointer;
}
.tab[aria-current="true"] { color: var(--accent); }

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 48px; padding: 0 20px;
  border: 1px solid var(--accent); border-radius: 10px;
  background: var(--accent); color: var(--accent-ink);
  font: inherit; font-weight: 700; cursor: pointer;
}
.btn.ghost { background: var(--surface); color: var(--accent); }
.btn.danger { background: var(--surface); border-color: var(--warn); color: var(--warn); }
.btn:disabled { opacity: .45; cursor: default; }

.muted { color: var(--muted); font-size: 14px; }
.error { color: var(--warn); font-size: 14px; }

.bar { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
.bar > i { display: block; height: 100%; background: var(--accent); }

/* オンボーディング */
#onboarding { padding: 32px 20px; max-width: 560px; margin: 0 auto; }
#onboarding h1 { font-size: 20px; margin: 0 0 8px; }
#onboarding ol { padding-left: 1.2em; color: var(--muted); font-size: 14px; }
```

- [ ] **Step 5: オンボーディング画面を書く**

`js/views/onboarding.js`:

```js
import { validateData, summarize } from '../lib/schema.js';
import { saveBook } from '../lib/db.js';

export function renderOnboarding(root, { onLoaded }) {
  root.innerHTML = `
    <h1>ペットフード販売士 学習</h1>
    <p class="muted">
      このアプリを使うには、お手持ちのテキストから作った教材ファイル
      <code>petfood-data.json</code> が必要です。
      教材は端末の中だけに保存され、外部には送信されません。
    </p>
    <div class="card">
      <button class="btn" id="pick">教材ファイルを選ぶ</button>
      <input type="file" id="file" accept="application/json,.json" hidden>
      <p class="muted" id="status" style="margin-bottom:0"></p>
    </div>
    <ol>
      <li>教材ファイルを端末にダウンロードしておく</li>
      <li>上のボタンから選ぶ</li>
      <li>次回からはそのまま起動します</li>
    </ol>
  `;

  const file = root.querySelector('#file');
  const status = root.querySelector('#status');
  const pick = root.querySelector('#pick');

  pick.addEventListener('click', () => file.click());

  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;

    status.className = 'muted';
    status.textContent = '読み込んでいます…';

    let parsed;
    try {
      parsed = JSON.parse(await f.text());
    } catch {
      status.className = 'error';
      status.textContent = 'JSONとして読めませんでした。ファイルを確認してください。';
      return;
    }

    const result = validateData(parsed);
    if (!result.ok) {
      status.className = 'error';
      status.textContent = '教材ファイルに問題があります: ' + result.errors.join(' / ');
      return;
    }

    await saveBook(result.data);
    const s = summarize(result.data);
    status.className = 'muted';
    status.textContent = `${s.title} ${s.edition}／${s.chapters}章 ${s.sections}節 問題${s.questions}問を取り込みました。`;
    onLoaded(result.data);
  });
}
```

- [ ] **Step 6: app.js を書く**

`js/app.js`:

```js
import { loadBook } from './lib/db.js';
import { createProgress } from './lib/progress.js';
import { createSettings } from './lib/settings.js';
import { createSpeech } from './lib/speech.js';
import { createWakeLock } from './lib/wakelock.js';
import { renderOnboarding } from './views/onboarding.js';

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
  speech: createSpeech({ synth: window.speechSynthesis, UtteranceCtor: window.SpeechSynthesisUtterance }),
  wakeLock: createWakeLock(navigator),
  tab: 'player',
};

// 画面モジュールは後続タスクで実装する。未実装のタブは案内だけ出す。
const views = {};

export function registerView(name, renderFn) { views[name] = renderFn; }

export function showTab(name) {
  ctx.tab = name;
  for (const b of el.tabs.querySelectorAll('.tab')) {
    b.setAttribute('aria-current', String(b.dataset.tab === name));
  }
  el.view.innerHTML = '';
  const render = views[name];
  if (render) render(el.view, ctx, { showTab });
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
  const book = await loadBook();
  if (book) {
    startMain(book);
  } else {
    el.main.hidden = true;
    el.onboarding.hidden = false;
    renderOnboarding(el.onboarding, { onLoaded: startMain });
  }
})();

window.__pfs = ctx;   // 実機での動作確認用
```

- [ ] **Step 7: 既存テストが壊れていないことを確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）（このタスクではテストを増やさない。`db.js` と `wakelock.js` と views はブラウザAPI依存のため `js/lib/` のテスト対象外）

- [ ] **Step 8: ブラウザで動作を確認する**

Run: `cd /Users/taichi/petfood-study && python3 -m http.server 8765`

ブラウザで `http://localhost:8765` を開く。
Expected: 「教材ファイルを選ぶ」ボタンのあるオンボーディング画面が出る。
コンソールにエラーが出ていないこと。

確認したらサーバを止める（Ctrl-C）。

- [ ] **Step 9: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/lib/db.js js/lib/wakelock.js index.html css/style.css js/views/onboarding.js js/app.js
git commit -m "$(cat <<'MSG'
アプリの外枠と教材取り込みを追加

IndexedDB への教材保管、Wake Lock ラッパ、タブ外枠、
初回のオンボーディング画面。ここで初めてブラウザで動く。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: きく画面

アプリの主機能。読み上げ、速度調整、一時停止、文単位のスキップ、中断再開。

**Files:**
- Create: `js/views/player.js`
- Modify: `js/app.js`（`player.js` を import して登録する）
- Modify: `css/style.css`（末尾に追記）

**Interfaces:**
- Consumes: `book.js` の `flattenSection`, `findSection`, `neighborSection`, `firstSectionId`；`speech.js`；`progress.js`；`settings.js`；`wakelock.js`
- Produces:
  - `renderPlayer(root, ctx, nav) => teardown` — **後始末の関数を返す。** `app.js` は画面を切り替える前にこれを呼ぶ。返された関数は再生を止め、Wake Lock を解放し、このレンダリングで登録した `document` レベルのリスナーを外す
  - `openPlayerAt(sectionId, sentIndex)` — もくじ・テスト画面から「この節を開く」ための入口。**呼び出し順に依存しないよう、モジュール内の変数に希望位置を積むだけ**にし、次に `renderPlayer` が走ったときに消費する

**なぜ静的プロパティ（`renderPlayer.openAt = ...`）にしないか:** `renderPlayer` が一度も走っていない状態では未定義になり、また再レンダリングのたびに古いクロージャを指す危険がある。モジュール変数に積む方式なら呼び出し順を問わない。

- [ ] **Step 1: player.js を書く**

`js/views/player.js`:

```js
import { flattenSection, findSection, neighborSection, firstSectionId } from '../lib/book.js';
import { RATE_STEP } from '../lib/settings.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// もくじ・テスト画面から「この節を開く」と指定された位置を一時的に預かる。
// 次に renderPlayer が走ったとき一度だけ消費する。
let pendingOpen = null;

export function openPlayerAt(sectionId, sentIndex = 0) {
  pendingOpen = { sectionId, sentIndex };
}

function takePendingOpen() {
  const p = pendingOpen;
  pendingOpen = null;
  return p;
}

export function renderPlayer(root, ctx, nav) {
  const { book, progress, settings, speech, wakeLock } = ctx;

  // ---- 状態 ----------------------------------------------------------
  // openPlayerAt で指定された位置があればそれを優先し、なければ前回の再生位置、
  // それも無ければ本の先頭から始める。
  const requested = takePendingOpen();
  const saved = requested || progress.getPosition();
  let sectionId = (saved && findSection(book.chapters, saved.sectionId))
    ? saved.sectionId
    : firstSectionId(book.chapters);
  let index = saved && saved.sectionId === sectionId ? saved.sentIndex : 0;
  let playing = false;
  let token = 0;          // 再生ループの世代。停止・移動のたびに増やす
  let voices = [];

  // ---- 骨格 ----------------------------------------------------------
  root.innerHTML = `
    <div id="p-head" class="card">
      <div class="muted" id="p-chapter"></div>
      <div id="p-title"></div>
      <div class="bar" style="margin-top:10px"><i id="p-bar"></i></div>
      <div class="muted" id="p-count" style="margin-top:6px"></div>
    </div>
    <div id="p-body"></div>
    <div id="p-ctrl">
      <div id="p-rate-row">
        <button class="btn ghost sm" id="p-slower">遅く</button>
        <span id="p-rate"></span>
        <button class="btn ghost sm" id="p-faster">速く</button>
      </div>
      <div id="p-move-row">
        <button class="btn ghost sm" id="p-prev-sec">前の節</button>
        <button class="btn ghost sm" id="p-back">◀ 1文</button>
        <button class="btn" id="p-play">再生</button>
        <button class="btn ghost sm" id="p-fwd">1文 ▶</button>
        <button class="btn ghost sm" id="p-next-sec">次の節</button>
      </div>
    </div>
  `;

  const $ = id => root.querySelector('#' + id);
  const body = $('p-body');

  // ---- 描画 ----------------------------------------------------------
  function currentSection() {
    const f = findSection(book.chapters, sectionId);
    return f ? f : null;
  }

  function utterances() {
    const f = currentSection();
    return f ? flattenSection(f.section) : [];
  }

  function drawHead() {
    const f = currentSection();
    const us = utterances();
    $('p-chapter').textContent = f ? `第${f.chapter.no}章 ${f.chapter.title}` : '';
    $('p-title').textContent = f ? `${f.chapter.no}-${f.section.no} ${f.section.title}（p.${f.section.page}）` : '';
    const rate = us.length ? Math.min(1, (index + 1) / us.length) : 0;
    $('p-bar').style.width = `${Math.round(rate * 100)}%`;
    $('p-count').textContent = us.length ? `${index + 1} / ${us.length} 文` : '本文がありません';
    $('p-rate').textContent = `${settings.get().rate.toFixed(1)}倍`;
    document.getElementById('topbar-rate').textContent = `${settings.get().rate.toFixed(1)}倍`;
    $('p-play').textContent = playing ? '一時停止' : '再生';
  }

  function drawBody() {
    const us = utterances();
    body.innerHTML = us.map(u => {
      if (u.type === 'figure') {
        return `<figure class="p-fig" data-i="${u.i}">
          <img src="${u.img}" alt="${escapeHtml(u.caption || '図')}">
          <figcaption>${escapeHtml(u.caption || '')}</figcaption>
        </figure>`;
      }
      const cls = u.type === 'list' ? 'p-sent p-list' : 'p-sent';
      return `<span class="${cls}" data-i="${u.i}">${escapeHtml(u.text)}</span>`;
    }).join('');
    highlight();
  }

  function highlight() {
    for (const n of body.querySelectorAll('[data-i]')) {
      n.classList.toggle('is-current', Number(n.dataset.i) === index);
    }
    const cur = body.querySelector('.is-current');
    if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ---- 再生ループ ----------------------------------------------------
  async function loop(myToken) {
    const cfg = settings.get();
    const voice = speech.pickVoice(voices, cfg.voiceURI);

    while (playing && myToken === token) {
      const us = utterances();
      if (index >= us.length) {
        progress.markDone(sectionId);
        const next = cfg.autoNextSection ? neighborSection(book.chapters, sectionId, 1) : null;
        if (!next) { stop(); break; }
        sectionId = next.section.id;
        index = 0;
        drawHead(); drawBody();
        continue;
      }

      const u = us[index];
      let result;
      try {
        result = await speech.speak(u.text, { rate: cfg.rate, voice });
      } catch {
        stop();                       // 読み上げが失敗したら止めて位置は保つ
        break;
      }
      if (myToken !== token) break;
      if (result === 'cancelled') break;

      progress.markSentence(sectionId, index, us.length);
      progress.setPosition(sectionId, index);
      index += 1;
      drawHead(); highlight();

      if (cfg.pauseMs > 0) await sleep(cfg.pauseMs);
    }
  }

  async function start() {
    if (playing) return;
    speech.unlock();
    playing = true;
    token += 1;
    if (settings.get().keepAwake) wakeLock.enable();
    drawHead();
    loop(token);
  }

  function stop() {
    playing = false;
    token += 1;
    speech.cancel();
    wakeLock.disable();
    progress.setPosition(sectionId, index);
    drawHead();
  }

  function moveTo(nextIndex) {
    const wasPlaying = playing;
    if (wasPlaying) stop();
    const us = utterances();
    index = Math.max(0, Math.min(nextIndex, Math.max(0, us.length - 1)));
    progress.setPosition(sectionId, index);
    drawHead(); highlight();
    if (wasPlaying) start();
  }

  function moveSection(delta) {
    const n = neighborSection(book.chapters, sectionId, delta);
    if (!n) return;
    const wasPlaying = playing;
    if (wasPlaying) stop();
    sectionId = n.section.id;
    index = 0;
    progress.setPosition(sectionId, index);
    drawHead(); drawBody();
    if (wasPlaying) start();
  }

  function changeRate(delta) {
    const next = settings.set({ rate: settings.get().rate + delta }).rate;
    drawHead();
    // 発話中の文には新しい速度が効かないため、いったん止めて同じ文から掛け直す。
    if (playing) { stop(); start(); }
    return next;
  }

  // ---- 配線 ----------------------------------------------------------
  $('p-play').addEventListener('click', () => (playing ? stop() : start()));
  $('p-back').addEventListener('click', () => moveTo(index - 1));
  $('p-fwd').addEventListener('click', () => moveTo(index + 1));
  $('p-prev-sec').addEventListener('click', () => moveSection(-1));
  $('p-next-sec').addEventListener('click', () => moveSection(1));
  $('p-slower').addEventListener('click', () => changeRate(-RATE_STEP));
  $('p-faster').addEventListener('click', () => changeRate(RATE_STEP));

  body.addEventListener('click', e => {
    const n = e.target.closest('[data-i]');
    if (n) moveTo(Number(n.dataset.i));
  });

  // 画面から離れたら必ず止める。Android Chrome は非表示だと読み上げを続けられない。
  // このリスナーは teardown で必ず外す。外さないと再レンダリングのたびに積み上がり、
  // 古いクロージャが残って停止処理が二重に走る。
  const onVisibility = () => { if (document.hidden && playing) stop(); };
  document.addEventListener('visibilitychange', onVisibility);

  drawHead();
  drawBody();
  speech.japaneseVoices().then(v => { voices = v; });

  // app.js が画面を切り替える前に呼ぶ。再生を止め、Wake Lock を解放し、
  // document レベルのリスナーを外す。これを怠ると、もくじタブに移っても
  // 読み上げが鳴り続け、進捗が書き換わり続ける。
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    if (playing) stop(); else { speech.cancel(); wakeLock.disable(); }
  };
}
```

- [ ] **Step 2: css/style.css の末尾に追記する**

```css
/* きく画面 */
#p-head { position: sticky; top: 44px; z-index: 5; }
#p-title { font-weight: 700; margin-top: 2px; }

#p-body { padding-bottom: 150px; }
.p-sent {
  display: inline; border-radius: 4px; padding: 1px 0;
  cursor: pointer; transition: background .15s;
}
.p-sent.is-current { background: #ffeeb4; box-shadow: 0 0 0 3px #ffeeb4; }
.p-list { display: block; padding-left: 1.2em; text-indent: -1.2em; }
.p-list::before { content: "・"; }

.p-fig {
  display: block; margin: 12px 0; padding: 8px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
  cursor: pointer;
}
.p-fig.is-current { box-shadow: 0 0 0 3px #ffeeb4; }
.p-fig img { display: block; width: 100%; height: auto; }
.p-fig figcaption { font-size: 13px; color: var(--muted); margin-top: 6px; }

#p-ctrl {
  position: fixed; left: 0; right: 0; bottom: var(--tabh); z-index: 9;
  background: var(--surface); border-top: 1px solid var(--line);
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  display: grid; gap: 8px;
}
#p-rate-row { display: flex; align-items: center; justify-content: center; gap: 14px; }
#p-rate { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 52px; text-align: center; }
#p-move-row { display: flex; align-items: center; justify-content: center; gap: 6px; }
.btn.sm { min-height: 40px; padding: 0 10px; font-size: 13px; font-weight: 600; }
#p-play { min-width: 108px; }
```

- [ ] **Step 3: app.js に登録する**

`js/app.js` の import 群の末尾に追記:

```js
import { renderPlayer } from './views/player.js';
```

`const views = {};` を次に差し替える:

```js
const views = { player: renderPlayer };
```

さらに `showTab` を、画面を切り替える前に前の画面の後始末を呼ぶ形に差し替える:

```js
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
```

画面モジュールは後始末が不要なら何も返さなくてよい（`undefined` は `null` として扱われる）。

- [ ] **Step 4: 動作確認用のダミー教材を作る**

Run:

```bash
cd /Users/taichi/petfood-study && cat > /tmp/petfood-data.json <<'JSON'
{
  "meta": { "schema": 1, "title": "ペットフード販売士認定講習会テキスト", "edition": "第5版", "generatedAt": "2026-09-15" },
  "chapters": [
    { "id": "ch01", "no": 1, "title": "ペットフード販売士認定制度の概要", "page": 4,
      "sections": [
        { "id": "ch01-s01", "no": 1, "title": "設立趣旨", "page": 4,
          "blocks": [
            { "type": "p", "sents": [
              "サンプルの段落です。ここに本文が入ります。",
              "水は毎日新しいものに取り替える。",
              "ペットの体調管理には日々の観察が欠かせない。"
            ]},
            { "type": "list", "sents": [
              "この資格に関心がある方",
              "将来この分野で活動しようと考えている方"
            ]}
          ]},
        { "id": "ch01-s02", "no": 2, "title": "設置", "page": 4,
          "blocks": [
            { "type": "p", "sents": [
              "サンプルの委員会を設置し、関心のある方向けに講習会および試験を実施するものである。"
            ]}
          ]}
      ]}
  ],
  "questions": []
}
JSON
echo "作成: /tmp/petfood-data.json"
```

- [ ] **Step 5: ブラウザで動作を確認する**

Run: `cd /Users/taichi/petfood-study && python3 -m http.server 8765`

`http://localhost:8765` を開き、`/tmp/petfood-data.json` を選ぶ。

Expected:
- 「きく」画面に第1章1-1の本文が出る
- 「再生」で読み上げが始まり、読んでいる文が黄色くハイライトされる
- 「遅く」「速く」で上部の倍率表示が変わる
- 「1文 ▶」「◀ 1文」で位置が動く
- 文をタップするとそこから読む
- 読み上げ中にページを再読み込みすると、同じ位置から始まる

確認したらサーバを止める。

- [ ] **Step 6: テストが壊れていないことを確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 7: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/views/player.js js/app.js css/style.css
git commit -m "$(cat <<'MSG'
きく画面を追加

1文ずつ読み上げ、読んでいる文をハイライトする。
速度調整・一時停止・文単位のスキップ・中断再開に対応。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: もくじ画面と「前回の続きから」

**Files:**
- Create: `js/views/toc.js`
- Modify: `js/app.js`
- Modify: `css/style.css`（末尾に追記）

**Interfaces:**
- Consumes: `book.js` の `findSection`, `sectionLength`；`progress.js`；`player.js` の `openPlayerAt`
- Produces: `renderToc(root, ctx, nav)`

- [ ] **Step 1: toc.js を書く**

`js/views/toc.js`:

```js
import { findSection, sectionLength } from '../lib/book.js';
import { openPlayerAt } from './player.js';

const LABEL = { unread: '未読', reading: '途中', done: '読了' };

export function renderToc(root, ctx, nav) {
  const { book, progress } = ctx;

  const pos = progress.getPosition();
  const at = pos ? findSection(book.chapters, pos.sectionId) : null;
  const { done, total } = progress.doneCount(book.chapters);

  const resume = at ? `
    <div class="card" id="t-resume">
      <div class="muted">前回の続きから</div>
      <div id="t-resume-title">第${at.chapter.no}章 ${at.chapter.no}-${at.section.no} ${at.section.title}</div>
      <div class="muted">${pos.sentIndex + 1}文目から</div>
      <button class="btn" id="t-resume-btn" style="margin-top:10px">続きを読む</button>
    </div>` : '';

  root.innerHTML = `
    ${resume}
    <div class="card">
      <div class="muted">全体の進捗</div>
      <div class="bar" style="margin:8px 0 6px"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div>
      <div class="muted">${done} / ${total} 節</div>
    </div>
    ${book.chapters.map(ch => chapterHtml(ch, progress)).join('')}
  `;

  const btn = root.querySelector('#t-resume-btn');
  if (btn) btn.addEventListener('click', () => open(pos.sectionId, pos.sentIndex));

  root.addEventListener('click', e => {
    const head = e.target.closest('.t-ch-head');
    if (head) { head.parentElement.classList.toggle('is-open'); return; }
    const row = e.target.closest('.t-sec');
    if (row) open(row.dataset.id, Number(row.dataset.at || 0));
  });

  function open(sectionId, sentIndex) {
    openPlayerAt(sectionId, sentIndex);
    nav.showTab('player');
  }
}

function chapterHtml(ch, progress) {
  const rate = Math.round(progress.chapterRate(ch) * 100);
  const rows = (ch.sections || []).map(sec => {
    const p = progress.getSection(sec.id);
    const len = sectionLength(sec);
    const at = p.state === 'reading' ? p.maxSent : 0;
    const sub = p.state === 'reading' ? `${p.maxSent + 1} / ${len} 文` : `${len} 文`;
    return `<div class="t-sec" data-id="${sec.id}" data-at="${at}">
      <span class="t-badge is-${p.state}">${LABEL[p.state]}</span>
      <span class="t-sec-title">${ch.no}-${sec.no} ${esc(sec.title)}</span>
      <span class="muted t-sec-sub">${sub}</span>
    </div>`;
  }).join('');

  return `<div class="card t-ch${rate === 100 ? ' is-done' : ''}">
    <div class="t-ch-head">
      <div>
        <div class="t-ch-title">第${ch.no}章 ${esc(ch.title)}</div>
        <div class="bar" style="margin-top:8px"><i style="width:${rate}%"></i></div>
      </div>
      <div class="muted t-ch-rate">${rate}%</div>
    </div>
    <div class="t-secs">${rows}</div>
  </div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
```

- [ ] **Step 2: css/style.css の末尾に追記する**

```css
/* もくじ */
#t-resume { border-color: var(--accent); border-width: 2px; }
#t-resume-title { font-weight: 700; margin: 2px 0; }

.t-ch-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; }
.t-ch-head > div:first-child { flex: 1; }
.t-ch-title { font-weight: 700; }
.t-ch-rate { font-variant-numeric: tabular-nums; }

.t-secs { display: none; margin-top: 10px; border-top: 1px solid var(--line); }
.t-ch.is-open .t-secs { display: block; }

.t-sec {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 0; border-bottom: 1px solid var(--line); cursor: pointer;
}
.t-sec:last-child { border-bottom: 0; }
.t-sec-title { flex: 1; }
.t-sec-sub { white-space: nowrap; font-size: 12px; }

.t-badge {
  font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
  background: var(--line); color: var(--muted); white-space: nowrap;
}
.t-badge.is-reading { background: #fde9a9; color: #7a5b00; }
.t-badge.is-done { background: var(--accent); color: var(--accent-ink); }
```

- [ ] **Step 3: app.js に登録する**

import に追記:

```js
import { renderToc } from './views/toc.js';
```

`views` を差し替える:

```js
const views = { player: renderPlayer, toc: renderToc };
```

- [ ] **Step 4: ブラウザで動作を確認する**

Run: `cd /Users/taichi/petfood-study && python3 -m http.server 8765`

Expected:
- 「もくじ」タブに「前回の続きから」カードと全体進捗が出る
- 章をタップすると節の一覧が開く
- 節をタップすると「きく」に切り替わり、その節が読み込まれる
- 1つの節を最後まで読むと、もくじでその節が「読了」になり章の％が上がる

- [ ] **Step 5: テストが壊れていないことを確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 6: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/views/toc.js js/app.js css/style.css
git commit -m "$(cat <<'MSG'
もくじ画面を追加

章のアコーディオン、節ごとの未読／途中／読了バッジ、
全体と章の進捗バー、前回の続きからの再開カード。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 11: 設定画面

**Files:**
- Create: `js/views/settings.js`
- Modify: `js/app.js`
- Modify: `css/style.css`（末尾に追記）

**Interfaces:**
- Consumes: `settings.js`；`speech.js`；`progress.js`；`db.js` の `clearBook`；`schema.js` の `summarize`
- Produces: `renderSettings(root, ctx, nav)`

- [ ] **Step 1: settings ビューを書く**

`js/views/settings.js`:

```js
import { RATE_MIN, RATE_MAX, RATE_STEP } from '../lib/settings.js';
import { summarize } from '../lib/schema.js';
import { clearBook } from '../lib/db.js';
import { escapeHtml as esc } from '../lib/html.js';

export function renderSettings(root, ctx, nav) {
  const { book, settings, speech, progress } = ctx;
  const cfg = settings.get();
  const info = summarize(book);

  root.innerHTML = `
    <div class="card">
      <div class="s-row">
        <label for="s-rate">読み上げの速さ</label>
        <output id="s-rate-out">${cfg.rate.toFixed(1)}倍</output>
      </div>
      <input type="range" id="s-rate" min="${RATE_MIN}" max="${RATE_MAX}" step="${RATE_STEP}" value="${cfg.rate}">

      <div class="s-row" style="margin-top:16px">
        <label for="s-pause">文と文の間</label>
        <output id="s-pause-out">${cfg.pauseMs}ミリ秒</output>
      </div>
      <input type="range" id="s-pause" min="0" max="1000" step="50" value="${cfg.pauseMs}">

      <div class="s-row" style="margin-top:16px">
        <label for="s-voice">声</label>
      </div>
      <select id="s-voice"><option value="">読み込み中…</option></select>
      <button class="btn ghost sm" id="s-test" style="margin-top:8px">この声で試す</button>
    </div>

    <div class="card">
      <label class="s-check"><input type="checkbox" id="s-awake" ${cfg.keepAwake ? 'checked' : ''}>
        再生中は画面を消さない</label>
      <p class="muted">Android では画面が消えると読み上げが止まります。オフにすると、画面が消えたときに再生も止まります。</p>

      <label class="s-check"><input type="checkbox" id="s-auto" ${cfg.autoNextSection ? 'checked' : ''}>
        節の終わりで次の節へ進む</label>
    </div>

    <div class="card">
      <div class="muted">取り込み済みの教材</div>
      <div>${esc(info.title)} ${esc(info.edition)}</div>
      <div class="muted">${info.chapters}章 ${info.sections}節 問題${info.questions}問／作成 ${esc(info.generatedAt)}</div>
      <div class="s-btns">
        <button class="btn ghost sm" id="s-export">学習データを書き出す</button>
        <button class="btn ghost sm" id="s-import">学習データを読み込む</button>
        <input type="file" id="s-import-file" accept="application/json,.json" hidden>
      </div>
      <div class="s-btns">
        <button class="btn danger sm" id="s-reset">進捗をリセット</button>
        <button class="btn danger sm" id="s-clear">教材を入れ替える</button>
      </div>
      <p class="muted" id="s-msg"></p>
    </div>
  `;

  const $ = id => root.querySelector('#' + id);

  $('s-rate').addEventListener('input', e => {
    const v = settings.set({ rate: Number(e.target.value) }).rate;
    $('s-rate-out').textContent = `${v.toFixed(1)}倍`;
    document.getElementById('topbar-rate').textContent = `${v.toFixed(1)}倍`;
  });

  $('s-pause').addEventListener('input', e => {
    const v = settings.set({ pauseMs: Number(e.target.value) }).pauseMs;
    $('s-pause-out').textContent = `${v}ミリ秒`;
  });

  $('s-awake').addEventListener('change', e => settings.set({ keepAwake: e.target.checked }));
  $('s-auto').addEventListener('change', e => settings.set({ autoNextSection: e.target.checked }));

  speech.japaneseVoices().then(voices => {
    const sel = $('s-voice');
    sel.innerHTML = '<option value="">端末の既定</option>' +
      voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)}（${esc(v.lang)}）</option>`).join('');
    sel.value = settings.get().voiceURI || '';
    sel.addEventListener('change', e => settings.set({ voiceURI: e.target.value || null }));

    $('s-test').addEventListener('click', () => {
      speech.unlock();
      const c = settings.get();
      speech.speak('ペットフードの表示に関する公正競争規約について説明します。',
        { rate: c.rate, voice: speech.pickVoice(voices, c.voiceURI) });
    });
  });

  $('s-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(progress.exportAll(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `petfood-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('s-import').addEventListener('click', () => $('s-import-file').click());
  $('s-import-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      progress.importAll(JSON.parse(await f.text()));
      progress.pruneTo(book.chapters);
      $('s-msg').textContent = '学習データを読み込みました。';
    } catch {
      $('s-msg').textContent = '読み込めませんでした。';
    }
  });

  $('s-reset').addEventListener('click', () => {
    if (!confirm('すべての進捗とテスト成績を消します。よろしいですか。')) return;
    progress.reset();
    localStorage.removeItem('pfs:quiz');
    $('s-msg').textContent = '進捗をリセットしました。';
  });

  $('s-clear').addEventListener('click', async () => {
    if (!confirm('教材を削除して選び直します。学習の進捗は残ります。よろしいですか。')) return;
    await clearBook();
    location.reload();
  });
}

```

- [ ] **Step 2: css/style.css の末尾に追記する**

```css
/* 設定 */
.s-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.s-row label { font-weight: 600; }
.s-row output { font-variant-numeric: tabular-nums; color: var(--muted); }

input[type="range"] { width: 100%; margin: 6px 0 0; accent-color: var(--accent); }
select { width: 100%; min-height: 48px; padding: 0 10px; font: inherit;
  border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); }

.s-check { display: flex; align-items: center; gap: 10px; font-weight: 600; margin-bottom: 4px; }
.s-check input { width: 22px; height: 22px; accent-color: var(--accent); }

.s-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
```

- [ ] **Step 3: app.js に登録する**

import に追記:

```js
import { renderSettings } from './views/settings.js';
```

`views` を差し替える:

```js
const views = { player: renderPlayer, toc: renderToc, settings: renderSettings };
```

- [ ] **Step 4: ブラウザで動作を確認する**

Run: `cd /Users/taichi/petfood-study && python3 -m http.server 8765`

Expected:
- 速度スライダーを動かすと上部の倍率表示が連動する
- 声の一覧に日本語音声が並び、「この声で試す」で発話する
- 「学習データを書き出す」でJSONがダウンロードされる
- 「教材を入れ替える」でオンボーディング画面に戻る

- [ ] **Step 5: テストが壊れていないことを確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 6: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/views/settings.js js/app.js css/style.css
git commit -m "$(cat <<'MSG'
設定画面を追加

速度・文間の間・声の選択・画面点灯維持の切り替え、
学習データの書き出しと読み込み、教材の入れ替え。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 12: テスト画面

**Files:**
- Create: `js/views/quiz.js`
- Modify: `js/app.js`
- Modify: `css/style.css`（末尾に追記）

**Interfaces:**
- Consumes: `quizpick.js` の `pickForSection`, `pickForChapter`, `pickWeak`；`book.js` の `listSections`, `findSection`；`player.js` の `openPlayerAt`；`quizresults.js` の `createQuizResults`
- Produces: `renderQuiz(root, ctx, nav)`

**成績の保管は `js/lib/quizresults.js` が持つ。** `js/views/` から `localStorage` を直接触らないのがこのプロジェクトの流儀で、storage は `js/lib/` が引数注入で受け取る（`progress.js` / `settings.js` と同じ）。これによりテストも書ける。

- [ ] **Step 1: quiz ビューを書く**

`js/views/quiz.js`:

```js
import { pickForSection, pickForChapter, pickWeak } from '../lib/quizpick.js';
import { listSections, findSection } from '../lib/book.js';
import { openPlayerAt } from './player.js';
import { escapeHtml as esc } from '../lib/html.js';

const PER_SECTION = 5;
const PER_CHAPTER = 10;
const PER_WEAK = 10;

export function renderQuiz(root, ctx, nav) {
  const { book, quizResults } = ctx;
  const questions = book.questions || [];
  const readResults = () => quizResults.all();
  const record = (questionId, ok) => quizResults.record(questionId, ok);

  if (questions.length === 0) {
    root.innerHTML = `<div class="card">
      <div>この教材には問題が入っていません。</div>
      <p class="muted">教材ファイルに questions を入れると、ここで確認テストができます。</p>
    </div>`;
    return;
  }

  menu();

  function menu() {
    const results = readResults();
    const weak = pickWeak(questions, results, PER_WEAK);
    const sections = listSections(book.chapters)
      .filter(x => questions.some(q => q.sectionId === x.section.id));

    root.innerHTML = `
      <div class="card">
        <div class="q-note">この問題は公式の過去問ではありません。テキストの範囲から作成した予想問題です。</div>
      </div>
      <div class="card">
        <button class="btn" id="q-weak" ${weak.length ? '' : 'disabled'}>
          苦手な問題を解く（${weak.length}問）
        </button>
        <p class="muted">間違えた問題と未挑戦の問題から出します。</p>
      </div>
      <div class="card">
        <div class="muted">章まとめ</div>
        ${book.chapters.map(ch => {
          const n = questions.filter(q => q.chapterNo === ch.no).length;
          return n ? `<button class="q-pick" data-kind="chapter" data-key="${ch.no}">
            第${ch.no}章 ${esc(ch.title)}<span class="muted">${n}問</span></button>` : '';
        }).join('')}
      </div>
      <div class="card">
        <div class="muted">節ごと</div>
        ${sections.map(x => {
          const n = questions.filter(q => q.sectionId === x.section.id).length;
          return `<button class="q-pick" data-kind="section" data-key="${x.section.id}">
            ${x.chapter.no}-${x.section.no} ${esc(x.section.title)}<span class="muted">${n}問</span></button>`;
        }).join('')}
      </div>
    `;

    root.querySelector('#q-weak').addEventListener('click', () => run(weak));
    for (const b of root.querySelectorAll('.q-pick')) {
      b.addEventListener('click', () => {
        const set = b.dataset.kind === 'chapter'
          ? pickForChapter(questions, Number(b.dataset.key), PER_CHAPTER)
          : pickForSection(questions, b.dataset.key, PER_SECTION);
        run(set);
      });
    }
  }

  function run(set) {
    if (!set.length) return;
    let at = 0;
    const log = [];
    show();

    function show() {
      const q = set[at];
      root.innerHTML = `
        <div class="card">
          <div class="muted">${at + 1} / ${set.length}　第${q.chapterNo}章（p.${q.page}）</div>
          <div class="q-text">${esc(q.question)}</div>
        </div>
        <div id="q-choices">
          ${q.choices.map((c, i) => `<button class="q-choice" data-i="${i}">${esc(c)}</button>`).join('')}
        </div>
        <div id="q-after"></div>
      `;

      for (const b of root.querySelectorAll('.q-choice')) {
        b.addEventListener('click', () => answer(q, Number(b.dataset.i)));
      }
    }

    function answer(q, chosen) {
      const ok = chosen === q.answer;
      record(q.id, ok);
      log.push({ q, ok });

      for (const b of root.querySelectorAll('.q-choice')) {
        const i = Number(b.dataset.i);
        b.disabled = true;
        if (i === q.answer) b.classList.add('is-right');
        else if (i === chosen) b.classList.add('is-wrong');
      }

      root.querySelector('#q-after').innerHTML = `
        <div class="card">
          <div class="q-verdict ${ok ? 'is-right' : 'is-wrong'}">${ok ? '正解' : '不正解'}</div>
          <p>${esc(q.explanation)}</p>
          <div class="s-btns">
            <button class="btn ghost sm" id="q-goto">この節を読む</button>
            <button class="btn" id="q-next">${at + 1 < set.length ? '次の問題' : '結果を見る'}</button>
          </div>
        </div>
      `;

      root.querySelector('#q-goto').addEventListener('click', () => {
        openPlayerAt(q.sectionId, 0);
        nav.showTab('player');
      });
      root.querySelector('#q-next').addEventListener('click', () => {
        at += 1;
        if (at < set.length) show(); else result();
      });
      root.querySelector('#q-after').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function result() {
      const right = log.filter(x => x.ok).length;
      const wrong = log.filter(x => !x.ok);
      root.innerHTML = `
        <div class="card">
          <div class="q-score">${right} / ${log.length} 問正解</div>
          <div class="bar" style="margin-top:10px"><i style="width:${Math.round(right / log.length * 100)}%"></i></div>
        </div>
        ${wrong.length ? `<div class="card">
          <div class="muted">間違えた問題</div>
          ${wrong.map(x => {
            const f = findSection(book.chapters, x.q.sectionId);
            const label = f ? `${f.chapter.no}-${f.section.no} ${esc(f.section.title)}` : x.q.sectionId;
            return `<button class="q-pick" data-goto="${x.q.sectionId}">${label}<span class="muted">p.${x.q.page}</span></button>`;
          }).join('')}
        </div>` : '<div class="card">全問正解です。</div>'}
        <button class="btn ghost" id="q-back">テストの選択に戻る</button>
      `;

      for (const b of root.querySelectorAll('[data-goto]')) {
        b.addEventListener('click', () => {
          openPlayerAt(b.dataset.goto, 0);
          nav.showTab('player');
        });
      }
      root.querySelector('#q-back').addEventListener('click', menu);
    }
  }
}

```

- [ ] **Step 2: css/style.css の末尾に追記する**

```css
/* テスト */
.q-note { font-size: 13px; color: var(--warn); }
.q-text { font-weight: 700; margin-top: 6px; }

#q-choices { display: grid; gap: 8px; margin-bottom: 12px; }
.q-choice {
  text-align: left; padding: 14px 16px; min-height: 56px;
  border: 1px solid var(--line); border-radius: 10px;
  background: var(--surface); color: var(--ink); font: inherit; cursor: pointer;
}
.q-choice:disabled { cursor: default; opacity: 1; }
.q-choice.is-right { border-color: var(--accent); background: #e8f3ec; font-weight: 700; }
.q-choice.is-wrong { border-color: var(--warn); background: #fbeae6; }

.q-verdict { font-weight: 700; }
.q-verdict.is-right { color: var(--accent); }
.q-verdict.is-wrong { color: var(--warn); }
.q-score { font-size: 22px; font-weight: 700; }

.q-pick {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; text-align: left; padding: 14px 0; min-height: 52px;
  border: 0; border-bottom: 1px solid var(--line);
  background: none; color: var(--ink); font: inherit; cursor: pointer;
}
.q-pick:last-child { border-bottom: 0; }
```

- [ ] **Step 3: app.js に登録する**

import に追記:

```js
import { renderQuiz } from './views/quiz.js';
```

`views` を差し替える:

```js
const views = { player: renderPlayer, toc: renderToc, quiz: renderQuiz, settings: renderSettings };
```

- [ ] **Step 4: ダミー教材に問題を足して確認する**

Run:

```bash
cd /Users/taichi/petfood-study && python3 - <<'PY'
import json
p = '/tmp/petfood-data.json'
d = json.load(open(p))
d['questions'] = [
  {"id":"q0101","sectionId":"ch01-s01","chapterNo":1,"type":"choice4","difficulty":1,
   "question":"この資格が対象としている人として、サンプル文中に挙げられていないものはどれか。",
   "choices":["この分野に関心がある方","将来この分野で活動しようと考えている方",
              "業界の発展に寄与したいと考えている方","この分野に全く関心のない方"],
   "answer":3,
   "explanation":"対象者は、関心がある方、将来活動しようと考えている方、業界の発展に寄与したい方の3つである（サンプルの解説文）。",
   "page":4},
  {"id":"q0102","sectionId":"ch01-s02","chapterNo":1,"type":"choice4","difficulty":1,
   "question":"サンプルの委員会が講習会および試験を実施する目的として適切なものはどれか。",
   "choices":["資格の認定のため","無関係な目的のため","罰則を科すため","広告のため"],
   "answer":0,
   "explanation":"サンプルの委員会を設置し、資格の認定のために講習会および試験を実施する（サンプルの解説文）。",
   "page":4}
]
json.dump(d, open(p,'w'), ensure_ascii=False)
print("問題を追加しました")
PY
```

Run: `cd /Users/taichi/petfood-study && python3 -m http.server 8765`

設定タブから「教材を入れ替える」を押し、更新した `/tmp/petfood-data.json` を選び直す。

Expected:
- 「テスト」タブに「苦手な問題を解く」「章まとめ」「節ごと」が出る
- 選択肢をタップすると正解が緑、誤答が赤になり、解説が出る
- 「この節を読む」で「きく」に切り替わる
- 最後まで解くと点数と間違えた問題の一覧が出る
- 間違えた問題が「苦手な問題を解く」に出てくる

- [ ] **Step 5: テストが壊れていないことを確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 6: コミット**

```bash
cd /Users/taichi/petfood-study
git add js/views/quiz.js js/app.js css/style.css
git commit -m "$(cat <<'MSG'
テスト画面を追加

節別・章別・苦手順の4択テスト。即時採点と解説、
間違えた問題から本文へ飛べる導線。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 13: PWA 化

ホーム画面に追加してオフラインで起動できるようにする。教材は IndexedDB にあるため、アプリ本体だけをキャッシュすればよい。

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Create: `icons/icon-192.png`, `icons/icon-512.png`, `icons/maskable-512.png`
- Modify: `js/app.js`（Service Worker 登録）

**Interfaces:**
- Consumes: なし
- Produces: `sw.js` の `CACHE` 名（`pfs-v1`）。アプリ本体のファイルを更新したら版番号を上げる

- [ ] **Step 1: アイコンを作る**

Run:

```bash
cd /Users/taichi/petfood-study && mkdir -p icons && python3 - <<'PY'
# 依存を増やさないため、最小限の PNG を自前で書き出す。
import struct, zlib

def png(path, size, bg, fg):
    px = bytearray()
    cx = cy = size / 2
    r = size * 0.30
    for y in range(size):
        px.append(0)                       # フィルタ種別 None
        for x in range(size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            px.extend(fg if d < r else bg)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(px), 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)

GREEN = (0x2f, 0x6f, 0x4e)
CREAM = (0xf7, 0xf6, 0xf2)
png('icons/icon-192.png', 192, GREEN, CREAM)
png('icons/icon-512.png', 512, GREEN, CREAM)
png('icons/maskable-512.png', 512, GREEN, CREAM)
print('アイコンを作成しました')
PY
ls -la icons/
```

Expected: `icons/` に3つのPNGができる。

- [ ] **Step 2: manifest.json を書く**

```json
{
  "name": "ペットフード販売士 学習",
  "short_name": "PF学習",
  "description": "ペットフード販売士認定試験のテキストを読み上げ、確認テストで復習する学習アプリ",
  "lang": "ja",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f7f6f2",
  "theme_color": "#2f6f4e",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: sw.js を書く**

```js
// アプリ本体だけをキャッシュする。教材データは IndexedDB にあるため対象外。
// アプリのファイルを更新したら CACHE の版番号を上げること。

const CACHE = 'pfs-v1';

const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/lib/book.js',
  'js/lib/db.js',
  'js/lib/html.js',
  'js/lib/progress.js',
  'js/lib/quizpick.js',
  'js/lib/quizresults.js',
  'js/lib/schema.js',
  'js/lib/sentences.js',
  'js/lib/settings.js',
  'js/lib/speech.js',
  'js/lib/wakelock.js',
  'js/views/onboarding.js',
  'js/views/player.js',
  'js/views/quiz.js',
  'js/views/settings.js',
  'js/views/toc.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // キャッシュを先に返し、裏で更新する。オフラインでも即座に起動できる。
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req)
        .then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
```

- [ ] **Step 4: app.js に Service Worker の登録を足す**

`js/app.js` の末尾、`window.__pfs = ctx;` の直前に追記:

```js
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 登録失敗でもアプリは動く */ });
  });
}
```

- [ ] **Step 5: オフライン動作を確認する**

Run: `cd /Users/taichi/petfood-study && python3 -m http.server 8765`

`http://localhost:8765` を開き、DevTools の Application → Service Workers で登録を確認する。
Network を Offline にして再読み込みする。

Expected: オフラインでもアプリが起動し、教材と進捗が残っている。

- [ ] **Step 6: テストが壊れていないことを確認する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 7: コミット**

```bash
cd /Users/taichi/petfood-study
git add manifest.json sw.js icons/ js/app.js
git commit -m "$(cat <<'MSG'
PWA化

マニフェストとアイコン、アプリ本体をキャッシュする Service Worker。
教材データは IndexedDB にあるためキャッシュ対象外。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 14: 教材生成ツール

154ページのPDFから `petfood-data.json` を組み立てる道具。校正作業そのものは人間（または Claude）が行うが、その前後の機械的な処理をここで自動化する。

**Files:**
- Create: `tools/requirements.txt`
- Create: `tools/ocr.py`
- Create: `tools/build_data.py`
- Create: `tools/README.md`

**Interfaces:**
- Consumes: なし（Python 3 と macOS のみ）
- Produces:
  - `tools/ocr.py <pdf> <outdir>` → `<outdir>/pages/pNNN.txt` と `<outdir>/png/pg-NNN.png`
  - `tools/build_data.py <srcdir> <out.json>` → 校正済みの中間形式から教材ファイルを組み立てる
  - 中間形式: `<srcdir>/chapters.json`（章節の定義）と `<srcdir>/sections/<sectionId>.md`（校正済み本文）と `<srcdir>/figures/<name>.png`

- [ ] **Step 1: tools/requirements.txt を書く**

```
pyobjc-framework-Vision
pyobjc-framework-Quartz
```

- [ ] **Step 2: tools/ocr.py を書く**

```python
#!/usr/bin/env python3
"""スキャンPDFをページ画像にしてOCRする。

macOS の Vision Framework を使う。ネットワーク不要、無料、日本語の精度が高い。

  python3 tools/ocr.py テキスト.pdf tools/_work

出力:
  tools/_work/png/pg-NNN.png   300dpi のページ画像（校正時に目視する用）
  tools/_work/pages/pNNN.txt   ページごとのOCRテキスト
"""
import os
import subprocess
import sys

import Quartz
import Vision
from Foundation import NSURL


def render(pdf: str, out: str) -> None:
    png_dir = os.path.join(out, "png")
    os.makedirs(png_dir, exist_ok=True)
    subprocess.run(
        ["pdftoppm", "-r", "300", "-png", pdf, os.path.join(png_dir, "pg")],
        check=True,
    )


def ocr_page(path: str) -> str:
    url = NSURL.fileURLWithPath_(path)
    src = Quartz.CGImageSourceCreateWithURL(url, None)
    img = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)

    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    req.setRecognitionLanguages_(["ja-JP", "en-US"])
    req.setUsesLanguageCorrection_(True)

    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(img, None)
    handler.performRequests_error_([req], None)

    lines = []
    for obs in req.results() or []:
        box = obs.boundingBox()
        lines.append((-box.origin.y, box.origin.x, obs.topCandidates_(1)[0].string()))

    lines.sort()
    return "\n".join(text for _, _, text in lines)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("usage: ocr.py <pdf> <outdir>")

    pdf, out = sys.argv[1], sys.argv[2]
    render(pdf, out)

    png_dir = os.path.join(out, "png")
    txt_dir = os.path.join(out, "pages")
    os.makedirs(txt_dir, exist_ok=True)

    names = sorted(n for n in os.listdir(png_dir) if n.endswith(".png"))
    for i, name in enumerate(names, 1):
        page = int(name.split("-")[1].split(".")[0])
        text = ocr_page(os.path.join(png_dir, name))
        with open(os.path.join(txt_dir, f"p{page:03d}.txt"), "w") as f:
            f.write(text)
        if i % 20 == 0:
            print(f"OCR {i}/{len(names)}", flush=True)

    print(f"完了: {len(names)}ページ -> {txt_dir}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: tools/build_data.py を書く**

```python
#!/usr/bin/env python3
"""校正済みの中間形式から petfood-data.json を組み立てる。

  python3 tools/build_data.py tools/_work/src ~/Downloads/petfood-data.json

中間形式:
  <srcdir>/chapters.json          章と節の定義
  <srcdir>/sections/<id>.md       校正済み本文
  <srcdir>/figures/<name>.png     図表の切り出し
  <srcdir>/questions.json         問題（任意）

本文 Markdown の書き方:
  普通の段落はそのまま書く。空行で段落を区切る。
  行頭 "- " は箇条書き（list ブロック）になる。
  行頭 "> " は補足（note ブロック）になる。
  "![説明](figures/xxx.png)" は図表になり、直後の "^ " 行を読み上げ文として使う。
"""
import base64
import json
import os
import re
import sys

SCHEMA = 1

ENDERS = set("。！？!?")
PAIRS = {"（": "）", "(": ")", "「": "」", "『": "』", "【": "】", "［": "］", "[": "]"}
TRAILERS = set("」』）)】］]…")
PAREN_CLOSERS = set("）)")


def split_sentences(text: str) -> list[str]:
    """js/lib/sentences.js と同じ規則で文に分割する。

    括弧の内側の句点では切らない。句点の直後に続く TRAILERS は前の文に含める。
    丸括弧がトップレベルまで閉じ切った場合は、閉じ括弧の直前から TRAILERS を
    読み飛ばして手前をたどり、最初の非TRAILERS文字が文末記号なら区切る。
    """
    src = re.sub(r"\s+", " ", text or "").strip()
    if not src:
        return []

    out: list[str] = []
    stack: list[str] = []
    buf = ""
    i = 0

    def flush() -> None:
        nonlocal buf
        if buf.strip():
            out.append(buf.strip())
        buf = ""

    while i < len(src):
        ch = src[i]
        buf += ch

        if ch in PAIRS:
            stack.append(PAIRS[ch])
        elif stack and ch == stack[-1]:
            stack.pop()
            if not stack and ch in PAREN_CLOSERS:
                j = i - 1
                while j >= 0 and src[j] in TRAILERS:
                    j -= 1
                if j >= 0 and src[j] in ENDERS:
                    while i + 1 < len(src) and src[i + 1] in TRAILERS:
                        i += 1
                        buf += src[i]
                    flush()
        elif not stack and ch in ENDERS:
            while i + 1 < len(src) and src[i + 1] in TRAILERS:
                i += 1
                buf += src[i]
            flush()
        i += 1

    flush()
    return out


def data_uri(path: str) -> str:
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")


def parse_markdown(md: str, srcdir: str) -> list[dict]:
    blocks: list[dict] = []
    para: list[str] = []
    items: list[str] = []
    notes: list[str] = []

    def flush() -> None:
        nonlocal para, items, notes
        if para:
            blocks.append({"type": "p", "sents": split_sentences(" ".join(para))})
            para = []
        if items:
            blocks.append({"type": "list", "sents": items})
            items = []
        if notes:
            blocks.append({"type": "note", "sents": split_sentences(" ".join(notes))})
            notes = []

    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()

        if not line.strip():
            flush()
        elif line.startswith("!["):
            flush()
            m = re.match(r"!\[(.*?)\]\((.+?)\)", line)
            if not m:
                raise SystemExit(f"図表の書式が不正です: {line}")
            caption, rel = m.group(1), m.group(2)
            speak = caption
            if i + 1 < len(lines) and lines[i + 1].startswith("^ "):
                i += 1
                speak = lines[i][2:].strip()
            blocks.append({
                "type": "figure",
                "img": data_uri(os.path.join(srcdir, rel)),
                "caption": caption,
                "speak": speak,
            })
        elif line.startswith("- "):
            if para or notes:
                flush()
            items.append(line[2:].strip())
        elif line.startswith("> "):
            if para or items:
                flush()
            notes.append(line[2:].strip())
        else:
            if items or notes:
                flush()
            para.append(line.strip())
        i += 1

    flush()
    return blocks


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("usage: build_data.py <srcdir> <out.json>")

    srcdir, out = sys.argv[1], sys.argv[2]

    with open(os.path.join(srcdir, "chapters.json")) as f:
        chapters = json.load(f)

    missing = []
    for ch in chapters:
        for sec in ch["sections"]:
            path = os.path.join(srcdir, "sections", f"{sec['id']}.md")
            if not os.path.exists(path):
                missing.append(sec["id"])
                sec["blocks"] = []
                continue
            with open(path) as f:
                sec["blocks"] = parse_markdown(f.read(), srcdir)

    qpath = os.path.join(srcdir, "questions.json")
    questions = json.load(open(qpath)) if os.path.exists(qpath) else []

    data = {
        "meta": {
            "schema": SCHEMA,
            "title": "ペットフード販売士認定講習会テキスト",
            "edition": "第5版",
            "publisher": "一般社団法人ペットフード協会",
            "generatedAt": __import__("datetime").date.today().isoformat(),
        },
        "chapters": chapters,
        "questions": questions,
    }

    with open(out, "w") as f:
        json.dump(data, f, ensure_ascii=False)

    sections = sum(len(c["sections"]) for c in chapters)
    sents = sum(
        len(b.get("sents", [])) or 1
        for c in chapters for s in c["sections"] for b in s["blocks"]
    )
    size = os.path.getsize(out) / 1024 / 1024
    print(f"書き出し: {out}")
    print(f"  {len(chapters)}章 {sections}節 約{sents}文 問題{len(questions)}問 / {size:.1f}MB")
    if missing:
        print(f"  未作成の節 {len(missing)}件: {', '.join(missing[:10])}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: tools/README.md を書く**

````markdown
# 教材ファイルの作り方

このリポジトリには教材データを含めない。手元のテキストから自分で作る。

## 用意するもの

- macOS（OCR に Vision Framework を使う）
- `brew install poppler`
- Python 3

```bash
python3 -m venv tools/_work/venv
tools/_work/venv/bin/pip install -r tools/requirements.txt
```

## 手順

### 1. OCR

```bash
tools/_work/venv/bin/python tools/ocr.py テキスト.pdf tools/_work
```

`tools/_work/png/` にページ画像、`tools/_work/pages/` にOCRテキストができる。

### 2. 校正

OCR は完全ではない。`tools/_work/png/pg-NNN.png` を目で見ながら
`tools/_work/pages/pNNN.txt` を直し、節ごとに
`tools/_work/src/sections/<節ID>.md` へ書き写す。

本文 Markdown の書き方:

| 書き方 | 意味 |
|---|---|
| 普通の行 | 段落。空行で区切る |
| `- 項目` | 箇条書き |
| `> 補足` | 囲み・補足 |
| `![図1 組織図](figures/p006.png)` | 図表 |
| `^ 図1、組織図の説明。` | 直前の図表の読み上げ文 |

### 3. 章節の定義

`tools/_work/src/chapters.json`:

```json
[
  { "id": "ch01", "no": 1, "title": "ペットフード販売士認定制度の概要", "page": 4,
    "sections": [
      { "id": "ch01-s01", "no": 1, "title": "設立趣旨", "page": 4 }
    ]}
]
```

### 4. 組み立て

```bash
python3 tools/build_data.py tools/_work/src ~/Downloads/petfood-data.json
```

できた `petfood-data.json` を端末に移し、アプリの取り込み画面で選ぶ。

**この JSON は絶対にコミットしない。** `.gitignore` で除外済み。
````

- [ ] **Step 5: 文分割が JS と一致することを確認する**

Run:

```bash
cd /Users/taichi/petfood-study && python3 -c "
import sys; sys.path.insert(0, 'tools')
from build_data import split_sentences as s
cases = [
  ('犬の先祖は野生動物である。オオカミは捕食する。', 2),
  ('「これは重要である。」と記されている。', 1),
  ('総合栄養食（主食となる。水と併せて与える）は重要である。', 1),
  ('注意が必要である（詳細は後述する。）次に進む。', 2),
  ('説明（外側（内側の文。））以上。', 2),
  ('（そうだ。…）次', 2),
  ('本当に驚いた（まさか本当とは！）次へ進む。', 2),
  ('「発言（本当だ。）続き」と言った。', 1),
  ('句点のない行', 1),
  ('', 0),
]
for text, want in cases:
    got = s(text)
    assert len(got) == want, f'{text!r}: {len(got)} != {want} -> {got}'
print('Python版の文分割は JS版と一致しました')
"
```

Expected: `Python版の文分割は JS版と一致しました`

- [ ] **Step 6: コミット**

```bash
cd /Users/taichi/petfood-study
git add tools/
git commit -m "$(cat <<'MSG'
教材生成ツールを追加

macOS Vision による OCR と、校正済み Markdown から
petfood-data.json を組み立てるスクリプト。
文分割の規則は js/lib/sentences.js と揃えてある。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 15: README と GitHub Pages 公開

**Files:**
- Create: `README.md`
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: なし
- Produces: 公開URL `https://<ユーザー名>.github.io/petfood-study/`

- [ ] **Step 1: README.md を書く**

````markdown
# ペットフード販売士 学習アプリ

ペットフード販売士認定試験の学習用 PWA。テキストを読み上げ、
中断した位置から再開でき、節ごとの確認テストで復習できる。

## 試験について

| 項目 | 内容 |
|---|---|
| 主催 | 一般社団法人ペットフード協会 |
| 形式 | CBT・四肢択一式 25問／60分 |
| 出題範囲 | 専門テキストの全範囲 |
| 合格基準 | 非公開 |

## 機能

- テキストの読み上げ（速度 0.5〜2.0倍、一時停止、文単位のスキップ）
- 読んでいる文のハイライトと自動スクロール
- 中断した位置からの再開（文が終わるたびに保存）
- 章節のもくじと進捗管理
- 節別・章別・苦手順の4択確認テスト
- オフライン動作（PWA）

## 教材データについて

**このリポジトリに教材データは含まれていない。**
テキストは一般社団法人ペットフード協会の著作物であり、再配布できないため。

利用するには、自分の手元のテキストから教材ファイル `petfood-data.json` を
作り、アプリの取り込み画面で選ぶ。作り方は [tools/README.md](tools/README.md) を参照。

教材データは端末の IndexedDB にのみ保存され、ネットワークには送信されない。

## 使い方

1. `https://<ユーザー名>.github.io/petfood-study/` を Chrome で開く
2. 教材ファイルを選ぶ
3. メニューから「ホーム画面に追加」

## 動作環境

Android Chrome を想定している（開発は Pixel 8a で確認）。

Android Chrome は画面が消えると読み上げを止めるため、バックグラウンド再生はできない。
設定の「再生中は画面を消さない」が既定でオンになっている。

## 開発

```bash
npm test                      # ユニットテスト
python3 -m http.server 8765   # ローカルで動かす
```

ビルドステップはない。外部ライブラリも使っていない。

| ディレクトリ | 中身 |
|---|---|
| `js/lib/` | 純粋ロジック。すべてテストがある |
| `js/views/` | DOM 描画 |
| `tools/` | 教材データの生成スクリプト |
| `test/` | `node --test` のユニットテスト |

アプリのファイルを追加・変更したら `sw.js` の `ASSETS` と `CACHE` の版番号を更新する。
````

- [ ] **Step 2: CI を置く**

`.github/workflows/test.yml`:

```yaml
name: test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm test
```

- [ ] **Step 3: 教材データが混入していないことを確認する**

Run:

```bash
cd /Users/taichi/petfood-study && \
  echo "=== 追跡中のファイル ===" && git ls-files && \
  echo "=== 教材データの混入チェック ===" && \
  (git ls-files | grep -E 'data\.json|_work' && echo "混入あり。中止すること" || echo "混入なし")
```

Expected: `混入なし`

- [ ] **Step 4: テストを実行する**

Run: `cd /Users/taichi/petfood-study && npm test`
Expected: PASS。このタスクで追加したテストが全て通り、既存のテストが1件も失敗しないこと（総数は先行タスクの追補で増えている場合がある）

- [ ] **Step 5: コミットして push する**

```bash
cd /Users/taichi/petfood-study
git add README.md .github/
git commit -m "$(cat <<'MSG'
README と CI を追加

教材データを同梱しない理由と、手元のテキストから作る手順を記載。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
gh repo create petfood-study --public --source=. --remote=origin --push
```

- [ ] **Step 6: GitHub Pages を有効にする**

Run:

```bash
cd /Users/taichi/petfood-study && \
gh api -X POST repos/{owner}/{repo}/pages -f 'source[branch]=main' -f 'source[path]=/' && \
sleep 30 && gh api repos/{owner}/{repo}/pages --jq '.html_url'
```

Expected: 公開URLが表示される。

- [ ] **Step 7: Pixel 8a で実機確認する**

1. 教材ファイルを Google ドライブ等で Pixel 8a に渡す
2. Chrome で公開URLを開く
3. 教材ファイルを選ぶ
4. メニュー →「ホーム画面に追加」
5. ホーム画面のアイコンから起動する

確認項目:

- [ ] 読み上げが聞こえ、声が日本語である
- [ ] 速度を変えると実際に速さが変わる
- [ ] 一時停止して再開すると、同じ文から続く
- [ ] アプリを閉じて開き直すと「前回の続きから」が出て、正しい位置から再開する
- [ ] 再生中に画面が消えない
- [ ] 機内モードにしても起動して読み上げできる
- [ ] 確認テストが動き、間違えた問題が苦手リストに入る

---

## 設計書との差分

計画を書く過程で、設計書から意図的に変えた点。

| 設計書 | 計画 | 理由 |
|---|---|---|
| 図表はタップで拡大 | 図表のタップはその位置から再生 | 再生画面では本文の文と図表を同じ操作で扱うほうが一貫する。拡大は本文幅いっぱいに出すことで代替する |
| 「節の先頭へ戻る」ボタン | 用意しない | 本文の先頭の文をタップすれば同じことができ、操作ボタンを5つに抑えられる |
| `js/lib/content.js` 相当 | `js/lib/book.js` | 章節の走査と平坦化を1つの責務にまとめた |

いずれも実装後に設計書へ反映する。

---

## 次フェーズ（この計画には含まない）

- 本番形式の模擬試験画面（全章から25問、60分タイマー、途中で答えを見ない）
- フラッシュカード画面（同じ問題データを一問一答で使う）
- 学習履歴のグラフ

## 本文データの整備について

Task 14 のツールは用意するが、**154ページの校正そのものはこの計画の外**で行う。
Task 9 の時点でダミー教材を使って動作を確認できるため、
アプリ完成後に章ごとに校正を進め、そのつど教材ファイルを作り直して差し替えればよい。

進め方の目安:

1. 第1章（4〜7頁）で一巡させ、Markdown の書き方と図表の扱いを固める
2. 出題範囲として重い第2章・第3章・第6章（栄養・製造）を先に仕上げる
3. 残りの章を順に進める
4. 全章そろったら問題を作る
