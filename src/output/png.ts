/**
 * PNG に解像度情報（pHYs チャンク）を書き込む。
 * 印刷ソフトで「実寸」を選んだときに、指定の dpi で 91×55mm として扱われるようにする。
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function withPhys(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  const chunk = new Uint8Array(12 + 9);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // 単位：メートル
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));

  // 既存の pHYs を除き、IHDR の直後に挿入する
  const out: Uint8Array[] = [png.subarray(0, 8)];
  let p = 8;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (p < png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    const end = p + 12 + len;
    if (type !== 'pHYs') out.push(png.subarray(p, end));
    if (type === 'IHDR') out.push(chunk);
    p = end;
  }
  const total = out.reduce((n, a) => n + a.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const a of out) {
    res.set(a, o);
    o += a.length;
  }
  return res;
}

/** PNG から pHYs の dpi を読む（テスト用） */
export function readPhysDpi(png: Uint8Array): number | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8;
  while (p < png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    if (type === 'pHYs') return Math.round(view.getUint32(p + 8) * 0.0254);
    p += 12 + len;
  }
  return null;
}
