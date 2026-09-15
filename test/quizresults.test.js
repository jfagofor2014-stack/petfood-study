import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuizResults } from '../js/lib/quizresults.js';

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}

const questions = [
  { id: 'q01' },
  { id: 'q02' },
  { id: 'q03' },
];

test('未挑戦の問題は既定値を返す', () => {
  const r = createQuizResults(fakeStorage());
  assert.deepEqual(r.get('q01'), { attempts: 0, correct: 0, lastResult: null, lastAt: null });
});

test('record(id, true) で attempts と correct が1ずつ増え、lastResult が true になる', () => {
  const r = createQuizResults(fakeStorage());
  const rec = r.record('q01', true);
  assert.equal(rec.attempts, 1);
  assert.equal(rec.correct, 1);
  assert.equal(rec.lastResult, true);
  assert.ok(rec.lastAt);
});

test('record(id, false) では attempts だけ増え、correct は増えない', () => {
  const r = createQuizResults(fakeStorage());
  const rec = r.record('q01', false);
  assert.equal(rec.attempts, 1);
  assert.equal(rec.correct, 0);
  assert.equal(rec.lastResult, false);
  assert.ok(rec.lastAt);
});

test('同じ問題を複数回記録すると累積する', () => {
  const r = createQuizResults(fakeStorage());
  r.record('q01', true);
  r.record('q01', false);
  const rec = r.record('q01', true);
  assert.equal(rec.attempts, 3);
  assert.equal(rec.correct, 2);
  assert.equal(rec.lastResult, true);
});

test('all() が全件を返す', () => {
  const r = createQuizResults(fakeStorage());
  r.record('q01', true);
  r.record('q02', false);
  const all = r.all();
  assert.equal(Object.keys(all).length, 2);
  assert.equal(all['q01'].correct, 1);
  assert.equal(all['q02'].attempts, 1);
});

test('壊れたJSONが保存されていても all() は {} を返し、record が落ちない', () => {
  const r = createQuizResults(fakeStorage({ 'pfs:quiz': '{壊れている' }));
  assert.deepEqual(r.all(), {});
  assert.doesNotThrow(() => r.record('q01', true));
  assert.equal(r.get('q01').attempts, 1);
});

test('保存値が文字列でも record が落ちず、正しく記録される', () => {
  const r = createQuizResults(fakeStorage({ 'pfs:quiz': JSON.stringify('文字列') }));
  assert.doesNotThrow(() => r.record('q01', true));
  assert.equal(r.get('q01').attempts, 1);
  assert.equal(r.get('q01').correct, 1);
});

test('保存値が配列でも record が落ちず、正しく記録される', () => {
  const r = createQuizResults(fakeStorage({ 'pfs:quiz': JSON.stringify([]) }));
  assert.doesNotThrow(() => r.record('q01', false));
  assert.equal(r.get('q01').attempts, 1);
  assert.equal(r.get('q01').correct, 0);
});

test('個別レコードが壊れた型でも get が未挑戦の既定値を返す', () => {
  const r = createQuizResults(fakeStorage({
    'pfs:quiz': JSON.stringify({ q01: '壊れている' }),
  }));
  assert.deepEqual(r.get('q01'), { attempts: 0, correct: 0, lastResult: null, lastAt: null });
});

test('reset() で全件消える', () => {
  const r = createQuizResults(fakeStorage());
  r.record('q01', true);
  r.record('q02', false);
  r.reset();
  assert.deepEqual(r.all(), {});
  assert.deepEqual(r.get('q01'), { attempts: 0, correct: 0, lastResult: null, lastAt: null });
});

test('pruneTo が存在しない問題の成績だけ捨て、残った件数を返す', () => {
  const r = createQuizResults(fakeStorage());
  r.record('q01', true);
  r.record('古い-q99', true);
  const kept = r.pruneTo(questions);
  assert.equal(kept, 1);
  assert.deepEqual(r.get('古い-q99'), { attempts: 0, correct: 0, lastResult: null, lastAt: null });
  assert.equal(r.get('q01').attempts, 1);
});

test('pruneTo([]) は何も消さない', () => {
  const r = createQuizResults(fakeStorage());
  r.record('q01', true);
  const kept = r.pruneTo([]);
  assert.equal(kept, 1);
  assert.equal(r.get('q01').attempts, 1);
});

test('pruneTo(null) は何も消さない', () => {
  const r = createQuizResults(fakeStorage());
  r.record('q01', true);
  const kept = r.pruneTo(null);
  assert.equal(kept, 1);
  assert.equal(r.get('q01').attempts, 1);
});
