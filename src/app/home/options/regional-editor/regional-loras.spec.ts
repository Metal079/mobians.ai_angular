import {
  clampLoraStrength, findCatalogLora, missingTriggerWords, normaliseRegionLoras, regionLoraFromCatalog, regionLoraPayload,
  sameLora, searchRegionLoras, withTriggerWords,
} from './regional-loras';

const catalog = [
  { id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', base_model: 'Illustrious', trigger_words: ['amy rose', 'red dress'], uses: 90 },
  { id: 12, version_id: 1201, name: 'Shadow', version: 'v1', base_model: 'Illustrious', trigger_words: [], uses: 80 },
  { id: 13, version_id: 1301, name: 'Rouge', version: 'v1', base_model: 'Illustrious', is_nsfw: true, uses: 70 },
  { id: 14, version_id: 1401, name: 'Cream', version: 'anima', base_model: 'Anima', uses: 60 },
  { id: null, version_id: null, name: 'Broken row', version: '', base_model: 'Illustrious' },
];

describe('regional-loras', () => {
  it('normalises region LoRAs: catalog ids only, strength in the LoRA range, no repeats, at most 2', () => {
    const loras = normaliseRegionLoras([
      { id: '11', version_id: 1101, name: ' Amy Rose ', version: 'v2', strength: 9, file_path: 'C:/x.safetensors', base_model: 'Illustrious' },
      { version_id: 1101, strength: 0.5 },                 // same LoRA again
      { name: 'no id' },
      'junk',
      { version_id: 1201, strength: 'abc' },
      { id: 17 },                                           // over the per-region limit
    ]);
    expect(loras).toEqual([
      { id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 1.5, base_model: 'Illustrious' },
      { id: null, version_id: 1201, name: '', version: '', strength: 0.8 },
    ]);
    expect(normaliseRegionLoras('nope')).toEqual([]);
    expect(clampLoraStrength(-1)).toBe(0);
    expect(clampLoraStrength(0.333)).toBe(0.33);
  });

  it('builds the entry from the catalog (default strength 0.8) and sends only the contract fields', () => {
    const lora = regionLoraFromCatalog(catalog[0])!;
    expect(lora).toEqual({ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.8, base_model: 'Illustrious' });
    expect(regionLoraPayload(lora)).toEqual({ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.8 });
    expect(regionLoraFromCatalog(catalog[4])).toBeNull();
  });

  it('matches LoRAs by version id or row id', () => {
    expect(sameLora({ version_id: 1101 }, { id: 11, version_id: 1101 })).toBeTrue();
    expect(sameLora({ id: '11' }, { id: 11 })).toBeTrue();
    expect(sameLora({ id: 11 }, { id: 12, version_id: 1101 })).toBeFalse();
    expect(findCatalogLora(catalog, { version_id: 1201 })?.name).toBe('Shadow');
    expect(findCatalogLora(catalog, { id: 14 })?.name).toBe('Cream');
    expect(findCatalogLora(catalog, { id: 99 })).toBeUndefined();
  });

  it('searches only LoRAs for the model\'s base model, hides NSFW unless shown, and leaves chosen ones out', () => {
    const all = searchRegionLoras(catalog, { baseModel: 'Illustrious' });
    expect(all.results.map(entry => entry.name)).toEqual(['Amy Rose', 'Shadow']);
    expect(searchRegionLoras(catalog, { baseModel: 'Illustrious', showNsfw: true }).total).toBe(3);
    expect(searchRegionLoras(catalog, { baseModel: 'Illustrious', query: 'red dress' }).results.map(e => e.name)).toEqual(['Amy Rose']);
    expect(searchRegionLoras(catalog, { baseModel: 'Illustrious', exclude: [{ version_id: 1101 }] }).results.map(e => e.name)).toEqual(['Shadow']);
    expect(searchRegionLoras(catalog, { baseModel: 'Anima' }).results.map(e => e.name)).toEqual(['Cream']);
    expect(searchRegionLoras(catalog, { baseModel: null }).total).toBe(0);
    expect(searchRegionLoras(catalog, { baseModel: 'Illustrious', showNsfw: true, limit: 1 })).toEqual(
      jasmine.objectContaining({ total: 3 }));
  });

  it('adds only the trigger words the box prompt lacks', () => {
    expect(missingTriggerWords('Amy Rose, smiling', ['amy rose', 'red dress', 'Red Dress'])).toEqual(['red dress']);
    expect(missingTriggerWords('', null)).toEqual([]);
    expect(withTriggerWords('smiling, ', ['amy rose', 'red dress'])).toBe('smiling, amy rose, red dress');
    expect(withTriggerWords('', ['amy rose'])).toBe('amy rose');
    expect(withTriggerWords('smiling', [])).toBe('smiling');
  });
});
