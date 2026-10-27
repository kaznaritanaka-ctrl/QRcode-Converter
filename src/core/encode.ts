import QRCode from 'qrcode';
import type { EclLevel, ModuleKind, QrMatrix } from '../types';

/** バージョンごとのアライメントパターン中心（JIS X 0510 附属書E） */
function alignmentCenters(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const last = size - 7;
  const step =
    version === 32 ? 26 : Math.ceil((last - 6) / (2 * count - 2)) * 2;
  const pos = [last];
  for (let i = 1; i < count - 1; i++) pos.unshift(last - i * step);
  pos.unshift(6);
  return pos;
}

/**
 * テキストをQRのモジュール行列に変換し、各モジュールの種別を判定する。
 * 文字列は UTF-8 のバイトモード等、qrcode ライブラリが自動で最適化する。
 */
export function encode(text: string, ecl: EclLevel): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecl });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const version = qr.version;
  const kinds: ModuleKind[] = new Array(n * n).fill('data');

  const set = (r: number, c: number, k: ModuleKind) => {
    if (r >= 0 && c >= 0 && r < n && c < n) kinds[r * n + c] = k;
  };

  // 位置検出パターン（7×7）と分離パターン（周囲1マス）
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = r0 - 1; r <= r0 + 7; r++)
      for (let c = c0 - 1; c <= c0 + 7; c++) {
        const inner = r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
        set(r, c, inner ? 'finder' : 'separator');
      }
  }
  // タイミングパターン
  for (let i = 8; i < n - 8; i++) {
    set(6, i, 'timing');
    set(i, 6, 'timing');
  }
  // アライメントパターン（位置検出パターンと重なるものを除く）
  const centers = alignmentCenters(version);
  for (const r of centers)
    for (const c of centers) {
      const onFinder = (r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8);
      if (onFinder) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, 'alignment');
    }
  // 形式情報・型番情報・暗モジュール
  for (let i = 0; i <= 8; i++) {
    if (kinds[8 * n + i] === 'data') set(8, i, 'format');
    if (kinds[i * n + 8] === 'data') set(i, 8, 'format');
  }
  for (let i = 0; i < 8; i++) {
    set(8, n - 1 - i, 'format');
    set(n - 1 - i, 8, 'format');
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        set(i, n - 11 + j, 'format');
        set(n - 11 + j, i, 'format');
      }
  }

  return {
    size: n,
    version,
    ecl,
    isDark: (r, c) => r >= 0 && c >= 0 && r < n && c < n && data[r * n + c] === 1,
    kind: (r, c) => kinds[r * n + c],
  };
}

/** 誤り訂正レベルごとの、おおよその訂正能力（データ全体に対する割合） */
export const ECL_CAPACITY: Record<EclLevel, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };
