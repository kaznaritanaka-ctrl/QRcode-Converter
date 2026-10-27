// ブラウザ内での読み取り検証（ZXing ＋ jsQR）。重いので初回の検証時に読み込む。
import type { CardScene } from '../types';
import { renderToCanvas } from '../output/canvas';
import type { DecodeResult } from './preflight';

type ZX = typeof import('zxing-wasm/reader');
let zx: Promise<ZX> | null = null;
let jsqr: Promise<typeof import('jsqr').default> | null = null;

function loadZxing(): Promise<ZX> {
  if (!zx)
    zx = Promise.all([import('zxing-wasm/reader'), import('zxing-wasm/reader/zxing_reader.wasm?url')]).then(([mod, url]) => {
      mod.prepareZXingModule({
        overrides: { locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? url.default : prefix + p) },
      });
      return mod;
    });
  return zx;
}
function loadJsqr() {
  if (!jsqr) jsqr = import('jsqr').then((m) => m.default);
  return jsqr;
}

async function decodeImage(img: ImageData, expected: string): Promise<string[]> {
  const [z, j] = await Promise.all([loadZxing(), loadJsqr()]);
  const engines: string[] = [];
  try {
    const r = await z.readBarcodes(img, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
    if (r[0]?.text === expected) engines.push('ZXing');
  } catch {
    /* 読み取り失敗は「読めない」扱い */
  }
  try {
    const r = j(img.data, img.width, img.height);
    if (r?.data === expected) engines.push('jsQR');
  } catch {
    /* 同上 */
  }
  return engines;
}

function blurred(src: OffscreenCanvas, radiusPx: number): ImageData {
  const c = new OffscreenCanvas(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.filter = `blur(${radiusPx}px)`;
  ctx.drawImage(src, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

const imageOf = (c: OffscreenCanvas) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height);

/**
 * 名刺の面を、入稿解像度（350dpi）と低解像度（200・150dpi、ぼかし）で画像化して読む。
 * 1つ目の条件が「必須」、残りは遠目・ピンぼけの目安。
 */
export async function verifyScene(scene: CardScene, expected: string): Promise<DecodeResult> {
  const conds: Array<{ label: string; img: () => ImageData }> = [
    { label: '350dpi', img: () => imageOf(renderToCanvas(scene, 350, { includeBleed: false })) },
    { label: '200dpi', img: () => imageOf(renderToCanvas(scene, 200, { includeBleed: false })) },
    { label: '150dpi', img: () => imageOf(renderToCanvas(scene, 150, { includeBleed: false })) },
    { label: 'ぼかし', img: () => blurred(renderToCanvas(scene, 200, { includeBleed: false }), 2) },
  ];
  const byCondition: DecodeResult['byCondition'] = [];
  for (const c of conds) byCondition.push({ label: c.label, engines: await decodeImage(c.img(), expected) });
  return { byCondition };
}
