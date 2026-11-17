/**
 * Plain-language position words (SPEC 3), used to preview what "layout hints" add to the main prompt.
 * The backend/worker compiles the text that the model actually reads; this mirrors the same rules.
 */
import { RegionalPromptRegion } from 'src/_shared/regional-prompting.interface';
import { RegionBox } from './regional-state';

const horizontal = (centre: number): 'left' | 'center' | 'right' => (centre < 0.4 ? 'left' : centre > 0.6 ? 'right' : 'center');
const vertical = (centre: number): 'top' | 'middle' | 'bottom' => (centre < 0.4 ? 'top' : centre > 0.6 ? 'bottom' : 'middle');

/** Always image-frame wording ("on the left side of the image"), never relative to a subject. */
export function positionPhrase(box: RegionBox): string {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (box.height >= 0.8) {
    const h = horizontal(cx);
    return h === 'left' ? 'on the left side of the image' : h === 'right' ? 'on the right side of the image' : 'in the middle of the image';
  }
  if (box.width >= 0.8) {
    const v = vertical(cy);
    return v === 'top' ? 'at the top of the image' : v === 'bottom' ? 'at the bottom of the image' : 'across the middle of the image';
  }
  const h = horizontal(cx);
  const v = vertical(cy);
  if (h === 'center' && v === 'middle') return 'in the center of the image';
  if (v === 'middle') return `on the ${h} side of the image`;
  if (h === 'center') return `at the ${v} of the image`;
  return `in the ${v} ${h} of the image`;
}

/** Reading order: top-to-bottom bands of one third of the height, then left to right. */
export function readingOrder<T extends RegionBox>(boxes: T[]): T[] {
  return boxes
    .map((box, index) => ({ box, index, band: Math.min(2, Math.floor((box.y + box.height / 2) * 3)), cx: box.x + box.width / 2 }))
    .sort((a, b) => a.band - b.band || a.cx - b.cx || a.index - b.index)
    .map(item => item.box);
}

/** "On the left side of the image: 1girl, red hair. On the right side of the image: 1boy." */
export function layoutHintText(regions: RegionalPromptRegion[]): string {
  return readingOrder(regions.filter(region => region.prompt?.trim() && (region.strength ?? 1) > 0))
    .map(region => {
      const phrase = positionPhrase(region);
      const prompt = region.prompt.trim().replace(/[.\s]+$/, '');
      return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}: ${prompt}.`;
    })
    .join(' ');
}
