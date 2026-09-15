// speechSynthesis のラッパ。Android Chrome の癖をこのファイルに閉じ込める。
//  - 長文を渡すと途中で止まるため、呼び出し側が1文ずつ渡す前提にする
//  - getVoices() は初回に空配列を返すことがあるため voiceschanged を待つ
//  - cancel() 由来の onerror('interrupted') は異常ではないので正常終了として扱う

const VOICE_WAIT_MS = 2000;

export function createSpeech({ synth, UtteranceCtor }) {
  let current = null;         // { utter, settle }

  function settleCurrent(result) {
    const c = current;
    current = null;
    if (c) c.settle(result);
  }

  return {
    speak(text, { rate = 1.0, voice = null } = {}) {
      const body = String(text ?? '').trim();
      if (current) { settleCurrent('cancelled'); synth.cancel(); }
      if (!body) return Promise.resolve('done');

      return new Promise((resolve, reject) => {
        const utter = new UtteranceCtor(body);
        utter.rate = rate;
        utter.lang = 'ja-JP';
        if (voice) utter.voice = voice;

        const settle = result => resolve(result);
        current = { utter, settle };

        utter.onend = () => { if (current && current.utter === utter) settleCurrent('done'); };
        utter.onerror = e => {
          if (!current || current.utter !== utter) return;
          const err = (e && e.error) || 'unknown';
          current = null;
          // cancel() を呼んだときにも interrupted / canceled が飛ぶ。異常ではない。
          if (err === 'interrupted' || err === 'canceled') resolve('cancelled');
          else reject(new Error(err));
        };

        synth.speak(utter);
      });
    },

    cancel() {
      if (current) settleCurrent('cancelled');
      synth.cancel();
    },

    async japaneseVoices() {
      let all = synth.getVoices() || [];
      if (all.length === 0) {
        all = await new Promise(resolve => {
          let done = false;
          let timer;
          // voiceschanged とタイムアウトのどちらが先に来ても一度しか解決しない。
          // 先に解決した側でタイマーを止め、取り残したタイマーがプロセスを
          // 生かし続けてテストがハングすることを防ぐ。
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(synth.getVoices() || []);
          };
          synth.addEventListener('voiceschanged', finish);
          timer = setTimeout(finish, VOICE_WAIT_MS);
        });
      }
      const ja = all.filter(v => String(v.lang || '').toLowerCase().startsWith('ja'));
      return ja.length ? ja : all;
    },

    pickVoice(voices, voiceURI) {
      if (!voiceURI) return null;
      return (voices || []).find(v => v.voiceURI === voiceURI) || null;
    },

    // 初回の発話がユーザー操作なしだと無音になるため、
    // 最初のタップのタイミングで無音の発話を1つ流して解禁する。
    unlock() {
      const u = new UtteranceCtor(' ');
      u.lang = 'ja-JP';
      u.volume = 0;
      synth.speak(u);
    },
  };
}
