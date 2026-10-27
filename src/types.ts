// 共通の型。座標と寸法はすべて mm、色はすべて CMYK（0〜1）。

export type Cmyk = { c: number; m: number; y: number; k: number };

export type EclLevel = 'L' | 'M' | 'Q' | 'H';

export type ModuleKind =
  | 'finder'
  | 'separator'
  | 'timing'
  | 'alignment'
  | 'format'
  | 'data';

export interface QrMatrix {
  /** 1辺のモジュール数（21〜177） */
  size: number;
  version: number;
  ecl: EclLevel;
  isDark(r: number, c: number): boolean;
  kind(r: number, c: number): ModuleKind;
}

// ---- 図形（出力先に依存しない） ----

export type Shape =
  | { type: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill: Cmyk }
  | {
      type: 'circle';
      cx: number;
      cy: number;
      r: number;
      fill: Cmyk;
      stroke?: { color: Cmyk; width: number };
    }
  | {
      type: 'path';
      /** SVGパス。transform がなければ mm の絶対座標 */
      d: string;
      fill: Cmyk;
      transform?: { x: number; y: number; scale: number };
    }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; width: number; color: Cmyk };

export interface CardScene {
  /** 塗り足し（mm） */
  bleed: number;
  /** 仕上がりサイズ（mm） */
  trim: { w: number; h: number };
  /** 座標は「塗り足しを含めた左上」からの mm */
  shapes: Shape[];
}

// ---- QRの見た目 ----

export type DotStyle = 'square' | 'stone';
export type FinderShape = 'linkedStones' | 'square' | 'rounded';
export type WhiteStones = 'game' | 'all' | 'none';
export type StoneLook = '3d' | 'flat';
export type BoardPreset = 'go' | 'othello' | 'white' | 'custom';

export interface QrStyleOptions {
  text: string;
  ecl: EclLevel;
  style: DotStyle;
  board: { preset: BoardPreset; color: Cmyk; gridLines: boolean; gridColor: Cmyk };
  /** 通常（四角）のドットの色 */
  dotColor: Cmyk;
  stone: {
    /** 石の半径（セルに対する比） */
    ratio: number;
    whiteStones: WhiteStones;
    /** 対局風での白石の出やすさ（黒石の隣／離れたマス） */
    density: { adjacent: number; far: number };
    seed: number;
    look: StoneLook;
    finder: FinderShape;
  };
}

// ---- 名刺 ----

export type Orientation = 'landscape' | 'portrait';
export type Align = 'start' | 'center' | 'end';
export type TextAlign = 'left' | 'center' | 'right';
export type FontFamily = 'sans' | 'serif';

export interface TextBox {
  id: string;
  text: string;
  sizePt: number;
  font: FontFamily;
  weight: 400 | 700;
  color: Cmyk;
  align: TextAlign;
  lineHeight: number;
  /** 仕上がり左上からの位置（mm）。x は揃えの基準点、y は1行目の上端 */
  x: number;
  y: number;
}

export interface QrPlacement {
  align: Align;
  /** パネル（コード＋余白4マス）の1辺 */
  size: number;
  /** 寄せた側の仕上がり端からの距離 */
  offset: number;
}

export interface CardSide {
  background: Cmyk;
  /** 盤（QRパネルの背景）を面全体に広げる */
  extendBoard: boolean;
  qr: QrPlacement | null;
  /** この面だけ別のURLにする場合 */
  qrTextOverride?: string;
  texts: TextBox[];
}

export interface CardOptions {
  orientation: Orientation;
  duplex: boolean;
  front: CardSide;
  back: CardSide;
}

export const BLEED = 3;
export const SAFE_REQUIRED = 3;
export const SAFE_RECOMMENDED = 4;
export const QUIET_ZONE = 4;
export const MIN_FONT_PT = 6;
export const MIN_LINE_MM = 0.1;
export const MIN_MODULE_MM = 0.5;
export const PT_TO_MM = 25.4 / 72;
