// カードの山の進み方。DOM も storage も触らない純粋ロジック。
//
// 「あやしい」にしたカードは山の最後へ戻す。1周して終わりではなく、
// 全部「わかった」になるまで回す形にしている。覚えるための反復が目的なので、
// 取りこぼしたまま終われないようにする。
//
// どのカードを出すかは既存の js/lib/quizpick.js が決める。ここは順番だけを持つ。

export function createDeck(cards) {
  // 呼び出し側の配列を壊さないよう複製する。
  const queue = Array.isArray(cards) ? [...cards] : [];
  const total = queue.length;

  const done = new Set();     // 「わかった」にしたカードのID
  const missed = new Set();   // 一度でも「あやしい」にしたカードのID
  let again = 0;              // 「あやしい」を押した延べ回数

  return {
    current() {
      return queue.length ? queue[0] : null;
    },

    size() { return total; },
    remaining() { return queue.length; },
    doneCount() { return done.size; },
    againCount() { return again; },

    // 一度も「あやしい」を押さずに覚えたカードの枚数。終了画面で出す。
    firstTryCount() {
      let n = 0;
      for (const id of done) if (!missed.has(id)) n += 1;
      return n;
    },

    isDone() { return queue.length === 0; },

    known() {
      const card = queue.shift();
      if (card) done.add(card.id);
    },

    unsure() {
      const card = queue.shift();
      if (!card) return;
      again += 1;
      missed.add(card.id);
      queue.push(card);
    },
  };
}
