import * as fontkitNs from '@pdf-lib/fontkit';
import type { FontFamily } from '../types';

// fontkit の実行時は default export、型定義は名前付き export のため、両方に対応する
const fontkit: { create(buf: Uint8Array): FkFont } =
  ((fontkitNs as unknown as { default?: unknown }).default ?? fontkitNs) as never;

/** 本アプリで使う fontkit の機能だけを型として持つ */
export interface FkPath {
  scale(sx: number, sy: number): FkPath;
  translate(x: number, y: number): FkPath;
  toSVG(): string;
}
export interface FkFont {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  getVariation(settings: Record<string, number>): FkFont;
  layout(text: string): {
    glyphs: Array<{ path: FkPath }>;
    positions: Array<{ xAdvance: number; xOffset: number; yOffset: number }>;
  };
}

export const FONT_FILES: Record<FontFamily, string> = {
  sans: 'fonts/NotoSansJP-VF.ttf',
  serif: 'fonts/NotoSerifJP-VF.ttf',
};

export const FONT_LABELS: Record<FontFamily, string> = {
  sans: 'ゴシック（Noto Sans JP）',
  serif: '明朝（Noto Serif JP）',
};

/** フォントの読み込み元。ブラウザは fetch、テストはファイル読み込み */
export type FontLoader = (path: string) => Promise<Uint8Array>;

export class FontStore {
  private base = new Map<FontFamily, Promise<FkFont>>();
  private variants = new Map<string, FkFont>();

  constructor(private loader: FontLoader) {}

  /** 書体を読み込む（同じ書体は1回だけ） */
  load(family: FontFamily): Promise<FkFont> {
    let p = this.base.get(family);
    if (!p) {
      p = this.loader(FONT_FILES[family]).then((buf) => fontkit.create(buf));
      p.catch(() => this.base.delete(family));
      this.base.set(family, p);
    }
    return p;
  }

  /** 指定の書体・太さのフォントを返す（書体が未読み込みなら読み込んでから） */
  async get(family: FontFamily, weight: number): Promise<FkFont> {
    const key = `${family}:${weight}`;
    const hit = this.variants.get(key);
    if (hit) return hit;
    const font = (await this.load(family)).getVariation({ wght: weight });
    this.variants.set(key, font);
    return font;
  }
}
