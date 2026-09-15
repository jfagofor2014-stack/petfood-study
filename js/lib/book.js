// 節の中のブロックを読み上げ単位の1次元配列に潰し、章節を走査する。
// 再生位置を {節ID, 文index} の2値だけで表せるようにするための土台。

export function flattenSection(section) {
  const blocks = (section && section.blocks) || [];
  const out = [];

  blocks.forEach((b, blockIndex) => {
    if (b.type === 'figure') {
      out.push({
        i: out.length, blockIndex, type: 'figure',
        text: b.speak || b.caption || '',
        img: b.img, caption: b.caption,
      });
      return;
    }
    (b.sents || []).forEach(text => {
      out.push({ i: out.length, blockIndex, type: b.type, text });
    });
  });

  return out;
}

export function sectionLength(section) {
  return flattenSection(section).length;
}

export function listSections(chapters) {
  const out = [];
  for (const chapter of chapters || []) {
    for (const section of chapter.sections || []) {
      out.push({ chapter, section, index: out.length });
    }
  }
  return out;
}

export function findSection(chapters, sectionId) {
  return listSections(chapters).find(x => x.section.id === sectionId) || null;
}

export function neighborSection(chapters, sectionId, delta) {
  const all = listSections(chapters);
  const at = all.findIndex(x => x.section.id === sectionId);
  if (at < 0) return null;
  return all[at + delta] || null;
}

export function firstSectionId(chapters) {
  const all = listSections(chapters);
  return all.length ? all[0].section.id : null;
}
