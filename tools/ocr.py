#!/usr/bin/env python3
"""スキャンPDFをページ画像にしてOCRする。

macOS の Vision Framework を使う。ネットワーク不要、無料、日本語の精度が高い。

  python3 tools/ocr.py テキスト.pdf tools/_work

出力:
  tools/_work/png/pg-NNN.png   300dpi のページ画像（校正時に目視する用）
  tools/_work/pages/pNNN.txt   ページごとのOCRテキスト
"""
import os
import shutil
import subprocess
import sys

import Quartz
import Vision
from Foundation import NSURL


def check_pdftoppm() -> None:
    """pdftoppm (poppler) がPATHに無ければ分かりやすいエラーで止める。"""
    if shutil.which("pdftoppm") is None:
        sys.exit(
            "エラー: pdftoppm が見つかりません。\n"
            "  poppler が未インストールです。次を実行してください:\n"
            "    brew install poppler"
        )


def warn_if_output_untracked(out: str) -> None:
    """出力先が tools/_work 以外（＝ .gitignore で無視されない可能性がある場所）の
    ときに、標準エラーへ日本語で警告する。処理は止めない。"""
    normalized = os.path.normpath(out)
    if normalized != "tools/_work" and not normalized.startswith("tools/_work" + os.sep):
        print(
            f"警告: 出力先 '{out}' は tools/_work 配下ではありません。\n"
            "  OCR生成物（PNG画像・OCRテキスト）がリポジトリの追跡対象に\n"
            "  入ってしまう可能性があります。出力先には tools/_work を指定することを推奨します。",
            file=sys.stderr,
        )


def render(pdf: str, out: str) -> None:
    if not os.path.exists(pdf):
        sys.exit(f"エラー: PDFが見つかりません: {pdf}")

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

    check_pdftoppm()

    pdf, out = sys.argv[1], sys.argv[2]
    warn_if_output_untracked(out)
    render(pdf, out)

    png_dir = os.path.join(out, "png")
    txt_dir = os.path.join(out, "pages")
    os.makedirs(txt_dir, exist_ok=True)

    names = sorted(n for n in os.listdir(png_dir) if n.endswith(".png"))
    if not names:
        sys.exit(f"エラー: {png_dir} にページ画像がありません（PDF変換に失敗した可能性）。")

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
