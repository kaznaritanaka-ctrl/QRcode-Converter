import type { CardSide, Orientation, QrPlacement, TextBox } from '../types';
import { SAFE_REQUIRED, PT_TO_MM } from '../types';
import { BLACK } from '../core/color';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function trimSize(o: Orientation): { w: number; h: number } {
  return o === 'landscape' ? { w: 91, h: 55 } : { w: 55, h: 91 };
}

/** パネルの最大サイズ（短い辺から安全域を引いた値） */
export function maxPanelSize(o: Orientation): number {
  const t = trimSize(o);
  return Math.min(t.w, t.h) - SAFE_REQUIRED * 2;
}

/**
 * QRパネルの位置（仕上がり座標）。
 * 寄せは名刺の長い辺の方向（横配置＝左右、縦配置＝上下）。短い辺の方向は中央。
 */
export function panelRect(o: Orientation, p: QrPlacement): Rect {
  const t = trimSize(o);
  const s = p.size;
  const along = o === 'landscape' ? t.w : t.h;
  const across = o === 'landscape' ? t.h : t.w;
  const a = p.align === 'start' ? p.offset : p.align === 'end' ? along - p.offset - s : (along - s) / 2;
  const b = (across - s) / 2;
  return o === 'landscape' ? { x: a, y: b, w: s, h: s } : { x: b, y: a, w: s, h: s };
}

/** 寄せの表示名 */
export function alignLabels(o: Orientation): Record<'start' | 'center' | 'end', string> {
  return o === 'landscape'
    ? { start: '左寄せ', center: '中央', end: '右寄せ' }
    : { start: '上寄せ', center: '中央', end: '下寄せ' };
}

let idSeq = 0;
export const newTextId = () => `t${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export function defaultTexts(): TextBox[] {
  const base = { font: 'sans' as const, color: BLACK, align: 'left' as const, lineHeight: 1.4, x: 0, y: 0 };
  return [
    { ...base, id: newTextId(), text: '山田 太郎', sizePt: 14, weight: 700 },
    { ...base, id: newTextId(), text: '肩書き・所属', sizePt: 8, weight: 400 },
    { ...base, id: newTextId(), text: 'example.com', sizePt: 6.5, weight: 400 },
  ];
}

/** 文字の高さの見積もり（フォント未読み込みでも計算できるように） */
function estHeight(tb: TextBox): number {
  const size = tb.sizePt * PT_TO_MM;
  const lines = tb.text.split('\n').length;
  return size + (lines - 1) * size * tb.lineHeight;
}

/**
 * QRを置いた残りの領域に、文字を上から順に並べる。
 * 位置（x, y）と揃えだけを書き換え、他の設定は保つ。
 */
export function autoLayoutTexts(side: CardSide, o: Orientation): TextBox[] {
  const t = trimSize(o);
  const m = 5; // 端からの余白（推奨の安全域4mm＋1mm）
  let area: Rect = { x: m, y: m, w: t.w - 2 * m, h: t.h - 2 * m };
  let align: TextBox['align'] = 'left';

  if (side.qr) {
    const p = panelRect(o, side.qr);
    const gap = 4;
    if (o === 'landscape') {
      if (side.qr.align === 'start') area = { x: p.x + p.w + gap, y: m, w: t.w - m - (p.x + p.w + gap), h: t.h - 2 * m };
      else if (side.qr.align === 'end') area = { x: m, y: m, w: p.x - gap - m, h: t.h - 2 * m };
      else {
        area = { x: m, y: m, w: t.w - 2 * m, h: t.h - 2 * m };
        align = 'center';
      }
    } else {
      align = 'center';
      if (side.qr.align === 'start') area = { x: m, y: p.y + p.h + gap, w: t.w - 2 * m, h: t.h - m - (p.y + p.h + gap) };
      else if (side.qr.align === 'end') area = { x: m, y: m, w: t.w - 2 * m, h: p.y - gap - m };
      else area = { x: m, y: p.y + p.h + gap, w: t.w - 2 * m, h: Math.max(8, t.h - m - (p.y + p.h + gap)) };
    }
  } else {
    align = 'center';
  }

  // 1つ目（名前）と2つ目以降の間を少し広めにとり、全体を領域の縦方向中央に置く
  const gaps = side.texts.map((_, i) => (i === 0 ? 0 : i === 1 ? 2.5 : 4));
  const total = side.texts.reduce((h, tb, i) => h + estHeight(tb) + gaps[i], 0);
  let y = area.y + Math.max(0, (area.h - total) / 2);
  const x = align === 'left' ? area.x : align === 'center' ? area.x + area.w / 2 : area.x + area.w;
  return side.texts.map((tb, i) => {
    y += gaps[i];
    const next = { ...tb, align, x: round1(x), y: round1(y) };
    y += estHeight(tb);
    return next;
  });
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 仕上がり端から矩形までの最短距離（はみ出していれば負） */
export function edgeDistance(r: Rect, o: Orientation): number {
  const t = trimSize(o);
  return Math.min(r.x, r.y, t.w - (r.x + r.w), t.h - (r.y + r.h));
}
