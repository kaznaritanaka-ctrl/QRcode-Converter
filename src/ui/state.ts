import type { CardOptions, QrStyleOptions } from '../types';
import { defaultCard, defaultQrOptions } from '../defaults';

export type SideKey = 'front' | 'back';
export type Tab = 'qr' | 'card' | 'text';

export interface ViewState {
  side: SideKey;
  tab: Tab;
  guides: boolean;
  selectedText: string | null;
}

export interface AppState {
  qr: QrStyleOptions;
  card: CardOptions;
  view: ViewState;
}

const KEY = 'qrcode-converter:v1';

export function initialState(): AppState {
  const saved = load();
  return {
    qr: saved?.qr ?? defaultQrOptions(),
    card: saved?.card ?? defaultCard(),
    view: { side: 'front', tab: 'qr', guides: true, selectedText: null },
  };
}

function load(): Pick<AppState, 'qr' | 'card'> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    // 形が変わっていたら既定に戻す
    if (!v?.qr?.stone || !v?.card?.front || !v?.card?.back) return null;
    return { qr: { ...defaultQrOptions(), ...v.qr, stone: { ...defaultQrOptions().stone, ...v.qr.stone } }, card: v.card };
  } catch {
    return null;
  }
}

/** 設定をこのブラウザに保存する（次に開いたときに続きから） */
export function persist(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ qr: s.qr, card: s.card }));
  } catch {
    /* 保存できない環境では何もしない */
  }
}

export function resetSaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
}
