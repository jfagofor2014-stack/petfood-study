import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech } from '../js/lib/speech.js';

class FakeUtterance {
  constructor(text) { this.text = text; this.rate = 1; this.voice = null; this.lang = ''; }
}

function fakeSynth(voices = []) {
  const s = {
    spoken: [],
    cancelled: 0,
    _pending: null,
    _voices: voices,
    _listeners: {},
    speak(u) { s.spoken.push(u); s._pending = u; },
    cancel() { s.cancelled++; const u = s._pending; s._pending = null; if (u && u.onend) u.onend(); },
    getVoices() { return s._voices; },
    addEventListener(name, fn) { s._listeners[name] = fn; },
    removeEventListener(name, fn) { if (s._listeners[name] === fn) delete s._listeners[name]; },
    finish() { const u = s._pending; s._pending = null; if (u && u.onend) u.onend(); },
    fail(msg) { const u = s._pending; s._pending = null; if (u && u.onerror) u.onerror({ error: msg }); },
    emitVoicesChanged(v) { s._voices = v; if (s._listeners.voiceschanged) s._listeners.voiceschanged(); },
  };
  return s;
}

const make = (synth) => createSpeech({ synth, UtteranceCtor: FakeUtterance });

test('文を1つ発話し、終了で解決する', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const p = sp.speak('こんにちは。', { rate: 1.2 });
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].text, 'こんにちは。');
  assert.equal(synth.spoken[0].rate, 1.2);
  assert.equal(synth.spoken[0].lang, 'ja-JP');
  synth.finish();
  assert.equal(await p, 'done');
});

test('cancel すると cancelled で解決する', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const p = sp.speak('長い文。', {});
  sp.cancel();
  assert.equal(await p, 'cancelled');
  assert.equal(synth.cancelled, 1);
});

test('エラーは reject になる', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const p = sp.speak('文。', {});
  synth.fail('synthesis-failed');
  await assert.rejects(p, /synthesis-failed/);
});

test('interrupted エラーは cancelled として扱う', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const p = sp.speak('文。', {});
  synth.fail('interrupted');
  assert.equal(await p, 'cancelled');
});

test('空文字は発話せずすぐ解決する', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  assert.equal(await sp.speak('   ', {}), 'done');
  assert.equal(synth.spoken.length, 0);
});

test('新しい発話の前に前の発話を打ち切る', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const first = sp.speak('一つ目。', {});
  const second = sp.speak('二つ目。', {});
  assert.equal(await first, 'cancelled');
  synth.finish();
  assert.equal(await second, 'done');
});

test('日本語の声だけを抜き出す', async () => {
  const synth = fakeSynth([
    { voiceURI: 'a', lang: 'en-US', name: 'English' },
    { voiceURI: 'b', lang: 'ja-JP', name: '日本語' },
  ]);
  const vs = await make(synth).japaneseVoices();
  assert.deepEqual(vs.map(v => v.voiceURI), ['b']);
});

test('日本語の声がなければ全件を返す', async () => {
  const synth = fakeSynth([{ voiceURI: 'a', lang: 'en-US', name: 'English' }]);
  const vs = await make(synth).japaneseVoices();
  assert.deepEqual(vs.map(v => v.voiceURI), ['a']);
});

test('getVoices が最初は空でも voiceschanged を待つ', async () => {
  const synth = fakeSynth([]);
  const p = make(synth).japaneseVoices();
  synth.emitVoicesChanged([{ voiceURI: 'b', lang: 'ja-JP', name: '日本語' }]);
  assert.deepEqual((await p).map(v => v.voiceURI), ['b']);
});

test('pickVoice が voiceURI で選ぶ', () => {
  const sp = make(fakeSynth());
  const vs = [{ voiceURI: 'a', lang: 'ja-JP' }, { voiceURI: 'b', lang: 'ja-JP' }];
  assert.equal(sp.pickVoice(vs, 'b').voiceURI, 'b');
  assert.equal(sp.pickVoice(vs, 'なし'), null);
  assert.equal(sp.pickVoice(vs, null), null);
});

test('指定した声を utterance に載せる', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const voice = { voiceURI: 'b', lang: 'ja-JP' };
  const p = sp.speak('文。', { voice });
  assert.equal(synth.spoken[0].voice, voice);
  synth.finish();
  await p;
});

test('unlock は synth.speak を1回呼ぶ', () => {
  const synth = fakeSynth();
  const sp = make(synth);
  sp.unlock();
  assert.equal(synth.spoken.length, 1);
});

test('unlock の utterance は lang=ja-JP, volume=0', () => {
  const synth = fakeSynth();
  const sp = make(synth);
  sp.unlock();
  assert.equal(synth.spoken[0].lang, 'ja-JP');
  assert.equal(synth.spoken[0].volume, 0);
});

test('unlock は speak() の Promise を進行中のまま保つ', async () => {
  const synth = fakeSynth();
  const sp = make(synth);
  const p = sp.speak('文。', {});
  sp.unlock();
  // unlock() は synth.speak を呼ぶだけで、前の speak() に影響しないことを確認
  assert.equal(synth.spoken.length, 2); // speak + unlock
  // 最初の utterance に onend を呼んで p が解決することを確認
  const firstUtterance = synth.spoken[0];
  if (firstUtterance.onend) firstUtterance.onend();
  assert.equal(await p, 'done');
});

test('japaneseVoices は voiceschanged リスナーを削除する', async () => {
  const synth = fakeSynth([]);
  const sp = make(synth);
  const p = sp.japaneseVoices();
  // voiceschanged が登録されている状態を確認
  assert.ok(synth._listeners.voiceschanged);
  // リスナーを呼んで解決
  synth.emitVoicesChanged([{ voiceURI: 'b', lang: 'ja-JP', name: '日本語' }]);
  await p;
  // 解決後、リスナーが外されていることを確認
  assert.equal(synth._listeners.voiceschanged, undefined);
});
