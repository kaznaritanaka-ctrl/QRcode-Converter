import type { CardOptions, CardSide, QrStyleOptions } from '../types';
import { MIN_FONT_PT, MIN_LINE_MM, MIN_MODULE_MM, SAFE_RECOMMENDED, SAFE_REQUIRED } from '../types';
import { BLACK, contrast } from '../core/color';
import { edgeDistance, intersects } from '../card/layout';
import type { SideRender } from '../card/scene';

export type Level = 'ok' | 'warn' | 'error';

export interface CheckItem {
  id: string;
  label: string;
  level: Level;
  detail: string;
}

/** 読み取り検証の結果（エンジンごと・条件ごと） */
export interface DecodeResult {
  /** 条件名（350dpi など）→ 読めたエンジン名の一覧 */
  byCondition: Array<{ label: string; engines: string[] }>;
}

const mm = (v: number) => `${v.toFixed(1)}mm`;

/** 画像を使わずに判定できる項目（安全域・文字サイズ・線幅・1マスの大きさ・重なり・背景の明るさ） */
export function staticChecks(side: CardSide, render: SideRender, card: CardOptions, qr: QrStyleOptions): CheckItem[] {
  const items: CheckItem[] = [];
  const o = card.orientation;

  // 安全域
  const objs: Array<{ name: string; d: number }> = [];
  if (render.panel) objs.push({ name: 'QRコード', d: edgeDistance(render.panel.rect, o) });
  for (const t of render.texts) {
    const tb = side.texts.find((x) => x.id === t.id);
    objs.push({ name: `文字「${(tb?.text ?? '').split('\n')[0].slice(0, 8)}」`, d: edgeDistance(t.box, o) });
  }
  const worst = objs.reduce<{ name: string; d: number } | null>((w, x) => (!w || x.d < w.d ? x : w), null);
  if (worst) {
    const level: Level = worst.d < SAFE_REQUIRED - 1e-6 ? 'error' : worst.d < SAFE_RECOMMENDED - 1e-6 ? 'warn' : 'ok';
    items.push({
      id: 'safe',
      label: '安全域',
      level,
      detail:
        level === 'ok'
          ? `すべて仕上がりから${SAFE_RECOMMENDED}mm以上内側`
          : `${worst.name}が仕上がりから${mm(worst.d)}（${level === 'error' ? `${SAFE_REQUIRED}mm以上が必須` : `${SAFE_RECOMMENDED}mm以上を推奨`}）`,
    });
  }

  // 文字サイズ
  const small = side.texts.filter((t) => t.text.trim() && t.sizePt < MIN_FONT_PT);
  items.push({
    id: 'font',
    label: '文字サイズ',
    level: small.length ? 'error' : 'ok',
    detail: small.length ? `${MIN_FONT_PT}pt未満の文字があります（${small.map((t) => `${t.sizePt}pt`).join('、')}）` : `すべて${MIN_FONT_PT}pt以上`,
  });

  if (render.panel) {
    const { cell, gridWidth, rect } = render.panel;
    // 線の太さ
    if (gridWidth > 0)
      items.push({
        id: 'line',
        label: '線の太さ',
        level: gridWidth < MIN_LINE_MM - 1e-9 ? 'error' : 'ok',
        detail: `盤の線 ${gridWidth.toFixed(2)}mm（${MIN_LINE_MM}mm以上が必要）`,
      });
    // 1マスの大きさ
    items.push({
      id: 'module',
      label: '1マスの大きさ',
      level: cell < MIN_MODULE_MM ? 'warn' : 'ok',
      detail: `${cell.toFixed(2)}mm（${render.panel.matrix.size}×${render.panel.matrix.size}マス、バージョン${render.panel.matrix.version}）${cell < MIN_MODULE_MM ? '。URLを短くするかQRを大きくしてください' : ''}`,
    });
    // 重なり
    const over = render.texts.filter((t) => intersects(t.box, rect));
    items.push({
      id: 'overlap',
      label: '重なり',
      level: over.length ? 'error' : 'ok',
      detail: over.length ? '文字がQRコード（周囲の余白を含む）に重なっています' : '文字とQRコードは重なっていません',
    });
    // 背景の明るさ
    const ratio = contrast(qr.board.color, qr.style === 'square' ? qr.dotColor : BLACK);
    items.push({
      id: 'contrast',
      label: '背景の明るさ',
      level: ratio < 4 ? 'error' : ratio < 7 ? 'warn' : 'ok',
      detail: `盤と黒のコントラスト比 ${ratio.toFixed(1)}（7以上が目安）`,
    });
  }
  return items;
}

/** 読み取り検証の結果を判定項目にする */
export function decodeCheck(res: DecodeResult): CheckItem {
  const main = res.byCondition[0];
  const lowFails = res.byCondition.slice(1).filter((c) => c.engines.length === 0);
  if (!main.engines.length)
    return { id: 'decode', label: 'QRの読み取り', level: 'error', detail: `${main.label}で読み取れません` };
  if (lowFails.length)
    return {
      id: 'decode',
      label: 'QRの読み取り',
      level: 'warn',
      detail: `${main.label}はOK（${main.engines.join('・')}）。${lowFails.map((c) => c.label).join('・')}で読めません（遠目・ピンぼけに弱い可能性）`,
    };
  return { id: 'decode', label: 'QRの読み取り', level: 'ok', detail: `全条件で読めました（${res.byCondition.map((c) => c.label).join('・')}）` };
}

export function overall(items: CheckItem[]): Level {
  if (items.some((i) => i.level === 'error')) return 'error';
  if (items.some((i) => i.level === 'warn')) return 'warn';
  return 'ok';
}
