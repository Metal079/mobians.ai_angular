import { normaliseRegionalConfig } from './regional-state';
import { applyTemplate, applyTemplateToConfig, REGIONAL_TEMPLATES } from './regional-templates';

const template = (id: string) => REGIONAL_TEMPLATES.find(item => item.id === id)!;

describe('regional-templates', () => {
  it('offers the layouts named in the spec, each inside the image', () => {
    expect(REGIONAL_TEMPLATES.map(item => item.id)).toEqual([
      'left-right', 'top-bottom', 'three-columns', 'grid-2x2', 'center-subject', 'three-characters', 'character-scenery',
    ]);
    for (const item of REGIONAL_TEMPLATES) {
      for (const box of item.boxes) {
        expect(box.x + box.width).toBeLessThanOrEqual(1 + 1e-9);
        expect(box.y + box.height).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('moves existing prompts into the new boxes in order and creates the rest empty', () => {
    const current = normaliseRegionalConfig({
      enabled: false, version: 2,
      regions: [
        { id: 'a', prompt: 'sonic', negative_prompt: 'x', x: 0.4, y: 0.4, width: 0.2, height: 0.2, strength: 0.6, feather: 40 },
        { id: 'empty', prompt: '', x: 0, y: 0, width: 0.2, height: 0.2 },
        { id: 'b', prompt: 'shadow', x: 0.7, y: 0.7, width: 0.2, height: 0.2 },
      ],
    }).regions;
    const result = applyTemplate(current, template('three-columns'));
    expect(result.keptOutside).toBe(0);
    expect(result.regions.map(region => region.prompt)).toEqual(['sonic', 'shadow', '']);
    expect(result.regions[0]).toEqual(jasmine.objectContaining({ id: 'a', x: 0, width: 1 / 3, height: 1, strength: 0.6, feather: 40, negative_prompt: 'x' }));
    expect(result.regions[1]).toEqual(jasmine.objectContaining({ id: 'b', x: 1 / 3 }));
    expect(new Set(result.regions.map(region => region.id)).size).toBe(3);
  });

  it('keeps prompts that do not fit the layout where they were', () => {
    const current = normaliseRegionalConfig({
      enabled: true, version: 2,
      regions: ['a', 'b', 'c'].map((prompt, i) => ({ id: prompt, prompt, x: i * 0.3, y: 0, width: 0.2, height: 0.2 })),
    }).regions;
    const result = applyTemplate(current, template('left-right'));
    expect(result.keptOutside).toBe(1);
    expect(result.regions.map(region => [region.prompt, region.x])).toEqual([['a', 0], ['b', 0.5], ['c', 0.6]]);
  });

  it('switches regions on when applied to the live config', () => {
    const config = normaliseRegionalConfig({ enabled: false, version: 2, regions: [] });
    applyTemplateToConfig(config, template('grid-2x2'));
    expect(config.enabled).toBeTrue();
    expect(config.regions.length).toBe(4);
    expect(config.regions.every(region => region.prompt === '' && region.inherit_base_prompt)).toBeTrue();
  });
});
