import { Component } from '@angular/core';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';

@Component({
  selector: 'app-add-loras',
  templateUrl: './add-loras.component.html',
  styleUrls: ['./add-loras.component.css']
})
export class AddLorasComponent {
  selectedOption: string | null = null; // Tracks which option the user selects
  loraSha256: string = '';
  loraFile: File | null = null;

  constructor(public ref: DynamicDialogRef, public config: DynamicDialogConfig) {}

  selectOption(option: string) {
    this.selectedOption = option;
  }

  onFileSelected(event: any) {
    this.loraFile = event.target.files[0];
  }

  canAddLora(): boolean {
    if (this.selectedOption === 'sha256') {
      return !!this.loraSha256;
    } else if (this.selectedOption === 'upload') {
      return !!this.loraFile;
    }
    return false;
  }

  addLora() {
    if (this.selectedOption === 'sha256' && this.loraSha256) {
      // Logic to handle adding Lora by SHA256
      console.log(`Lora SHA256: ${this.loraSha256}`);
    } else if (this.selectedOption === 'upload' && this.loraFile) {
      // Logic to handle adding Lora by file upload
      console.log(`Lora File: ${this.loraFile.name}`);
    }
    this.ref.close();  // Close the dialog after adding
  }

  close() {
    this.ref.close();
  }
}
