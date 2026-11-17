import { layoutHintText, positionPhrase, readingOrder } from './regional-layout-hints';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('regional-layout-hints (SPEC 3)', () => {
  it('uses image-frame wording for full-height, full-width and small boxes', () => {
    expect(positionPhrase(box(0, 0, 0.5, 1))).toBe('on the left side of the image');
    expect(positionPhrase(box(0.5, 0, 0.5, 1))).toBe('on the right side of the image');
    expect(positionPhrase(box(0.3, 0, 0.4, 0.9))).toBe('in the middle of the image');
    expect(positionPhrase(box(0, 0, 1, 0.3))).toBe('at the top of the image');
    expect(positionPhrase(box(0, 0.35, 1, 0.3))).toBe('across the middle of the image');
    expect(positionPhrase(box(0, 0.7, 1, 0.3))).toBe('at the bottom of the image');
    expect(positionPhrase(box(0.4, 0.4, 0.2, 0.2))).toBe('in the center of the image');
    expect(positionPhrase(box(0, 0, 0.3, 0.3))).toBe('in the top left of the image');
    expect(positionPhrase(box(0.7, 0.7, 0.3, 0.3))).toBe('in the bottom right of the image');
    expect(positionPhrase(box(0.4, 0, 0.2, 0.3))).toBe('at the top of the image');
    expect(positionPhrase(box(0, 0.4, 0.3, 0.2))).toBe('on the left side of the image');
  });

  it('orders regions top-to-bottom in thirds, then left to right', () => {
    const regions = [box(0.6, 0.7, 0.2, 0.2), box(0.6, 0, 0.3, 0.2), box(0, 0.05, 0.3, 0.2), box(0, 0.7, 0.2, 0.2)];
    expect(readingOrder(regions)).toEqual([regions[2], regions[1], regions[3], regions[0]]);
  });

  it('writes one sentence per region with a prompt', () => {
    const text = layoutHintText([
      { id: 'b', prompt: '1boy, blue jacket.', x: 0.5, y: 0, width: 0.5, height: 1, feather: 24, inherit_base_prompt: true, denoise_strength: 1, opacity: 1 },
      { id: 'a', prompt: '1girl, red hair', x: 0, y: 0, width: 0.5, height: 1, feather: 24, inherit_base_prompt: true, denoise_strength: 1, opacity: 1 },
      { id: 'c', prompt: '  ', x: 0.4, y: 0.4, width: 0.2, height: 0.2, feather: 24, inherit_base_prompt: true, denoise_strength: 1, opacity: 1 },
    ]);
    expect(text).toBe('On the left side of the image: 1girl, red hair. On the right side of the image: 1boy, blue jacket.');
  });
});
