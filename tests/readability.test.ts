// 可読性テスト：既定の図案が、複数の解像度・ぼかしでも読めることを保証する
import { describe, expect, it } from 'vitest';
import { defaultCard, defaultQrOptions, applyBoardPreset } from '../src/defaults';
import { buildSide } from '../src/card/scene';
import { sceneToSvg } from '../src/output/svg';
import type { QrStyleOptions } from '../src/types';
import { decodeAll, fonts, rasterize, saveOutput } from './helpers';

const TEXTS = {
  short: 'https://note.com/tanaka936',
  long: 'https://example.com/very/long/path/for/testing?utm_source=meishi&utm_medium=card&id=1234567890',
  japanese: 'https://example.com/名刺/囲碁',
};

type Variant = { name: string; q: (q: QrStyleOptions) => QrStyleOptions };
const VARIANTS: Variant[] = [
  { name: '囲碁（既定：対局風・つなげた石・立体）', q: (q) => q },
  { name: '囲碁（平面）', q: (q) => ({ ...q, stone: { ...q.stone, look: 'flat' } }) },
  { name: '囲碁（全面白石）', q: (q) => ({ ...q, stone: { ...q.stone, whiteStones: 'all' } }) },
  { name: '囲碁（空きのみ・四角の三隅）', q: (q) => ({ ...q, stone: { ...q.stone, whiteStones: 'none', finder: 'square' } }) },
  { name: 'オセロ', q: (q) => applyBoardPreset(q, 'othello') },
  { name: '白・碁石', q: (q) => applyBoardPreset(q, 'white') },
  { name: '通常（四角）', q: (q) => ({ ...applyBoardPreset(q, 'white'), style: 'square' }) },
];

// 名刺全体（91mm幅）を、350dpi相当・200dpi相当・150dpi相当・ぼかし で画像化して読む
const CONDITIONS: Array<{ label: string; px: number; blur: number }> = [
  { label: '350dpi', px: 1254, blur: 0 },
  { label: '200dpi', px: 717, blur: 0 },
  { label: '150dpi', px: 537, blur: 0 },
  { label: '200dpi+ぼかし', px: 717, blur: 0.25 },
];

describe.each(Object.entries(TEXTS))('入力：%s', (key, text) => {
  it.each(VARIANTS.map((v) => [v.name, v] as const))('%s', async (_name, v) => {
    const card = defaultCard();
    const q = v.q({ ...defaultQrOptions(), text, ecl: 'M' });
    const side = await buildSide(card.front, card, q, fonts);
    const svg = sceneToSvg(side.scene, { includeBleed: false });
    const fails: string[] = [];
    for (const c of CONDITIONS) {
      const png = rasterize(svg, c.px, c.blur);
      const r = await decodeAll(png);
      // 2つのエンジンのどちらかで読めれば合格。どちらも読めなければ失敗として記録する
      if (r.zxing !== text && r.jsqr !== text) {
        fails.push(c.label);
        saveOutput(`fail_${key}_${v.name}_${c.label}.png`, png);
      }
    }
    // 350dpi（入稿時の解像度）は必ず読めること、低解像度も含め全条件で読めること
    expect(fails).toEqual([]);
  });
});
