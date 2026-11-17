import { Injectable, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { v4 as uuidv4 } from 'uuid';
import { RegionalPromptingConfig, RegionalPromptRegion, RegionalSeparation } from 'src/_shared/regional-prompting.interface';
import { RegionalPromptPreset, StableDiffusionService } from 'src/app/stable-diffusion.service';
import { regionLoraPayload } from './regional-loras';
import { cloneRegion, normaliseRegionalConfig, REGIONAL_LIMITS, REGIONAL_SEPARATIONS } from './regional-state';

export interface RegionalPreset {
  id: string;
  name: string;
  regions: RegionalPromptRegion[];
  separation?: RegionalSeparation;
  layout_hints?: boolean;
}

const LOCAL_KEY = 'mobians:regional-presets';
const MAX_PRESETS = 100;

/**
 * Regional layout presets (SPEC 5): synced to the account when signed in (`/regional-presets`, full replace),
 * kept in this browser for guests. Guest presets are offered to the account on the next sign-in.
 */
@Injectable({ providedIn: 'root' })
export class RegionalPresetsService {
  private readonly api = inject(StableDiffusionService);
  private readonly messages = inject(MessageService);

  readonly presets = signal<RegionalPreset[]>([]);
  /** True while the account list loads; saving waits for it so a late response cannot drop a save. */
  readonly loading = signal(false);
  readonly account = signal(false);

  private initialised = false;
  private pushing = false;
  private pushQueued = false;

  /** Called whenever the sign-in state may have changed. */
  setLoggedIn(loggedIn: boolean): void {
    if (this.initialised && loggedIn === this.account()) return;
    this.initialised = true;
    this.account.set(loggedIn);
    if (loggedIn) {
      this.loadAccount();
    } else {
      this.presets.set(this.readLocal());
    }
  }

  findByName(name: string): RegionalPreset | undefined {
    const key = name.trim().toLowerCase();
    return this.presets().find(preset => preset.name.toLowerCase() === key);
  }

  /** Saves the layout under `name`, replacing a preset with the same name (case-insensitive) in place. */
  save(name: string, config: RegionalPromptingConfig): RegionalPreset | null {
    const trimmed = name.trim().slice(0, REGIONAL_LIMITS.nameMax);
    if (!trimmed || !config.regions.length || this.loading()) return null;
    const existing = this.findByName(trimmed);
    const preset: RegionalPreset = {
      id: existing?.id ?? uuidv4(),
      name: trimmed,
      // The account store keeps at most 8 regions per preset (SPEC 4.7); browser presets follow the same limit.
      regions: config.regions.slice(0, REGIONAL_LIMITS.maxRegions).map(cloneRegion),
      separation: config.separation ?? 'balanced',
      layout_hints: config.layout_hints === true,
    };
    const list = this.presets();
    const next = existing ? list.map(item => (item.id === existing.id ? preset : item)) : [...list, preset].slice(-MAX_PRESETS);
    this.presets.set(next);
    this.persist();
    return preset;
  }

  remove(id: string): void {
    this.presets.set(this.presets().filter(preset => preset.id !== id));
    this.persist();
  }

  private persist(): void {
    if (this.account()) this.push();
    else this.writeLocal(this.presets());
  }

  private loadAccount(): void {
    this.loading.set(true);
    this.api.getRegionalPromptPresets().subscribe({
      next: (cloud) => {
        const fromAccount = this.normaliseList(cloud || []);
        const local = this.readLocal();
        const names = new Set(fromAccount.map(preset => preset.name.toLowerCase()));
        const imported = local.filter(preset => !names.has(preset.name.toLowerCase()));
        this.presets.set([...fromAccount, ...imported].slice(0, MAX_PRESETS));
        this.loading.set(false);
        if (imported.length) {
          this.push(() => this.writeLocal([]));
        } else if (local.length) {
          this.writeLocal([]);
        }
      },
      error: () => {
        this.loading.set(false);
        // Keep whatever this browser has, so the list is not empty while the account is unreachable.
        this.presets.set(this.readLocal());
        this.messages.add({ severity: 'warn', summary: 'Presets unavailable', detail: 'Your saved region presets could not be loaded. Try again later.', life: 5000 });
      },
    });
  }

  /** Posts the whole list; saves made while a post is in flight are sent right after it. */
  private push(onSuccess?: () => void): void {
    if (this.pushing) {
      this.pushQueued = true;
      return;
    }
    this.pushing = true;
    this.api.syncRegionalPromptPresets({ presets: this.presets().map(preset => this.serialise(preset)) }).subscribe({
      next: () => {
        this.pushing = false;
        onSuccess?.();
        if (this.pushQueued) {
          this.pushQueued = false;
          this.push();
        }
      },
      error: () => {
        this.pushing = false;
        this.pushQueued = false;
        // Keep a browser copy so nothing is lost; it is offered to the account again on the next sign-in.
        this.writeLocal(this.presets());
        this.messages.add({ severity: 'error', summary: 'Preset not saved to your account', detail: 'It is kept in this browser for now.', life: 5000 });
      },
    });
  }

  /** Version 2 fields are sent too; an older backend ignores what it does not know (SPEC 4.7). */
  private serialise(preset: RegionalPreset): RegionalPromptPreset {
    return {
      id: preset.id,
      name: preset.name,
      separation: preset.separation,
      layout_hints: preset.layout_hints,
      regions: preset.regions.map(region => ({
        id: region.id,
        name: region.name ?? '',
        prompt: region.prompt,
        negative_prompt: region.negative_prompt ?? '',
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        strength: region.strength ?? 1,
        denoise_strength: region.strength ?? region.denoise_strength ?? 1,
        feather: Math.round(region.feather),
        opacity: 1,
        inherit_base_prompt: region.inherit_base_prompt !== false,
        // LoRAs per region as catalog references; generation resolves them again (never a file path).
        ...(region.loras?.length ? { loras: region.loras.map(regionLoraPayload) } : {}),
      })),
    };
  }

  private normaliseList(raw: unknown[]): RegionalPreset[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const list: RegionalPreset[] = [];
    for (const item of raw as any[]) {
      const name = String(item?.name ?? '').trim().slice(0, REGIONAL_LIMITS.nameMax);
      if (!name || seen.has(name.toLowerCase())) continue;
      const hasVersion2Fields = Array.isArray(item?.regions) && item.regions.some((region: any) => region && region.strength !== undefined);
      const config = normaliseRegionalConfig({
        enabled: true,
        version: hasVersion2Fields ? 2 : undefined,
        separation: item?.separation,
        layout_hints: item?.layout_hints,
        regions: item?.regions,
      });
      if (!config.regions.length) continue;
      seen.add(name.toLowerCase());
      list.push({
        id: typeof item?.id === 'string' && item.id ? item.id : uuidv4(),
        name,
        regions: config.regions,
        separation: REGIONAL_SEPARATIONS.includes(item?.separation) ? item.separation : undefined,
        layout_hints: typeof item?.layout_hints === 'boolean' ? item.layout_hints : undefined,
      });
    }
    return list;
  }

  private readLocal(): RegionalPreset[] {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? this.normaliseList(JSON.parse(raw)) : [];
    } catch {
      return [];
    }
  }

  private writeLocal(presets: RegionalPreset[]): void {
    try {
      if (presets.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(presets.map(preset => this.serialise(preset))));
      else localStorage.removeItem(LOCAL_KEY);
    } catch {
      this.messages.add({ severity: 'warn', summary: 'Browser storage full', detail: 'The preset could not be saved in this browser.', life: 5000 });
    }
  }
}
