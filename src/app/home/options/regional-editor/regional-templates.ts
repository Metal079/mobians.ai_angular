/**
 * One-tap layouts (SPEC 5). Applying a layout keeps the existing prompts in order by moving them into the new
 * boxes; only boxes without a prompt are created empty. Regions that do not fit stay where they were.
 */
import { RegionalPromptingConfig, RegionalPromptRegion } from 'src/_shared/regional-prompting.interface';
import { clampBox, cloneRegion, createRegion, RegionBox } from './regional-state';

export interface RegionalTemplateBox extends RegionBox { name: string; }

export interface RegionalTemplate {
  id: string;
  label: string;
  description: string;
  boxes: RegionalTemplateBox[];
}

const third = 1 / 3;

export const REGIONAL_TEMPLATES: RegionalTemplate[] = [
  {
    id: 'left-right', label: 'Left / Right', description: 'Two characters side by side',
    boxes: [
      { name: 'Left', x: 0, y: 0, width: 0.5, height: 1 },
      { name: 'Right', x: 0.5, y: 0, width: 0.5, height: 1 },
    ],
  },
  {
    id: 'top-bottom', label: 'Top / Bottom', description: 'Sky and ground, or above and below',
    boxes: [
      { name: 'Top', x: 0, y: 0, width: 1, height: 0.5 },
      { name: 'Bottom', x: 0, y: 0.5, width: 1, height: 0.5 },
    ],
  },
  {
    id: 'three-columns', label: 'Three columns', description: 'Three equal vertical strips',
    boxes: [
      { name: 'Left', x: 0, y: 0, width: third, height: 1 },
      { name: 'Middle', x: third, y: 0, width: third, height: 1 },
      { name: 'Right', x: 2 * third, y: 0, width: third, height: 1 },
    ],
  },
  {
    id: 'grid-2x2', label: '2 × 2 grid', description: 'Four quarters',
    boxes: [
      { name: 'Top left', x: 0, y: 0, width: 0.5, height: 0.5 },
      { name: 'Top right', x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { name: 'Bottom left', x: 0, y: 0.5, width: 0.5, height: 0.5 },
      { name: 'Bottom right', x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ],
  },
  {
    id: 'center-subject', label: 'Center subject', description: 'One subject; the main prompt paints the rest',
    boxes: [{ name: 'Subject', x: 0.25, y: 0.15, width: 0.5, height: 0.8 }],
  },
  {
    id: 'three-characters', label: 'Three characters', description: 'Left, center and right characters',
    boxes: [
      { name: 'Left character', x: 0.02, y: 0.12, width: 0.31, height: 0.86 },
      { name: 'Center character', x: 0.345, y: 0.08, width: 0.31, height: 0.9 },
      { name: 'Right character', x: 0.67, y: 0.12, width: 0.31, height: 0.86 },
    ],
  },
  {
    id: 'character-scenery', label: 'Character + scenery', description: 'A scenery box with a character on top',
    boxes: [
      { name: 'Scenery', x: 0, y: 0, width: 1, height: 1 },
      { name: 'Character', x: 0.28, y: 0.18, width: 0.44, height: 0.8 },
    ],
  },
];

const hasContent = (region: RegionalPromptRegion): boolean =>
  !!(region.prompt?.trim() || region.negative_prompt?.trim() || region.loras?.length);

export interface TemplateResult {
  regions: RegionalPromptRegion[];
  /** Regions with a prompt that had no box in the layout and were left in place. */
  keptOutside: number;
}

/** Pure: builds the regions for a layout from the current ones. */
export function applyTemplate(current: RegionalPromptRegion[], template: RegionalTemplate, inherit = true): TemplateResult {
  const withContent = current.filter(hasContent);
  const usedIds = new Set<string>(current.map(region => region.id));
  const regions = template.boxes.map((box, index) => {
    const source = withContent[index];
    if (source) {
      return clampBox({ ...cloneRegion(source), x: box.x, y: box.y, width: box.width, height: box.height });
    }
    // Names stay empty so every box is labelled the same way (its prompt, or "Region n").
    const created = createRegion(box, { existingIds: usedIds, inherit });
    usedIds.add(created.id);
    return created;
  });
  const extras = withContent.slice(template.boxes.length).map(cloneRegion);
  return { regions: [...regions, ...extras], keptOutside: extras.length };
}

/** Applies a layout to the live config in place and switches regions on. */
export function applyTemplateToConfig(config: RegionalPromptingConfig, template: RegionalTemplate): TemplateResult {
  const inherit = config.regions.length ? config.regions.every(region => region.inherit_base_prompt !== false) : true;
  const result = applyTemplate(config.regions, template, inherit);
  config.regions = result.regions;
  config.enabled = true;
  return result;
}
