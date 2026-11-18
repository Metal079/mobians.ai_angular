import {
  buildRegionalPayload, clampBox, cloneRegionalConfig, composedRegionPrompt, regionTextWeight, createRegion, describeRegionLoraSkips, emptyRegionalConfig,
  normaliseRegionalConfig, regionalStatus, regionLoraBudget, resolveRegionalCapability, sharedSubjectTag, REGIONAL_JOB_TYPES,
} from './regional-state';

const sdxl = { model_id: 'novaMobianXL_v20', display_name: 'novaMobianXL_v20', base_model: 'Illustrious', supports_regional_prompting: true };
const anima = { model_id: 'RDBT-Anima', display_name: 'RDBT-Anima', base_model: 'Anima', supports_regional_prompting: true };
const krea = { model_id: 'Kroma-Krea2', display_name: 'Kroma Krea 2', base_model: 'Krea 2', supports_regional_prompting: true, supports_negative_prompt: false };
const sd15 = { model_id: 'sonicDiffusionV4', display_name: 'SonicDiffusionV4', base_model: 'SD 1.5', supports_regional_prompting: false };

const v1Region = (extra: any = {}) => ({
  id: 'a', prompt: 'sonic', negative_prompt: 'shadow', x: 0, y: 0, width: 0.5, height: 1,
  denoise_strength: 0.8, feather: 32, opacity: 0.5, ...extra,
});

describe('regional-state: normalising stored settings', () => {
  it('reads version 1: strength = denoise_strength x opacity, missing inherit = true, layout hints off', () => {
    const config = normaliseRegionalConfig({ enabled: true, regions: [v1Region()] });
    expect(config.version).toBe(2);
    expect(config.separation).toBe('balanced');
    expect(config.layout_hints).toBeFalse();
    expect(config.regions[0].strength).toBeCloseTo(0.4, 6);
    expect(config.regions[0].denoise_strength).toBeCloseTo(0.4, 6);
    expect(config.regions[0].opacity).toBe(1);
    expect(config.regions[0].inherit_base_prompt).toBeTrue();
    expect(config.regions[0].feather).toBe(32);
  });

  it('keeps version 2 fields and reads hybrids per region', () => {
    const config = normaliseRegionalConfig({
      enabled: true, version: 2, separation: 'strict', layout_hints: false,
      regions: [{ ...v1Region(), strength: 0.7, name: 'Left' }, v1Region({ id: 'b', denoise_strength: 1, opacity: 1 })],
    });
    expect(config.separation).toBe('strict');
    expect(config.layout_hints).toBeFalse();
    expect(config.regions[0].strength).toBe(0.7);
    expect(config.regions[0].name).toBe('Left');
    expect(config.regions[1].strength).toBe(1);
  });

  it('keeps empty regions in the working state, repairs ids and clamps geometry', () => {
    const config = normaliseRegionalConfig({
      enabled: true, version: 2,
      regions: [
        { id: 'same', prompt: '', x: 0.9, y: -1, width: 0.5, height: 2, feather: 999 },
        { id: 'same', prompt: 'b', x: 'nope', y: 0, width: 0.001, height: 0.2 },
        null,
      ],
    });
    expect(config.regions.length).toBe(2);
    expect(config.regions[0].id).not.toBe(config.regions[1].id);
    expect(config.regions[0]).toEqual(jasmine.objectContaining({ x: 0.5, y: 0, width: 0.5, height: 1, feather: 160 }));
    expect(config.regions[1]).toEqual(jasmine.objectContaining({ x: 0, width: 0.03 }));
  });

  it('returns an empty switched-off config for missing or malformed input', () => {
    expect(normaliseRegionalConfig(null)).toEqual(emptyRegionalConfig());
    expect(normaliseRegionalConfig('x').regions).toEqual([]);
    expect(normaliseRegionalConfig({ enabled: 'yes', regions: 'no' }).enabled).toBeFalse();
  });

  it('gives the old empty default ({enabled: false, regions: []}) the version 2 layout-hint default', () => {
    expect(normaliseRegionalConfig({ enabled: false, regions: [] })).toEqual(emptyRegionalConfig());
    expect(normaliseRegionalConfig({ enabled: true, regions: [v1Region()] }).layout_hints).toBeFalse();
  });

  it('creates regions with the version 2 defaults inside the image', () => {
    const region = createRegion({ x: 0.9, y: 0.9, width: 0.4, height: 0.4 }, { existingIds: ['r-1'] });
    expect(region).toEqual(jasmine.objectContaining({ x: 0.6, y: 0.6, strength: 1, denoise_strength: 1, opacity: 1, feather: 24, inherit_base_prompt: true, prompt: '' }));
    expect(clampBox({ x: 0.5, y: 0.5, width: 1, height: 0 }).height).toBe(0.03);
  });
});

describe('regional-state: model capability', () => {
  it('falls back from base_model when /models has no regional object', () => {
    expect(resolveRegionalCapability(sdxl)).toEqual({
      supported: true, max_regions: 8, negative_prompts: true, layout_hints: false, job_types: REGIONAL_JOB_TYPES,
      region_loras: false, max_region_loras: 0, max_total_loras: 3,
    });
    expect(resolveRegionalCapability(anima).negative_prompts).toBeTrue();
    expect(resolveRegionalCapability(krea)).toEqual(jasmine.objectContaining({ supported: true, negative_prompts: false, layout_hints: true }));
    expect(resolveRegionalCapability(sd15).supported).toBeFalse();
    expect(resolveRegionalCapability(undefined).supported).toBeFalse();
  });

  it('uses the regional capability object when present', () => {
    const capability = resolveRegionalCapability({
      ...sdxl, regional: { supported: true, max_regions: 6, negative_prompts: false, layout_hints: true, job_types: ['txt2img'] },
    });
    expect(capability).toEqual({
      supported: true, max_regions: 6, negative_prompts: false, layout_hints: true, job_types: ['txt2img'],
      region_loras: false, max_region_loras: 0, max_total_loras: 3,
    });
    expect(resolveRegionalCapability({ ...sdxl, regional: { supported: false } }).supported).toBeFalse();
    expect(resolveRegionalCapability({ ...krea, regional: { negative_prompts: true } }).negative_prompts).toBeFalse();
  });

  it('keeps the shared region limit on a model whose /models entry says unsupported (max_regions 0)', () => {
    // What the backend sends for SD 1.5 and Klein: regions are paused there, and the editor must not read "3/1".
    const capability = resolveRegionalCapability({
      ...sd15, regional: { supported: false, max_regions: 0, negative_prompts: false, layout_hints: false, job_types: [] },
    });
    expect(capability.supported).toBeFalse();
    expect(capability.max_regions).toBe(8);
  });
});

describe('regional-state: job payload (SPEC 1)', () => {
  const working = () => normaliseRegionalConfig({
    enabled: true, version: 2, separation: 'soft', layout_hints: true,
    regions: [
      { id: 'r-1', name: ' Hero ', prompt: '  sonic  ', negative_prompt: ' shadow ', x: 0.3333333, y: 0, width: 0.6666667, height: 1, strength: 0.5, feather: 23.6 },
      { id: 'r-2', prompt: '   ', x: 0, y: 0, width: 0.5, height: 0.5 },
      { id: 'r-3', prompt: 'moon', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    ],
  });

  it('sends version 2 with the version 1 fields filled and empty regions left out', () => {
    const report = buildRegionalPayload(working(), resolveRegionalCapability(sdxl), 'txt2img');
    expect(report.status).toBe('sent');
    expect(report.emptyRegions).toEqual([2]);
    const payload = report.payload;
    expect(payload).toEqual(jasmine.objectContaining({ enabled: true, version: 2, separation: 'soft', layout_hints: true }));
    expect(payload.regions.map(region => region.id)).toEqual(['r-1', 'r-3']);
    const first = payload.regions[0];
    expect(first).toEqual(jasmine.objectContaining({
      prompt: 'sonic', negative_prompt: 'shadow', strength: 0.5, denoise_strength: 0.5, opacity: 1, feather: 24, inherit_base_prompt: true,
    }));
    expect('name' in first).toBeFalse();            // an old saved name is not sent (the editor has no name field)
    expect(first.x + first.width).toBeLessThanOrEqual(1);
    expect('name' in payload.regions[1]).toBeFalse();
  });

  it('drops region negatives for models without them (Krea 2)', () => {
    const payload = buildRegionalPayload(working(), resolveRegionalCapability(krea), 'txt2img').payload;
    expect(payload.regions[0].negative_prompt).toBe('');
  });

  it('pauses instead of sending for unsupported models and job types', () => {
    expect(buildRegionalPayload(working(), resolveRegionalCapability(sd15), 'txt2img')).toEqual(jasmine.objectContaining({ status: 'paused-model', payload: { enabled: false, regions: [] } }));
    const textOnly = resolveRegionalCapability({ ...sdxl, regional: { job_types: ['txt2img'] } });
    expect(buildRegionalPayload(working(), textOnly, 'inpainting').status).toBe('paused-job');
    expect(buildRegionalPayload(working(), textOnly, 'txt2img').status).toBe('sent');
  });

  it('reports switched-off, prompt-less and over-limit states', () => {
    expect(buildRegionalPayload({ ...working(), enabled: false }, resolveRegionalCapability(sdxl)).status).toBe('off');
    const empty = normaliseRegionalConfig({ enabled: true, version: 2, regions: [{ prompt: '' }, { prompt: ' ' }] });
    expect(buildRegionalPayload(empty, resolveRegionalCapability(sdxl))).toEqual(jasmine.objectContaining({ status: 'no-prompts', emptyRegions: [1, 2] }));
    const many = normaliseRegionalConfig({ enabled: true, version: 2, regions: Array.from({ length: 10 }, (_, i) => ({ prompt: `p${i}` })) });
    const report = buildRegionalPayload(many, resolveRegionalCapability(sdxl));
    expect(report.payload.regions.length).toBe(8);
    expect(report.overLimit).toBe(2);
  });

  it('leaves out regions at 0% strength (region off) without using a model slot', () => {
    const config = normaliseRegionalConfig({
      enabled: true, version: 2,
      regions: [
        { id: 'off', prompt: 'ghost', strength: 0 },
        ...Array.from({ length: 8 }, (_, i) => ({ id: `r-${i}`, prompt: `p${i}`, strength: 1 })),
      ],
    });
    const report = buildRegionalPayload(config, resolveRegionalCapability(sdxl), 'txt2img');
    expect(report.status).toBe('sent');
    expect(report.offRegions).toEqual([1]);
    expect(report.overLimit).toBe(0);
    expect(report.payload.regions.map(region => region.id)).toEqual(['r-0', 'r-1', 'r-2', 'r-3', 'r-4', 'r-5', 'r-6', 'r-7']);

    const allOff = normaliseRegionalConfig({ enabled: true, version: 2, regions: [{ prompt: 'a', strength: 0 }, { prompt: '' }] });
    const offReport = buildRegionalPayload(allOff, resolveRegionalCapability(sdxl), 'txt2img');
    expect(offReport).toEqual(jasmine.objectContaining({ status: 'all-off', payload: { enabled: false, regions: [] }, emptyRegions: [2], offRegions: [1] }));
    const status = regionalStatus(allOff, resolveRegionalCapability(sdxl), 'txt2img');
    expect(status.kind).toBe('warning');
    expect(status.detail).toContain('0% strength');
  });

  it('upgrades a version 1 payload from history before sending it', () => {
    const payload = buildRegionalPayload({ enabled: true, regions: [v1Region()] } as any, resolveRegionalCapability(sdxl)).payload;
    expect(payload.version).toBe(2);
    expect(payload.layout_hints).toBeFalse();
    expect(payload.regions[0].strength).toBeCloseTo(0.4, 6);
  });

  it('rounds box edges, not sizes, so touching boxes still touch: three columns leave no 0.01% gap', () => {
    const third = 1 / 3;
    const columns = normaliseRegionalConfig({
      enabled: true, version: 2,
      regions: [0, 1, 2].map(index => ({ id: `c${index}`, prompt: `column ${index}`, x: index * third, y: 0, width: third, height: 1 })),
    });
    const [left, middle, right] = buildRegionalPayload(columns, resolveRegionalCapability(sdxl), 'txt2img').payload.regions;
    expect([left.x, middle.x, right.x]).toEqual([0, 0.3333, 0.6667]);
    expect([left.width, middle.width, right.width]).toEqual([0.3333, 0.3334, 0.3333]);
    expect(left.x + left.width).toBeCloseTo(middle.x, 12);
    expect(middle.x + middle.width).toBeCloseTo(right.x, 12);
    expect(right.x + right.width).toBeCloseTo(1, 12);
  });

  it('keeps every sent box inside the image and at least the minimum size after rounding', () => {
    const odd = normaliseRegionalConfig({
      enabled: true, version: 2,
      regions: [
        { id: 'a', prompt: 'tiny', x: 0.00005, y: 0.99, width: 0.03, height: 0.03 },
        { id: 'b', prompt: 'edge', x: 0.97004, y: 0.4, width: 0.02996, height: 0.6 },
        { id: 'c', prompt: 'full', x: 0, y: 0, width: 1, height: 1 },
      ],
    });
    for (const box of buildRegionalPayload(odd, resolveRegionalCapability(sdxl), 'txt2img').payload.regions) {
      expect(box.width).toBeGreaterThanOrEqual(0.03);
      expect(box.height).toBeGreaterThanOrEqual(0.03);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1 + 1e-12);
      expect(box.y + box.height).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
});

describe('regional-state: status chip and coaching', () => {
  it('counts only the regions that are sent', () => {
    const config = normaliseRegionalConfig({ enabled: true, version: 2, regions: [{ prompt: 'a' }, { prompt: 'b', strength: 0 }] });
    expect(regionalStatus(config, resolveRegionalCapability(sdxl), 'txt2img')).toEqual(jasmine.objectContaining({ kind: 'on', label: 'Regions on · 1', count: 1 }));
  });

  it('describes on, paused and warning states', () => {
    const config = normaliseRegionalConfig({ enabled: true, version: 2, regions: [{ prompt: 'a' }, { prompt: '' }] });
    const warning = regionalStatus(config, resolveRegionalCapability(sdxl), 'txt2img', 'novaMobianXL_v20');
    expect(warning.kind).toBe('warning');
    expect(warning.label).toBe('Regions on · 1');
    expect(warning.detail).toContain('Region 2 has no prompt');
    config.regions[1].prompt = 'b';
    expect(regionalStatus(config, resolveRegionalCapability(sdxl), 'txt2img').kind).toBe('on');
    expect(regionalStatus(config, resolveRegionalCapability(sd15), 'txt2img', 'SonicDiffusionV4')).toEqual(jasmine.objectContaining({ kind: 'paused', label: 'Regions paused' }));
    expect(regionalStatus({ ...config, enabled: false }, resolveRegionalCapability(sdxl)).kind).toBe('off');
    expect(regionalStatus(emptyRegionalConfig(), resolveRegionalCapability(sd15)).kind).toBe('hidden');
  });

  it('previews the composed prompt and finds subjects shared with the main prompt', () => {
    expect(composedRegionPrompt('city, night', 'sonic', true)).toBe('city, night, sonic');
    expect(composedRegionPrompt('city, night', 'sonic', false)).toBe('sonic');
    expect(composedRegionPrompt('city, night', 'sonic', true, 1.2)).toBe('city, night, (sonic:1.2)');
    expect(regionTextWeight('sdxl', 'red balloon')).toBe(1.2);
    expect(regionTextWeight('sdxl', 'red (balloon:1.4)')).toBe(1);   // the user's own weight is left alone
    expect(regionTextWeight('sdxl', '(smile')).toBe(1);              // unbalanced: never wrapped
    expect(regionTextWeight('anima', 'red balloon')).toBe(1);
    expect(sharedSubjectTag('masterpiece, Sonic the Hedgehog, city', '(sonic the hedgehog:1.2), running')).toBe('sonic the hedgehog');
    expect(sharedSubjectTag('masterpiece, city', 'masterpiece, sonic')).toBeNull();
  });
});

describe('regional-state: LoRAs per region', () => {
  const regionLoras = { supported: true, max_regions: 8, negative_prompts: true, layout_hints: false, job_types: REGIONAL_JOB_TYPES, region_loras: true, max_region_loras: 2, max_total_loras: 3 };
  const sdxlWithLoras = { ...sdxl, regional: regionLoras };
  const kreaReported = { ...krea, regional: { ...regionLoras, negative_prompts: false, region_loras: false, max_region_loras: 0 } };
  const amy = { id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.6, base_model: 'Illustrious' };
  const shadow = { id: 12, version_id: 1201, name: 'Shadow', version: 'v1', strength: 0.8, base_model: 'Illustrious' };
  const knuckles = { id: 17, version_id: 1701, name: 'Knuckles', version: 'v3', strength: 1, base_model: 'Illustrious' };
  const withLoras = (...lists: any[][]) => normaliseRegionalConfig({
    enabled: true, version: 2,
    regions: lists.map((loras, index) => ({ id: `r${index + 1}`, prompt: `subject ${index + 1}`, x: index * 0.3, y: 0, width: 0.3, height: 1, loras })),
  });

  it('only a backend that reports region_loras turns them on (older backends drop them silently)', () => {
    expect(resolveRegionalCapability(sdxl).region_loras).toBeFalse();
    expect(resolveRegionalCapability({ ...sdxl, regional: { supported: true } }).region_loras).toBeFalse();
    expect(resolveRegionalCapability(sdxlWithLoras)).toEqual(jasmine.objectContaining({ region_loras: true, max_region_loras: 2, max_total_loras: 3 }));
    expect(resolveRegionalCapability(kreaReported).region_loras).toBeFalse();
    expect(resolveRegionalCapability({ ...sdxlWithLoras, supports_loras: false }).region_loras).toBeFalse();
    expect(resolveRegionalCapability({ ...sdxl, max_loras: 5 }).max_total_loras).toBe(5);
  });

  it('keeps region LoRAs in the working state and copies them deeply', () => {
    const config = withLoras([amy, { ...amy }, shadow, knuckles]);
    expect(config.regions[0].loras).toEqual([amy, shadow]);
    const copy = cloneRegionalConfig(config);
    copy.regions[0].loras![0].strength = 1.2;
    expect(config.regions[0].loras![0].strength).toBe(0.6);
    expect(normaliseRegionalConfig({ enabled: true, version: 2, regions: [{ prompt: 'a' }] }).regions[0].loras).toBeUndefined();
  });

  it('sends {id, version_id, name, version, strength} per region on models with region LoRAs', () => {
    const report = buildRegionalPayload(withLoras([amy], [shadow, { ...knuckles, strength: 0 }]), resolveRegionalCapability(sdxlWithLoras), 'txt2img',
      { jobLoras: [], baseModel: 'Illustrious' });
    expect(report.payload.regions[0].loras).toEqual([{ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.6 }]);
    expect(report.payload.regions[1].loras).toEqual([{ id: 12, version_id: 1201, name: 'Shadow', version: 'v1', strength: 0.8 }]);
    expect(report.regionLoras).toBe(2);
    // Regions without LoRAs keep exactly the old shape.
    const plain = buildRegionalPayload(withLoras([]), resolveRegionalCapability(sdxlWithLoras), 'txt2img');
    expect('loras' in plain.payload.regions[0]).toBeFalse();
  });

  it('pauses region LoRAs on models without them (Krea, older backends) and keeps the regions', () => {
    const config = withLoras([amy, shadow]);
    for (const model of [kreaReported, sdxl]) {
      const report = buildRegionalPayload(config, resolveRegionalCapability(model), 'txt2img');
      expect(report.status).toBe('sent');
      expect(report.payload.regions[0].loras).toBeUndefined();
      expect(report.regionLorasPaused).toBe(2);
      expect(report.regionLoras).toBe(0);
    }
    expect(config.regions[0].loras!.length).toBe(2);
    const status = regionalStatus(config, resolveRegionalCapability(kreaReported), 'txt2img', 'Kroma Krea 2');
    expect(status.warnings.join(' ')).toContain('Kroma Krea 2 does not use LoRAs per region');
  });

  it('pauses LoRAs made for another base model, skips copies of job LoRAs and keeps the per-image limit', () => {
    const capability = resolveRegionalCapability(sdxlWithLoras);
    const animaReport = buildRegionalPayload(withLoras([amy]), resolveRegionalCapability({ ...anima, regional: regionLoras }), 'txt2img', { baseModel: 'Anima' });
    expect(animaReport.regionLoraSkips).toEqual([{ region: 1, name: 'Amy Rose', reason: 'base-model', baseModel: 'Illustrious' }]);
    // A LoRA from history or a preset has no base model: the catalog lookup decides.
    const fromHistory = withLoras([{ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 1 }]);
    const looked = buildRegionalPayload(fromHistory, capability, 'txt2img', { baseModel: 'Anima', loraBaseModel: () => 'Illustrious' });
    expect(looked.regionLoraSkips[0].reason).toBe('base-model');

    const duplicate = buildRegionalPayload(withLoras([amy, shadow]), capability, 'txt2img', { jobLoras: [{ id: 11, version_id: 1101 }], baseModel: 'Illustrious' });
    expect(duplicate.payload.regions[0].loras!.map(l => l.name)).toEqual(['Shadow']);
    expect(duplicate.regionLoraSkips).toEqual([{ region: 1, name: 'Amy Rose', reason: 'job-lora' }]);

    // 3 per image: one job LoRA leaves two region LoRAs, in region order.
    const limited = buildRegionalPayload(withLoras([amy], [shadow, knuckles]), capability, 'txt2img', { jobLoras: [{ id: 99 }], baseModel: 'Illustrious' });
    expect(limited.regionLoras).toBe(2);
    expect(limited.regionLoraSkips).toEqual([{ region: 2, name: 'Knuckles', reason: 'limit' }]);
    const notes = describeRegionLoraSkips(limited, capability, 'novaMobianXL_v20', 'Illustrious');
    expect(notes[0]).toContain('Up to 3 LoRAs per image');
    expect(regionLoraBudget(capability, 0)).toBe(3);
    expect(regionLoraBudget({ ...capability, max_total_loras: 10 }, 1)).toBe(4);   // at most 4 region LoRAs per image
    expect(regionLoraBudget(capability, 5)).toBe(0);
  });
});
