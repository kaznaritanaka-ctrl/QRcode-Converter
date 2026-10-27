import type { Shape, TextBox } from '../types';
import { PT_TO_MM } from '../types';
import type { FkFont } from './fonts';

/** CJKフォントで、文字サイズに対する「1行目の上端からベースラインまで」の比 */
const ASCENT_RATIO = 0.88;

export interface TextLayout {
  shape: Shape | null;
  /** 文字の外枠（仕上がり座標、mm） */
  box: { x: number; y: number; w: number; h: number };
}

const round = (s: string) => s.replace(/-?\d+\.\d{4,}/g, (v) => Number(v).toFixed(3));

/**
 * テキストボックスの文字をアウトライン（SVGパス）に変換する。
 * offsetX/offsetY は仕上がり座標→シーン座標のずれ（＝塗り足し）。
 */
export function layoutText(tb: TextBox, font: FkFont, offsetX = 0, offsetY = 0): TextLayout {
  const size = tb.sizePt * PT_TO_MM;
  const scale = size / font.unitsPerEm;
  const lineH = size * tb.lineHeight;
  const lines = tb.text.split('\n');

  const runs = lines.map((line) => {
    const run = font.layout(line);
    const width = run.positions.reduce((w, p) => w + p.xAdvance, 0) * scale;
    return { run, width };
  });
  const maxW = Math.max(0, ...runs.map((r) => r.width));
  const blockH = lines.length === 0 ? 0 : size + (lines.length - 1) * lineH;
  const left = tb.align === 'left' ? tb.x : tb.align === 'center' ? tb.x - maxW / 2 : tb.x - maxW;

  const parts: string[] = [];
  runs.forEach(({ run, width }, i) => {
    const lineLeft = tb.align === 'left' ? tb.x : tb.align === 'center' ? tb.x - width / 2 : tb.x - width;
    const baseline = tb.y + ASCENT_RATIO * size + i * lineH;
    let pen = 0;
    run.glyphs.forEach((g, j) => {
      const pos = run.positions[j];
      const gx = offsetX + lineLeft + (pen + pos.xOffset) * scale;
      const gy = offsetY + baseline - pos.yOffset * scale;
      const d = g.path.scale(scale, -scale).translate(gx, gy).toSVG();
      if (d) parts.push(round(d));
      pen += pos.xAdvance;
    });
  });

  return {
    shape: parts.length ? { type: 'path', d: parts.join(''), fill: tb.color } : null,
    box: { x: left, y: tb.y, w: maxW, h: blockH },
  };
}
