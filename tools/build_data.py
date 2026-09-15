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

js/lib/schema.js の validateData() を通る JSON を作ることが目的。
落ちる可能性のある入力は、書き出し前にここで検出して分かりやすいメッセージで止める
（アプリ側で弾かれてから気づくと手戻りが大きいため）。
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


def data_uri(path: str, *, context: str) -> str:
    """PNGファイルを data URI にする。見つからない場合は文脈つきで分かりやすく失敗する。"""
    if not os.path.exists(path):
        raise SystemExit(f"エラー: 図表ファイルが見つかりません: {path}（{context}）")
    if not path.lower().endswith(".png"):
        raise SystemExit(f"エラー: 図表はPNGにしてください: {path}（{context}）")
    with open(path, "rb") as f:
        raw = f.read()
    if not raw:
        raise SystemExit(f"エラー: 図表ファイルが空です: {path}（{context}）")
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def parse_markdown(md: str, srcdir: str, *, section_id: str) -> list[dict]:
    blocks: list[dict] = []
    para: list[str] = []
    items: list[str] = []
    notes: list[str] = []

    def flush() -> None:
        nonlocal para, items, notes
        if para:
            sents = split_sentences(" ".join(para))
            if sents:
                blocks.append({"type": "p", "sents": sents})
            para = []
        if items:
            # 空行（"- " のみ）は捨てる。全て空だったブロック自体は作らない。
            sents = [s for s in (item.strip() for item in items) if s]
            if sents:
                blocks.append({"type": "list", "sents": sents})
            items = []
        if notes:
            sents = split_sentences(" ".join(notes))
            if sents:
                blocks.append({"type": "note", "sents": sents})
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
                raise SystemExit(f"エラー: 図表の書式が不正です（{section_id}）: {line}")
            caption, rel = m.group(1), m.group(2)
            speak = caption
            if i + 1 < len(lines) and lines[i + 1].startswith("^ "):
                i += 1
                speak = lines[i][2:].strip()
            if not caption and not speak:
                raise SystemExit(
                    f"エラー: 図表に caption も speak（^ 行）もありません（{section_id}）: {line}"
                )
            blocks.append({
                "type": "figure",
                "img": data_uri(os.path.join(srcdir, rel), context=f"{section_id}: {line}"),
                "caption": caption,
                "speak": speak,
            })
        elif line.startswith("- ") or line == "-":
            # "- " の後ろが空白だけの行は rstrip() で "-" になるため、
            # それも箇条書きの（空の）項目として認識する
            if para or notes:
                flush()
            items.append(line[2:].strip())
        elif line.startswith("> ") or line == ">":
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


def validate_chapters(chapters) -> list[str]:
    """chapters.json 自体の構造をゆるく検証する（重複ID・章noの整数性など）。"""
    errors: list[str] = []
    if not isinstance(chapters, list) or not chapters:
        return ["chapters.json: 章が1つもありません。"]

    seen_ch_ids: set[str] = set()
    seen_sec_ids: set[str] = set()
    for ch in chapters:
        if not isinstance(ch, dict) or not ch.get("id"):
            errors.append("chapters.json: id のない章があります。")
            continue
        if ch["id"] in seen_ch_ids:
            errors.append(f"chapters.json: 章IDが重複しています: {ch['id']}")
        seen_ch_ids.add(ch["id"])
        if not isinstance(ch.get("no"), int):
            errors.append(f"chapters.json: {ch['id']} の no が整数ではありません。")
        sections = ch.get("sections")
        if not isinstance(sections, list) or not sections:
            errors.append(f"chapters.json: {ch['id']} に節がありません。")
            continue
        for sec in sections:
            if not isinstance(sec, dict) or not sec.get("id"):
                errors.append(f"chapters.json: {ch['id']} に id のない節があります。")
                continue
            if sec["id"] in seen_sec_ids:
                errors.append(f"chapters.json: 節IDが重複しています: {sec['id']}")
            seen_sec_ids.add(sec["id"])
    return errors


def validate_questions(questions, section_chapter_no: dict) -> list[str]:
    """questions.json が schema.js の validateData() を通るかを出力前に確認する。

    特に chapterNo が節の所属章の no と一致しているかは、アプリ側で弾かれてから
    気づくと手戻りが大きいので、ここで先に検証する。
    """
    errors: list[str] = []
    seen_ids: set[str] = set()
    for q in questions:
        if not isinstance(q, dict) or not q.get("id"):
            errors.append("questions.json: id のない問題があります。")
            continue
        qid = q["id"]
        if qid in seen_ids:
            errors.append(f"questions.json: 問題IDが重複しています: {qid}")
        seen_ids.add(qid)

        choices = q.get("choices")
        if not isinstance(choices, list) or len(choices) < 2:
            errors.append(f"questions.json: {qid} の選択肢が2つ未満です。")
            choices = []

        answer = q.get("answer")
        if not isinstance(answer, int) or isinstance(answer, bool) or not (0 <= answer < len(choices)):
            errors.append(f"questions.json: {qid} の answer が選択肢の範囲外です。")

        section_id = q.get("sectionId")
        if not section_id or section_id not in section_chapter_no:
            errors.append(f"questions.json: {qid} が存在しない節を指しています: {section_id}")
            continue

        chapter_no = q.get("chapterNo")
        expected = section_chapter_no[section_id]
        if not isinstance(chapter_no, int) or isinstance(chapter_no, bool) or chapter_no != expected:
            errors.append(
                f"questions.json: {qid} の chapterNo({chapter_no!r}) が"
                f" 節 {section_id} の所属章({expected}) と一致しません。"
            )
    return errors


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("usage: build_data.py <srcdir> <out.json>")

    srcdir, out = sys.argv[1], sys.argv[2]

    chapters_path = os.path.join(srcdir, "chapters.json")
    if not os.path.exists(chapters_path):
        sys.exit(f"エラー: chapters.json が見つかりません: {chapters_path}")
    with open(chapters_path) as f:
        chapters = json.load(f)

    struct_errors = validate_chapters(chapters)
    if struct_errors:
        sys.exit("chapters.json の検証に失敗しました:\n  " + "\n  ".join(struct_errors))

    # 節ID → 所属章の no（questions.json の chapterNo 突き合わせに使う）
    section_chapter_no = {
        sec["id"]: ch["no"] for ch in chapters for sec in ch["sections"]
    }

    missing = []
    for ch in chapters:
        for sec in ch["sections"]:
            path = os.path.join(srcdir, "sections", f"{sec['id']}.md")
            if not os.path.exists(path):
                missing.append(sec["id"])
                sec["blocks"] = []
                continue
            with open(path) as f:
                sec["blocks"] = parse_markdown(f.read(), srcdir, section_id=sec["id"])

    qpath = os.path.join(srcdir, "questions.json")
    questions = json.load(open(qpath)) if os.path.exists(qpath) else []

    q_errors = validate_questions(questions, section_chapter_no)
    if q_errors:
        sys.exit("questions.json の検証に失敗しました:\n  " + "\n  ".join(q_errors))

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
