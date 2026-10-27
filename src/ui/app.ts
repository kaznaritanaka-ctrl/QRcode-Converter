import type { Align, CardSide, Cmyk, FinderShape, QrStyleOptions, StoneLook, TextBox, WhiteStones } from '../types';
import { BLEED, MIN_FONT_PT } from '../types';
import { cmykToHex, formatCmyk, hexToCmyk } from '../core/color';
import { applyBoardPreset, defaultCard, defaultQrOptions } from '../defaults';
import { FontStore, FONT_LABELS } from '../card/fonts';
import { alignLabels, autoLayoutTexts, maxPanelSize, newTextId, trimSize, type Rect } from '../card/layout';
import { buildCard, buildSide, type SideRender } from '../card/scene';
import { drawScene, renderToCanvas } from '../output/canvas';
import { withPhys } from '../output/png';
import { decodeCheck, overall, staticChecks, type CheckItem, type DecodeResult } from '../check/preflight';
import { verifyScene } from '../check/decode';
import { download, field, h, segmented, slider, stamp } from './dom';
import { initialState, persist, resetSaved, type AppState, type SideKey, type Tab } from './state';

const STONE_B = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="#1E2226"/></svg>';
const STONE_W = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#F7F7F2" stroke="#8a8a84"/></svg>';
const STONE_BW =
  '<svg viewBox="0 0 22 16"><circle cx="7" cy="8" r="6" fill="#F7F7F2" stroke="#8a8a84"/><circle cx="15" cy="8" r="6.5" fill="#1E2226"/></svg>';
const POINT =
  '<svg viewBox="0 0 16 16"><path d="M8 1V15M1 8H15" stroke="#9a8a6a" stroke-width="1.4"/><circle cx="8" cy="8" r="2" fill="#9a8a6a"/></svg>';

const fontStore = new FontStore(async (p) => {
  const res = await fetch(import.meta.env.BASE_URL + p);
  if (!res.ok) throw new Error(`書体を読み込めませんでした（${res.status}）`);
  return new Uint8Array(await res.arrayBuffer());
});

interface SideState {
  render: SideRender | null;
  checks: CheckItem[];
  decode: DecodeResult | null;
  decoding: boolean;
}

export class App {
  private s: AppState = initialState();
  private sides: Record<SideKey, SideState> = {
    front: { render: null, checks: [], decode: null, decoding: false },
    back: { render: null, checks: [], decode: null, decoding: false },
  };
  private settingsEl = h('div', { class: 'settings-body' });
  private tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  private sideTabsEl = h('div', { class: 'side-tabs' });
  private canvas = h('canvas', { class: 'card-canvas', tabindex: 0, 'aria-label': '名刺のプレビュー。文字をドラッグして動かせます' });
  private stageMsg = h('div', { class: 'stage-msg' }, '書体を読み込み中…');
  private checksEl = h('section', { class: 'checks', 'aria-live': 'polite' });
  private metaEl = h('div', { class: 'stage-meta' });
  private renderTimer = 0;
  private decodeTimer = 0;
  private renderSeq = 0;
  private drag: null | { id: string; dx: number; dy: number; moved: boolean } = null;

  constructor(private root: HTMLElement) {}

  mount() {
    const saveBar = h(
      'div',
      { class: 'save-bar' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => this.savePdf() }, 'PDFを保存', h('small', {}, '入稿用')),
      h('button', { type: 'button', class: 'btn', onclick: () => this.savePng() }, 'PNGを保存', h('small', {}, '確認用')),
    );
    const settings = h(
      'aside',
      { class: 'settings' },
      h('header', { class: 'brand' }, h('h1', {}, '碁石名刺QR'), h('p', {}, 'URLを碁石のQRにして、名刺の入稿データを作ります')),
      this.tabsEl,
      this.settingsEl,
      saveBar,
    );
    const guideToggle = h(
      'label',
      { class: 'check-inline' },
      h('input', {
        type: 'checkbox',
        checked: this.s.view.guides,
        onchange: (e: Event) => {
          this.s.view.guides = (e.target as HTMLInputElement).checked;
          this.drawPreview();
        },
      }),
      '仕上がり線・安全域を表示',
    );
    const stage = h(
      'main',
      { class: 'stage' },
      h('div', { class: 'stage-top' }, this.sideTabsEl, h('div', { class: 'stage-tools' }, guideToggle, h('button', { type: 'button', class: 'btn ghost', onclick: () => this.openPhoneCheck() }, '実機確認'))),
      h('div', { class: 'table' }, h('div', { class: 'card-wrap' }, this.canvas, this.stageMsg)),
      this.metaEl,
      this.checksEl,
    );
    this.root.append(h('div', { class: 'layout' }, settings, stage));

    this.bindCanvas();
    // 机（.table）の幅が変わったら描き直す（キャンバス自身の大きさでは縮まないため）
    new ResizeObserver(() => this.drawPreview()).observe(this.canvas.parentElement!.parentElement!);
    this.renderAll();
  }

  // ---------- 状態の更新 ----------

  private get side(): CardSide {
    return this.s.card[this.s.view.side];
  }

  /** 状態を変えて描き直す。panel=false のときは設定欄を作り直さない（入力中のフォーカスを保つため） */
  private update(fn: (s: AppState) => void, panel = true) {
    fn(this.s);
    persist(this.s);
    if (panel) this.renderSettings();
    this.scheduleRender();
  }

  private renderAll() {
    this.renderSettings();
    this.scheduleRender(0);
  }

  // ---------- 設定欄 ----------

  private renderSettings() {
    const v = this.s.view;
    const tabs: Array<[Tab, string]> = [
      ['qr', 'QRコード'],
      ['card', '名刺'],
      ['text', '文字'],
    ];
    this.tabsEl.replaceChildren(
      ...tabs.map(([k, label]) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': v.tab === k ? 'true' : 'false',
            class: v.tab === k ? 'on' : '',
            onclick: () => {
              this.s.view.tab = k;
              this.renderSettings();
            },
          },
          label,
        ),
      ),
    );
    const body = v.tab === 'qr' ? this.qrPanel() : v.tab === 'card' ? this.cardPanel() : this.textPanel();
    this.settingsEl.replaceChildren(body);
    this.renderSideTabs();
  }

  private renderSideTabs() {
    if (!this.s.card.duplex) {
      this.sideTabsEl.replaceChildren(h('span', { class: 'side-label' }, '片面'));
      return;
    }
    this.sideTabsEl.replaceChildren(
      segmented<SideKey>(
        '表示する面',
        [
          { value: 'front', label: '表' },
          { value: 'back', label: '裏' },
        ],
        this.s.view.side,
        (k) => {
          this.s.view.side = k;
          this.s.view.selectedText = null;
          this.renderSettings();
          this.drawPreview();
          this.renderChecks();
        },
      ),
    );
  }

  private qrPanel(): HTMLElement {
    const q = this.s.qr;
    const set = (fn: (q: QrStyleOptions) => QrStyleOptions | void, panel = true) =>
      this.update((s) => {
        const r = fn(s.qr);
        if (r) s.qr = r;
      }, panel);

    const url = h('textarea', {
      rows: 2,
      spellcheck: 'false',
      'aria-label': 'QRコードにするURLまたは文字',
      value: q.text,
      oninput: (e: Event) => set((q) => void (q.text = (e.target as HTMLTextAreaElement).value), false),
    });
    url.value = q.text;

    const parts: Array<Node | null> = [
      field('URL・テキスト', url, '短いURLほどマスが少なくなり、石が大きく見えます'),
      field(
        '誤り訂正',
        segmented(
          '誤り訂正',
          [
            { value: 'L', label: 'L', title: '約7%まで復元。石が最も少ない' },
            { value: 'M', label: 'M', title: '約15%まで復元（標準）' },
            { value: 'Q', label: 'Q', title: '約25%まで復元' },
            { value: 'H', label: 'H', title: '約30%まで復元。石が最も多い' },
          ],
          q.ecl,
          (v) => set((q) => void (q.ecl = v)),
        ),
        '上げるほど汚れや欠けに強くなり、石の数が増えます。通常はMで十分です',
      ),
      field(
        '図案',
        segmented(
          '図案',
          [
            { value: 'stone', label: '碁石', icon: STONE_BW },
            { value: 'square', label: '通常の四角' },
          ],
          q.style,
          (v) => set((q) => void (q.style = v)),
        ),
      ),
      field(
        '盤',
        segmented(
          '盤',
          [
            { value: 'go', label: '碁盤' },
            { value: 'othello', label: 'オセロ盤' },
            { value: 'white', label: '白' },
            { value: 'custom', label: '自由色' },
          ],
          q.board.preset,
          (v) => set((q) => applyBoardPreset(q, v)),
        ),
      ),
    ];
    if (q.board.preset === 'custom')
      parts.push(
        field('盤の色', this.colorInput(q.board.color, (c) => set((q) => void (q.board.color = c)), '盤の色'), '暗すぎる色は読み取れなくなります。下の入稿チェックで確認してください'),
      );

    if (q.style === 'stone') {
      const st = q.stone;
      parts.push(
        field(
          '白石',
          segmented<WhiteStones>(
            '白石の置き方',
            [
              { value: 'game', label: '対局風', icon: STONE_BW, title: '黒石の近くに白石を多めに置き、空き交点も残す' },
              { value: 'all', label: '全面', icon: STONE_W, title: '明るいマスすべてに白石' },
              { value: 'none', label: '空きのみ', icon: POINT, title: '白石を置かない' },
            ],
            st.whiteStones,
            (v) => set((q) => void (q.stone.whiteStones = v)),
          ),
          st.whiteStones === 'game' ? '白石も空き交点も「明るいマス」として読まれるので、置き方は読み取りに影響しません' : undefined,
        ),
      );
      if (st.whiteStones === 'game')
        parts.push(
          h(
            'div',
            { class: 'row-actions' },
            h('button', { type: 'button', class: 'btn small', onclick: () => set((q) => void (q.stone.seed = (Math.random() * 2 ** 31) | 0)) }, '白石の配置を変える'),
          ),
        );
      parts.push(
        field(
          '三隅',
          segmented<FinderShape>(
            '三隅の形',
            [
              { value: 'linkedStones', label: 'つなげた石', icon: STONE_B },
              { value: 'square', label: '四角' },
              { value: 'rounded', label: '角丸' },
            ],
            st.finder,
            (v) => set((q) => void (q.stone.finder = v)),
          ),
          st.finder === 'rounded' ? '角丸は一部の読み取りアプリで読めないことがあります' : '三隅は読み取りの目印です。単独の石にはできません',
        ),
        field(
          '石の見た目',
          segmented<StoneLook>(
            '石の見た目',
            [
              { value: '3d', label: '立体' },
              { value: 'flat', label: '平面（棋譜風）' },
            ],
            st.look,
            (v) => set((q) => void (q.stone.look = v)),
          ),
        ),
        field(
          '石の大きさ',
          slider({
            label: '石の大きさ',
            min: 0.44,
            max: 0.49,
            step: 0.01,
            value: st.ratio,
            format: (v) => `${Math.round(v * 200)}%`,
            onInput: (v) => set((q) => void (q.stone.ratio = v), false),
          }),
          'マスの幅に対する石の直径',
        ),
        h(
          'label',
          { class: 'check-inline' },
          h('input', { type: 'checkbox', checked: q.board.gridLines, onchange: (e: Event) => set((q) => void (q.board.gridLines = (e.target as HTMLInputElement).checked)) }),
          '盤の線を引く',
        ),
      );
    }
    return h('div', { class: 'panel' }, ...parts);
  }

  private cardPanel(): HTMLElement {
    const c = this.s.card;
    const sideKey = this.s.view.side;
    const side = this.side;
    const o = c.orientation;
    const maxSize = maxPanelSize(o);

    const setSide = (fn: (s: CardSide) => void, panel = true) => this.update((s) => fn(s.card[sideKey]), panel);

    const parts: Array<Node | null> = [
      field(
        '片面・両面',
        segmented(
          '片面・両面',
          [
            { value: 'single', label: '片面' },
            { value: 'duplex', label: '両面' },
          ],
          c.duplex ? 'duplex' : 'single',
          (v) =>
            this.update((s) => {
              s.card.duplex = v === 'duplex';
              if (!s.card.duplex) s.view.side = 'front';
            }),
        ),
        c.duplex ? 'PDFは2ページ（1ページ目が表、2ページ目が裏）になります' : '片面にしても裏面の内容は残ります',
      ),
      field(
        '向き',
        segmented(
          '向き',
          [
            { value: 'landscape', label: '横（91×55mm）' },
            { value: 'portrait', label: '縦（55×91mm）' },
          ],
          o,
          (v) =>
            this.update((s) => {
              if (s.card.orientation === v) return;
              s.card.orientation = v;
              const max = maxPanelSize(v);
              for (const k of ['front', 'back'] as const) {
                const sd = s.card[k];
                if (sd.qr) sd.qr.size = Math.min(sd.qr.size, max);
                sd.texts = autoLayoutTexts(sd, v);
              }
            }),
        ),
        '向きを変えると、文字は自動で並べ直します',
      ),
      h('h2', { class: 'group' }, c.duplex ? `${sideKey === 'front' ? '表' : '裏'}の設定` : 'この面の設定'),
      h(
        'label',
        { class: 'check-inline' },
        h('input', {
          type: 'checkbox',
          checked: !!side.qr,
          onchange: (e: Event) =>
            setSide((sd) => {
              sd.qr = (e.target as HTMLInputElement).checked ? { align: 'start', size: Math.min(45, maxSize), offset: 4 } : null;
              sd.texts = autoLayoutTexts(sd, o);
            }),
        }),
        'この面にQRコードを置く',
      ),
    ];

    if (side.qr) {
      const labels = alignLabels(o);
      parts.push(
        field(
          'QRの位置',
          segmented<Align>(
            'QRの位置',
            (['start', 'center', 'end'] as const).map((a) => ({ value: a, label: labels[a] })),
            side.qr.align,
            (v) =>
              setSide((sd) => {
                sd.qr!.align = v;
                sd.texts = autoLayoutTexts(sd, o);
              }),
          ),
          '文字は自動で並べ直します。あとから文字タブやドラッグで動かせます',
        ),
        field(
          'QRの大きさ',
          slider({
            label: 'QRの大きさ',
            min: 20,
            max: maxSize,
            step: 0.5,
            value: side.qr.size,
            format: (v) => `${v.toFixed(1)}mm`,
            onInput: (v) => setSide((sd) => void (sd.qr!.size = v), false),
          }),
          '周囲の余白（4マス分）を含めた1辺の長さ',
        ),
      );
      if (side.qr.align !== 'center')
        parts.push(
          field(
            '端からの距離',
            slider({
              label: '端からの距離',
              min: 3,
              max: 12,
              step: 0.5,
              value: side.qr.offset,
              format: (v) => `${v.toFixed(1)}mm`,
              onInput: (v) => setSide((sd) => void (sd.qr!.offset = v), false),
            }),
            '仕上がり線から3mm以上が必須、4mm以上を推奨',
          ),
        );
      parts.push(
        h(
          'label',
          { class: 'check-inline' },
          h('input', { type: 'checkbox', checked: side.extendBoard, onchange: (e: Event) => setSide((sd) => void (sd.extendBoard = (e.target as HTMLInputElement).checked)) }),
          '盤の色を名刺全体に広げる',
        ),
      );
      if (sideKey === 'back') {
        const ov = h('input', {
          type: 'text',
          placeholder: '空欄なら表と同じURL',
          value: side.qrTextOverride ?? '',
          oninput: (e: Event) => setSide((sd) => void (sd.qrTextOverride = (e.target as HTMLInputElement).value), false),
        });
        parts.push(field('裏面のQRのURL', ov));
      }
    }
    if (!side.qr || !side.extendBoard)
      parts.push(field('背景色', this.colorInput(side.background, (col) => setSide((sd) => void (sd.background = col)), '背景色')));

    parts.push(
      h(
        'div',
        { class: 'row-actions muted' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn small ghost-dark',
            onclick: () => {
              if (!confirm('すべての設定を初期状態に戻します。よろしいですか？')) return;
              resetSaved();
              this.s.qr = defaultQrOptions();
              this.s.card = defaultCard();
              this.s.view.side = 'front';
              this.s.view.selectedText = null;
              this.renderAll();
            },
          },
          '設定を初期状態に戻す',
        ),
      ),
    );
    return h('div', { class: 'panel' }, ...parts);
  }

  private textPanel(): HTMLElement {
    const side = this.side;
    const o = this.s.card.orientation;
    const sideKey = this.s.view.side;
    const setTb = (id: string, fn: (t: TextBox) => void, panel = false) =>
      this.update((s) => {
        const t = s.card[sideKey].texts.find((x) => x.id === id);
        if (t) fn(t);
      }, panel);

    const items = side.texts.map((tb) => {
      const sel = this.s.view.selectedText === tb.id;
      const ta = h('textarea', {
        rows: Math.min(4, tb.text.split('\n').length + (tb.text.length > 18 ? 1 : 0)),
        'aria-label': '文字',
        oninput: (e: Event) => setTb(tb.id, (t) => void (t.text = (e.target as HTMLTextAreaElement).value)),
        onfocus: () => this.select(tb.id),
      });
      ta.value = tb.text;
      const num = (label: string, value: number, step: number, min: number, max: number, apply: (t: TextBox, v: number) => void, unit: string) =>
        h(
          'label',
          { class: 'num' },
          h('span', {}, label),
          h('input', {
            type: 'number',
            step,
            min,
            max,
            value,
            onchange: (e: Event) => {
              const v = Number((e.target as HTMLInputElement).value);
              if (Number.isFinite(v)) setTb(tb.id, (t) => apply(t, Math.min(max, Math.max(min, v))), true);
            },
          }),
          h('span', { class: 'unit' }, unit),
        );
      return h(
        'div',
        { class: `text-item${sel ? ' selected' : ''}`, onclick: () => this.select(tb.id, false) },
        ta,
        h(
          'div',
          { class: 'text-row' },
          num('大きさ', tb.sizePt, 0.5, MIN_FONT_PT, 36, (t, v) => (t.sizePt = v), 'pt'),
          h(
            'select',
            { 'aria-label': '書体', onchange: (e: Event) => setTb(tb.id, (t) => void (t.font = (e.target as HTMLSelectElement).value as TextBox['font']), true) },
            ...(['sans', 'serif'] as const).map((f) => h('option', { value: f, selected: tb.font === f }, FONT_LABELS[f].split('（')[0])),
          ),
          h(
            'label',
            { class: 'check-inline compact' },
            h('input', { type: 'checkbox', checked: tb.weight === 700, onchange: (e: Event) => setTb(tb.id, (t) => void (t.weight = (e.target as HTMLInputElement).checked ? 700 : 400), true) }),
            '太字',
          ),
          this.colorInput(tb.color, (c) => setTb(tb.id, (t) => void (t.color = c), true), '文字の色', true),
        ),
        h(
          'div',
          { class: 'text-row' },
          segmented(
            '揃え',
            [
              { value: 'left', label: '左' },
              { value: 'center', label: '中央' },
              { value: 'right', label: '右' },
            ],
            tb.align,
            (v) =>
              setTb(
                tb.id,
                (t) => {
                  // 見た目の位置を保ったまま揃えの基準点を移す
                  const box = this.textBox(t.id);
                  if (box) t.x = v === 'left' ? box.x : v === 'center' ? box.x + box.w / 2 : box.x + box.w;
                  t.align = v;
                },
                true,
              ),
          ),
          num('行間', tb.lineHeight, 0.1, 1, 2, (t, v) => (t.lineHeight = v), '倍'),
        ),
        h(
          'div',
          { class: 'text-row' },
          num('横', tb.x, 0.5, -10, 100, (t, v) => (t.x = v), 'mm'),
          num('縦', tb.y, 0.5, -10, 100, (t, v) => (t.y = v), 'mm'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn small ghost-dark',
              onclick: (e: Event) => {
                e.stopPropagation();
                this.update((s) => {
                  s.card[sideKey].texts = s.card[sideKey].texts.filter((x) => x.id !== tb.id);
                  if (s.view.selectedText === tb.id) s.view.selectedText = null;
                });
              },
            },
            '削除',
          ),
        ),
      );
    });

    return h(
      'div',
      { class: 'panel' },
      h('p', { class: 'hint lead' }, `${this.s.card.duplex ? (sideKey === 'front' ? '表' : '裏') + 'の' : ''}文字です。プレビュー上でドラッグして動かせます（選択中は矢印キーで0.5mmずつ）。位置は仕上がりの左上からのmmです。`),
      ...items,
      h(
        'div',
        { class: 'row-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn small',
            onclick: () =>
              this.update((s) => {
                const t = trimSize(o);
                const nt: TextBox = { id: newTextId(), text: '新しい文字', sizePt: 8, font: 'sans', weight: 400, color: { c: 0, m: 0, y: 0, k: 1 }, align: 'left', lineHeight: 1.4, x: 6, y: t.h / 2 };
                s.card[sideKey].texts.push(nt);
                s.view.selectedText = nt.id;
              }),
          },
          '文字を追加',
        ),
        h('button', { type: 'button', class: 'btn small', onclick: () => this.update((s) => void (s.card[sideKey].texts = autoLayoutTexts(s.card[sideKey], o))) }, '自動で並べる'),
      ),
    );
  }

  private colorInput(value: Cmyk, onChange: (c: Cmyk) => void, label: string, compact = false): HTMLElement {
    const out = h('span', { class: 'cmyk' }, formatCmyk(value));
    const input = h('input', {
      type: 'color',
      value: cmykToHex(value),
      'aria-label': label,
      onchange: (e: Event) => {
        const c = hexToCmyk((e.target as HTMLInputElement).value);
        out.textContent = formatCmyk(c);
        onChange(c);
      },
    });
    return h('span', { class: `color${compact ? ' compact' : ''}` }, input, compact ? null : out);
  }

  private select(id: string | null, redrawPanel = false) {
    if (this.s.view.selectedText === id) return;
    this.s.view.selectedText = id;
    if (redrawPanel || this.s.view.tab === 'text') this.renderSettings();
    this.drawPreview();
  }

  // ---------- 描画とチェック ----------

  private scheduleRender(delay = 40) {
    clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.renderNow(), delay);
  }

  private async renderNow() {
    const seq = ++this.renderSeq;
    try {
      const keys: SideKey[] = this.s.card.duplex ? ['front', 'back'] : ['front'];
      for (const k of keys) {
        const r = await buildSide(this.s.card[k], this.s.card, this.s.qr, fontStore);
        if (seq !== this.renderSeq) return;
        this.sides[k].render = r;
        this.sides[k].checks = staticChecks(this.s.card[k], r, this.s.card, this.s.qr);
        this.sides[k].decode = null;
      }
      this.stageMsg.hidden = true;
      this.drawPreview();
      this.renderChecks();
      this.scheduleDecode();
    } catch (e) {
      this.stageMsg.hidden = false;
      this.stageMsg.textContent = e instanceof Error ? `表示できません：${e.message}` : '表示できません';
    }
  }

  private scheduleDecode() {
    clearTimeout(this.decodeTimer);
    const seq = this.renderSeq;
    this.decodeTimer = window.setTimeout(async () => {
      const keys: SideKey[] = this.s.card.duplex ? ['front', 'back'] : ['front'];
      for (const k of keys) {
        const st = this.sides[k];
        if (!st.render?.panel) continue;
        st.decoding = true;
        this.renderChecks();
        const res = await verifyScene(st.render.scene, st.render.panel.text);
        if (seq !== this.renderSeq) return;
        st.decode = res;
        st.decoding = false;
        this.renderChecks();
      }
    }, 450);
  }

  private textBox(id: string): Rect | null {
    return this.sides[this.s.view.side].render?.texts.find((t) => t.id === id)?.box ?? null;
  }

  private layoutMetrics() {
    const wrap = this.canvas.parentElement!;
    const trim = trimSize(this.s.card.orientation);
    const Wmm = trim.w + BLEED * 2;
    const Hmm = trim.h + BLEED * 2;
    const table = wrap.parentElement!;
    const availW = Math.max(200, table.clientWidth - 48);
    const availH = Math.max(200, Math.min(window.innerHeight * 0.62, 760));
    const cssPerMm = Math.min(availW / Wmm, availH / Hmm, 9);
    return { Wmm, Hmm, cssPerMm, cssW: Wmm * cssPerMm, cssH: Hmm * cssPerMm };
  }

  private drawPreview() {
    const st = this.sides[this.s.view.side];
    const r = st.render;
    if (!r) return;
    const { cssPerMm, cssW, cssH } = this.layoutMetrics();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const ctx = this.canvas.getContext('2d')!;
    const pxPerMm = cssPerMm * dpr;
    drawScene(ctx, r.scene, pxPerMm, { includeBleed: true, guides: this.s.view.guides });

    const sel = this.s.view.selectedText ? r.texts.find((t) => t.id === this.s.view.selectedText) : null;
    if (sel) {
      const b = sel.box;
      ctx.save();
      ctx.strokeStyle = '#2F6FE0';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([5 * dpr, 3 * dpr]);
      ctx.strokeRect((b.x + BLEED) * pxPerMm - 3 * dpr, (b.y + BLEED) * pxPerMm - 3 * dpr, b.w * pxPerMm + 6 * dpr, b.h * pxPerMm + 6 * dpr);
      ctx.restore();
    }

    const p = r.panel;
    this.metaEl.replaceChildren(
      h(
        'span',
        {},
        p
          ? `QR ${p.rect.w.toFixed(1)}mm角・${p.matrix.size}×${p.matrix.size}マス（バージョン${p.matrix.version}・誤り訂正${p.matrix.ecl}）・1マス${p.cell.toFixed(2)}mm`
          : 'この面にはQRコードがありません',
      ),
    );
  }

  private renderChecks() {
    const st = this.sides[this.s.view.side];
    const items = [...st.checks];
    if (st.render?.panel) {
      if (st.decode) items.unshift(decodeCheck(st.decode));
      else items.unshift({ id: 'decode', label: 'QRの読み取り', level: 'warn', detail: '確認中…' });
    }
    const keys: SideKey[] = this.s.card.duplex ? ['front', 'back'] : ['front'];
    const all = keys.flatMap((k) => {
      const s = this.sides[k];
      const its = [...s.checks];
      if (s.render?.panel && s.decode) its.push(decodeCheck(s.decode));
      return its;
    });
    const pending = keys.some((k) => this.sides[k].render?.panel && !this.sides[k].decode);
    const lv = pending ? 'pending' : overall(all);
    const head =
      lv === 'pending' ? '入稿チェック中…' : lv === 'ok' ? '入稿OK' : lv === 'warn' ? '入稿できます（注意あり）' : '直してから入稿してください';
    const mark = (l: string) => (l === 'ok' ? '◎' : l === 'warn' ? '△' : '×');
    this.checksEl.replaceChildren(
      h(
        'div',
        { class: `checks-head ${lv}` },
        h('strong', {}, head),
        this.s.card.duplex ? h('span', {}, `${this.s.view.side === 'front' ? '表' : '裏'}の結果を表示中（判定は両面）`) : null,
      ),
      h(
        'ul',
        {},
        ...items.map((i) =>
          h(
            'li',
            { class: i.level },
            h('span', { class: 'mark', 'aria-hidden': 'true' }, i.detail === '確認中…' ? '…' : mark(i.level)),
            h('span', { class: 'label' }, i.label),
            h('span', { class: 'detail' }, i.detail),
          ),
        ),
      ),
    );
  }

  // ---------- 文字のドラッグ ----------

  private bindCanvas() {
    const toMm = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const { cssPerMm } = this.layoutMetrics();
      return { x: (e.clientX - rect.left) / cssPerMm - BLEED, y: (e.clientY - rect.top) / cssPerMm - BLEED };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      const r = this.sides[this.s.view.side].render;
      if (!r) return;
      const p = toMm(e);
      const pad = 1.2;
      const hit = [...r.texts].reverse().find((t) => p.x >= t.box.x - pad && p.x <= t.box.x + t.box.w + pad && p.y >= t.box.y - pad && p.y <= t.box.y + t.box.h + pad);
      if (!hit) {
        this.select(null);
        return;
      }
      const tb = this.side.texts.find((t) => t.id === hit.id)!;
      this.drag = { id: hit.id, dx: p.x - tb.x, dy: p.y - tb.y, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      this.select(hit.id);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.sides[this.s.view.side].render;
      if (!r) return;
      const p = toMm(e);
      if (!this.drag) {
        const over = r.texts.some((t) => p.x >= t.box.x && p.x <= t.box.x + t.box.w && p.y >= t.box.y && p.y <= t.box.y + t.box.h);
        this.canvas.style.cursor = over ? 'move' : 'default';
        return;
      }
      const tb = this.side.texts.find((t) => t.id === this.drag!.id);
      const box = this.textBox(this.drag.id);
      if (!tb || !box) return;
      let nx = p.x - this.drag.dx;
      let ny = p.y - this.drag.dy;
      // 吸着：文字の外枠の端・中心を、安全域・中心線・QRの端に合わせる
      const off = { x: box.x - tb.x, y: box.y - tb.y };
      const snapped = this.snap({ x: nx + off.x, y: ny + off.y, w: box.w, h: box.h });
      nx = snapped.x - off.x;
      ny = snapped.y - off.y;
      this.drag.moved = true;
      this.update((s) => {
        const t = s.card[s.view.side].texts.find((x) => x.id === tb.id)!;
        t.x = Math.round(nx * 10) / 10;
        t.y = Math.round(ny * 10) / 10;
      }, false);
    });
    const end = () => {
      if (this.drag?.moved) this.renderSettings();
      this.drag = null;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('keydown', (e) => {
      const id = this.s.view.selectedText;
      if (!id) return;
      const d = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] }[e.key];
      if (!d) return;
      e.preventDefault();
      this.update((s) => {
        const t = s.card[s.view.side].texts.find((x) => x.id === id);
        if (t) {
          t.x = Math.round((t.x + d[0]) * 10) / 10;
          t.y = Math.round((t.y + d[1]) * 10) / 10;
        }
      }, this.s.view.tab === 'text');
    });
  }

  private snap(b: Rect): Rect {
    const t = trimSize(this.s.card.orientation);
    const th = 0.8;
    const xs = [4, t.w - 4, t.w / 2];
    const ys = [4, t.h - 4, t.h / 2];
    const panel = this.sides[this.s.view.side].render?.panel?.rect;
    if (panel) {
      xs.push(panel.x + panel.w + 4, panel.x - 4);
      ys.push(panel.y, panel.y + panel.h, panel.y + panel.h + 4, panel.y - 4);
    }
    // 外枠の「始端・終端・中心」のうち、いずれかの線に最も近いものを吸着させる
    const pick = (start: number, size: number, lines: number[]) => {
      let best = start;
      let bestD = th;
      for (const L of lines) {
        const opts = [L, L - size, L - size / 2];
        const anchors = [start, start + size, start + size / 2];
        anchors.forEach((a, i) => {
          const dd = Math.abs(a - L);
          if (dd < bestD) {
            bestD = dd;
            best = opts[i];
          }
        });
      }
      return best;
    };
    return { x: pick(b.x, b.w, xs), y: pick(b.y, b.h, ys), w: b.w, h: b.h };
  }

  // ---------- 実機確認 ----------

  private openPhoneCheck() {
    const r = this.sides[this.s.view.side].render;
    if (!r?.panel) {
      alert('この面にはQRコードがありません');
      return;
    }
    const side = Math.min(window.innerWidth, window.innerHeight) * 0.82;
    const dpr = window.devicePixelRatio || 1;
    const rect = r.panel.rect;
    const cssPerMm = side / rect.w;
    const c = h('canvas', { width: Math.round(side * dpr), height: Math.round(side * dpr), style: `width:${side}px;height:${side}px` });
    const ctx = c.getContext('2d')!;
    ctx.translate(-(rect.x + BLEED) * cssPerMm * dpr, -(rect.y + BLEED) * cssPerMm * dpr);
    drawScene(ctx, r.scene, cssPerMm * dpr, { includeBleed: true });
    const dlg = h(
      'dialog',
      { class: 'phone-check', 'aria-label': '実機確認' },
      c,
      h('p', {}, 'スマホの標準カメラを向けて、読み取れるか確かめてください。少し離したり斜めにしたりしても読めると安心です。'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => dlg.close() }, '閉じる'),
    );
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  // ---------- 保存 ----------

  private confirmIfProblems(): boolean {
    const keys: SideKey[] = this.s.card.duplex ? ['front', 'back'] : ['front'];
    const errs = keys.flatMap((k) => {
      const s = this.sides[k];
      const its = [...s.checks];
      if (s.decode) its.push(decodeCheck(s.decode));
      return its.filter((i) => i.level === 'error').map((i) => `・${this.s.card.duplex ? (k === 'front' ? '表：' : '裏：') : ''}${i.label}：${i.detail}`);
    });
    if (!errs.length) return true;
    return confirm(`入稿チェックで問題が見つかっています。\n\n${errs.join('\n')}\n\nこのまま保存しますか？`);
  }

  private async savePdf() {
    if (!this.confirmIfProblems()) return;
    const [{ scenesToPdf }, sides] = await Promise.all([import('../output/pdf'), buildCard(this.s.card, this.s.qr, fontStore)]);
    const bytes = await scenesToPdf(
      sides.map((s) => s.scene),
      '名刺（QRcode-Converter）',
    );
    download(bytes, `meishi_${stamp()}.pdf`, 'application/pdf');
  }

  private async savePng() {
    const keys: SideKey[] = this.s.card.duplex ? ['front', 'back'] : ['front'];
    for (const k of keys) {
      const r = await buildSide(this.s.card[k], this.s.card, this.s.qr, fontStore);
      const canvas = renderToCanvas(r.scene, 350, { includeBleed: false });
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const png = withPhys(new Uint8Array(await blob.arrayBuffer()), 350);
      download(png, `meishi_${stamp()}${this.s.card.duplex ? (k === 'front' ? '_omote' : '_ura') : ''}.png`, 'image/png');
    }
  }
}
