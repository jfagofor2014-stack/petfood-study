# 教材ファイルの作り方

このリポジトリには教材データを含めない（著作権上、公開リポジトリに含められないため）。
手元のテキストから自分で作る。

## 用意するもの

- macOS（OCR に Vision Framework を使う）
- `brew install poppler`（`pdftoppm` コマンドを使う。無いと `ocr.py` がエラーで止まる）
- Python 3

```bash
python3 -m venv tools/_work/venv
tools/_work/venv/bin/pip install -r tools/requirements.txt
```

## 手順

### 1. OCR

**PDF はリポジトリの外に置くこと。** リポジトリ内（`tools/` 配下やリポジトリ直下）に
置くと、`git add -A` 等で誤ってコミットしてしまう危険がある。`~/Downloads/` など、
リポジトリの外のディレクトリに置いてから指定する。

```bash
tools/_work/venv/bin/python tools/ocr.py ~/Downloads/テキスト.pdf tools/_work
```

`tools/_work/png/` にページ画像、`tools/_work/pages/` にOCRテキストができる。
`pdftoppm` が見つからない場合や PDF が存在しない場合はその場でエラーになる。
出力先も `tools/_work` 以外（特にリポジトリ内の無視されていない場所）を指定しないこと。
`tools/_work` 以外を指定すると `ocr.py` が警告を出す。

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
| `![図1 組織図](figures/p006.png)` | 図表（PNGのみ） |
| `^ 図1、組織図の説明。` | 直前の図表の読み上げ文 |

注意:

- 図表は `caption`（`![...]` の中身）と `^` 行（読み上げ文）の少なくとも一方が必要。
  どちらも空だと `build_data.py` がその場でエラーにする。
- 図表ファイルが見つからない・PNGでない・空ファイルの場合も、節IDとファイルパスを
  含めたエラーで止まる。
- 空の段落や空の箇条書き項目（`- ` だけの行など）は自動的に読み飛ばされ、
  空の `sents` を持つブロックは作られない（アプリ側の検証 `validateData()` は
  空の `sents` を許さないため）。

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

本文がまだ無い節は `sections/<節ID>.md` を置かなければ `blocks: []` として
出力される（章ごとに少しずつ作る運用のため許容されている）。

### 4. 問題（任意）

`tools/_work/src/questions.json`:

```json
[
  { "id": "q01", "sectionId": "ch01-s01", "chapterNo": 1,
    "choices": ["a", "b", "c"], "answer": 0 }
]
```

`chapterNo` は `sectionId` が属する章の `no` と一致していなければならない。
一致しない場合や、存在しない `sectionId` を指している場合は
`build_data.py` が書き出し前に検出してエラーで止める
（アプリ側の `validateData()` で弾かれてから気づくと手戻りが大きいため）。

### 5. 組み立て

```bash
python3 tools/build_data.py tools/_work/src ~/Downloads/petfood-data.json
```

`chapters.json` / `questions.json` の検証を通ったら書き出す。
最後に章数・節数・おおよその文数・問題数・ファイルサイズ（MB）を表示する
（図表を data URI で埋め込むため数MBになりうる）。

できた `petfood-data.json` を端末に移し、アプリの取り込み画面で選ぶ。

**この JSON は絶対にコミットしない。** `.gitignore` で除外済み
（`*-data.json` / `petfood-data*.json` / `tools/_work/`）。

## 検証

書き出した JSON がアプリの検証を通るか、事前に確認したい場合:

```bash
node -e "
import('./js/lib/schema.js').then(async m => {
  const fs = await import('node:fs');
  const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  const r = m.validateData(data);
  console.log(r.ok ? 'OK: 検証通過' : 'NG: ' + r.errors.join(' / '));
});
" ~/Downloads/petfood-data.json
```
