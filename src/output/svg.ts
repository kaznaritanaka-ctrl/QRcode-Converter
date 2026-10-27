import type { CardScene, Shape } from '../types';
import { cmykToCss } from '../core/color';

export interface ViewOptions {
  /** true：塗り足し込み、false：仕上がりサイズで切り抜く */
  includeBleed: boolean;
  /** 仕上がり線・安全域のガイドを重ねる（保存データには使わない） */
  guides?: boolean;
}

const f = (v: number) => Number(v.toFixed(4));

function shapeToSvg(s: Shape): string {
  switch (s.type) {
    case 'rect':
      return `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}"${s.rx ? ` rx="${f(s.rx)}"` : ''} fill="${cmykToCss(s.fill)}"/>`;
    case 'circle':
      return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}" fill="${cmykToCss(s.fill)}"${
        s.stroke ? ` stroke="${cmykToCss(s.stroke.color)}" stroke-width="${f(s.stroke.width)}"` : ''
      }/>`;
    case 'line':
      return `<line x1="${f(s.x1)}" y1="${f(s.y1)}" x2="${f(s.x2)}" y2="${f(s.y2)}" stroke="${cmykToCss(s.color)}" stroke-width="${f(s.width)}"/>`;
    case 'path': {
      const t = s.transform ? ` transform="translate(${f(s.transform.x)} ${f(s.transform.y)}) scale(${f(s.transform.scale)})"` : '';
      return `<path d="${s.d}"${t} fill="${cmykToCss(s.fill)}"/>`;
    }
  }
}

/** シーンをSVG文字列にする（単位は mm）。テストと確認用 */
export function sceneToSvg(scene: CardScene, opt: ViewOptions): string {
  const b = scene.bleed;
  const { w, h } = scene.trim;
  const vb = opt.includeBleed ? [0, 0, w + 2 * b, h + 2 * b] : [b, b, w, h];
  const guides = opt.guides
    ? `<rect x="${b}" y="${b}" width="${w}" height="${h}" fill="none" stroke="#e5484d" stroke-width="0.2"/>` +
      `<rect x="${b + 3}" y="${b + 3}" width="${w - 6}" height="${h - 6}" fill="none" stroke="#3e63dd" stroke-width="0.15" stroke-dasharray="1 0.6"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}mm" height="${vb[3]}mm">` +
    scene.shapes.map(shapeToSvg).join('') +
    guides +
    `</svg>`
  );
}
