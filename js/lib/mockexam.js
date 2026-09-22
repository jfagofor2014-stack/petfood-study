// 本番形式の模擬試験の出題と採点。
// 乱数は引数で受け取り、テストを決定的にできるようにする（quizpick.js と同じ流儀）。
// DOM も storage も触らない。

// 章の分量をページ数で測る。本番の章別配分は公表されていないため、
// 「出題範囲はテキスト全範囲」という公式の説明に沿って分量に比例させる。
// 章の開始ページはその章の節の最小 page、終了ページは次章の開始ページ-1。
// 最終章だけは次が無いので、その章の節の最大 page を終了ページとする。
export function chapterPages(chapters) {
  const list = chapters || [];
  const pagesOf = ch => (ch.sections || []).map(s => Number(s.page)).filter(Number.isFinite);
  const starts = list.map(ch => {
    const ps = pagesOf(ch);
    return ps.length ? Math.min(...ps) : 0;
  });

  return list.map((ch, i) => {
    const ps = pagesOf(ch);
    const lastPage = ps.length ? Math.max(...ps) : starts[i];
    const end = i + 1 < list.length ? starts[i + 1] - 1 : lastPage;
    // 節が無い章やページが逆転している章でも 0 や負にならないようにする。
    return Math.max(1, end - starts[i] + 1);
  });
}

// 各章に最低 floor 問を配ったうえで、残りをページ数に比例して配る（最大剰余法）。
// 章数が要求数を超えるときは floor を 0 に落とす。そうしないと合計が要求数を超えてしまう。
export function allocateByPages(chapters, total = 25, floor = 1) {
  const n = (chapters || []).length;
  if (n === 0 || total <= 0) return [];

  const f = n * floor <= total ? floor : 0;
  const rest = total - f * n;
  const out = new Array(n).fill(f);
  if (rest <= 0) return out;

  const pages = chapterPages(chapters);
  const sum = pages.reduce((a, b) => a + b, 0);
  const raw = pages.map(p => (rest * p) / sum);
  const add = raw.map(Math.floor);

  // 端数が大きい章から順に1問ずつ足す。端数が同じときは章の順で決める（結果を決定的にするため）。
  const order = raw.map((_, i) => i)
    .sort((a, b) => (raw[b] - add[b]) - (raw[a] - add[a]) || a - b);
  let left = rest - add.reduce((a, b) => a + b, 0);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) add[order[k]] += 1;

  return out.map((v, i) => v + add[i]);
}
