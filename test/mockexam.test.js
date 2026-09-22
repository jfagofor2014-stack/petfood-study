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
