import { Component, OnInit, OnDestroy } from '@angular/core';
import { StableDiffusionService } from '../stable-diffusion.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { interval, Subscription } from 'rxjs';

interface DownloaderStatus {
  status: string;
  current_lora: string | null;
  approved_count: number;
  updated_at: string | null;
  last_processed?: {
    name: string | null;
    status: string | null;
    error_message: string | null;
    updated_at: string | null;
  } | null;
}

interface DownloadHistoryItem {
  lora_name: string;
  version: string;
  status: string;
  error_message: string | null;
  version_id: number;
  downloaded_at: string;
}

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit, OnDestroy {
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

  // Image preview dialog
  imagePreviewVisible = false;
  imagePreviewUrl = '';
  imagePreviewTitle = '';

  // Row expansion state (keys must match dataKey used in table)
  expandedRowKeysLoras: { [key: string]: boolean } = {};
  expandedRowKeysSuggestions: { [key: string]: boolean } = {};

  // Loading states for individual actions
  savingLora: { [key: string]: boolean } = {};
  processingSuggestion: { [key: string]: boolean } = {};

  // Inline editing state
  editingDisplayName: { [key: string]: boolean } = {};
  editDisplayNameValue: { [key: string]: string } = {};

  // Downloader status
  downloaderStatus: DownloaderStatus | null = null;
  downloadHistory: DownloadHistoryItem[] = [];
  loadingDownloaderStatus = false;
  triggeringDownload = false;
  private statusPollingSubscription: Subscription | null = null;

  constructor(
    private sdService: StableDiffusionService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Verify admin access on component init
    if (!this.authService.isAdmin()) {
      this.messageService.add({
        severity: 'error',
        summary: 'Access Denied',
        detail: 'You do not have admin privileges',
        life: 3000
      });
      this.router.navigate(['/']);
      return;
    }
    this.reloadAll();
    this.loadDownloaderStatus();
    this.loadDownloadHistory();
    // Poll downloader status every 10 seconds
    this.statusPollingSubscription = interval(10000).subscribe(() => {
      this.loadDownloaderStatus(true);
    });
  }

  ngOnDestroy(): void {
    if (this.statusPollingSubscription) {
      this.statusPollingSubscription.unsubscribe();
    }
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

  // Row actions with real API calls
  toggleActive(row: any): void {
    const loraId = row?.id;
    const loraKey = loraId ?? row?.name;
    if (loraId == null) {
      row.is_active = !row.is_active;
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Unable to update LoRA: missing id.',
        life: 5000
      });
      return;
    }

    this.savingLora[loraKey] = true;
    
    this.sdService.updateLora(loraId, { is_active: row.is_active }).subscribe({
      next: (response) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Updated',
          detail: `${row.name} is now ${row.is_active ? 'active' : 'inactive'}`,
          life: 3000
        });
      },
      error: (err) => {
        // Revert the toggle on error
        row.is_active = !row.is_active;
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.detail || 'Failed to update LoRA',
          life: 5000
        });
      },
      complete: () => {
        this.savingLora[loraKey] = false;
      }
    });
  }

  toggleNSFW(row: any): void {
    const loraId = row?.id;
    const loraKey = loraId ?? row?.name;
    if (loraId == null) {
      row.is_nsfw = !row.is_nsfw;
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Unable to update LoRA: missing id.',
        life: 5000
      });
      return;
    }

    this.savingLora[loraKey] = true;
    
    this.sdService.updateLora(loraId, { is_nsfw: row.is_nsfw }).subscribe({
      next: (response) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Updated',
          detail: `${row.name} is now marked as ${row.is_nsfw ? 'NSFW' : 'SFW'}`,
          life: 3000
        });
      },
      error: (err) => {
        // Revert the toggle on error
        row.is_nsfw = !row.is_nsfw;
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.detail || 'Failed to update LoRA',
          life: 5000
        });
      },
      complete: () => {
        this.savingLora[loraKey] = false;
      }
    });
  }

  approveSuggestion(s: any): void {
    this.confirmationService.confirm({
      message: `Are you sure you want to approve "${s.name}"? This will add it to the active LoRA list.`,
      header: 'Confirm Approval',
      icon: 'pi pi-check-circle',
      accept: () => this.doApproveSuggestion(s)
    });
  }

  private doApproveSuggestion(s: any): void {
    const suggKey = s.id || s.name;
    this.processingSuggestion[suggKey] = true;
    
    this.sdService.approveSuggestion(s.id).subscribe({
      next: (response) => {
        this.loraSuggestions = this.loraSuggestions.filter(x => x.id !== s.id);
        this.filterSuggestions();
        this.messageService.add({
          severity: 'success',
          summary: 'Approved',
          detail: response.message || `${s.name} has been approved`,
          life: 3000
        });
        // Reload LoRAs to show the newly approved one
        this.loadAllLoras();
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.detail || 'Failed to approve suggestion',
          life: 5000
        });
      },
      complete: () => {
        this.processingSuggestion[suggKey] = false;
      }
    });
  }

  rejectSuggestion(s: any): void {
    this.confirmationService.confirm({
      message: `Are you sure you want to reject "${s.name}"? This action cannot be undone.`,
      header: 'Confirm Rejection',
      icon: 'pi pi-times-circle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.doRejectSuggestion(s)
    });
  }

  private doRejectSuggestion(s: any): void {
    const suggKey = s.id || s.name;
    this.processingSuggestion[suggKey] = true;
    
    this.sdService.rejectSuggestion(s.id).subscribe({
      next: (response) => {
        this.loraSuggestions = this.loraSuggestions.filter(x => x.id !== s.id);
        this.filterSuggestions();
        this.messageService.add({
          severity: 'info',
          summary: 'Rejected',
          detail: response.message || `${s.name} has been rejected`,
          life: 3000
        });
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.detail || 'Failed to reject suggestion',
          life: 5000
        });
      },
      complete: () => {
        this.processingSuggestion[suggKey] = false;
      }
    });
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

  openImagePreview(url: string, title: string): void {
    if (!url) return;
    this.imagePreviewUrl = url;
    this.imagePreviewTitle = title || 'Preview';
    this.imagePreviewVisible = true;
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
    const key = row?.id ?? row?.name;
    return !!(key && this.expandedRowKeysLoras[key]);
  }

  isSuggestionExpanded(row: any): boolean {
    const key = row?.id ?? row?.name;
    return !!(key && this.expandedRowKeysSuggestions[key]);
  }

  isLoraSaving(row: any): boolean {
    const key = row?.id ?? row?.name;
    return !!this.savingLora[key];
  }

  isSuggestionProcessing(row: any): boolean {
    const key = row?.id ?? row?.name;
    return !!this.processingSuggestion[key];
  }

  // Name editing methods
  startEditName(row: any): void {
    const key = row?.id ?? row?.name;
    this.editingDisplayName[key] = true;
    this.editDisplayNameValue[key] = row.name || '';
  }

  cancelEditName(row: any): void {
    const key = row?.id ?? row?.name;
    this.editingDisplayName[key] = false;
    delete this.editDisplayNameValue[key];
  }

  saveName(row: any): void {
    const key = row?.id ?? row?.name;
    const loraId = row?.id;
    if (loraId == null) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Unable to rename LoRA: missing id.',
        life: 5000
      });
      return;
    }

    const newName = this.editDisplayNameValue[key]?.trim();
    
    if (!newName) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid Name',
        detail: 'Name cannot be empty',
        life: 3000
      });
      return;
    }

    this.savingLora[key] = true;
    
    this.sdService.updateLora(loraId, { name: newName }).subscribe({
      next: (response) => {
        row.name = newName;
        this.editingDisplayName[key] = false;
        delete this.editDisplayNameValue[key];
        this.messageService.add({
          severity: 'success',
          summary: 'Updated',
          detail: `Name changed to "${newName}"`,
          life: 3000
        });
        // Reload to get fresh data since the key changed
        this.loadAllLoras();
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.detail || 'Failed to update name',
          life: 5000
        });
      },
      complete: () => {
        this.savingLora[key] = false;
      }
    });
  }

  isEditingName(row: any): boolean {
    const key = row?.id ?? row?.name;
    return !!this.editingDisplayName[key];
  }

  getEditNameValue(row: any): string {
    const key = row?.id ?? row?.name;
    return this.editDisplayNameValue[key] || '';
  }

  setEditNameValue(row: any, value: string): void {
    const key = row?.id ?? row?.name;
    this.editDisplayNameValue[key] = value;
  }

  getCivitAILink(row: any): string | null {
    const versionId = row?.version_id ?? row?.model_version_id ?? row?.modelVersionId;
    const modelId = row?.model_id ?? row?.model_page_id ?? row?.modelId ?? row?.modelPageId;

    if (modelId && versionId) return `https://civitai.com/models/${modelId}?modelVersionId=${versionId}`;
    if (modelId) return `https://civitai.com/models/${modelId}`;
    if (versionId) return `https://civitai.com/api/v1/model-versions/${versionId}`;
    return null;
  }

  onCivitAiClick(event: Event, row: any): void {
    event.preventDefault();
    event.stopPropagation();

    const versionId = row?.version_id ?? row?.model_version_id ?? row?.modelVersionId;
    if (!versionId) return;

    this.sdService.resolveCivitAiLink(versionId).subscribe({
      next: (res: any) => {
        const url = res?.url;
        if (!url) {
          this.messageService.add({
            severity: 'warn',
            summary: 'CivitAI',
            detail: 'Unable to resolve CivitAI link for this version.',
            life: 4000
          });
          return;
        }

        row.civitai_url = url;
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      error: (err) => {
        const fallbackUrl = this.getCivitAILink(row);
        if (fallbackUrl) window.open(fallbackUrl, '_blank', 'noopener,noreferrer');

        this.messageService.add({
          severity: 'warn',
          summary: 'CivitAI',
          detail: err?.error?.detail || 'Failed to resolve CivitAI link.',
          life: 5000
        });
      }
    });
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

  // ================ Downloader Status Methods ================

  loadDownloaderStatus(silent = false): void {
    if (!silent) this.loadingDownloaderStatus = true;
    this.sdService.getDownloaderStatus().subscribe({
      next: (status: DownloaderStatus) => {
        this.downloaderStatus = status;
      },
      error: (err) => {
        if (!silent) {
          console.error('Failed to load downloader status', err);
        }
        // Set a default status indicating the service may be offline
        this.downloaderStatus = {
          status: 'offline',
          current_lora: null,
          approved_count: 0,
          updated_at: null,
          last_processed: null
        };
      },
      complete: () => {
        if (!silent) this.loadingDownloaderStatus = false;
      }
    });
  }

  loadDownloadHistory(): void {
    this.sdService.getDownloadHistory(20).subscribe({
      next: (history: DownloadHistoryItem[]) => {
        this.downloadHistory = history || [];
      },
      error: (err) => {
        console.error('Failed to load download history', err);
      }
    });
  }

  triggerDownload(): void {
    this.triggeringDownload = true;
    this.sdService.triggerDownload().subscribe({
      next: (response: any) => {
        if (response.status === 'busy') {
          this.messageService.add({
            severity: 'info',
            summary: 'Already Running',
            detail: response.message || 'Download already in progress',
            life: 3000
          });
        } else {
          this.messageService.add({
            severity: 'success',
            summary: 'Download Triggered',
            detail: response.message || 'Download cycle started',
            life: 3000
          });
        }
        // Refresh status after a short delay
        setTimeout(() => {
          this.loadDownloaderStatus();
          this.loadDownloadHistory();
        }, 1000);
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.detail || 'Failed to trigger download. Make sure the downloader service is running.',
          life: 5000
        });
      },
      complete: () => {
        this.triggeringDownload = false;
      }
    });
  }

  getStatusSeverity(status: string): 'success' | 'warning' | 'danger' | 'secondary' | 'info' | 'contrast' | undefined {
    switch (status?.toLowerCase()) {
      case 'idle': return 'success';
      case 'downloading': return 'info';
      case 'checking': return 'info';
      case 'error': return 'danger';
      case 'stopped': return 'warning';
      case 'offline': return 'danger';
      default: return 'secondary';
    }
  }

  getStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'idle': return 'bi bi-check-circle';
      case 'downloading': return 'bi bi-download';
      case 'checking': return 'bi bi-search';
      case 'error': return 'bi bi-exclamation-triangle';
      case 'stopped': return 'bi bi-stop-circle';
      case 'offline': return 'bi bi-wifi-off';
      default: return 'bi bi-question-circle';
    }
  }

  getHistoryStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'success': return 'bi bi-check-circle-fill text-success';
      case 'failed': return 'bi bi-x-circle-fill text-danger';
      case 'skipped': return 'bi bi-skip-forward-fill text-warning';
      default: return 'bi bi-question-circle';
    }
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString();
  }
}
