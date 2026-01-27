import { Component, OnInit } from '@angular/core';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { MessageService } from 'primeng/api';
import { SharedService } from 'src/app/shared.service';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';


@Component({
  selector: 'app-add-loras',
  templateUrl: './add-loras.component.html',
  styleUrls: ['./add-loras.component.css']
})
export class AddLorasComponent {
  selectedSearchOption: string | null = 'lora_name'; // Default to Search by Name
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

  approvedVersionIds: Set<string> = new Set();
  pendingVersionIds: Set<string> = new Set();
  rejectedVersionIds: Set<string> = new Set();

  pendingSuggestions: any[] = [];
  rejectedSuggestions: any[] = [];
  userPendingSuggestions: any[] = [];

  statusLabels: Record<'approved' | 'pending' | 'rejected', string> = {
    approved: 'Approved',
    pending: 'Pending',
    rejected: 'Rejected'
  };

  constructor(
    public ref: DynamicDialogRef
    , public config: DynamicDialogConfig
    , private stableDiffusionService: StableDiffusionService
    , private messageService: MessageService
    , private sharedService: SharedService
  ) { }

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

  selectOption(option: string) {
    this.selectedSearchOption = option;
    this.searchResults = [];
    this.selectedLoRA = null;

    // Reset the form fields
    this.loraFile = null;
    this.searchField = '';
  }

  onFileSelected(event: any) {
    this.loraFile = event.target.files[0];
  }

  search() {
    if (this.isLoading || !this.searchField) return;

    if (this.selectedSearchOption === 'username') {
      this.searchByUsername();
    } else if (this.selectedSearchOption === 'lora_name') {
      this.searchByLoRAName();
    } else if (this.selectedSearchOption === 'model_id') {
      this.searchByModelId();
    }
  }

  searchByUsername() {
    this.isLoading = true; // Start loading
    this.stableDiffusionService.searchByUser(this.searchField, this.showNSFWLoras).subscribe({
      next: (response: any) => {
        console.log('civitAi user search done');
        this.searchResults = response;

        // Append version name to each result
        this.searchResults.forEach((result: any) => {
          result['name'] += ' - ' + result['model_name'];
        });

        this.isLoading = false;
      },
      error: (error: any) => {
        console.log('error', error);
        this.showError(error);
        this.isLoading = false;
      }
    });
  }

  searchByLoRAName() {
    this.isLoading = true; // Start loading
    this.stableDiffusionService.searchByQuery(this.searchField, this.showNSFWLoras).subscribe({
      next: (response: any) => {
        console.log('civitAi query search done');
        this.searchResults = response;

        // Append version name to each result
        this.searchResults.forEach((result: any) => {
          result['name'] += ' - ' + result['model_name'];
        });

        this.isLoading = false;
      },
      error: (error: any) => {
        console.log('error', error);
        this.showError(error);
        this.isLoading = false;
      }
    });
  }

  // New method to search by Model ID
  searchByModelId() {
    this.isLoading = true; // Start loading
    this.stableDiffusionService.searchByID(this.searchField, this.showNSFWLoras).subscribe({
      next: (response: any) => {
        this.searchResults = response;

        // Append version name to each result
        this.searchResults.forEach((result: any) => {
          result['name'] += ' - ' + result['model_name'];
        });

        this.isLoading = false;
      },
      error: (error: any) => {
        console.log('error', error);
        this.showError(error);
        this.isLoading = false;
      }
    });
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
        },
        error: (error: any) => {
          console.log('error', error);
          this.showError(error);
        }
      });
    }
    this.ref.close({ showNSFWLoras: this.showNSFWLoras });
  }

  selectLora(lora: any) {
    this.selectedLoRA = lora; // Set the selected LoRA
  }

  // Open the image dialog and show the full-size image
  openImageDialog(imageUrl: string) {
    this.imageToShow = imageUrl;
    this.showImageDialog = true;
  }


  close() {
    this.ref.close({ showNSFWLoras: this.showNSFWLoras });
  }

  loadApprovedLoras() {
    this.stableDiffusionService.getLoras('active').subscribe({
      next: (rows: any[]) => {
        this.approvedVersionIds.clear();
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          if (row?.is_active === false) return;
          const id = this.getVersionId(row);
          if (id) this.approvedVersionIds.add(id);
        });
      },
      error: (error: any) => {
        console.log('Failed to load approved LoRAs', error);
      }
    });
  }

  loadSuggestionStatuses() {
    this.loadingStatuses = true;
    forkJoin({
      pending: this.stableDiffusionService.getMyLoraSuggestions('pending').pipe(catchError(() => of([]))),
      rejected: this.stableDiffusionService.getMyLoraSuggestions('rejected').pipe(catchError(() => of([])))
    })
      .pipe(finalize(() => (this.loadingStatuses = false)))
      .subscribe(({ pending, rejected }) => {
        this.pendingSuggestions = Array.isArray(pending) ? pending : [];
        this.rejectedSuggestions = Array.isArray(rejected) ? rejected : [];

        this.pendingVersionIds.clear();
        this.rejectedVersionIds.clear();

        this.pendingSuggestions.forEach((row) => {
          const id = this.getVersionId(row);
          if (id) this.pendingVersionIds.add(id);
        });

        this.rejectedSuggestions.forEach((row) => {
          const id = this.getVersionId(row);
          if (id) this.rejectedVersionIds.add(id);
        });

        this.updateUserPendingSuggestions();
      });
  }

  updateUserPendingSuggestions() {
    this.userPendingSuggestions = [...this.pendingSuggestions];
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

    this.stableDiffusionService.cancelLoraSuggestion(suggestionId).subscribe({
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

  getLoraStatus(lora: any): 'approved' | 'pending' | 'rejected' | null {
    const id = this.getVersionId(lora);
    if (!id) return null;
    if (this.approvedVersionIds.has(id)) return 'approved';
    if (this.pendingVersionIds.has(id)) return 'pending';
    if (this.rejectedVersionIds.has(id)) return 'rejected';
    return null;
  }

  getLoraStatusClass(lora: any): string {
    const status = this.getLoraStatus(lora);
    return status ? `status-${status}` : '';
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

}
