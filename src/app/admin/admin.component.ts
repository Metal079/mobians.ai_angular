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

  // UI State
  loadingLoras = false;
  loadingSuggestions = false;
  detailsDialogVisible = false;
  detailsDialogTitle = '';
  detailsJson = '';

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
}
