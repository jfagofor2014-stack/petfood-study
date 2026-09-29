// localStorage は上限超過・プライベートモード・端末のポリシーで例外を投げる。
// 進捗・設定・成績・模試のモジュールはいずれも storage を引数で受け取る作りなので、
// ここで1回だけ包んで渡せば、4モジュールに手を入れずに全ての書き込みを守れる。
//
// どのメソッドも例外を投げない。書き込みが失敗したことは onChange で画面へ知らせ、
// 「保存できていない」ことを利用者が分かるようにする。黙って記録が消えるのが最悪の結末。

const NOOP = () => {};

export function createSafeStorage(storage, onChange = NOOP) {
  let failing = false;

  // 状態が変わったときだけ知らせる。模試は5秒ごとに書くため、
  // 毎回知らせると画面側が不必要に描き直される。
  function setFailing(next) {
    if (next === failing) return;
    failing = next;
    // 画面側の不具合で保存の流れを止めないよう、通知の失敗は握りつぶす。
    try { onChange(failing); } catch { /* 通知できなくても保存は続ける */ }
  }

  return {
    getItem(key) {
      // 読み出しの失敗は「値が無い」と同じ扱いでよい。呼び出し側は既定値で動ける。
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },

    setItem(key, value) {
      try {
        storage.setItem(key, value);
        setFailing(false);
      } catch {
        setFailing(true);
      }
    },

    removeItem(key) {
      // 消せなくても読み出し側の妥当性検査が壊れた値を弾くため、失敗を状態に反映しない。
      // 容量超過では removeItem は成功するのが普通で、これだけが失敗する状況では
      // 前後の setItem が失敗して状態が立つ。
      try {
        storage.removeItem(key);
      } catch { /* 消せなくても先へ進む */ }
    },

    isFailing() {
      return failing;
    },
  };
}
