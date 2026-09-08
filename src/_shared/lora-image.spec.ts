import { environment } from 'src/environments/environment';
import { loraThumbnailUrl } from './lora-image';

describe('LoRA thumbnails', () => {
  it('resolves local images against the API and replaces an existing size', () => {
    expect(loraThumbnailUrl('/lora-image/7?w=500', 160)).toBe(`${environment.apiBaseUrl}/lora-image/7?w=160`);
  });
  it('requests smaller CivitAI images in supported URL formats', () => {
    expect(loraThumbnailUrl('https://image.civitai.com/example/original=true/fox.jpeg', 160))
      .toBe('https://image.civitai.com/example/width=160/fox.jpeg');
    expect(loraThumbnailUrl('https://image.civitai.com/fox.jpeg?w=500', 160))
      .toBe('https://image.civitai.com/fox.jpeg?width=160');
  });
  it('preserves other image URLs and handles absent previews', () => {
    expect(loraThumbnailUrl('/assets/Sanic.webp', 160)).toBe('/assets/Sanic.webp');
    expect(loraThumbnailUrl(null, 160)).toBe('');
  });
});
