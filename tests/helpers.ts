// テスト用：フォントの読み込み、ラスタライズ、複数エンジンでの読み取り
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
import { FontStore } from '../src/card/fonts';

const root = path.resolve(__dirname, '..');

export const fonts = new FontStore(async (p) => new Uint8Array(fs.readFileSync(path.join(root, 'public', p))));

let zxingReady: Promise<unknown> | null = null;
function initZxing() {
  if (!zxingReady) {
    const wasm = fs.readFileSync(path.join(root, 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'));
    zxingReady = prepareZXingModule({
      overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer },
      fireImmediately: true,
    });
  }
  return zxingReady;
}

/** SVG を指定幅（px）の PNG にする。blur はぼかし量（mm単位） */
export function rasterize(svg: string, widthPx: number, blurMm = 0): Uint8Array {
  const s = blurMm
    ? svg
        .replace(/(<svg[^>]*>)/, `$1<filter id="__b"><feGaussianBlur stdDeviation="${blurMm}"/></filter><g filter="url(#__b)">`)
        .replace(/<\/svg>$/, '</g></svg>')
    : svg;
  return new Uint8Array(new Resvg(s, { fitTo: { mode: 'width', value: widthPx }, background: 'white' }).render().asPng());
}

export async function decodeAll(png: Uint8Array): Promise<{ zxing: string | null; jsqr: string | null }> {
  await initZxing();
  const z = await readBarcodes(png, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
  const img = PNG.sync.read(Buffer.from(png));
  const j = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  return { zxing: z[0]?.text ?? null, jsqr: j?.data ?? null };
}

export const outDir = path.join(root, 'tests', '__output__');
export function saveOutput(name: string, data: Uint8Array | string) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, name), data);
}
