// テスト画面。節ごと・章まとめ・苦手順の4択テストを出題し、即時採点する。
// 成績は ctx.quizResults（js/lib/quizresults.js）を通してのみ読み書きする。

import { pickForSection, pickForChapter, pickWeak } from '../lib/quizpick.js';
import { listSections, findSection } from '../lib/book.js';
import { openPlayerAt } from './player.js';
import { escapeHtml as esc } from '../lib/html.js';

const PER_SECTION = 5;
const PER_CHAPTER = 10;
const PER_WEAK = 10;

export function renderQuiz(root, ctx, nav) {
  const { book, quizResults } = ctx;
  const questions = book.questions || [];
  const readResults = () => quizResults.all();
  const record = (questionId, ok) => quizResults.record(questionId, ok);

  if (questions.length === 0) {
    root.innerHTML = `<div class="card">
      <div>この教材には問題が入っていません。</div>
      <p class="muted">教材ファイルに questions を入れると、ここで確認テストができます。</p>
    </div>`;
    return;
  }

  menu();

  // ---- メニュー：何を出題するか選ぶ ------------------------------------
  function menu() {
    const results = readResults();
    const weak = pickWeak(questions, results, PER_WEAK);
    // 問題が1問もない節はボタンを出さない（空の出題セットで run() に入らないよう、
    // ここで候補から除いておく）。
    const sections = listSections(book.chapters)
      .filter(x => questions.some(q => q.sectionId === x.section.id));

    root.innerHTML = `
      <div class="card">
        <div class="q-note">この問題は公式の過去問ではありません。テキストの範囲から作成した予想問題です。</div>
      </div>
      <div class="card">
        <button class="btn" id="q-mock">本番形式の模擬試験（25問・60分）</button>
        <p class="muted">答えを見ずに25問を通して解き、最後にまとめて採点します。</p>
      </div>
      <div class="card">
        <button class="btn" id="q-weak" ${weak.length ? '' : 'disabled'}>
          苦手な問題を解く（${weak.length}問）
        </button>
        <p class="muted">間違えた問題と未挑戦の問題から出します。</p>
      </div>
      <div class="card">
        <div class="muted">章まとめ</div>
        ${book.chapters.map(ch => {
          const n = questions.filter(q => q.chapterNo === ch.no).length;
          return n ? `<button class="q-pick" data-kind="chapter" data-key="${esc(ch.no)}">
            第${esc(ch.no)}章 ${esc(ch.title)}<span class="muted">${n}問</span></button>` : '';
        }).join('')}
      </div>
      <div class="card">
        <div class="muted">節ごと</div>
        ${sections.map(x => {
          const n = questions.filter(q => q.sectionId === x.section.id).length;
          return `<button class="q-pick" data-kind="section" data-key="${esc(x.section.id)}">
            ${esc(x.chapter.no)}-${esc(x.section.no)} ${esc(x.section.title)}<span class="muted">${n}問</span></button>`;
        }).join('')}
      </div>
    `;

    root.querySelector('#q-mock').addEventListener('click', () => nav.showTab('mock'));
    root.querySelector('#q-weak').addEventListener('click', () => run(weak));
    for (const b of root.querySelectorAll('.q-pick')) {
      b.addEventListener('click', () => {
        const set = b.dataset.kind === 'chapter'
          ? pickForChapter(questions, Number(b.dataset.key), PER_CHAPTER)
          : pickForSection(questions, b.dataset.key, PER_SECTION);
        run(set);
      });
    }
  }

  // ---- 出題〜採点〜結果 --------------------------------------------------
  // menu() 側で0問の節・章はボタンごと出さないため通常は素通りしないが、
  // 念のため空セットでは出題に入らない。
  function run(set) {
    if (!set.length) return;
    let at = 0;
    const log = [];
    // 同じ問題で選択肢を素早く2回タップしても record() が二重に走らないよう、
    // 1問ごとに答え済みかどうかをこのフラグで管理する（show() のたびにリセット）。
    let locked = false;
    show();

    function show() {
      locked = false;
      const q = set[at];
      root.innerHTML = `
        <div class="card">
          <div class="muted">${at + 1} / ${set.length}　第${esc(q.chapterNo)}章（p.${esc(q.page)}）</div>
          <div class="q-text">${esc(q.question)}</div>
        </div>
        <div id="q-choices">
          ${q.choices.map((c, i) => `<button class="q-choice" data-i="${i}">${esc(c)}</button>`).join('')}
        </div>
        <div id="q-after"></div>
      `;

      for (const b of root.querySelectorAll('.q-choice')) {
        b.addEventListener('click', () => answer(q, Number(b.dataset.i)));
      }
    }

    function answer(q, chosen) {
      if (locked) return;      // 二重タップ対策：1問につき1回しか採点しない
      locked = true;

      const ok = chosen === q.answer;
      record(q.id, ok);
      log.push({ q, ok });

      for (const b of root.querySelectorAll('.q-choice')) {
        const i = Number(b.dataset.i);
        b.disabled = true;
        if (i === q.answer) b.classList.add('is-right');
        else if (i === chosen) b.classList.add('is-wrong');
      }

      root.querySelector('#q-after').innerHTML = `
        <div class="card">
          <div class="q-verdict ${ok ? 'is-right' : 'is-wrong'}">${ok ? '正解' : '不正解'}</div>
          <p>${esc(q.explanation)}</p>
          <div class="s-btns">
            <button class="btn ghost sm" id="q-goto">この節を読む</button>
            <button class="btn" id="q-next">${at + 1 < set.length ? '次の問題' : '結果を見る'}</button>
          </div>
        </div>
      `;

      root.querySelector('#q-goto').addEventListener('click', () => {
        openPlayerAt(q.sectionId, 0);
        nav.showTab('player');
      });
      root.querySelector('#q-next').addEventListener('click', () => {
        at += 1;
        if (at < set.length) show(); else result();
      });
      root.querySelector('#q-after').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function result() {
      const right = log.filter(x => x.ok).length;
      const wrongList = log.filter(x => !x.ok);

      // 同じ節の問題を複数間違えても一覧に同じ行が重複して出ないよう、
      // 節IDごとにまとめる（件数はまとめて表示する）。
      const wrongBySection = [];
      const bySectionId = new Map();
      for (const x of wrongList) {
        const sectionId = x.q.sectionId;
        let entry = bySectionId.get(sectionId);
        if (!entry) {
          entry = { sectionId, count: 0 };
          bySectionId.set(sectionId, entry);
          wrongBySection.push(entry);
        }
        entry.count += 1;
      }

      root.innerHTML = `
        <div class="card">
          <div class="q-score">${right} / ${log.length} 問正解</div>
          <div class="bar" style="margin-top:10px"><i style="width:${Math.round(right / log.length * 100)}%"></i></div>
        </div>
        ${wrongBySection.length ? `<div class="card">
          <div class="muted">間違えた問題</div>
          ${wrongBySection.map(x => {
            const f = findSection(book.chapters, x.sectionId);
            const label = f ? `${esc(f.chapter.no)}-${esc(f.section.no)} ${esc(f.section.title)}` : esc(x.sectionId);
            return `<button class="q-pick" data-goto="${esc(x.sectionId)}">${label}<span class="muted">${x.count}問</span></button>`;
          }).join('')}
        </div>` : '<div class="card">全問正解です。</div>'}
        <button class="btn ghost" id="q-back">テストの選択に戻る</button>
      `;

      for (const b of root.querySelectorAll('[data-goto]')) {
        b.addEventListener('click', () => {
          openPlayerAt(b.dataset.goto, 0);
          nav.showTab('player');
        });
      }
      root.querySelector('#q-back').addEventListener('click', menu);
    }
  }
}
