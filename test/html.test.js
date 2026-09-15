import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../js/lib/html.js';

test('& < > " \' をそれぞれ実体参照に変換する', () => {
  assert.equal(escapeHtml('&'), '&amp;');
  assert.equal(escapeHtml('<'), '&lt;');
  assert.equal(escapeHtml('>'), '&gt;');
  assert.equal(escapeHtml('"'), '&quot;');
  assert.equal(escapeHtml("'"), '&#39;');
});

test('複合した文字列をまとめて変換する', () => {
  assert.equal(
    escapeHtml(`<a href="x" class='y'>A&B</a>`),
    '&lt;a href=&quot;x&quot; class=&#39;y&#39;&gt;A&amp;B&lt;/a&gt;'
  );
});

test('null / undefined は空文字として扱う', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('数値の入力は文字列化してから変換する', () => {
  assert.equal(escapeHtml(123), '123');
  assert.equal(escapeHtml(0), '0');
});

test('変換不要な日本語文字列はそのまま返る', () => {
  assert.equal(escapeHtml('第1章 概要'), '第1章 概要');
});

test('スクリプトタグを無害化する', () => {
  assert.equal(
    escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
});
