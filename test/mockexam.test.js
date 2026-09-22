import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterPages, allocateByPages } from '../js/lib/mockexam.js';

// 教材データと同じ形の章。page だけがこのテストに関係する。
const sec = (no, page) => ({ id: `s${no}`, no, title: `節${no}`, page, blocks: [] });
const chap = (no, pages) => ({ no, title: `章${no}`, sections: pages.map((p, i) => sec(i + 1, p)) });

// 実際の教材と同じページ配置（第1章 p4〜、第2章 p8〜 …、最終章の最終節 p150）
const REAL = [
  chap(1, [4, 5, 6]), chap(2, [8, 20, 27]), chap(3, [28, 40, 47]), chap(4, [48, 57]),
  chap(5, [58, 63]), chap(6, [64, 80, 84]), chap(7, [85, 98]), chap(8, [99, 115]),
  chap(9, [116, 140]), chap(10, [141, 150]),
];

test('章のページ数は次章の開始ページから求める', () => {
  assert.deepEqual(chapterPages(REAL), [4, 20, 20, 10, 6, 21, 14, 17, 25, 10]);
});

test('節が無い章でも1ページとして扱う', () => {
  assert.deepEqual(chapterPages([{ no: 1, sections: [] }]), [1]);
});

test('章が無ければ空配列', () => {
  assert.deepEqual(chapterPages([]), []);
  assert.deepEqual(allocateByPages([], 25), []);
});

test('実際の教材では設計書どおりの配分になる', () => {
  assert.deepEqual(allocateByPages(REAL, 25), [1, 3, 3, 2, 2, 3, 2, 3, 4, 2]);
});

test('配分の合計は必ず要求数に一致する', () => {
  for (const total of [10, 11, 25, 26, 40, 100]) {
    assert.equal(allocateByPages(REAL, total).reduce((a, b) => a + b, 0), total, `total=${total}`);
  }
});

test('どの章も最低1問は出る', () => {
  assert.ok(allocateByPages(REAL, 25).every(n => n >= 1));
});

test('ページ数が多い章ほど多く出る', () => {
  const a = allocateByPages(REAL, 25);
  // 第9章(25p) は第1章(4p) より多い
  assert.ok(a[8] > a[0]);
});

test('章数より要求数が少ないときは最低1問をあきらめて比例配分だけにする', () => {
  const got = allocateByPages(REAL, 5);
  assert.equal(got.reduce((a, b) => a + b, 0), 5);
  assert.ok(got.every(n => n >= 0));
});

test('要求数が0以下なら空配列', () => {
  assert.deepEqual(allocateByPages(REAL, 0), []);
  assert.deepEqual(allocateByPages(REAL, -1), []);
});

import { buildExam } from '../js/lib/mockexam.js';

// 決定的な擬似乱数（quizpick.test.js と同じもの）
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

// 各章に n 問ずつ用意する。answer は採点テストで使う。
function makeQuestions(perChapter) {
  const out = [];
  perChapter.forEach((n, idx) => {
    const chapterNo = idx + 1;
    for (let i = 1; i <= n; i++) {
      out.push({
        id: `q${chapterNo}-${i}`,
        sectionId: `s${chapterNo}`,
        chapterNo,
        answer: 0,
        choices: ['あ', 'い', 'う', 'え'],
      });
    }
  });
  return out;
}

const PLENTY = makeQuestions([13, 25, 20, 22, 14, 24, 26, 26, 23, 10]);

const countByChapter = set => {
  const m = new Map();
  for (const q of set) m.set(q.chapterNo, (m.get(q.chapterNo) || 0) + 1);
  return [...m.keys()].sort((a, b) => a - b).map(no => m.get(no));
};

test('25問が出題され、章別の内訳が配分どおりになる', () => {
  const set = buildExam(PLENTY, REAL, { rnd: seeded(1) });
  assert.equal(set.length, 25);
  assert.deepEqual(countByChapter(set), [1, 3, 3, 2, 2, 3, 2, 3, 4, 2]);
});

test('同じ問題が二度出ない', () => {
  const set = buildExam(PLENTY, REAL, { rnd: seeded(2) });
  assert.equal(new Set(set.map(q => q.id)).size, set.length);
});

test('乱数を注入すれば結果は決定的になる', () => {
  const a = buildExam(PLENTY, REAL, { rnd: seeded(7) }).map(q => q.id);
  const b = buildExam(PLENTY, REAL, { rnd: seeded(7) }).map(q => q.id);
  assert.deepEqual(a, b);
});

test('直近に出た問題は避けられる', () => {
  // 第2章は手持ち25問・配分3問。20問を直近扱いにしても、残り5問から選べるはず。
  const recentIds = PLENTY.filter(q => q.chapterNo === 2).slice(0, 20).map(q => q.id);
  const set = buildExam(PLENTY, REAL, { recentIds, rnd: seeded(3) });
  const ch2 = set.filter(q => q.chapterNo === 2).map(q => q.id);
  assert.equal(ch2.length, 3);
  assert.ok(ch2.every(id => !recentIds.includes(id)), `避けられていない: ${ch2}`);
});

test('避けきれないときは直近に出た問題からも出す', () => {
  // 全問を直近扱いにしても、25問そろえることを優先する。
  const recentIds = PLENTY.map(q => q.id);
  const set = buildExam(PLENTY, REAL, { recentIds, rnd: seeded(4) });
  assert.equal(set.length, 25);
});

test('ある章の手持ちが足りなければ他章から補う', () => {
  // 第9章は配分4問だが1問しか無い。不足3問は他章から補われ、合計は25問になる。
  const scarce = makeQuestions([13, 25, 20, 22, 14, 24, 26, 26, 1, 10]);
  const set = buildExam(scarce, REAL, { rnd: seeded(5) });
  assert.equal(set.length, 25);
  assert.equal(set.filter(q => q.chapterNo === 9).length, 1);
});

test('全体が25問に満たなければあるだけ返す', () => {
  const few = makeQuestions([1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  const set = buildExam(few, REAL, { rnd: seeded(6) });
  assert.equal(set.length, 3);
});

test('問題が無ければ空配列', () => {
  assert.deepEqual(buildExam([], REAL, { rnd: seeded(1) }), []);
  assert.deepEqual(buildExam(null, REAL, { rnd: seeded(1) }), []);
});

import { gradeExam } from '../js/lib/mockexam.js';

const GQ = [
  { id: 'a', chapterNo: 1, answer: 0 },
  { id: 'b', chapterNo: 1, answer: 3 },
  { id: 'c', chapterNo: 2, answer: 1 },
];

test('正解数と正答率を数える', () => {
  const g = gradeExam(GQ, [0, 3, 1]);
  assert.equal(g.total, 3);
  assert.equal(g.score, 3);
  assert.equal(g.rate, 1);
});

test('未解答は不正解として数える', () => {
  const g = gradeExam(GQ, [0, null, undefined]);
  assert.equal(g.score, 1);
  assert.equal(g.details[1].chosen, null);
  assert.equal(g.details[1].ok, false);
  assert.equal(g.details[2].chosen, null);
});

test('章別に集計する', () => {
  const g = gradeExam(GQ, [0, 0, 1]);
  assert.deepEqual(g.byChapter, [
    { chapterNo: 1, total: 2, correct: 1 },
    { chapterNo: 2, total: 1, correct: 1 },
  ]);
});

test('章別は章番号の昇順に並ぶ', () => {
  const qs = [{ id: 'x', chapterNo: 9, answer: 0 }, { id: 'y', chapterNo: 2, answer: 0 }];
  assert.deepEqual(gradeExam(qs, [0, 0]).byChapter.map(x => x.chapterNo), [2, 9]);
});

test('全問不正解でも落ちない', () => {
  const g = gradeExam(GQ, [1, 1, 0]);
  assert.equal(g.score, 0);
  assert.equal(g.rate, 0);
});

test('出題が無ければ0件として返す', () => {
  const g = gradeExam([], []);
  assert.deepEqual(g, { total: 0, score: 0, rate: 0, byChapter: [], details: [] });
});
