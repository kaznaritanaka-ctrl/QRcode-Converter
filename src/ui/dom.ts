type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | null | undefined | false;

/** 小さなDOM組み立てヘルパー */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** ラジオボタン風の選択肢（segmented control） */
export function segmented<T extends string>(
  name: string,
  options: Array<{ value: T; label: string; icon?: string; title?: string }>,
  current: T,
  onChange: (v: T) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'seg', role: 'radiogroup', 'aria-label': name },
    ...options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': o.value === current ? 'true' : 'false',
          class: o.value === current ? 'on' : '',
          title: o.title,
          onclick: () => onChange(o.value),
        },
        o.icon ? h('span', { class: 'seg-icon', html: o.icon, 'aria-hidden': 'true' }) : null,
        o.label,
      ),
    ),
  );
}

export function field(label: string, control: Node, hint?: string): HTMLElement {
  return h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

export function slider(opts: { min: number; max: number; step: number; value: number; format: (v: number) => string; onInput: (v: number) => void; label: string }): HTMLElement {
  const out = h('output', {}, opts.format(opts.value));
  const input = h('input', {
    type: 'range',
    min: opts.min,
    max: opts.max,
    step: opts.step,
    value: opts.value,
    'aria-label': opts.label,
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      out.textContent = opts.format(v);
      opts.onInput(v);
    },
  });
  return h('div', { class: 'slider' }, input, out);
}

export function download(data: Uint8Array | Blob, filename: string, type: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
