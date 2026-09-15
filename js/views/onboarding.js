import { validateData, summarize } from '../lib/schema.js';
import { saveBook } from '../lib/db.js';

export function renderOnboarding(root, { onLoaded }) {
  root.innerHTML = `
    <h1>ペットフード販売士 学習</h1>
    <p class="muted">
      このアプリを使うには、お手持ちのテキストから作った教材ファイル
      <code>petfood-data.json</code> が必要です。
      教材は端末の中だけに保存され、外部には送信されません。
    </p>
    <div class="card">
      <button class="btn" id="pick">教材ファイルを選ぶ</button>
      <input type="file" id="file" accept="application/json,.json" hidden>
      <p class="muted" id="status" style="margin-bottom:0"></p>
    </div>
    <ol>
      <li>教材ファイルを端末にダウンロードしておく</li>
      <li>上のボタンから選ぶ</li>
      <li>次回からはそのまま起動します</li>
    </ol>
  `;

  const file = root.querySelector('#file');
  const status = root.querySelector('#status');
  const pick = root.querySelector('#pick');

  pick.addEventListener('click', () => file.click());

  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    // 選択直後に値を空にしておく。こうしないと同じファイルを選び直したときに
    // input の値が変化せず change イベントが発火しないため、
    // 一度失敗した後に同じファイルで再挑戦できなくなる。
    file.value = '';
    if (!f) return;

    status.className = 'muted';
    status.textContent = '読み込んでいます…';

    let parsed;
    try {
      parsed = JSON.parse(await f.text());
    } catch {
      status.className = 'error';
      status.textContent = 'JSONとして読めませんでした。ファイルを確認してください。';
      return;
    }

    const result = validateData(parsed);
    if (!result.ok) {
      status.className = 'error';
      status.textContent = '教材ファイルに問題があります: ' + result.errors.join(' / ');
      return;
    }

    try {
      await saveBook(result.data);
    } catch (err) {
      // IndexedDB が使えない・容量不足などで保存に失敗した場合も、
      // 画面が「読み込んでいます…」のまま固まらないようにする。
      status.className = 'error';
      status.textContent = '端末への保存に失敗しました。ブラウザの設定でサイトのデータ保存が許可されているか確認してください。';
      console.error(err);
      return;
    }

    const s = summarize(result.data);
    status.className = 'muted';
    status.textContent = `${s.title} ${s.edition}／${s.chapters}章 ${s.sections}節 問題${s.questions}問を取り込みました。`;
    onLoaded(result.data);
  });
}
