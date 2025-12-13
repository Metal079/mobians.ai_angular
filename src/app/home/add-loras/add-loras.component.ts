import { Component } from '@angular/core';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { MessageService } from 'primeng/api';
import { SharedService } from 'src/app/shared.service';


@Component({
  selector: 'app-add-loras',
  templateUrl: './add-loras.component.html',
  styleUrls: ['./add-loras.component.css']
})
export class AddLorasComponent {
  selectedSearchOption: string | null = null; // No default selected, user must pick
  loraSha256: string = '';
  loraFile: File | null = null;
  searchField: string = ''; // New field for search field

  searchResults: any[] = []; // Will hold the API search results
  selectedLoRA: any = null;  // Holds the selected LoRA from the table
  showImageDialog: boolean = false; // Track the state of the image dialog
  imageToShow: string = ''; // The image URL to show in the dialog

  isLoading: boolean = false;

  constructor(
    public ref: DynamicDialogRef
    , public config: DynamicDialogConfig
    , private stableDiffusionService: StableDiffusionService
    , private messageService: MessageService
    , private sharedService: SharedService
  ) { }

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
    this.stableDiffusionService.searchByUser(this.searchField).subscribe({
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
    this.stableDiffusionService.searchByQuery(this.searchField).subscribe({
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
    this.stableDiffusionService.searchByID(this.searchField).subscribe({
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
        },
        error: (error: any) => {
          console.log('error', error);
          this.showError(error);
        }
      });
    }
    this.ref.close();
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
    this.ref.close();
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
