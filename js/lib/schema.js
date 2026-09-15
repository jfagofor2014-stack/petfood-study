// 取り込まれた教材データが使える形かを入口で検証する。
// 壊れたデータで先に進むと原因の分からない不具合になるため、ここで弾く。

export const SCHEMA_VERSION = 1;

const BLOCK_TYPES = new Set(['p', 'list', 'note', 'figure']);
const MAX_ERRORS = 10;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateData(obj) {
  const errors = [];
  const add = m => { if (errors.length < MAX_ERRORS) errors.push(m); };

  if (!isObj(obj)) return { ok: false, errors: ['教材ファイルの形式が正しくありません。'] };

  const meta = obj.meta;
  if (!isObj(meta)) add('meta がありません。');
  else if (meta.schema !== SCHEMA_VERSION) {
    add(`スキーマの版が違います（期待 ${SCHEMA_VERSION}、実際 ${meta.schema}）。`);
  }

  const chapters = obj.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    add('章が1つもありません。');
    return { ok: false, errors };
  }

  const sectionIds = new Set();
  // 問題の sectionId 検証・chapterNo 突き合わせに使う「節ID → 所属章の no」の対応表
  const sectionChapterNo = new Map();

  for (const ch of chapters) {
    if (!isObj(ch) || !ch.id) { add('章に id がありません。'); continue; }
    if (!Array.isArray(ch.sections) || ch.sections.length === 0) {
      add(`${ch.id} に節がありません。`);
      continue;
    }
    for (const sec of ch.sections) {
      if (!isObj(sec) || !sec.id) { add(`${ch.id} の節に id がありません。`); continue; }
      if (sectionIds.has(sec.id)) add(`節IDが重複しています: ${sec.id}`);
      sectionIds.add(sec.id);
      sectionChapterNo.set(sec.id, ch.no);

      if (!Array.isArray(sec.blocks)) { add(`${sec.id} に blocks がありません。`); continue; }
      for (const b of sec.blocks) {
        if (!isObj(b) || !BLOCK_TYPES.has(b.type)) {
          add(`${sec.id} に未知のブロック種別があります: ${isObj(b) ? b.type : String(b)}`);
          continue;
        }
        if (b.type === 'figure') {
          if (typeof b.img !== 'string' || b.img === '') {
            add(`${sec.id} の figure に img がありません。`);
          }
          if (!b.speak && !b.caption) add(`${sec.id} の figure に speak も caption もありません。`);
        } else if (!Array.isArray(b.sents) || b.sents.length === 0) {
          add(`${sec.id} の ${b.type} に sents がありません。`);
        }
      }
    }
  }

  const questions = Array.isArray(obj.questions) ? obj.questions : [];
  for (const q of questions) {
    if (!isObj(q) || !q.id) { add('問題に id がありません。'); continue; }
    if (!Array.isArray(q.choices) || q.choices.length < 2) { add(`${q.id} の選択肢が足りません。`); continue; }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) {
      add(`${q.id} の answer が選択肢の範囲外です。`);
    }
    if (!q.sectionId || !sectionIds.has(q.sectionId)) {
      add(`${q.id} が存在しない節を指しています: ${q.sectionId}`);
    } else if (!Number.isInteger(q.chapterNo) || q.chapterNo !== sectionChapterNo.get(q.sectionId)) {
      add(`${q.id} の chapterNo が節の所属章と一致しません。`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { meta: obj.meta, chapters, questions } };
}

export function summarize(data) {
  const chapters = data.chapters || [];
  const sections = chapters.reduce((n, c) => n + (c.sections ? c.sections.length : 0), 0);
  return {
    title: data.meta?.title ?? '',
    edition: data.meta?.edition ?? '',
    schema: data.meta?.schema ?? null,
    generatedAt: data.meta?.generatedAt ?? '',
    chapters: chapters.length,
    sections,
    questions: (data.questions || []).length,
  };
}
