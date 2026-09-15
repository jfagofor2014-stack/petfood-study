import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  flattenSection, sectionLength, listSections,
  findSection, neighborSection, firstSectionId
} from '../js/lib/book.js';

const section = {
  id: 'ch01-s01', no: 1, title: '設立趣旨', page: 4,
  blocks: [
    { type: 'p', sents: ['一文目である。', '二文目である。'] },
    { type: 'figure', img: 'data:image/png;base64,AAA', caption: '図1 組織図', speak: '図1、組織図の説明。' },
    { type: 'list', sents: ['項目ア', '項目イ'] }
  ]
};

const chapters = [
  { id: 'ch01', no: 1, title: '概要', sections: [section, { id: 'ch01-s02', no: 2, title: '設置', blocks: [] }] },
  { id: 'ch02', no: 2, title: '構造', sections: [{ id: 'ch02-s01', no: 1, title: '外形', blocks: [] }] }
];

test('ブロックをまたいで通し番号を振る', () => {
  const u = flattenSection(section);
  assert.equal(u.length, 5);
  assert.deepEqual(u.map(x => x.i), [0, 1, 2, 3, 4]);
});

test('figure は speak を読み上げ文として使う', () => {
  const u = flattenSection(section);
  assert.equal(u[2].type, 'figure');
  assert.equal(u[2].text, '図1、組織図の説明。');
  assert.equal(u[2].img, 'data:image/png;base64,AAA');
  assert.equal(u[2].caption, '図1 組織図');
});

test('speak がない figure は caption を読み上げる', () => {
  const u = flattenSection({ blocks: [{ type: 'figure', img: 'x', caption: '図2' }] });
  assert.equal(u[0].text, '図2');
});

test('元のブロック位置を保持する', () => {
  const u = flattenSection(section);
  assert.deepEqual(u.map(x => x.blockIndex), [0, 0, 1, 2, 2]);
});

test('空の節は空配列になる', () => {
  assert.deepEqual(flattenSection({ blocks: [] }), []);
  assert.deepEqual(flattenSection({}), []);
});

test('sectionLength が文数を返す', () => {
  assert.equal(sectionLength(section), 5);
  assert.equal(sectionLength({ blocks: [] }), 0);
});

test('listSections が本全体の並び順を返す', () => {
  const all = listSections(chapters);
  assert.deepEqual(all.map(x => x.section.id), ['ch01-s01', 'ch01-s02', 'ch02-s01']);
  assert.deepEqual(all.map(x => x.index), [0, 1, 2]);
  assert.equal(all[2].chapter.id, 'ch02');
});

test('findSection が章ごと返す', () => {
  const f = findSection(chapters, 'ch01-s02');
  assert.equal(f.section.title, '設置');
  assert.equal(f.chapter.id, 'ch01');
  assert.equal(f.index, 1);
});

test('findSection は見つからないと null', () => {
  assert.equal(findSection(chapters, 'ch99-s99'), null);
});

test('neighborSection が章をまたいで次へ進む', () => {
  assert.equal(neighborSection(chapters, 'ch01-s02', 1).section.id, 'ch02-s01');
});

test('neighborSection が章をまたいで前へ戻る', () => {
  assert.equal(neighborSection(chapters, 'ch02-s01', -1).section.id, 'ch01-s02');
});

test('neighborSection は端では null を返す', () => {
  assert.equal(neighborSection(chapters, 'ch01-s01', -1), null);
  assert.equal(neighborSection(chapters, 'ch02-s01', 1), null);
});

test('firstSectionId が最初の節を返す', () => {
  assert.equal(firstSectionId(chapters), 'ch01-s01');
  assert.equal(firstSectionId([]), null);
});
