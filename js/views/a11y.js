// 画面の中身を innerHTML で差し替える作りのため、押したボタンが消えると
// フォーカスが body に落ち、スクリーンリーダーの利用者が迷子になる。
// 次に読むべき場所へフォーカスを移す。目で見ている人の読み位置は動かさない。

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

export function moveFocus(el) {
  if (!el) return;
  // もともとフォーカスできない要素（div など）は、プログラムからだけ移せるようにする。
  if (!el.matches(FOCUSABLE)) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}
