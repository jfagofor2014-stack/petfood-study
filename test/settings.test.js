import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, DEFAULTS, RATE_MIN, RATE_MAX } from '../js/lib/settings.js';
import { FONT_SIZES } from '../js/lib/settings.js';

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

test('初期状態では既定値を返す', () => {
  assert.deepEqual(createSettings(fakeStorage()).get(), DEFAULTS);
});

test('一部だけ変えても他は既定のまま', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 1.5 });
  assert.equal(s.get().rate, 1.5);
  assert.equal(s.get().pauseMs, DEFAULTS.pauseMs);
  assert.equal(s.get().keepAwake, DEFAULTS.keepAwake);
});

test('速度は下限と上限に丸める', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 0.1 });
  assert.equal(s.get().rate, RATE_MIN);
  s.set({ rate: 9 });
  assert.equal(s.get().rate, RATE_MAX);
});

test('速度に数値でない値が来たら既定に戻す', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 'はやく' });
  assert.equal(s.get().rate, DEFAULTS.rate);
});

test('文間の間は0〜2000msに丸める', () => {
  const s = createSettings(fakeStorage());
  s.set({ pauseMs: -100 });
  assert.equal(s.get().pauseMs, 0);
  s.set({ pauseMs: 99999 });
  assert.equal(s.get().pauseMs, 2000);
});

test('真偽値は真偽値に正規化する', () => {
  const s = createSettings(fakeStorage());
  s.set({ keepAwake: 0 });
  assert.equal(s.get().keepAwake, false);
  s.set({ keepAwake: 'はい' });
  assert.equal(s.get().keepAwake, true);
});

test('壊れたJSONが入っていても既定値を返す', () => {
  const s = createSettings(fakeStorage({ 'pfs:settings': '{壊れている' }));
  assert.deepEqual(s.get(), DEFAULTS);
});

test('未知のキーは保存しない', () => {
  const s = createSettings(fakeStorage());
  s.set({ 謎: 1 });
  assert.equal(s.get().謎, undefined);
});

test('reset で既定値に戻る', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 1.8, voiceURI: 'ja-JP-voice' });
  s.reset();
  assert.deepEqual(s.get(), DEFAULTS);
});

test('文字列を set しても落ちず、設定が変わらない', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 1.5 });
  const before = s.get();
  assert.doesNotThrow(() => s.set('文字列'));
  assert.deepEqual(s.get(), before);
});

test('数値を set しても落ちず、設定が変わらない', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 1.5 });
  const before = s.get();
  assert.doesNotThrow(() => s.set(123));
  assert.deepEqual(s.get(), before);
});

test('配列を set しても落ちず、設定が変わらない', () => {
  const s = createSettings(fakeStorage());
  s.set({ rate: 1.5 });
  const before = s.get();
  assert.doesNotThrow(() => s.set([]));
  assert.deepEqual(s.get(), before);
});

test('文字サイズの既定は中', () => {
  const s = createSettings(fakeStorage());
  assert.equal(s.get().mockFontSize, 'md');
});

test('文字サイズは3段階', () => {
  assert.deepEqual([...FONT_SIZES], ['sm', 'md', 'lg']);
});

test('文字サイズを保存できる', () => {
  const s = createSettings(fakeStorage());
  assert.equal(s.set({ mockFontSize: 'lg' }).mockFontSize, 'lg');
  assert.equal(s.get().mockFontSize, 'lg');
});

test('知らない文字サイズは既定に丸める', () => {
  const s = createSettings(fakeStorage());
  assert.equal(s.set({ mockFontSize: 'xl' }).mockFontSize, 'md');
  assert.equal(s.set({ mockFontSize: null }).mockFontSize, 'md');
  assert.equal(s.set({ mockFontSize: 3 }).mockFontSize, 'md');
});
