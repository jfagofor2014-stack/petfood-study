import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSafeStorage } from '../js/lib/safestorage.js';

// 素の Storage のかわり。どのメソッドを投げさせるかを個別に切り替えられる。
function fake({ throwOn = [] } = {}) {
  const map = new Map();
  const guard = name => { if (throwOn.includes(name)) throw new Error(`${name} blocked`); };
  return {
    getItem(k) { guard('getItem'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { guard('setItem'); map.set(k, String(v)); },
    removeItem(k) { guard('removeItem'); map.delete(k); },
    _dump: () => Object.fromEntries(map),
  };
}

// onChange の呼ばれ方を記録する
function recorder() {
  const calls = [];
  const fn = v => calls.push(v);
  fn.calls = calls;
  return fn;
}

test('素の storage へ委譲する', () => {
  const raw = fake();
  const s = createSafeStorage(raw);
  s.setItem('a', '1');
  assert.equal(s.getItem('a'), '1');
  assert.deepEqual(raw._dump(), { a: '1' });
  s.removeItem('a');
  assert.equal(s.getItem('a'), null);
  assert.deepEqual(raw._dump(), {});
});

test('無い鍵は null', () => {
  assert.equal(createSafeStorage(fake()).getItem('nope'), null);
});

test('setItem が投げても例外が外に出ない', () => {
  const s = createSafeStorage(fake({ throwOn: ['setItem'] }));
  assert.doesNotThrow(() => s.setItem('a', '1'));
});

test('getItem が投げても例外が外に出ず null を返す', () => {
  const s = createSafeStorage(fake({ throwOn: ['getItem'] }));
  let got;
  assert.doesNotThrow(() => { got = s.getItem('a'); });
  assert.equal(got, null);
});

test('removeItem が投げても例外が外に出ない', () => {
  const s = createSafeStorage(fake({ throwOn: ['removeItem'] }));
  assert.doesNotThrow(() => s.removeItem('a'));
});

test('書き込みに失敗すると onChange(true) が1回だけ呼ばれる', () => {
  const on = recorder();
  const s = createSafeStorage(fake({ throwOn: ['setItem'] }), on);
  s.setItem('a', '1');
  s.setItem('b', '2');
  s.setItem('c', '3');
  assert.deepEqual(on.calls, [true]);
  assert.equal(s.isFailing(), true);
});

test('失敗のあと成功すると onChange(false) が呼ばれる', () => {
  const on = recorder();
  // 最初は投げる storage、途中で投げなくする
  let blocked = true;
  const raw = {
    getItem: () => null,
    setItem: () => { if (blocked) throw new Error('blocked'); },
    removeItem: () => {},
  };
  const s = createSafeStorage(raw, on);
  s.setItem('a', '1');
  assert.deepEqual(on.calls, [true]);
  blocked = false;
  s.setItem('a', '1');
  assert.deepEqual(on.calls, [true, false]);
  assert.equal(s.isFailing(), false);
});

test('成功が続く間は onChange が呼ばれない', () => {
  const on = recorder();
  const s = createSafeStorage(fake(), on);
  s.setItem('a', '1');
  s.setItem('b', '2');
  assert.deepEqual(on.calls, []);
  assert.equal(s.isFailing(), false);
});

test('removeItem の失敗では onChange が呼ばれない', () => {
  const on = recorder();
  const s = createSafeStorage(fake({ throwOn: ['removeItem'] }), on);
  s.removeItem('a');
  assert.deepEqual(on.calls, []);
  assert.equal(s.isFailing(), false);
});

test('getItem の失敗では onChange が呼ばれない', () => {
  const on = recorder();
  const s = createSafeStorage(fake({ throwOn: ['getItem'] }), on);
  s.getItem('a');
  assert.deepEqual(on.calls, []);
  assert.equal(s.isFailing(), false);
});

test('onChange を渡さなくても落ちない', () => {
  const s = createSafeStorage(fake({ throwOn: ['setItem'] }));
  assert.doesNotThrow(() => s.setItem('a', '1'));
  assert.equal(s.isFailing(), true);
});

test('storage が null でも落ちない', () => {
  const on = recorder();
  const s = createSafeStorage(null, on);
  assert.doesNotThrow(() => s.setItem('a', '1'));
  assert.equal(s.getItem('a'), null);
  assert.doesNotThrow(() => s.removeItem('a'));
  assert.equal(s.isFailing(), true);
  assert.deepEqual(on.calls, [true]);
});

test('onChange が投げても書き込み側に影響しない', () => {
  // 画面側の不具合で保存が壊れることを防ぐ
  const s = createSafeStorage(fake({ throwOn: ['setItem'] }), () => { throw new Error('ui bug'); });
  assert.doesNotThrow(() => s.setItem('a', '1'));
  assert.equal(s.isFailing(), true);
});
