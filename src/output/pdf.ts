import { PDFDocument, cmyk as pdfCmyk, LineCapStyle } from 'pdf-lib';
import type { CardScene, Cmyk, Shape } from '../types';

const PT = 72 / 25.4; // mm → pt

const col = (c: Cmyk) => pdfCmyk(c.c, c.m, c.y, c.k);

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

/**
 * シーンを入稿用PDFにする。
 * - ページは塗り足し込み（例：97×61mm）。TrimBox＝仕上がり、BleedBox＝ページ全体
 * - 色はすべて CMYK（黒は K100）
 * - 文字はすでにアウトライン（パス）になっているので、フォントは埋め込まない
 * 両面のときは1ページ目＝表、2ページ目＝裏。
 */
export async function scenesToPdf(scenes: CardScene[], title = '名刺'): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('QRcode-Converter');
  doc.setProducer('QRcode-Converter (pdf-lib)');

  for (const scene of scenes) {
    const b = scene.bleed;
    const Wmm = scene.trim.w + b * 2;
    const Hmm = scene.trim.h + b * 2;
    const page = doc.addPage([Wmm * PT, Hmm * PT]);
    page.setBleedBox(0, 0, Wmm * PT, Hmm * PT);
    page.setTrimBox(b * PT, b * PT, scene.trim.w * PT, scene.trim.h * PT);

    // シーン座標（左上原点・mm）→ PDF座標（左下原点・pt）
    const X = (x: number) => x * PT;
    const Y = (y: number) => (Hmm - y) * PT;

    for (const s of scene.shapes) drawShape(page, s, X, Y, Hmm);
  }
  return doc.save();
}

function drawShape(
  page: ReturnType<PDFDocument['addPage']>,
  s: Shape,
  X: (x: number) => number,
  Y: (y: number) => number,
  Hmm: number,
) {
  switch (s.type) {
    case 'rect':
      if (s.rx) page.drawSvgPath(roundedRectPath(s.x, s.y, s.w, s.h, s.rx), { x: 0, y: Hmm * PT, scale: PT, color: col(s.fill) });
      else page.drawRectangle({ x: X(s.x), y: Y(s.y + s.h), width: s.w * PT, height: s.h * PT, color: col(s.fill) });
      return;
    case 'circle':
      page.drawCircle({
        x: X(s.cx),
        y: Y(s.cy),
        size: s.r * PT,
        color: col(s.fill),
        ...(s.stroke ? { borderColor: col(s.stroke.color), borderWidth: s.stroke.width * PT } : {}),
      });
      return;
    case 'line':
      page.drawLine({
        start: { x: X(s.x1), y: Y(s.y1) },
        end: { x: X(s.x2), y: Y(s.y2) },
        thickness: s.width * PT,
        color: col(s.color),
        lineCap: LineCapStyle.Butt,
      });
      return;
    case 'path':
      if (s.transform)
        page.drawSvgPath(s.d, { x: X(s.transform.x), y: Y(s.transform.y), scale: s.transform.scale * PT, color: col(s.fill) });
      else page.drawSvgPath(s.d, { x: 0, y: Hmm * PT, scale: PT, color: col(s.fill) });
      return;
  }
}
