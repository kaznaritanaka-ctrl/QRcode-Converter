import type { Cmyk, QrMatrix, QrStyleOptions, Shape } from '../types';
import { QUIET_ZONE, MIN_LINE_MM } from '../types';
import { K } from '../core/color';
import { createRng } from '../core/rng';

/** パネル（コード＋余白）の配置情報 */
export interface PanelGeometry {
  /** パネル左上（シーン座標、mm） */
  x: number;
  y: number;
  /** パネルの1辺（mm） */
  size: number;
}

export interface PanelInfo {
  /** 1マスの実寸（mm） */
  cell: number;
  /** 盤の線の太さ（mm）。線なしなら 0 */
  gridWidth: number;
}

// 石の色（K版のみで作る）
const STONE_BLACK = K(1);
const STONE_WHITE = K(0.02);
const STONE_WHITE_EDGE = K(0.45);
const FINDER_LIGHT = K(0.02);

/** 黒石を描く。立体のときは同心円を重ねてハイライトを付ける（グラデーション不使用＝PDFでもK版のみ） */
function blackStone(out: Shape[], cx: number, cy: number, r: number, look: '3d' | 'flat') {
  out.push({ type: 'circle', cx, cy, r, fill: STONE_BLACK });
  if (look === 'flat') return;
  // 中心付近は必ず暗いまま残す（読み取りのため、ハイライトは左上に寄せて小さく）
  const steps: Array<[number, number, number]> = [
    // [K値, 半径比, 左上へのずれ比]
    [0.9, 0.55, 0.22],
    [0.8, 0.36, 0.3],
    [0.68, 0.2, 0.36],
  ];
  for (const [k, rr, off] of steps)
    out.push({ type: 'circle', cx: cx - r * off, cy: cy - r * off, r: r * rr, fill: K(k) });
}

/** 白石を描く。立体のときは縁を少し暗くする */
function whiteStone(out: Shape[], cx: number, cy: number, r: number, look: '3d' | 'flat', cell: number) {
  const edge = Math.max(MIN_LINE_MM, cell * 0.05);
  if (look === 'flat') {
    out.push({ type: 'circle', cx, cy, r: r - edge / 2, fill: STONE_WHITE, stroke: { color: STONE_WHITE_EDGE, width: edge } });
    return;
  }
  out.push({ type: 'circle', cx, cy, r: r - edge / 2, fill: K(0.2), stroke: { color: STONE_WHITE_EDGE, width: edge } });
  const steps: Array<[number, number, number]> = [
    [0.1, 0.86, 0.05],
    [0.04, 0.7, 0.1],
    [0, 0.42, 0.2],
  ];
  for (const [k, rr, off] of steps)
    out.push({ type: 'circle', cx: cx - r * off, cy: cy - r * off, r: r * rr, fill: K(k) });
}

/**
 * QRパネルの図形を作る。
 * 盤の背景 → 盤の線 → 石（またはドット） → 三隅 の順に重ねる。
 */
export function buildPanel(m: QrMatrix, opt: QrStyleOptions, g: PanelGeometry): { shapes: Shape[]; info: PanelInfo } {
  const n = m.size;
  const cells = n + QUIET_ZONE * 2;
  const cell = g.size / cells;
  const ox = g.x + QUIET_ZONE * cell;
  const oy = g.y + QUIET_ZONE * cell;
  const cx = (c: number) => ox + (c + 0.5) * cell;
  const cy = (r: number) => oy + (r + 0.5) * cell;
  const out: Shape[] = [];

  // 盤の背景（パネル全体）
  out.push({ type: 'rect', x: g.x, y: g.y, w: g.size, h: g.size, fill: opt.board.color });

  // ---- 通常（四角） ----
  if (opt.style === 'square') {
    // 隣り合う四角の間にヘアラインが出ないよう、わずかに重ねる
    const overlap = cell * 0.02;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (m.isDark(r, c))
          out.push({ type: 'rect', x: ox + c * cell, y: oy + r * cell, w: cell + overlap, h: cell + overlap, fill: opt.dotColor });
    return { shapes: out, info: { cell, gridWidth: 0 } };
  }

  // ---- 碁石 ----
  const st = opt.stone;
  const R = cell * st.ratio;
  let gridWidth = 0;
  if (opt.board.gridLines) {
    gridWidth = Math.max(MIN_LINE_MM, cell * 0.08);
    for (let i = 0; i < n; i++) {
      out.push({ type: 'line', x1: cx(0), y1: cy(i), x2: cx(n - 1), y2: cy(i), width: gridWidth, color: opt.board.gridColor });
      out.push({ type: 'line', x1: cx(i), y1: cy(0), x2: cx(i), y2: cy(n - 1), width: gridWidth, color: opt.board.gridColor });
    }
  }

  const rand = createRng(st.seed);
  const isFinderArea = (r: number, c: number) => {
    const k = m.kind(r, c);
    return k === 'finder' || k === 'separator';
  };
  const whiteFor = (r: number, c: number): boolean => {
    if (st.whiteStones === 'all') return true;
    if (st.whiteStones === 'none') return false;
    const adj = m.isDark(r - 1, c) || m.isDark(r + 1, c) || m.isDark(r, c - 1) || m.isDark(r, c + 1);
    return rand() < (adj ? st.density.adjacent : st.density.far);
  };

  // 三隅以外のマス（乱数の消費順を固定するため、行優先で1回だけ回す）
  const blacks: Array<[number, number]> = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (isFinderArea(r, c)) continue;
      if (m.isDark(r, c)) blacks.push([r, c]);
      else if (whiteFor(r, c)) whiteStone(out, cx(c), cy(r), R, st.look, cell);
    }
  for (const [r, c] of blacks) blackStone(out, cx(c), cy(r), R, st.look);

  // 三隅
  drawFinders(out, m, st.finder, st.whiteStones, st.look, { cell, R, cx, cy, ox, oy });

  return { shapes: out, info: { cell, gridWidth } };
}

interface FinderCtx {
  cell: number;
  R: number;
  cx: (c: number) => number;
  cy: (r: number) => number;
  ox: number;
  oy: number;
}

function drawFinders(
  out: Shape[],
  m: QrMatrix,
  shape: QrStyleOptions['stone']['finder'],
  whiteStones: QrStyleOptions['stone']['whiteStones'],
  look: '3d' | 'flat',
  f: FinderCtx,
) {
  const n = m.size;
  const origins: Array<[number, number]> = [[0, 0], [0, n - 7], [n - 7, 0]];

  for (const [r0, c0] of origins) {
    // 分離パターン（三隅の外周1マス）：白石を置く設定なら白石、空きのみなら何も置かない
    if (whiteStones !== 'none') {
      for (let r = r0 - 1; r <= r0 + 7; r++)
        for (let c = c0 - 1; c <= c0 + 7; c++) {
          if (r < 0 || c < 0 || r >= n || c >= n) continue;
          if (m.kind(r, c) === 'separator') whiteStone(out, f.cx(c), f.cy(r), f.R, look, f.cell);
        }
    }

    const x = f.ox + c0 * f.cell;
    const y = f.oy + r0 * f.cell;
    const s = f.cell;

    if (shape === 'linkedStones') {
      // 内側の明るい輪は常に白石（黒い輪との対比を保つ）
      for (let r = r0; r < r0 + 7; r++)
        for (let c = c0; c < c0 + 7; c++)
          if (!m.isDark(r, c)) whiteStone(out, f.cx(c), f.cy(r), f.R, look, f.cell);
      // 暗いマスは石を大きく（セルの0.66倍）して重ね、つながった塊にする
      const big = s * 0.66;
      for (let r = r0; r < r0 + 7; r++)
        for (let c = c0; c < c0 + 7; c++)
          if (m.isDark(r, c)) blackStone(out, f.cx(c), f.cy(r), big, look);
      continue;
    }

    const rounded = shape === 'rounded';
    out.push({ type: 'rect', x, y, w: 7 * s, h: 7 * s, rx: rounded ? 2.2 * s : 0, fill: STONE_BLACK });
    out.push({ type: 'rect', x: x + s, y: y + s, w: 5 * s, h: 5 * s, rx: rounded ? 1.5 * s : 0, fill: FINDER_LIGHT });
    if (rounded) out.push({ type: 'circle', cx: x + 3.5 * s, cy: y + 3.5 * s, r: 1.5 * s, fill: STONE_BLACK });
    else out.push({ type: 'rect', x: x + 2 * s, y: y + 2 * s, w: 3 * s, h: 3 * s, fill: STONE_BLACK });
  }
}

/** 盤のプリセット（CMYKは初期値。印刷見本を見て調整する） */
export const BOARD_PRESETS: Record<'go' | 'othello' | 'white', { color: Cmyk; gridColor: Cmyk; gridLines: boolean }> = {
  go: { color: { c: 0.05, m: 0.25, y: 0.65, k: 0.1 }, gridColor: { c: 0.08, m: 0.32, y: 0.7, k: 0.2 }, gridLines: true },
  othello: { color: { c: 0.45, m: 0, y: 0.43, k: 0.27 }, gridColor: { c: 0.5, m: 0, y: 0.48, k: 0.38 }, gridLines: true },
  white: { color: K(0), gridColor: K(0.15), gridLines: false },
};
