import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData, summarize, SCHEMA_VERSION } from '../js/lib/schema.js';

function validData() {
  return {
    meta: { schema: 1, title: 'ペットフード販売士認定講習会テキスト', edition: '第5版', generatedAt: '2026-09-15' },
    chapters: [{
      id: 'ch01', no: 1, title: '概要', page: 4,
      sections: [{
        id: 'ch01-s01', no: 1, title: '設立趣旨', page: 4,
        blocks: [
          { type: 'p', sents: ['家族の一員であるペットと暮らす。'] },
          { type: 'figure', img: 'data:image/png;base64,AAA', caption: '図1', speak: '図1の説明。' }
        ]
      }]
    }],
    questions: []
  };
}

test('正しいデータを受け入れる', () => {
  const r = validateData(validData());
  assert.equal(r.ok, true);
  assert.equal(r.data.chapters.length, 1);
});

test('オブジェクトでない入力を拒否する', () => {
  assert.equal(validateData(null).ok, false);
  assert.equal(validateData('文字列').ok, false);
  assert.equal(validateData([]).ok, false);
});

test('スキーマ版が違うと拒否し、理由を返す', () => {
  const d = validData();
  d.meta.schema = 99;
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('スキーマ')));
});

test('章が空だと拒否する', () => {
  const d = validData();
  d.chapters = [];
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('章')));
});

test('節IDが重複していると拒否する', () => {
  const d = validData();
  d.chapters[0].sections.push({ ...d.chapters[0].sections[0] });
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('重複')));
});

test('未知のブロック種別を拒否する', () => {
  const d = validData();
  d.chapters[0].sections[0].blocks.push({ type: 'unknown', sents: ['x'] });
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('unknown')));
});

test('figure に speak も caption もないと拒否する', () => {
  const d = validData();
  d.chapters[0].sections[0].blocks[1] = { type: 'figure', img: 'data:image/png;base64,AAA' };
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('figure')));
});

test('questions がなくても受け入れ、空配列を補う', () => {
  const d = validData();
  delete d.questions;
  const r = validateData(d);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.questions, []);
});

test('問題の answer が選択肢の範囲外だと拒否する', () => {
  const d = validData();
  d.questions = [{ id: 'q1', sectionId: 'ch01-s01', chapterNo: 1, type: 'choice4',
    question: '問', choices: ['a', 'b', 'c', 'd'], answer: 4, explanation: '解説', page: 4 }];
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('q1')));
});

test('存在しない節を指す問題を拒否する', () => {
  const d = validData();
  d.questions = [{ id: 'q1', sectionId: 'ch99-s01', chapterNo: 99, type: 'choice4',
    question: '問', choices: ['a', 'b', 'c', 'd'], answer: 0, explanation: '解説', page: 4 }];
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('ch99-s01')));
});

test('エラーは最大10件までにまとめる', () => {
  const d = validData();
  d.chapters[0].sections[0].blocks = Array.from({ length: 30 }, () => ({ type: 'bad' }));
  const r = validateData(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length <= 10);
});

test('summarize が取り込み結果の要約を返す', () => {
  const s = summarize(validData());
  assert.equal(s.chapters, 1);
  assert.equal(s.sections, 1);
  assert.equal(s.questions, 0);
  assert.equal(s.edition, '第5版');
  assert.equal(s.schema, SCHEMA_VERSION);
});
