import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface LoraTraining {
    name: string;
    imagesUsed: number;
    type: 'SDXL' | 'SD1.5';
    dateCreated: Date;
}

@Component({
    selector: 'app-train',
    templateUrl: './train.component.html',
    styleUrls: ['./train.component.css']
})
export class TrainComponent {
    trainingHistory: LoraTraining[] = [
        { name: 'My First LoRA', imagesUsed: 100, type: 'SDXL', dateCreated: new Date('2023-07-01') },
        { name: 'Character Style', imagesUsed: 50, type: 'SD1.5', dateCreated: new Date('2023-07-15') },
        // Add more mock data as needed
    ];

    constructor(private router: Router) {}

    viewDetails(lora: LoraTraining) {
        // Implement view details logic
        console.log('Viewing details for:', lora.name);
    }

    createNewLora() {
        this.router.navigate(['/train/new']);
    }
}