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
