import { Component, OnInit } from '@angular/core';
import { StableDiffusionService } from '../stable-diffusion.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  // Data
  allLoras: any[] = [];
  loraSuggestions: any[] = [];
  filteredAllLoras: any[] = [];
  filteredSuggestions: any[] = [];

  // UI State
  loadingLoras = false;
  loadingSuggestions = false;
  detailsDialogVisible = false;
  detailsDialogTitle = '';
  detailsJson = '';

  // Row expansion state (keys must match dataKey used in table)
  expandedRowKeysLoras: { [key: string]: boolean } = {};
  expandedRowKeysSuggestions: { [key: string]: boolean } = {};

  constructor(private sdService: StableDiffusionService) {}

  ngOnInit(): void {
    this.reloadAll();
  }

  reloadAll(): void {
    this.loadAllLoras();
    this.loadSuggestions();
  }

  loadAllLoras(): void {
    this.loadingLoras = true;
    this.sdService.getLoras('all').subscribe({
      next: (rows: any[]) => {
        this.allLoras = Array.isArray(rows) ? rows : [];
  this.expandedRowKeysLoras = {}; // reset
  this.buildLoraBaseModelOptions();
  this.filterAllLoras();
      },
      error: (err) => {
        console.error('Failed to load all LoRAs', err);
      },
      complete: () => (this.loadingLoras = false),
    });
  }

  loadSuggestions(): void {
    this.loadingSuggestions = true;
    this.sdService.getLoraSuggestions().subscribe({
      next: (rows: any[]) => {
        this.loraSuggestions = Array.isArray(rows) ? rows : [];
  this.expandedRowKeysSuggestions = {}; // reset
  this.buildSuggestionBaseModelOptions();
  this.filterSuggestions();
      },
      error: (err) => {
        console.error('Failed to load LoRA suggestions', err);
      },
      complete: () => (this.loadingSuggestions = false),
    });
  }

  // Row actions (placeholders for now)
  toggleActive(row: any): void {
    row.is_active = !!row.is_active;
    console.log('Mark Active (placeholder):', row.name || row.id, row.is_active);
    // TODO: call API to persist active state
  }

  toggleNSFW(row: any): void {
    row.is_nsfw = !!row.is_nsfw;
    console.log('Mark NSFW (placeholder):', row.name || row.id, row.is_nsfw);
    // TODO: call API to persist nsfw flag
  }

  approveSuggestion(s: any): void {
    console.log('Approve suggestion (placeholder):', s);
    // Optimistically remove from list to simulate action
    this.loraSuggestions = this.loraSuggestions.filter((x) => x !== s);
    // TODO: call API to approve
  }

  rejectSuggestion(s: any): void {
    console.log('Reject suggestion (placeholder):', s);
    // Optimistically remove from list to simulate action
    this.loraSuggestions = this.loraSuggestions.filter((x) => x !== s);
    // TODO: call API to reject
  }

  openDetailsDialog(title: string, obj: any): void {
    this.detailsDialogTitle = title;
    try {
      this.detailsJson = JSON.stringify(obj, null, 2);
    } catch {
      this.detailsJson = String(obj);
    }
    this.detailsDialogVisible = true;
  }

  trackById(_idx: number, row: any): any {
    return row.id || row.name || row.version || row.image_url || _idx;
  }

  // Helpers for preview images
  isValidImageUrl(u: any): boolean {
    return typeof u === 'string' && /^(https?:\/\/|\/|data:)/i.test(u.trim());
  }

  getPreviewUrl(row: any): string | null {
    const u = row?.image_url || row?.preview || row?.thumbnail || row?.image;
    return this.isValidImageUrl(u) ? u : null;
  }

  isLoraExpanded(row: any): boolean {
    const key = row?.name ?? row?.id;
    return !!(key && this.expandedRowKeysLoras[key]);
  }

  isSuggestionExpanded(row: any): boolean {
    const key = row?.name ?? row?.id;
    return !!(key && this.expandedRowKeysSuggestions[key]);
  }

  // ---------------- Filters (All LoRAs) ----------------
  loraSearch = '';
  selectedBaseModels: string[] = [];
  loraBaseModelOptions: { label: string; value: string }[] = [];
  activeFilter: 'any' | 'active' | 'inactive' = 'any';
  nsfwFilter: 'any' | 'nsfw' | 'sfw' = 'any';
  activeOptions = [
    { label: 'Any', value: 'any' },
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
  ];
  nsfwOptions = [
    { label: 'Any', value: 'any' },
    { label: 'SFW', value: 'sfw' },
    { label: 'NSFW', value: 'nsfw' },
  ];

  buildLoraBaseModelOptions(): void {
    const uniq = new Set<string>();
    for (const r of this.allLoras) if (r?.base_model) uniq.add(r.base_model);
    this.loraBaseModelOptions = Array.from(uniq).sort().map(v => ({ label: v, value: v }));
  }

  onLoraSearchChange(v: string): void {
    this.loraSearch = v;
    this.filterAllLoras();
  }

  filterAllLoras(): void {
    const q = (this.loraSearch || '').toLowerCase();
    const bases = new Set(this.selectedBaseModels || []);
    this.filteredAllLoras = (this.allLoras || []).filter(r => {
      const name = (r?.name || '').toLowerCase();
      const version = (r?.version || '').toLowerCase();
      const matchesText = !q || name.includes(q) || version.includes(q);
      const matchesBase = bases.size === 0 || (r?.base_model && bases.has(r.base_model));
      const matchesActive =
        this.activeFilter === 'any' ||
        (this.activeFilter === 'active' && !!r?.is_active) ||
        (this.activeFilter === 'inactive' && !r?.is_active);
      const matchesNSFW =
        this.nsfwFilter === 'any' ||
        (this.nsfwFilter === 'nsfw' && !!r?.is_nsfw) ||
        (this.nsfwFilter === 'sfw' && !r?.is_nsfw);
      return matchesText && matchesBase && matchesActive && matchesNSFW;
    });
  }

  // ---------------- Filters (Suggestions) ----------------
  suggSearch = '';
  submittedBySearch = '';
  selectedSuggBaseModels: string[] = [];
  suggBaseModelOptions: { label: string; value: string }[] = [];

  buildSuggestionBaseModelOptions(): void {
    const uniq = new Set<string>();
    for (const r of this.loraSuggestions) if (r?.base_model) uniq.add(r.base_model);
    this.suggBaseModelOptions = Array.from(uniq).sort().map(v => ({ label: v, value: v }));
  }

  onSuggSearchChange(v: string): void {
    this.suggSearch = v;
    this.filterSuggestions();
  }

  onSubmittedByChange(v: string): void {
    this.submittedBySearch = v;
    this.filterSuggestions();
  }

  filterSuggestions(): void {
    const q = (this.suggSearch || '').toLowerCase();
    const submitQ = (this.submittedBySearch || '').toLowerCase();
    const bases = new Set(this.selectedSuggBaseModels || []);
    this.filteredSuggestions = (this.loraSuggestions || []).filter(r => {
      const name = (r?.name || '').toLowerCase();
      const version = (r?.version || '').toLowerCase();
      const submitter = (r?.submitted_by || r?.username || '').toLowerCase();
      const matchesText = !q || name.includes(q) || version.includes(q);
      const matchesSubmitter = !submitQ || submitter.includes(submitQ);
      const matchesBase = bases.size === 0 || (r?.base_model && bases.has(r.base_model));
      return matchesText && matchesSubmitter && matchesBase;
    });
  }
}
