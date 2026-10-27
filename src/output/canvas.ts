import type { CardScene, Shape } from '../types';
import { cmykToCss } from '../core/color';
import type { ViewOptions } from './svg';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const pathCache = new Map<string, Path2D>();
function path2d(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    if (pathCache.size > 200) pathCache.clear();
    pathCache.set(d, p);
  }
  return p;
}

function drawShape(ctx: Ctx, s: Shape) {
  switch (s.type) {
    case 'rect':
      ctx.fillStyle = cmykToCss(s.fill);
      ctx.beginPath();
      if (s.rx) ctx.roundRect(s.x, s.y, s.w, s.h, s.rx);
      else ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      return;
    case 'circle':
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = cmykToCss(s.fill);
      ctx.fill();
      if (s.stroke) {
        ctx.strokeStyle = cmykToCss(s.stroke.color);
        ctx.lineWidth = s.stroke.width;
        ctx.stroke();
      }
      return;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.strokeStyle = cmykToCss(s.color);
      ctx.lineWidth = s.width;
      ctx.stroke();
      return;
    case 'path':
      ctx.fillStyle = cmykToCss(s.fill);
      if (s.transform) {
        ctx.save();
        ctx.translate(s.transform.x, s.transform.y);
        ctx.scale(s.transform.scale, s.transform.scale);
        ctx.fill(path2d(s.d));
        ctx.restore();
      } else ctx.fill(path2d(s.d));
      return;
  }
}

/** 描画に必要なキャンバスの大きさ（px） */
export function canvasSize(scene: CardScene, pxPerMm: number, includeBleed: boolean): { w: number; h: number } {
  const b = includeBleed ? scene.bleed * 2 : 0;
  return {
    w: Math.round((scene.trim.w + b) * pxPerMm),
    h: Math.round((scene.trim.h + b) * pxPerMm),
  };
}

/** シーンをキャンバスに描く（プレビュー・PNG・読み取り検証で共通） */
export function drawScene(ctx: Ctx, scene: CardScene, pxPerMm: number, opt: ViewOptions) {
  const b = scene.bleed;
  ctx.save();
  ctx.scale(pxPerMm, pxPerMm);
  if (!opt.includeBleed) ctx.translate(-b, -b);
  for (const s of scene.shapes) drawShape(ctx, s);
  if (opt.guides) {
    const { w, h } = scene.trim;
    ctx.lineWidth = 1.2 / pxPerMm;
    ctx.strokeStyle = '#e5484d';
    ctx.strokeRect(b, b, w, h);
    ctx.setLineDash([4 / pxPerMm, 3 / pxPerMm]);
    ctx.strokeStyle = '#3e63dd';
    ctx.strokeRect(b + 3, b + 3, w - 6, h - 6);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** シーンを指定解像度で描いた OffscreenCanvas を返す */
export function renderToCanvas(scene: CardScene, dpi: number, opt: ViewOptions): OffscreenCanvas {
  const pxPerMm = dpi / 25.4;
  const { w, h } = canvasSize(scene, pxPerMm, opt.includeBleed);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  drawScene(ctx, scene, pxPerMm, opt);
  return canvas;
}
