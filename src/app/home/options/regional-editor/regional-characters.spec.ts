import { describeCharacterLoraSkips, planCharacterLoras } from './regional-characters';

const catalog = [
  { id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', base_model: 'Illustrious' },
  { id: 12, version_id: 1201, name: 'Shadow', version: 'v1', base_model: 'Illustrious' },
  { id: 14, version_id: 1401, name: 'Watercolor', version: 'v1', base_model: 'Illustrious' },
  { id: 15, version_id: 1501, name: 'Cream', version: 'v1', base_model: 'Anima' },
];
const base = { catalog, baseModel: 'Illustrious', regionLoras: true, room: 2, jobLoras: [] };

describe('regional characters', () => {
  it('keeps compatible LoRAs with the look strength and the catalog identity', () => {
    const plan = planCharacterLoras([{ id: 11, version_id: 1101, name: 'Amy (old name)', strength: 0.9 }, { version_id: 1401, strength: 2 }], base);
    expect(plan.slots).toBe(2);
    expect(plan.skipped).toEqual([]);
    expect(plan.usable).toEqual([
      { id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.9, base_model: 'Illustrious' },
      { id: 14, version_id: 1401, name: 'Watercolor', version: 'v1', strength: 1.5, base_model: 'Illustrious' },
    ]);
  });

  it('offers every compatible LoRA when there are more than the box takes (the user chooses)', () => {
    const plan = planCharacterLoras([{ id: 11 }, { id: 12 }, { id: 14 }], base);
    expect(plan.usable.map(lora => lora.id)).toEqual([11, 12, 14]);
    expect(plan.slots).toBe(2);
  });

  it('limits the slots to what is left of the image limit, never above 2', () => {
    expect(planCharacterLoras([{ id: 11 }], { ...base, room: 1 }).slots).toBe(1);
    expect(planCharacterLoras([{ id: 11 }], { ...base, room: 0 }).slots).toBe(0);
    expect(planCharacterLoras([{ id: 11 }], { ...base, room: 5 }).slots).toBe(2);
  });

  it('skips LoRAs for another base model, gone from the catalog, or already in the LoRA panel', () => {
    const plan = planCharacterLoras(
      [{ id: 15, name: 'Cream' }, { id: 99, name: 'Retired LoRA' }, { id: 12, name: 'Shadow' }, { id: 11 }, { id: 11 }],
      { ...base, jobLoras: [{ id: 12, version_id: 1201 }] });
    expect(plan.usable.map(lora => lora.id)).toEqual([11]);
    expect(plan.skipped).toEqual([
      { name: 'Cream', reason: 'other-model', baseModel: 'Anima' },
      { name: 'Retired LoRA', reason: 'unavailable' },
      { name: 'Shadow', reason: 'in-panel' },
    ]);
    expect(describeCharacterLoraSkips(plan.skipped, 'novaMobianXL_v20', 'Illustrious')).toEqual([
      '"Cream" is made for Anima, not Illustrious.',
      '"Retired LoRA" is no longer available.',
      '"Shadow" is already in the LoRA panel for the whole image.',
    ]);
  });

  it('adds no LoRAs on a model without LoRAs per region, and says so once', () => {
    const plan = planCharacterLoras([{ id: 11 }, { id: 12 }], { ...base, regionLoras: false, baseModel: 'Krea 2' });
    expect(plan.usable).toEqual([]);
    expect(plan.slots).toBe(0);
    expect(describeCharacterLoraSkips(plan.skipped, 'Kroma Krea 2')).toEqual(['Kroma Krea 2 does not use LoRAs per region, so its LoRAs were not added.']);
  });

  it('ignores entries without a catalog id and handles a look without LoRAs', () => {
    expect(planCharacterLoras([{ name: 'no id' } as any, null as any], base)).toEqual({ usable: [], slots: 2, skipped: [] });
    expect(planCharacterLoras(undefined, base)).toEqual({ usable: [], slots: 2, skipped: [] });
  });
});
