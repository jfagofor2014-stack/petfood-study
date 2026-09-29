import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../js/lib/flashcards.js';

// カードは問題オブジェクト。この山のロジックが見るのは id だけ。
const cards = n => Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` }));

test('最初のカードは山の先頭', () => {
  const d = createDeck(cards(3));
  assert.equal(d.current().id, 'q1');
  assert.equal(d.size(), 3);
  assert.equal(d.remaining(), 3);
  assert.equal(d.isDone(), false);
});

test('わかったにすると山から消えて次へ進む', () => {
  const d = createDeck(cards(3));
  d.known();
  assert.equal(d.current().id, 'q2');
  assert.equal(d.remaining(), 2);
  assert.equal(d.doneCount(), 1);
});

test('あやしいにすると山の最後へ回る', () => {
  const d = createDeck(cards(3));
  d.unsure();
  assert.equal(d.current().id, 'q2');
  assert.equal(d.remaining(), 3);      // 減らない
  assert.equal(d.doneCount(), 0);
  d.known(); d.known();                // q2, q3 を覚える
  assert.equal(d.current().id, 'q1');  // 戻ってきた
});

test('全部わかったにすると終わる', () => {
  const d = createDeck(cards(3));
  d.known(); d.known(); d.known();
  assert.equal(d.isDone(), true);
  assert.equal(d.remaining(), 0);
  assert.equal(d.current(), null);
  assert.equal(d.doneCount(), 3);
});

test('あやしいを挟んでも、覚えるまで終わらない', () => {
  const d = createDeck(cards(2));
  d.unsure();            // q1 を後ろへ → [q2, q1]
  d.known();             // q2 覚えた → [q1]
  assert.equal(d.isDone(), false);
  assert.equal(d.current().id, 'q1');
  d.known();             // q1 覚えた → []
  assert.equal(d.isDone(), true);
  assert.equal(d.doneCount(), 2);
});

test('あやしいを押した延べ回数を数える', () => {
  const d = createDeck(cards(2));
  d.unsure();            // [q2, q1]
  d.unsure();            // [q1, q2]
  d.known(); d.known();
  assert.equal(d.againCount(), 2);
  assert.equal(d.isDone(), true);
});

test('1回で覚えた枚数を数える', () => {
  const d = createDeck(cards(3));
  d.known();             // q1 は一発
  d.unsure();            // q2 をあやしいに
  d.known();             // q3 は一発
  d.known();             // 戻ってきた q2 を覚えた（一発ではない）
  assert.equal(d.firstTryCount(), 2);
  assert.equal(d.doneCount(), 3);
});

test('山が1枚のときにあやしいを押すと同じカードが戻る', () => {
  const d = createDeck(cards(1));
  d.unsure();
  assert.equal(d.current().id, 'q1');
  assert.equal(d.remaining(), 1);
  assert.equal(d.isDone(), false);
});

test('空の山は最初から終わっている', () => {
  const d = createDeck([]);
  assert.equal(d.isDone(), true);
  assert.equal(d.current(), null);
  assert.equal(d.size(), 0);
  assert.equal(d.remaining(), 0);
  assert.equal(d.doneCount(), 0);
});

test('空の山で操作しても落ちない', () => {
  const d = createDeck([]);
  assert.doesNotThrow(() => { d.known(); d.unsure(); });
  assert.equal(d.isDone(), true);
  assert.equal(d.doneCount(), 0);
  assert.equal(d.againCount(), 0);
});

test('null を渡しても落ちない', () => {
  const d = createDeck(null);
  assert.equal(d.size(), 0);
  assert.equal(d.isDone(), true);
  assert.equal(d.current(), null);
});

test('元の配列を壊さない', () => {
  const src = cards(3);
  const d = createDeck(src);
  d.known(); d.unsure();
  assert.deepEqual(src.map(c => c.id), ['q1', 'q2', 'q3']);
});
