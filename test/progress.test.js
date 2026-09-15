import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../js/lib/progress.js';

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}

const chapters = [
  { id: 'ch01', no: 1, sections: [
    { id: 'ch01-s01', blocks: [{ type: 'p', sents: ['あ。', 'い。', 'う。', 'え。'] }] },
    { id: 'ch01-s02', blocks: [{ type: 'p', sents: ['か。', 'き。'] }] },
  ]},
  { id: 'ch02', no: 2, sections: [
    { id: 'ch02-s01', blocks: [{ type: 'p', sents: ['さ。', 'し。'] }] },
  ]},
];

test('位置が未保存なら null', () => {
  const p = createProgress(fakeStorage());
  assert.equal(p.getPosition(), null);
});

test('位置を保存して読み戻せる', () => {
  const p = createProgress(fakeStorage());
  p.setPosition('ch01-s01', 12);
  const pos = p.getPosition();
  assert.equal(pos.sectionId, 'ch01-s01');
  assert.equal(pos.sentIndex, 12);
  assert.ok(pos.updatedAt);
});

test('位置を消せる', () => {
  const p = createProgress(fakeStorage());
  p.setPosition('ch01-s01', 3);
  p.clearPosition();
  assert.equal(p.getPosition(), null);
});

test('壊れたJSONが入っていても null を返して落ちない', () => {
  const p = createProgress(fakeStorage({ 'pfs:position': '{壊れている' }));
  assert.equal(p.getPosition(), null);
});

test('未読の節の既定状態を返す', () => {
  const p = createProgress(fakeStorage());
  assert.deepEqual(p.getSection('ch01-s01'), { state: 'unread', maxSent: 0, doneAt: null });
});

test('文を読むと reading になり maxSent が伸びる', () => {
  const p = createProgress(fakeStorage());
  p.markSentence('ch01-s01', 2, 4);
  const s = p.getSection('ch01-s01');
  assert.equal(s.state, 'reading');
  assert.equal(s.maxSent, 2);
});

test('maxSent は後戻りしない', () => {
  const p = createProgress(fakeStorage());
  p.markSentence('ch01-s01', 3, 4);
  p.markSentence('ch01-s01', 1, 4);
  assert.equal(p.getSection('ch01-s01').maxSent, 3);
});

test('最終文に達すると done になる', () => {
  const p = createProgress(fakeStorage());
  p.markSentence('ch01-s01', 3, 4);
  const s = p.getSection('ch01-s01');
  assert.equal(s.state, 'done');
  assert.ok(s.doneAt);
});

test('done になった節は読み直しても done のまま', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  p.markSentence('ch01-s01', 0, 4);
  assert.equal(p.getSection('ch01-s01').state, 'done');
});

test('章の達成率は読了節の割合', () => {
  const p = createProgress(fakeStorage());
  assert.equal(p.chapterRate(chapters[0]), 0);
  p.markDone('ch01-s01');
  assert.equal(p.chapterRate(chapters[0]), 0.5);
  p.markDone('ch01-s02');
  assert.equal(p.chapterRate(chapters[0]), 1);
});

test('節のない章の達成率は0', () => {
  const p = createProgress(fakeStorage());
  assert.equal(p.chapterRate({ id: 'chX', sections: [] }), 0);
});

test('全体の達成率と読了数', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  assert.equal(p.overallRate(chapters), 1 / 3);
  assert.deepEqual(p.doneCount(chapters), { done: 1, total: 3 });
});

test('pruneTo が存在しない節の記録を捨てる', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  p.markDone('古い-s99');
  assert.equal(p.pruneTo(chapters), 1);
  assert.equal(p.getSection('古い-s99').state, 'unread');
  assert.equal(p.getSection('ch01-s01').state, 'done');
});

test('pruneTo は存在しない節を指す位置も消す', () => {
  const p = createProgress(fakeStorage());
  p.setPosition('古い-s99', 4);
  p.pruneTo(chapters);
  assert.equal(p.getPosition(), null);
});

test('reset で全部消える', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  p.setPosition('ch01-s01', 2);
  p.reset();
  assert.equal(p.getPosition(), null);
  assert.equal(p.getSection('ch01-s01').state, 'unread');
});

test('書き出して読み込み直せる', () => {
  const a = createProgress(fakeStorage());
  a.markDone('ch01-s01');
  a.setPosition('ch01-s02', 1);
  const dump = a.exportAll();

  const b = createProgress(fakeStorage());
  b.importAll(dump);
  assert.equal(b.getSection('ch01-s01').state, 'done');
  assert.equal(b.getPosition().sectionId, 'ch01-s02');
});

// --- レビュー指摘の回帰テスト ---

test('importAll: progress が文字列でも markDone は落ちず、状態は壊れない', () => {
  const p = createProgress(fakeStorage());
  p.importAll({ progress: '文字列' });
  assert.doesNotThrow(() => p.markDone('ch01-s01'));
  assert.equal(p.getSection('ch01-s01').state, 'done');
});

test('importAll: progress が配列でも状態は壊れない', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  p.importAll({ progress: [] });
  assert.doesNotThrow(() => p.markDone('ch01-s02'));
  // 元の記録が無効な配列で上書きされていないこと
  assert.equal(p.getSection('ch01-s01').state, 'done');
});

test('importAll: 不正な position (sectionIdが数値) を渡しても getPosition は破綻しない', () => {
  const p = createProgress(fakeStorage());
  p.setPosition('ch01-s01', 2);
  p.importAll({ position: { sectionId: 123, sentIndex: 1 } });
  assert.doesNotThrow(() => p.getPosition());
  // 不正な値は書き込まれず、既存の位置が保たれる
  const pos = p.getPosition();
  assert.equal(pos.sectionId, 'ch01-s01');
});

test('importAll: 不正な position (sentIndexが文字列) を渡しても getPosition は破綻しない', () => {
  const p = createProgress(fakeStorage());
  p.importAll({ position: { sectionId: 'ch01-s01', sentIndex: 'あ' } });
  assert.doesNotThrow(() => p.getPosition());
  assert.equal(p.getPosition(), null);
});

test('pruneTo: 分割代入で取り出しても this に依存せず動く', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  const { pruneTo } = p;
  assert.doesNotThrow(() => pruneTo(chapters));
  assert.equal(p.getSection('ch01-s01').state, 'done');
});

test('pruneTo([]) は進捗も位置も消さない', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  p.setPosition('ch01-s01', 2);
  const kept = p.pruneTo([]);
  assert.equal(kept, 1);
  assert.equal(p.getSection('ch01-s01').state, 'done');
  assert.ok(p.getPosition());
  assert.equal(p.getPosition().sectionId, 'ch01-s01');
});

test('pruneTo(null) は進捗も位置も消さない', () => {
  const p = createProgress(fakeStorage());
  p.markDone('ch01-s01');
  p.setPosition('ch01-s01', 2);
  const kept = p.pruneTo(null);
  assert.equal(kept, 1);
  assert.equal(p.getSection('ch01-s01').state, 'done');
  assert.ok(p.getPosition());
});

test('壊れた個別レコード(文字列)は getSection が UNREAD を返す', () => {
  const p = createProgress(fakeStorage({
    'pfs:progress': JSON.stringify({ 'ch01-s01': '壊れている' }),
  }));
  assert.deepEqual(p.getSection('ch01-s01'), { state: 'unread', maxSent: 0, doneAt: null });
});
