import { describe, expect, it } from 'vitest';
import { autoLayoutTexts, edgeDistance, intersects, maxPanelSize, panelRect } from '../src/card/layout';
import { defaultCard, defaultQrOptions } from '../src/defaults';
import { buildSide } from '../src/card/scene';
import { staticChecks } from '../src/check/preflight';
import type { Orientation } from '../src/types';
import { fonts } from './helpers';

describe('QRの寄せ', () => {
  it('横配置は左右に寄せ、縦方向は中央', () => {
    expect(panelRect('landscape', { align: 'start', size: 45, offset: 4 })).toEqual({ x: 4, y: 5, w: 45, h: 45 });
    expect(panelRect('landscape', { align: 'end', size: 45, offset: 4 })).toEqual({ x: 42, y: 5, w: 45, h: 45 });
    expect(panelRect('landscape', { align: 'center', size: 45, offset: 4 }).x).toBeCloseTo(23);
  });
  it('縦配置は上下に寄せ、横方向は中央', () => {
    expect(panelRect('portrait', { align: 'start', size: 45, offset: 4 })).toEqual({ x: 5, y: 4, w: 45, h: 45 });
    expect(panelRect('portrait', { align: 'end', size: 45, offset: 4 })).toEqual({ x: 5, y: 42, w: 45, h: 45 });
  });
  it('パネルの最大は短い辺−安全域3mm×2＝49mm', () => {
    expect(maxPanelSize('landscape')).toBe(49);
    expect(maxPanelSize('portrait')).toBe(49);
  });
});

describe('文字の自動配置', () => {
  const cases: Array<[Orientation, 'start' | 'center' | 'end']> = [
    ['landscape', 'start'],
    ['landscape', 'end'],
    ['portrait', 'start'],
    ['portrait', 'end'],
  ];
  it.each(cases)('%s・%s：文字がQRに重ならず、安全域（4mm）の内側に収まる', async (o, align) => {
    const card = { ...defaultCard(), orientation: o };
    const side = { ...card.front, qr: { align, size: 45, offset: 4 } };
    side.texts = autoLayoutTexts(side, o);
    const r = await buildSide(side, card, defaultQrOptions(), fonts);
    for (const t of r.texts) {
      expect(intersects(t.box, r.panel!.rect)).toBe(false);
      expect(edgeDistance(t.box, o)).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('入稿チェック', () => {
  it('既定の名刺はすべてOK', async () => {
    const card = defaultCard();
    const q = defaultQrOptions();
    const r = await buildSide(card.front, card, q, fonts);
    const items = staticChecks(card.front, r, card, q);
    expect(items.filter((i) => i.level !== 'ok')).toEqual([]);
  });

  it('文字をQRに重ねると「重なり」がエラー、端に寄せると「安全域」がエラー', async () => {
    const card = defaultCard();
    const q = defaultQrOptions();
    const side = structuredClone(card.front);
    side.texts[0].x = 10;
    side.texts[0].y = 20;
    side.texts[1].x = 1;
    side.texts[1].y = 50;
    const r = await buildSide(side, card, q, fonts);
    const items = staticChecks(side, r, card, q);
    expect(items.find((i) => i.id === 'overlap')?.level).toBe('error');
    expect(items.find((i) => i.id === 'safe')?.level).toBe('error');
  });

  it('暗い盤の色は「背景の明るさ」で引っかかる', async () => {
    const card = defaultCard();
    const q = { ...defaultQrOptions(), board: { ...defaultQrOptions().board, preset: 'custom' as const, color: { c: 0.8, m: 0.2, y: 0.9, k: 0.5 } } };
    const r = await buildSide(card.front, card, q, fonts);
    const items = staticChecks(card.front, r, card, q);
    expect(items.find((i) => i.id === 'contrast')?.level).not.toBe('ok');
  });
});
