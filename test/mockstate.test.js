import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockState } from '../js/lib/mockstate.js';

// localStorage のかわり。js/lib は storage を注入で受け取る。
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    _dump: () => Object.fromEntries(map),
  };
}

const active = (over = {}) => ({
  v: 1,
  startedAt: '2026-09-22T01:00:00.000Z',
  remainingMs: 3400000,
  questionIds: ['q1', 'q2', 'q3'],
  answers: [null, 2, null],
  flags: [false, true, false],
  at: 1,
  ...over,
});

const entry = (over = {}) => ({
  finishedAt: '2026-09-22T02:00:00.000Z',
  score: 19,
  total: 25,
  elapsedMs: 1980000,
  byChapter: [{ chapterNo: 1, total: 1, correct: 1 }],
  questionIds: ['q1', 'q2'],
  ...over,
});

test('中断データを保存して読み戻せる', () => {
  const m = createMockState(fakeStorage());
  m.saveActive(active());
  assert.deepEqual(m.getActive(), active());
});

test('中断データが無ければ null', () => {
  assert.equal(createMockState(fakeStorage()).getActive(), null);
});

test('壊れた中断データは中断なしとして扱う', () => {
  for (const bad of ['{', 'null', '"文字列"', '[]', '{"v":1}', '{"v":2,"questionIds":["a"]}']) {
    const m = createMockState(fakeStorage({ 'pfs:mock': bad }));
    assert.equal(m.getActive(), null, `bad=${bad}`);
  }
});

test('配列の長さが食い違う中断データは捨てる', () => {
  const m = createMockState(fakeStorage());
  assert.equal(m.saveActive(active({ answers: [null] })), null);
  assert.equal(m.getActive(), null);
});

test('at が範囲外の中断データは捨てる', () => {
  const m = createMockState(fakeStorage());
  assert.equal(m.saveActive(active({ at: 3 })), null);
  assert.equal(m.saveActive(active({ at: -1 })), null);
});

test('中断データを消せる', () => {
  const m = createMockState(fakeStorage());
  m.saveActive(active());
  m.clearActive();
  assert.equal(m.getActive(), null);
});

test('履歴は新しい順に積まれる', () => {
  const m = createMockState(fakeStorage());
  m.pushHistory(entry({ score: 1 }));
  m.pushHistory(entry({ score: 2 }));
  assert.deepEqual(m.history().map(e => e.score), [2, 1]);
});

test('履歴は10件までしか持たない', () => {
  const m = createMockState(fakeStorage());
  for (let i = 0; i < 15; i++) m.pushHistory(entry({ score: i }));
  assert.equal(m.history().length, 10);
  assert.equal(m.history()[0].score, 14);
});

test('壊れた履歴は空として扱う', () => {
  for (const bad of ['{', '{"a":1}', '"文字列"']) {
    assert.deepEqual(createMockState(fakeStorage({ 'pfs:mockhist': bad })).history(), [], `bad=${bad}`);
  }
});

test('履歴の中の壊れた要素だけを落とす', () => {
  const raw = JSON.stringify([entry(), null, { score: 'x' }, entry({ score: 3 })]);
  const m = createMockState(fakeStorage({ 'pfs:mockhist': raw }));
  assert.deepEqual(m.history().map(e => e.score), [19, 3]);
});

test('直近3件で出た問題IDの和集合を返す', () => {
  const m = createMockState(fakeStorage());
  m.pushHistory(entry({ questionIds: ['a', 'b'] }));
  m.pushHistory(entry({ questionIds: ['b', 'c'] }));
  m.pushHistory(entry({ questionIds: ['d'] }));
  m.pushHistory(entry({ questionIds: ['e'] }));
  assert.deepEqual(m.recentQuestionIds(3).sort(), ['b', 'c', 'd', 'e']);
});

test('履歴が無ければ直近IDは空', () => {
  assert.deepEqual(createMockState(fakeStorage()).recentQuestionIds(), []);
});

test('reset で中断データも履歴も消える', () => {
  const m = createMockState(fakeStorage());
  m.saveActive(active());
  m.pushHistory(entry());
  m.reset();
  assert.equal(m.getActive(), null);
  assert.deepEqual(m.history(), []);
});

test('書き出しと読み込みが往復する', () => {
  const a = createMockState(fakeStorage());
  a.saveActive(active());
  a.pushHistory(entry());
  const dumped = a.exportAll();

  const b = createMockState(fakeStorage());
  b.importAll(dumped);
  assert.deepEqual(b.getActive(), active());
  assert.deepEqual(b.history(), [entry()]);
});

test('オブジェクト以外を読み込んでも既存を壊さない', () => {
  const m = createMockState(fakeStorage());
  m.pushHistory(entry());
  m.importAll(null);
  m.importAll('文字列');
  m.importAll([]);
  assert.equal(m.history().length, 1);
});
