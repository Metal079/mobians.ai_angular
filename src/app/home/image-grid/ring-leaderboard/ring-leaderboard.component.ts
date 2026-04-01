import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';

@Component({
  selector: 'app-ring-leaderboard',
  templateUrl: './ring-leaderboard.component.html',
  styleUrls: ['./ring-leaderboard.component.css'],
  standalone: true,
  imports: [CommonModule, DialogModule],
})
export class RingLeaderboardComponent implements OnInit {
  visible = false;
  loading = false;
  leaderboard: Array<{ rank: number; display_name: string; rings: number }> = [];

  constructor(private sdService: StableDiffusionService) {}

  ngOnInit(): void {}

  open(): void {
    this.visible = true;
    this.loading = true;
    this.sdService.getRingLeaderboard().subscribe({
      next: (res) => {
        this.leaderboard = res.leaderboard;
        this.loading = false;
      },
      error: () => {
        this.leaderboard = [];
        this.loading = false;
      },
    });
  }
}
