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
