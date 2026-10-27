import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { encode } from '../src/core/encode';

/** 数字モード・誤り訂正Lで、指定バージョンになる長さの文字列を作って符号化する */
function encodeAtVersion(v: number) {
  for (let len = 1; len < 7100; len++) {
    const ref = QRCode.create('1'.repeat(len), { errorCorrectionLevel: 'L' });
    if (ref.version === v) return encode('1'.repeat(len), 'L');
    if (ref.version > v) break;
  }
  throw new Error(`version ${v} not reachable`);
}

describe('encode', () => {
  it('モジュール行列がライブラリと一致する（日本語を含むURL）', () => {
    const text = 'https://example.com/あいう';
    const m = encode(text, 'M');
    const ref = QRCode.create(text, { errorCorrectionLevel: 'M' });
    expect(m.size).toBe(ref.modules.size);
    for (let r = 0; r < m.size; r++)
      for (let c = 0; c < m.size; c++) expect(m.isDark(r, c)).toBe(ref.modules.get(r, c) === 1);
  });

  it.each([1, 2, 6, 7, 10, 25])('バージョン%iで、機能パターンの判定がライブラリの予約領域と一致する', (v) => {
    const mine = encodeAtVersion(v);
    expect(mine.version).toBe(v);
    const ref = QRCode.create('1', { errorCorrectionLevel: 'L', version: v });
    const n = ref.modules.size;
    const reserved = (ref.modules as unknown as { reservedBit: Uint8Array }).reservedBit;
    let mismatch = 0;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if ((mine.kind(r, c) !== 'data') !== (reserved[r * n + c] === 1)) mismatch++;
    expect(mismatch).toBe(0);
  });

  it('三隅の位置検出パターンは7×7が3つ', () => {
    const m = encode('https://example.com', 'M');
    let count = 0;
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.kind(r, c) === 'finder') count++;
    expect(count).toBe(49 * 3);
  });
});
