// 本文を読み上げの最小単位である「文」に分割する。
// 括弧の内側の句点では切らない。句点の直後に続く閉じ括弧や省略記号などの
// TRAILERS は前の文に含める。
// ただし丸括弧がトップレベルまで閉じ切った場合は、閉じ括弧の直前から
// TRAILERS の文字を読み飛ばしながら手前をたどり、最初に見つかった
// 非TRAILERS文字が文末記号であれば、その閉じ括弧の直後で文を区切る
// （丸括弧の中身がそれ自体で完結した文であるため）。

const ENDERS = new Set(['。', '！', '？', '!', '?']);
const PAIRS = { '（': '）', '(': ')', '「': '」', '『': '』', '【': '】', '［': '］', '[': ']' };
const TRAILERS = new Set(['」', '』', '）', ')', '】', '］', ']', '…']);
const PAREN_CLOSERS = new Set(['）', ')']); // 分割対象になり得るのは丸括弧の閉じのみ

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
    if (stack.length && ch === stack[stack.length - 1]) {
      stack.pop();
      // 丸括弧がトップレベルまで閉じ切ったら、TRAILERS を読み飛ばしながら手前をたどり、
      // 最初に見つかった非TRAILERS文字が文末記号なら、ここで文を区切る
      if (stack.length === 0 && PAREN_CLOSERS.has(ch)) {
        let j = i - 1;
        while (j >= 0 && TRAILERS.has(src[j])) j--;
        if (j >= 0 && ENDERS.has(src[j])) {
          while (i + 1 < src.length && TRAILERS.has(src[i + 1])) buf += src[++i];
          const s = buf.trim();
          if (s) out.push(s);
          buf = '';
        }
      }
      continue;
    }
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
