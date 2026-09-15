// 教材由来の文字列を innerHTML に入れる前に無害化する共通処理。
// 教材はJSONファイルとして利用者間で受け渡される可能性があるため、
// 画面側のどこであっても innerHTML に入れる前に必ずこれを通すこと。

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ENTITIES[c]);
}
