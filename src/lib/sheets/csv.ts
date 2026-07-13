/**
 * 最小限の CSV パーサー（RFC 4180 準拠の主要ケースに対応）。
 *
 * Google スプレッドシートの gviz CSV エンドポイント（`tqx=out:csv`）が返す形式
 * （ダブルクォート囲み・エスケープされた `""`・フィールド内改行・CRLF/LF 改行）を
 * 想定した、外部ライブラリに依存しない純粋関数。`server-only` を import しないため
 * ユニットテストから直接検証できる（[[feedback-server-only-testability]]）。
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // 末尾の改行のみのトークンを最終行として誤って push しないよう、
  // 「現在のフィールド/行に何らかの内容が来たか」を追跡する。
  let rowHasContent = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    rowHasContent = false;
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      rowHasContent = true;
      continue;
    }

    if (char === ",") {
      pushField();
      rowHasContent = true;
      continue;
    }

    if (char === "\r") {
      // CRLF の CR は無視し、後続の LF で改行処理する
      continue;
    }

    if (char === "\n") {
      pushRow();
      continue;
    }

    field += char;
    rowHasContent = true;
  }

  // 最後の行（末尾に改行がない場合）を確定する
  if (rowHasContent || field !== "" || row.length > 0) {
    pushRow();
  }

  return rows;
}
