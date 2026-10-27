import type { Cmyk } from '../types';

export const cmyk = (c: number, m: number, y: number, k: number): Cmyk => ({ c, m, y, k });

/** CMYK を % 表記の数値から作る（C5 M25 Y65 K10 → cmykPct(5,25,65,10)） */
export const cmykPct = (c: number, m: number, y: number, k: number): Cmyk =>
  cmyk(c / 100, m / 100, y / 100, k / 100);

export const K = (k: number): Cmyk => cmyk(0, 0, 0, k);
export const BLACK = K(1);
export const WHITE = K(0);

/** 画面表示用の簡易換算（実際の印刷色とは異なる） */
export function cmykToRgb({ c, m, y, k }: Cmyk): [number, number, number] {
  return [
    Math.round(255 * (1 - c) * (1 - k)),
    Math.round(255 * (1 - m) * (1 - k)),
    Math.round(255 * (1 - y) * (1 - k)),
  ];
}

export function rgbToCmyk(r: number, g: number, b: number): Cmyk {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return BLACK;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return cmyk(
    round((1 - rr - k) / (1 - k)),
    round((1 - gg - k) / (1 - k)),
    round((1 - bb - k) / (1 - k)),
    round(k),
  );
}

export function cmykToCss(col: Cmyk): string {
  const [r, g, b] = cmykToRgb(col);
  return `rgb(${r},${g},${b})`;
}

export function cmykToHex(col: Cmyk): string {
  return '#' + cmykToRgb(col).map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function hexToCmyk(hex: string): Cmyk {
  const h = hex.replace('#', '');
  return rgbToCmyk(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
}

/** 相対輝度（0〜1）。画面表示用RGBから計算する */
export function luminance(col: Cmyk): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = cmykToRgb(col);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** コントラスト比（1〜21） */
export function contrast(a: Cmyk, b: Cmyk): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function formatCmyk({ c, m, y, k }: Cmyk): string {
  const p = (v: number) => Math.round(v * 100);
  return `C${p(c)} M${p(m)} Y${p(y)} K${p(k)}`;
}
