import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { readPhysDpi, withPhys } from '../src/output/png';

describe('PNGの解像度情報', () => {
  it.each([350, 600])('%i dpi を書き込み、画像として壊れていない', (dpi) => {
    const img = new PNG({ width: 4, height: 3 });
    img.data.fill(255);
    const src = new Uint8Array(PNG.sync.write(img));
    const out = withPhys(src, dpi);
    expect(readPhysDpi(out)).toBe(dpi);
    const back = PNG.sync.read(Buffer.from(out));
    expect([back.width, back.height]).toEqual([4, 3]);
    // 2回書き込んでも pHYs は1つ
    const twice = withPhys(out, dpi);
    expect(Buffer.from(twice).toString('latin1').split('pHYs').length - 1).toBe(1);
  });
});
