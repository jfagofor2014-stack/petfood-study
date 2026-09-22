// 本番形式の模擬試験の出題と採点。
// 乱数は引数で受け取り、テストを決定的にできるようにする（quizpick.js と同じ流儀）。
// DOM も storage も触らない。

import { shuffle } from './quizpick.js';

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

// 章ごとの配分どおりに出題を組み立てる。
// recentIds（直近の模試で出た問題）は優先的に外すが、25問そろえることを優先する。
export function buildExam(questions, chapters, { total = 25, recentIds = [], rnd = Math.random } = {}) {
  const all = questions || [];
  if (all.length === 0) return [];

  const recent = new Set(recentIds || []);
  const alloc = allocateByPages(chapters, total);
  const used = new Set();
  const picked = [];

  // 「直近に出ていない問題」を先に、「出た問題」を後ろに置く。各群の中は乱数で散らす。
  // こうすると、前者だけで足りるときは後者から取らずに済む。
  const ordered = pool => [
    ...shuffle(pool.filter(q => !recent.has(q.id)), rnd),
    ...shuffle(pool.filter(q => recent.has(q.id)), rnd),
  ];

  (chapters || []).forEach((ch, i) => {
    const pool = ordered(all.filter(q => q.chapterNo === ch.no));
    for (const q of pool.slice(0, alloc[i] || 0)) { picked.push(q); used.add(q.id); }
  });

  // ある章の手持ちが配分数に足りなかった分を、章を問わず未採用の問題から補う。
  if (picked.length < total) {
    const rest = ordered(all.filter(q => !used.has(q.id)));
    for (const q of rest.slice(0, total - picked.length)) { picked.push(q); used.add(q.id); }
  }

  // 章順に並んだままだと本番と違ってしまうので、最後に全体を混ぜる。
  return shuffle(picked, rnd);
}

// 採点する。未解答（null / undefined）は不正解として数える。
// 本番も未解答を救済しないため、点数の見え方を本番に合わせる。
export function gradeExam(examQuestions, answers) {
  const qs = examQuestions || [];
  const as = answers || [];

  const details = qs.map((q, i) => {
    const chosen = Number.isInteger(as[i]) ? as[i] : null;
    return { q, chosen, ok: chosen === q.answer };
  });

  const byChapter = [];
  const index = new Map();
  for (const d of details) {
    const no = d.q.chapterNo;
    let entry = index.get(no);
    if (!entry) { entry = { chapterNo: no, total: 0, correct: 0 }; index.set(no, entry); byChapter.push(entry); }
    entry.total += 1;
    if (d.ok) entry.correct += 1;
  }
  byChapter.sort((a, b) => a.chapterNo - b.chapterNo);

  const score = details.filter(d => d.ok).length;
  return { total: qs.length, score, rate: qs.length ? score / qs.length : 0, byChapter, details };
}
