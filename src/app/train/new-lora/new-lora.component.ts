import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface UploadedImage {
    url: string;
    captions: string[];
}

@Component({
    selector: 'app-new-lora',
    templateUrl: './new-lora.component.html',
    styleUrls: ['./new-lora.component.css']
})
export class NewLoraComponent {
    uploadedImages: UploadedImage[] = [];
    totalImages = 0;
    captionedImages = 0;

    constructor(private router: Router) {}

    onFileSelect(event: any) {
        for (let file of event.files) {
            this.addImage(file);
        }
    }

    onFileRemove(event: any) {
        this.uploadedImages = this.uploadedImages.filter(img => img.url !== event.file.objectURL);
        this.totalImages = this.uploadedImages.length;
        this.updateCaptionedCount();
    }

    onUpload(event: any) {
        // Handle the upload process here
        console.log('Uploading files:', event.files);
    }

    addImage(file: File) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
            this.uploadedImages.push({ url: e.target.result, captions: [] });
            this.totalImages++;
            this.updateCaptionedCount();
        };
        reader.readAsDataURL(file);
    }

    addCaption(index: number) {
        // Use PrimeNG dialog service for better UX
        const caption = prompt('Enter a caption for this image:');
        if (caption) {
            this.uploadedImages[index].captions.push(caption);
            this.updateCaptionedCount();
        }
    }

    updateCaptionedCount() {
        this.captionedImages = this.uploadedImages.filter(img => img.captions.length > 0).length;
    }

    autoTag() {
        // Implement auto-tagging logic here
        console.log('Auto-tagging images...');
    }

    downloadCaptions() {
        // Implement caption download logic here
        console.log('Downloading captions...');
    }

    reset() {
        this.uploadedImages = [];
        this.totalImages = 0;
        this.captionedImages = 0;
    }

    canProceed(): boolean {
        return this.uploadedImages.length > 0 && this.captionedImages === this.totalImages;
    }

    goBack() {
        this.router.navigate(['/train']);
    }

    proceed() {
        // Implement the next step in the LoRA creation process
        console.log('Proceeding to next step...');
    }
}