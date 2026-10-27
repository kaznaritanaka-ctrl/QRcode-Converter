import type { BoardPreset, CardOptions, CardSide, QrStyleOptions } from './types';
import { BLACK, K } from './core/color';
import { BOARD_PRESETS } from './qr/panel';
import { autoLayoutTexts, defaultTexts } from './card/layout';

export function defaultQrOptions(): QrStyleOptions {
  return {
    text: 'https://example.com',
    ecl: 'M',
    style: 'stone',
    board: { preset: 'go', ...structuredClone(BOARD_PRESETS.go) },
    dotColor: BLACK,
    stone: {
      ratio: 0.48,
      whiteStones: 'game',
      density: { adjacent: 0.65, far: 0.2 },
      seed: 20261028,
      look: '3d',
      finder: 'linkedStones',
    },
  };
}

/** 盤のプリセットを選んだときに、石の置き方・三隅の既定もあわせて切り替える */
export function applyBoardPreset(q: QrStyleOptions, preset: BoardPreset): QrStyleOptions {
  if (preset === 'custom') return { ...q, board: { ...q.board, preset } };
  const p = structuredClone(BOARD_PRESETS[preset]);
  const stone = { ...q.stone };
  if (preset === 'go') Object.assign(stone, { whiteStones: 'game', finder: 'linkedStones' });
  if (preset === 'othello') Object.assign(stone, { whiteStones: 'all', finder: 'square' });
  if (preset === 'white') Object.assign(stone, { whiteStones: 'none', finder: 'square' });
  return { ...q, board: { preset, ...p }, stone };
}

export function defaultCard(): CardOptions {
  const front: CardSide = {
    background: K(0),
    extendBoard: true,
    qr: { align: 'start', size: 45, offset: 4 },
    texts: defaultTexts(),
  };
  front.texts = autoLayoutTexts(front, 'landscape');

  const back: CardSide = {
    background: K(0),
    extendBoard: false,
    qr: null,
    texts: [
      { ...defaultTexts()[2], text: '住所・電話番号・メールアドレスなど', sizePt: 7 },
    ],
  };
  back.texts = autoLayoutTexts(back, 'landscape');

  return { orientation: 'landscape', duplex: false, front, back };
}
