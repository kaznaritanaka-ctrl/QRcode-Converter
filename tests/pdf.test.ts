import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { PDFDocument, PDFName, PDFArray, PDFNumber } from 'pdf-lib';
import { defaultCard, defaultQrOptions } from '../src/defaults';
import { buildCard } from '../src/card/scene';
import { scenesToPdf } from '../src/output/pdf';
import { sceneToSvg } from '../src/output/svg';
import { decodeAll, fonts, outDir, rasterize, saveOutput } from './helpers';

const PT = 72 / 25.4;

/** PDF のページ内容（圧縮ストリーム）を展開して連結する */
function contentStreams(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      out.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'));
    } catch {
      out.push(m[1]);
    }
  }
  return out.join('\n');
}
const boxMm = (page: ReturnType<PDFDocument['getPage']>, name: string) => {
  const arr = page.node.get(PDFName.of(name)) as PDFArray;
  return arr.asArray().map((n) => Number(((n as PDFNumber).asNumber() / PT).toFixed(2)));
};

function hasPdftoppm() {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('入稿用PDF', () => {
  it('片面：97×61mm、仕上がり枠は四辺3mm内側、フォント非埋め込み、色はCMYK', async () => {
    const card = defaultCard();
    const q = { ...defaultQrOptions(), text: 'https://note.com/tanaka936' };
    const sides = await buildCard(card, q, fonts);
    const bytes = await scenesToPdf(sides.map((s) => s.scene));
    saveOutput('sample_front.pdf', bytes);
    saveOutput('sample_front_guides.svg', sceneToSvg(sides[0].scene, { includeBleed: true, guides: true }));
    saveOutput('sample_front.png', rasterize(sceneToSvg(sides[0].scene, { includeBleed: true, guides: true }), 1100));

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    const { width, height } = page.getSize();
    expect(width / PT).toBeCloseTo(97, 1);
    expect(height / PT).toBeCloseTo(61, 1);
    expect(boxMm(page, 'TrimBox')).toEqual([3, 3, 94, 58]);
    expect(boxMm(page, 'BleedBox')).toEqual([0, 0, 97, 61]);

    const raw = Buffer.from(bytes).toString('latin1');
    expect(raw).not.toMatch(/\/FontFile/); // フォントを埋め込んでいない（文字はアウトライン）
    const content = contentStreams(bytes);
    expect(content).not.toMatch(/\s(rg|RG)\s/); // RGBの色指定がない
    expect(content).toMatch(/\s0 0 0 1 k\s/); // 黒は K100（CMYKの塗り演算子 k）
  });

  it('両面：2ページになる', async () => {
    const card = { ...defaultCard(), duplex: true };
    const sides = await buildCard(card, defaultQrOptions(), fonts);
    const bytes = await scenesToPdf(sides.map((s) => s.scene));
    saveOutput('sample_duplex.pdf', bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it.runIf(hasPdftoppm())('PDFを画像化してもQRが読める（350dpiは必須、低解像度は大半で読める）', async () => {
    const card = defaultCard();
    const text = 'https://note.com/tanaka936';
    const sides = await buildCard(card, { ...defaultQrOptions(), text }, fonts);
    const bytes = await scenesToPdf(sides.map((s) => s.scene));
    const pdfPath = path.join(outDir, 'decode_check.pdf');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(pdfPath, bytes);
    const ok: Record<number, boolean> = {};
    for (const dpi of [350, 250, 200, 175, 150, 120]) {
      const base = path.join(outDir, `decode_check_${dpi}`);
      execFileSync('pdftoppm', ['-r', String(dpi), '-png', '-singlefile', pdfPath, base]);
      const r = await decodeAll(new Uint8Array(fs.readFileSync(`${base}.png`)));
      ok[dpi] = r.zxing === text || r.jsqr === text;
    }
    // 入稿解像度（350dpi）は必ず読めること
    expect(ok[350]).toBe(true);
    // 低解像度（遠目・ピンぼけ相当）は5段階中4段階以上で読めること（アプリの入稿チェックの「△」に相当）
    const low = [250, 200, 175, 150, 120].filter((d) => ok[d]).length;
    expect(low, JSON.stringify(ok)).toBeGreaterThanOrEqual(4);
  });
});
