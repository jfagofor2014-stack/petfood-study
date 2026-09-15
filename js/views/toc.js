import { findSection, sectionLength } from '../lib/book.js';
import { escapeHtml as esc } from '../lib/html.js';
import { openPlayerAt } from './player.js';

const LABEL = { unread: '未読', reading: '途中', done: '読了' };

export function renderToc(root, ctx, nav) {
  const { book, progress } = ctx;

  const pos = progress.getPosition();
  const at = pos ? findSection(book.chapters, pos.sectionId) : null;
  const { done, total } = progress.doneCount(book.chapters);

  // 教材の編集で節の文数が変わっていても、保存済みの sentIndex が
  // その節の文数を超えて表示されないように丸める（下限0・上限は 文数-1）。
  // 表示（resumeSent）と「続きを読む」ボタンが開く位置（resumeAt）は
  // 必ず同じ丸め値から作り、ずれないようにする。
  const resumeLen = at ? sectionLength(at.section) : 0;
  const resumeAt = at ? Math.max(0, Math.min(pos.sentIndex, Math.max(resumeLen - 1, 0))) : 0;
  const resumeSent = resumeAt + 1;
  // 文数0の節（本文がまだ無い節）で「1文目から」と表示されないようにする。
  const resumeLabel = resumeLen === 0 ? '本文がありません' : `${resumeSent}文目から`;

  const resume = at ? `
    <div class="card" id="t-resume">
      <div class="muted">前回の続きから</div>
      <div id="t-resume-title">第${esc(at.chapter.no)}章 ${esc(at.chapter.no)}-${esc(at.section.no)} ${esc(at.section.title)}</div>
      <div class="muted">${resumeLabel}</div>
      <button class="btn" id="t-resume-btn" style="margin-top:10px">続きを読む</button>
    </div>` : '';

  root.innerHTML = `
    ${resume}
    <div class="card">
      <div class="muted">全体の進捗</div>
      <div class="bar" style="margin:8px 0 6px"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div>
      <div class="muted">${done} / ${total} 節</div>
    </div>
    ${book.chapters.map(ch => chapterHtml(ch, progress)).join('')}
  `;

  const btn = root.querySelector('#t-resume-btn');
  if (btn) btn.addEventListener('click', () => open(pos.sectionId, resumeAt));

  // root（#view）はタブ切り替えのたびに innerHTML だけ空にされ、要素自体は
  // 使い回される。ここに付けたリスナーを teardown で外さないと、もくじタブに
  // 出入りするたびに積み重なり、1回のタップで複数回 open() が走ってしまう。
  const onClick = e => {
    const head = e.target.closest('.t-ch-head');
    if (head) { head.parentElement.classList.toggle('is-open'); return; }
    const row = e.target.closest('.t-sec');
    if (row) open(row.dataset.id, Number(row.dataset.at || 0));
  };
  root.addEventListener('click', onClick);

  function open(sectionId, sentIndex) {
    openPlayerAt(sectionId, sentIndex);
    nav.showTab('player');
  }

  return () => root.removeEventListener('click', onClick);
}

function chapterHtml(ch, progress) {
  const rate = Math.round(progress.chapterRate(ch) * 100);
  const rows = (ch.sections || []).map(sec => {
    const p = progress.getSection(sec.id);
    const len = sectionLength(sec);
    // maxSent は保存後に教材が編集されて文数が減ることがあるため、
    // 表示・再開位置ともに現在の文数に収まるよう丸める（下限0・上限は 文数-1）。
    const at = p.state === 'reading' ? Math.max(0, Math.min(p.maxSent, Math.max(len - 1, 0))) : 0;
    const sub = len === 0 ? '0 文' : (p.state === 'reading' ? `${at + 1} / ${len} 文` : `${len} 文`);
    return `<div class="t-sec" data-id="${esc(sec.id)}" data-at="${at}">
      <span class="t-badge is-${p.state}">${LABEL[p.state]}</span>
      <span class="t-sec-title">${esc(ch.no)}-${esc(sec.no)} ${esc(sec.title)}</span>
      <span class="muted t-sec-sub">${sub}</span>
    </div>`;
  }).join('');

  return `<div class="card t-ch${rate === 100 ? ' is-done' : ''}">
    <div class="t-ch-head">
      <div>
        <div class="t-ch-title">第${esc(ch.no)}章 ${esc(ch.title)}</div>
        <div class="bar" style="margin-top:8px"><i style="width:${rate}%"></i></div>
      </div>
      <div class="muted t-ch-rate">${rate}%</div>
    </div>
    <div class="t-secs">${rows}</div>
  </div>`;
}
