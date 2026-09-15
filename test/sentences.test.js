import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../js/lib/sentences.js';

test('句点で文に分割する', () => {
  assert.deepEqual(
    splitSentences('犬の先祖は野生動物である。オオカミは捕食する。'),
    ['犬の先祖は野生動物である。', 'オオカミは捕食する。']
  );
});

test('感嘆符と疑問符でも分割する', () => {
  assert.deepEqual(
    splitSentences('本当か？そうだ！'),
    ['本当か？', 'そうだ！']
  );
});

test('鉤括弧の中の句点では分割しない', () => {
  assert.deepEqual(
    splitSentences('「これは重要である。」と記されている。'),
    ['「これは重要である。」と記されている。']
  );
});

test('丸括弧の中の句点では分割しない', () => {
  assert.deepEqual(
    splitSentences('総合栄養食（主食となる。水と併せて与える）は重要である。'),
    ['総合栄養食（主食となる。水と併せて与える）は重要である。']
  );
});

test('句点の直後の閉じ括弧は前の文に含める', () => {
  assert.deepEqual(
    splitSentences('注意が必要である（詳細は後述する。）次に進む。'),
    ['注意が必要である（詳細は後述する。）', '次に進む。']
  );
});

test('末尾に句点がなくても最後の文を落とさない', () => {
  assert.deepEqual(splitSentences('句点のない行'), ['句点のない行']);
});

test('空文字と空白のみは空配列を返す', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('   '), []);
  assert.deepEqual(splitSentences(null), []);
});

test('連続する空白を1つに畳む', () => {
  assert.deepEqual(
    splitSentences('前半である。   後半である。'),
    ['前半である。', '後半である。']
  );
});

test('括弧が閉じられていなくても最後まで返す', () => {
  assert.deepEqual(
    splitSentences('未閉じ（のまま終わる。'),
    ['未閉じ（のまま終わる。']
  );
});

test('入れ子の丸括弧が閉じ括弧を挟んでトップレベルまで閉じ切っても区切る', () => {
  assert.deepEqual(
    splitSentences('説明（外側（内側の文。））以上。'),
    ['説明（外側（内側の文。））', '以上。']
  );
});

test('省略記号を挟んで閉じても区切る', () => {
  assert.deepEqual(
    splitSentences('（そうだ。…）次'),
    ['（そうだ。…）', '次']
  );
});

test('丸括弧の中が感嘆符や疑問符で終わる場合も区切る', () => {
  assert.deepEqual(
    splitSentences('本当に驚いた（まさか本当とは！）次へ進む。'),
    ['本当に驚いた（まさか本当とは！）', '次へ進む。']
  );
});
