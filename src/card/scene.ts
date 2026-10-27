import type { CardOptions, CardScene, CardSide, QrMatrix, QrStyleOptions, Shape } from '../types';
import { BLEED } from '../types';
import { encode } from '../core/encode';
import { buildPanel } from '../qr/panel';
import type { FontStore } from './fonts';
import { layoutText } from './text';
import { panelRect, trimSize, type Rect } from './layout';

export interface SideRender {
  scene: CardScene;
  /** QRパネル（仕上がり座標）。この面にQRがなければ null */
  panel: null | { rect: Rect; cell: number; gridWidth: number; matrix: QrMatrix; text: string };
  /** 文字の外枠（仕上がり座標） */
  texts: Array<{ id: string; box: Rect }>;
}

export function sideQrText(side: CardSide, qr: QrStyleOptions): string {
  return side.qrTextOverride?.trim() ? side.qrTextOverride : qr.text;
}

/** 1つの面のシーン（図形リスト）を組み立てる */
export async function buildSide(side: CardSide, card: CardOptions, qr: QrStyleOptions, fonts: FontStore): Promise<SideRender> {
  const trim = trimSize(card.orientation);
  const W = trim.w + BLEED * 2;
  const H = trim.h + BLEED * 2;
  const shapes: Shape[] = [];

  // 背景（塗り足しの端まで）
  const bg = side.qr && side.extendBoard ? qr.board.color : side.background;
  shapes.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: bg });

  // QRパネル
  let panel: SideRender['panel'] = null;
  const text = sideQrText(side, qr);
  if (side.qr && text) {
    const matrix = encode(text, qr.ecl);
    const rect = panelRect(card.orientation, side.qr);
    const built = buildPanel(matrix, qr, { x: rect.x + BLEED, y: rect.y + BLEED, size: rect.w });
    shapes.push(...built.shapes);
    panel = { rect, cell: built.info.cell, gridWidth: built.info.gridWidth, matrix, text };
  }

  // 文字（アウトライン化）
  const texts: SideRender['texts'] = [];
  for (const tb of side.texts) {
    if (!tb.text.trim()) continue;
    const font = await fonts.get(tb.font, tb.weight);
    const lay = layoutText(tb, font, BLEED, BLEED);
    if (lay.shape) shapes.push(lay.shape);
    texts.push({ id: tb.id, box: lay.box });
  }

  return { scene: { bleed: BLEED, trim, shapes }, panel, texts };
}

/** 表・裏（両面のとき）をまとめて組み立てる */
export async function buildCard(card: CardOptions, qr: QrStyleOptions, fonts: FontStore): Promise<SideRender[]> {
  const sides = card.duplex ? [card.front, card.back] : [card.front];
  const out: SideRender[] = [];
  for (const s of sides) out.push(await buildSide(s, card, qr, fonts));
  return out;
}
