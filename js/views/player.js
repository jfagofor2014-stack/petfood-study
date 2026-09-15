import { flattenSection, findSection, neighborSection, firstSectionId } from '../lib/book.js';
import { RATE_STEP } from '../lib/settings.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// もくじ・テスト画面から「この節を開く」と指定された位置を一時的に預かる。
// 次に renderPlayer が走ったとき一度だけ消費する。
let pendingOpen = null;

export function openPlayerAt(sectionId, sentIndex = 0) {
  pendingOpen = { sectionId, sentIndex };
}

function takePendingOpen() {
  const p = pendingOpen;
  pendingOpen = null;
  return p;
}

export function renderPlayer(root, ctx, nav) {
  const { book, progress, settings, speech, wakeLock } = ctx;

  // ---- 状態 ----------------------------------------------------------
  // openPlayerAt で指定された位置があればそれを優先し、なければ前回の再生位置、
  // それも無ければ本の先頭から始める。
  const requested = takePendingOpen();
  const saved = requested || progress.getPosition();
  let sectionId = (saved && findSection(book.chapters, saved.sectionId))
    ? saved.sectionId
    : firstSectionId(book.chapters);
  let index = saved && saved.sectionId === sectionId ? saved.sentIndex : 0;
  // 既に壊れた値（節の文数を超える index）が保存されている利用者を救済するため、
  // 復元時点でその節の文数に収まるよう丸める。
  index = clampSentIndex(index, utterances().length);
  let playing = false;
  let token = 0;          // 再生ループの世代。停止・移動のたびに増やす
  let voices = [];

  // ---- 骨格 ----------------------------------------------------------
  root.innerHTML = `
    <div id="p-head" class="card">
      <div class="muted" id="p-chapter"></div>
      <div id="p-title"></div>
      <div class="bar" style="margin-top:10px"><i id="p-bar"></i></div>
      <div class="muted" id="p-count" style="margin-top:6px"></div>
    </div>
    <div id="p-body"></div>
    <div id="p-ctrl">
      <div id="p-rate-row">
        <button class="btn ghost sm" id="p-slower">遅く</button>
        <span id="p-rate"></span>
        <button class="btn ghost sm" id="p-faster">速く</button>
      </div>
      <div id="p-move-row">
        <button class="btn ghost sm" id="p-prev-sec">前節</button>
        <button class="btn ghost sm" id="p-back">◀ 1文</button>
        <button class="btn" id="p-play">再生</button>
        <button class="btn ghost sm" id="p-fwd">1文 ▶</button>
        <button class="btn ghost sm" id="p-next-sec">次節</button>
      </div>
      <div class="error" id="p-err" hidden></div>
    </div>
  `;

  const $ = id => root.querySelector('#' + id);
  const body = $('p-body');

  // ---- 描画 ----------------------------------------------------------
  function currentSection() {
    const f = findSection(book.chapters, sectionId);
    return f ? f : null;
  }

  function utterances() {
    const f = currentSection();
    return f ? flattenSection(f.section) : [];
  }

  function drawHead() {
    const f = currentSection();
    const us = utterances();
    $('p-chapter').textContent = f ? `第${f.chapter.no}章 ${f.chapter.title}` : '';
    $('p-title').textContent = f ? `${f.chapter.no}-${f.section.no} ${f.section.title}（p.${f.section.page}）` : '';
    const rate = us.length ? Math.min(1, (index + 1) / us.length) : 0;
    $('p-bar').style.width = `${Math.round(rate * 100)}%`;
    $('p-count').textContent = us.length ? `${index + 1} / ${us.length} 文` : '本文がありません';
    $('p-rate').textContent = `${settings.get().rate.toFixed(1)}倍`;
    document.getElementById('topbar-rate').textContent = `${settings.get().rate.toFixed(1)}倍`;
    $('p-play').textContent = playing ? '一時停止' : '再生';
    // 最初/最後の節では、押しても無反応にならないようボタン自体を無効化する。
    $('p-prev-sec').disabled = !neighborSection(book.chapters, sectionId, -1);
    $('p-next-sec').disabled = !neighborSection(book.chapters, sectionId, 1);
  }

  function drawBody() {
    const us = utterances();
    body.innerHTML = us.map(u => {
      if (u.type === 'figure') {
        return `<figure class="p-fig" data-i="${u.i}">
          <img src="${escapeHtml(u.img)}" alt="${escapeHtml(u.caption || '図')}">
          <figcaption>${escapeHtml(u.caption || '')}</figcaption>
        </figure>`;
      }
      const cls = u.type === 'list' ? 'p-sent p-list' : 'p-sent';
      return `<span class="${cls}" data-i="${u.i}">${escapeHtml(u.text)}</span>`;
    }).join('');
    highlight();
  }

  function highlight() {
    for (const n of body.querySelectorAll('[data-i]')) {
      n.classList.toggle('is-current', Number(n.dataset.i) === index);
    }
    const cur = body.querySelector('.is-current');
    if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // index を 0 以上 (文数-1) 以下（文数が0なら0）に丸める。
  // 節末（index === us.length）のような範囲外の値を保存・表示しないための共通処理。
  function clampSentIndex(i, len) {
    return Math.max(0, Math.min(i, Math.max(0, len - 1)));
  }

  function showError(msg) {
    const el = $('p-err');
    el.textContent = msg;
    el.hidden = false;
  }

  function hideError() {
    const el = $('p-err');
    el.hidden = true;
    el.textContent = '';
  }

  // ---- 再生ループ ----------------------------------------------------
  async function loop(myToken) {
    const cfg = settings.get();
    const voice = speech.pickVoice(voices, cfg.voiceURI);

    while (playing && myToken === token) {
      const us = utterances();
      if (index >= us.length) {
        progress.markDone(sectionId);
        const next = cfg.autoNextSection ? neighborSection(book.chapters, sectionId, 1) : null;
        if (!next) { stop(); break; }
        sectionId = next.section.id;
        index = 0;
        drawHead(); drawBody();
        // 空の節（blocks: []）が連続すると await を挟まず同期的に回り続けてしまうため、
        // 節をまたぐたびに1ティック譲ってメインスレッドを占有しないようにする。
        await sleep(0);
        continue;
      }

      const u = us[index];
      let result;
      try {
        result = await speech.speak(u.text, { rate: cfg.rate, voice });
      } catch {
        if (myToken === token) {
          showError('読み上げができませんでした。端末の音声設定をご確認ください。');
        }
        stop();                       // 読み上げが失敗したら止めて位置は保つ
        break;
      }
      if (myToken !== token) break;
      if (result === 'cancelled') break;

      progress.markSentence(sectionId, index, us.length);
      progress.setPosition(sectionId, index);
      index += 1;
      drawHead(); highlight();

      if (cfg.pauseMs > 0) await sleep(cfg.pauseMs);
    }
  }

  async function start() {
    if (playing) return;
    speech.unlock();
    playing = true;
    token += 1;
    if (settings.get().keepAwake) wakeLock.enable();
    hideError();          // 前回の読み上げ失敗メッセージが残っていたら消す
    drawHead();
    loop(token);
  }

  function stop() {
    playing = false;
    token += 1;
    speech.cancel();
    wakeLock.disable();
    // 節末（index === us.length）のような範囲外の値を保存しない。
    // 丸めた値を index 自体にも反映し、表示（p-count）と保存内容を一致させる。
    index = clampSentIndex(index, utterances().length);
    progress.setPosition(sectionId, index);
    drawHead();
  }

  function moveTo(nextIndex) {
    const wasPlaying = playing;
    if (wasPlaying) stop();
    const us = utterances();
    index = Math.max(0, Math.min(nextIndex, Math.max(0, us.length - 1)));
    progress.setPosition(sectionId, index);
    drawHead(); highlight();
    if (wasPlaying) start();
  }

  function moveSection(delta) {
    const n = neighborSection(book.chapters, sectionId, delta);
    if (!n) return;
    const wasPlaying = playing;
    if (wasPlaying) stop();
    sectionId = n.section.id;
    index = 0;
    progress.setPosition(sectionId, index);
    drawHead(); drawBody();
    if (wasPlaying) start();
  }

  function changeRate(delta) {
    const next = settings.set({ rate: settings.get().rate + delta }).rate;
    drawHead();
    // 発話中の文には新しい速度が効かないため、いったん止めて同じ文から掛け直す。
    if (playing) { stop(); start(); }
    return next;
  }

  // ---- 配線 ----------------------------------------------------------
  $('p-play').addEventListener('click', () => (playing ? stop() : start()));
  $('p-back').addEventListener('click', () => moveTo(index - 1));
  $('p-fwd').addEventListener('click', () => moveTo(index + 1));
  $('p-prev-sec').addEventListener('click', () => moveSection(-1));
  $('p-next-sec').addEventListener('click', () => moveSection(1));
  $('p-slower').addEventListener('click', () => changeRate(-RATE_STEP));
  $('p-faster').addEventListener('click', () => changeRate(RATE_STEP));

  body.addEventListener('click', e => {
    const n = e.target.closest('[data-i]');
    if (n) moveTo(Number(n.dataset.i));
  });

  // 画面から離れたら必ず止める。Android Chrome は非表示だと読み上げを続けられない。
  // このリスナーは teardown で必ず外す。外さないと再レンダリングのたびに積み上がり、
  // 古いクロージャが残って停止処理が二重に走る。
  const onVisibility = () => { if (document.hidden && playing) stop(); };
  document.addEventListener('visibilitychange', onVisibility);

  drawHead();
  drawBody();
  speech.japaneseVoices().then(v => { voices = v; });

  // app.js が画面を切り替える前に呼ぶ。再生を止め、Wake Lock を解放し、
  // document レベルのリスナーを外す。これを怠ると、もくじタブに移っても
  // 読み上げが鳴り続け、進捗が書き換わり続ける。
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    if (playing) stop(); else { speech.cancel(); wakeLock.disable(); }
  };
}
