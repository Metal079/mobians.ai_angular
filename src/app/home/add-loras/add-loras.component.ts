import { ChangeDetectorRef, Component, DestroyRef, NgZone, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { MessageService } from 'primeng/api';
import { SharedService } from 'src/app/shared.service';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

type SearchOption = 'lora_name' | 'model_id' | 'username';

@Component({
    selector: 'app-add-loras',
    templateUrl: './add-loras.component.html',
    styleUrls: ['./add-loras.component.css'],
    standalone: true,
    imports: [
      CommonModule,
      FormsModule,
      ButtonModule,
      InputTextModule,
      ToggleSwitchModule,
      ProgressSpinnerModule,
      ChipModule,
      DialogModule
    ]
})
export class AddLorasComponent {
  private readonly destroyRef = inject(DestroyRef);
  private isComponentDestroyed = false;

  searchOptions: { value: SearchOption; label: string; icon: string }[] = [
    { value: 'lora_name', label: 'Search by Name', icon: 'pi pi-search' },
    { value: 'model_id', label: 'Search by Model ID', icon: 'pi pi-id-card' },
    { value: 'username', label: 'Search by Creator', icon: 'pi pi-user' }
  ];

  selectedSearchOption: SearchOption = 'lora_name';
  loraSha256: string = '';
  loraFile: File | null = null;
  searchField: string = ''; // New field for search field

  showNSFWLoras: boolean = false;

  searchResults: any[] = []; // Will hold the API search results
  selectedLoRA: any = null;  // Holds the selected LoRA from the table
  showImageDialog: boolean = false; // Track the state of the image dialog
  imageToShow: string = ''; // The image URL to show in the dialog

  isLoading: boolean = false;
  loadingStatuses: boolean = false;
  showPendingRequests: boolean = false;
  hasSearched: boolean = false;

  approvedVersionIds: Set<string> = new Set();
  pendingVersionIds: Set<string> = new Set();
  rejectedVersionIds: Set<string> = new Set();
  failedVersionIds: Set<string> = new Set();

  pendingSuggestions: any[] = [];
  rejectedSuggestions: any[] = [];
  failedSuggestions: any[] = [];
  userPendingSuggestions: any[] = [];

  statusLabels: Record<'approved' | 'pending' | 'rejected' | 'failed', string> = {
    approved: 'Approved',
    pending: 'Pending',
    rejected: 'Rejected',
    failed: 'Needs Retry'
  };

  constructor(
    public ref: DynamicDialogRef
    , public config: DynamicDialogConfig
    , private stableDiffusionService: StableDiffusionService
    , private messageService: MessageService
    , private sharedService: SharedService
    , private cdr: ChangeDetectorRef
    , private ngZone: NgZone
  ) {
    this.destroyRef.onDestroy(() => {
      this.isComponentDestroyed = true;
    });
  }

  ngOnInit(): void {
    const fromParent = this.config?.data?.showNSFWLoras;
    if (typeof fromParent === 'boolean') {
      this.showNSFWLoras = fromParent;
    } else {
      const stored = localStorage.getItem('showNSFWLoras');
      if (stored != null) this.showNSFWLoras = stored === 'true';
    }

    this.loadApprovedLoras();
    this.loadSuggestionStatuses();
  }

  onShowNsfwChanged(): void {
    localStorage.setItem('showNSFWLoras', this.showNSFWLoras.toString());
  }

  selectOption(option: SearchOption) {
    this.selectedSearchOption = option;
    this.searchResults = [];
    this.selectedLoRA = null;
    this.hasSearched = false;

    // Reset the form fields
    this.loraFile = null;
    this.searchField = '';
  }

  onFileSelected(event: any) {
    this.loraFile = event.target.files[0];
  }

  search() {
    if (this.isLoading) return;
    const query = this.searchField.trim();
    if (!query) return;

    this.searchField = query;
    this.hasSearched = true;

    if (this.selectedSearchOption === 'username') {
      this.searchByUsername(query);
    } else if (this.selectedSearchOption === 'lora_name') {
      this.searchByLoRAName(query);
    } else if (this.selectedSearchOption === 'model_id') {
      this.searchByModelId(query);
    }
  }

  searchByUsername(query: string) {
    this.executeSearch(this.stableDiffusionService.searchByUser(query, this.showNSFWLoras), 'civitAi user search done');
  }

  searchByLoRAName(query: string) {
    this.executeSearch(this.stableDiffusionService.searchByQuery(query, this.showNSFWLoras), 'civitAi query search done');
  }

  // New method to search by Model ID
  searchByModelId(query: string) {
    this.executeSearch(this.stableDiffusionService.searchByID(query, this.showNSFWLoras), 'civitAi model ID search done');
  }

  requestSelectedLoRA() {
    if (this.selectedLoRA) {
      console.log(`Selected LoRA: ${this.selectedLoRA.name}`);

      // Get the user's discord ID
      const discordUserID = this.sharedService.getUserDataValue().discord_user_id;

      // Create data to send to the backend
      const data = {
        'lora_version_id': this.selectedLoRA.model_version_id,
        'name': this.selectedLoRA.name,
        'version': this.selectedLoRA.model_name,
        'status': 'pending',
        'requestor': discordUserID,
        'is_nsfw': this.selectedLoRA.nsfw,
        'is_minor': this.selectedLoRA.minor,
        'preview_image': this.selectedLoRA.images[0].url,
        'base_model': this.selectedLoRA.base_model,
      };

      // Add the selected LoRA to the lora queue
      this.stableDiffusionService.addLoraSuggestion(data).subscribe({
        next: (response: any) => {
          console.log('LoRA suggestion added');
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'LoRA suggestion added successfully',
            life: 5000  // Here is the addition.
          });
          this.loadSuggestionStatuses();
          this.close();
        },
        error: (error: any) => {
          console.log('error', error);
          this.showError(error);
        }
      });
    }
  }

  selectLora(lora: any) {
    this.selectedLoRA = lora; // Set the selected LoRA
  }

  // Open the image dialog and show the full-size image
  openImageDialog(imageUrl: string) {
    this.imageToShow = imageUrl;
    this.showImageDialog = true;
  }

  previewImage(event: Event, imageUrl: string) {
    event.preventDefault();
    event.stopPropagation();
    this.openImageDialog(imageUrl);
  }

  getSearchPlaceholder(): string {
    if (this.selectedSearchOption === 'model_id') {
      return 'Enter LoRA Model ID';
    }
    if (this.selectedSearchOption === 'username') {
      return "Enter creator's CivitAI username";
    }
    return 'Search LoRA by name';
  }


  close() {
    this.ref.close({ showNSFWLoras: this.showNSFWLoras });
  }

  loadApprovedLoras() {
    this.stableDiffusionService.getLoras('active').pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (rows: any[]) => {
        this.applyAsyncState(() => {
          this.approvedVersionIds.clear();
          (Array.isArray(rows) ? rows : []).forEach((row) => {
            if (row?.is_active === false) return;
            const id = this.getVersionId(row);
            if (id) this.approvedVersionIds.add(id);
          });
        });
      },
      error: (error: any) => {
        console.log('Failed to load approved LoRAs', error);
      }
    });
  }

  loadSuggestionStatuses() {
    this.applyAsyncState(() => {
      this.loadingStatuses = true;
    });

    forkJoin({
      pending: this.stableDiffusionService.getMyLoraSuggestions('pending').pipe(catchError(() => of([]))),
      rejected: this.stableDiffusionService.getMyLoraSuggestions('rejected').pipe(catchError(() => of([]))),
      failed: this.stableDiffusionService.getMyLoraSuggestions('failed').pipe(catchError(() => of([])))
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.applyAsyncState(() => {
            this.loadingStatuses = false;
          });
        })
      )
      .subscribe(({ pending, rejected, failed }) => {
        this.applyAsyncState(() => {
          this.pendingSuggestions = Array.isArray(pending) ? pending : [];
          this.rejectedSuggestions = Array.isArray(rejected) ? rejected : [];
          this.failedSuggestions = Array.isArray(failed) ? failed : [];

          this.pendingVersionIds.clear();
          this.rejectedVersionIds.clear();
          this.failedVersionIds.clear();

          this.pendingSuggestions.forEach((row) => {
            const id = this.getVersionId(row);
            if (id) this.pendingVersionIds.add(id);
          });

          this.rejectedSuggestions.forEach((row) => {
            const id = this.getVersionId(row);
            if (id) this.rejectedVersionIds.add(id);
          });

          this.failedSuggestions.forEach((row) => {
            const id = this.getVersionId(row);
            if (id) this.failedVersionIds.add(id);
          });

          this.updateUserPendingSuggestions();
        });
      });
  }

  updateUserPendingSuggestions() {
    const combined = [...this.pendingSuggestions, ...this.failedSuggestions];
    this.userPendingSuggestions = combined;
    if (this.userPendingSuggestions.length === 0) {
      this.showPendingRequests = false;
    }
  }

  cancelSuggestion(suggestion: any) {
    const suggestionId = suggestion?.id;
    if (!suggestionId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Unable to cancel',
        detail: 'Missing suggestion ID.',
        life: 4000
      });
      return;
    }

    if (!confirm(`Cancel your request for "${suggestion?.name || 'this LoRA'}"?`)) {
      return;
    }

    this.stableDiffusionService.cancelLoraSuggestion(suggestionId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (response: any) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Cancelled',
          detail: response?.message || 'LoRA request cancelled.',
          life: 4000
        });
        this.loadSuggestionStatuses();
      },
      error: (error: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Cancel failed',
          detail: error?.error?.detail || 'Unable to cancel this request.',
          life: 5000
        });
      }
    });
  }

  togglePendingRequests(): void {
    this.showPendingRequests = !this.showPendingRequests;
  }

  getLoraStatus(lora: any): 'approved' | 'pending' | 'rejected' | 'failed' | null {
    const id = this.getVersionId(lora);
    if (!id) return null;
    if (this.approvedVersionIds.has(id)) return 'approved';
    if (this.pendingVersionIds.has(id)) return 'pending';
    if (this.failedVersionIds.has(id)) return 'failed';
    if (this.rejectedVersionIds.has(id)) return 'rejected';
    return null;
  }

  getLoraStatusClass(lora: any): string {
    const status = this.getLoraStatus(lora);
    return status ? `status-${status}` : '';
  }

  getStatusClassName(status: unknown): string {
    const key = status == null ? '' : String(status).trim().toLowerCase();
    return key ? `status-${key}` : '';
  }

  formatStatusLabel(status: unknown): string {
    if (status == null) {
      return '';
    }
    const key = String(status).trim().toLowerCase() as keyof typeof this.statusLabels;
    if (key in this.statusLabels) {
      return this.statusLabels[key];
    }
    return String(status);
  }

  private getVersionId(row: any): string | null {
    const id = row?.model_version_id ?? row?.version_id ?? row?.lora_version_id ?? row?.modelVersionId ?? row?.versionId;
    if (id === undefined || id === null || id === '') return null;
    return String(id);
  }

  showError(error: any) {
    // Default error message
    let errorMessage = 'There was an error attempting to generate your image. Website is possibly down. Try out JSCammie\'s website as an alternative!. https://www.jscammie.com/';

    // If the error comes from the backend and has a 'detail' field, use it as the error message
    if (error && error.error && error.error.detail) {
      errorMessage = error.error.detail;
    }

    // Display the error toast
    this.messageService.add({
      severity: 'error',
      summary: 'Error Message',
      detail: errorMessage,
      life: 500000  // Here is the addition.
    });
  }

  private executeSearch(request$: Observable<any>, successLog: string): void {
    this.applyAsyncState(() => {
      this.isLoading = true;
    });

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: any) => {
          console.log(successLog);
          const mappedResults = this.mapSearchResults(response);

          this.applyAsyncState(() => {
            this.searchResults = mappedResults;
            this.selectedLoRA = null;
            this.isLoading = false;
          });
        },
        error: (error: any) => {
          console.log('error', error);
          this.showError(error);

          this.applyAsyncState(() => {
            this.isLoading = false;
          });
        }
      });
  }

  private mapSearchResults(response: any): any[] {
    const rawResults = Array.isArray(response) ? response : (response ? [response] : []);
    return rawResults.map((result: any) => {
      const baseName = result?.name ?? 'Unnamed LoRA';
      const versionName = result?.model_name ? ` - ${result.model_name}` : '';
      return {
        ...result,
        name: `${baseName}${versionName}`
      };
    });
  }

  private applyAsyncState(update: () => void): void {
    const commit = () => {
      if (this.isComponentDestroyed) {
        return;
      }
      update();
      this.cdr.markForCheck();
    };

    if (NgZone.isInAngularZone()) {
      commit();
      return;
    }

    this.ngZone.run(commit);
  }

}
