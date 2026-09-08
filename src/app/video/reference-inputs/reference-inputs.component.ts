import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, NgZone, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VideoConfig, VideoReference } from 'src/_shared/video-generation.interface';

@Component({
  selector: 'app-video-reference-inputs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reference-inputs.component.html',
  styleUrls: ['./reference-inputs.component.css'],
})
export class ReferenceInputsComponent implements OnDestroy {
  @Input() config: VideoConfig | null = null;
  @Output() referencesChange = new EventEmitter<VideoReference[]>();
  @Output() historyRequested = new EventEmitter<void>();
  @Output() promptReference = new EventEmitter<{ kind: 'image' | 'video'; index: number }>();
  @Output() referenceRemoved = new EventEmitter<{ kind: 'image' | 'video'; index: number }>();
  @Output() busyChange = new EventEmitter<boolean>();
  references: VideoReference[] = [];
  busy = false;
  error = '';
  showVideos = false;
  private destroyed = false;
  constructor(private readonly zone: NgZone) {}
  get images(): VideoReference[] { return this.references.filter(item => item.kind === 'image'); }
  get videos(): VideoReference[] { return this.references.filter(item => item.kind === 'video'); }
  get imageLimit(): number { return this.config?.max_reference_images ?? 9; }
  get videoLimit(): number { return this.config?.max_reference_videos ?? 3; }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.references.forEach(item => URL.revokeObjectURL(item.previewUrl));
  }
  upload(input: HTMLInputElement): void { input.value = ''; input.click(); }
  async selected(event: Event, kind: 'image' | 'video'): Promise<void> {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    await this.addFiles(files, kind);
  }
  async dropped(event: DragEvent, kind: 'image' | 'video'): Promise<void> {
    event.preventDefault();
    await this.addFiles(Array.from(event.dataTransfer?.files ?? []), kind);
  }
  async addFiles(files: File[], kind: 'image' | 'video', source: 'upload' | 'history' = 'upload'): Promise<void> {
    if (this.busy || this.destroyed) return;
    this.busy = true;
    this.busyChange.emit(true);
    this.error = '';
    try {
      for (const file of files) {
        if (this.destroyed) break;
        const count = kind === 'image' ? this.images.length : this.videos.length;
        const limit = kind === 'image' ? this.imageLimit : this.videoLimit;
        if (count >= limit) throw new Error(`Use up to ${limit} reference ${kind === 'image' ? 'images' : 'videos'}.`);
        const max = kind === 'image' ? (this.config?.max_frame_bytes ?? 15 * 1024 * 1024) : (this.config?.max_reference_video_bytes ?? 50 * 1024 * 1024);
        if (!file.size || file.size > max) throw new Error(`Each ${kind} must be nonempty and ${Math.round(max / 1024 / 1024)} MB or smaller.`);
        if (this.references.reduce((sum, item) => sum + item.file.size, 0) + file.size > (this.config?.max_reference_total_bytes ?? 150 * 1024 * 1024)) throw new Error('Reference uploads must total 150 MB or less.');
        const bytes = await file.arrayBuffer();
        const head = new Uint8Array(bytes);
        let mime = file.type;
        if (kind === 'image') {
          mime = head[0] === 0xff && head[1] === 0xd8 ? 'image/jpeg'
            : head[0] === 0x89 && head[1] === 0x50 ? 'image/png'
            : String.fromCharCode(...head.slice(8, 12)) === 'WEBP' ? 'image/webp' : '';
          if (!mime) throw new Error('Choose a JPEG, PNG, or WebP image.');
        } else {
          mime = String.fromCharCode(...head.slice(4, 8)) === 'ftyp' ? 'video/mp4'
            : head[0] === 0x1a && head[1] === 0x45 ? 'video/webm' : '';
          if (!mime) throw new Error('Choose an MP4, MOV, or WebM video.');
        }
        const owned = new File([bytes], file.name, { type: mime, lastModified: file.lastModified });
        const previewUrl = URL.createObjectURL(owned);
        try {
          const dimensions = await this.metadata(previewUrl, kind);
          if (dimensions.width < 64 || dimensions.height < 64 || dimensions.width * dimensions.height > (kind === 'image' ? 40000000 : 8294400)) throw new Error('The reference dimensions are unsupported. Use an image under 40 MP or a video up to 4K, at least 64 pixels per side.');
          if (kind === 'video' && (!Number.isFinite(dimensions.duration) || dimensions.duration! < (this.config?.reference_video_min_seconds ?? 0.25) || dimensions.duration! > (this.config?.reference_video_max_seconds ?? 15))) throw new Error('Reference videos must be between 0.25 and 15 seconds long.');
          if (this.destroyed) { URL.revokeObjectURL(previewUrl); break; }
          this.zone.run(() => {
            this.references = [...this.references, { id: crypto.randomUUID(), kind, file: owned, previewUrl, source, useAudio: false, ...dimensions }];
            this.referencesChange.emit(this.references);
          });
        } catch (error) { URL.revokeObjectURL(previewUrl); throw error; }
      }
    } catch (error) {
      this.zone.run(() => this.error = error instanceof Error ? error.message : 'The reference could not be read.');
    } finally {
      this.zone.run(() => { this.busy = false; this.busyChange.emit(false); });
    }
  }
  remove(reference: VideoReference): void {
    const siblings = reference.kind === 'image' ? this.images : this.videos;
    this.referenceRemoved.emit({ kind: reference.kind, index: siblings.indexOf(reference) + 1 });
    this.references = this.references.filter(item => item.id !== reference.id);
    URL.revokeObjectURL(reference.previewUrl);
    this.referencesChange.emit(this.references);
  }
  changed(): void { this.referencesChange.emit([...this.references]); }
  private metadata(url: string, kind: 'image' | 'video'): Promise<{ width: number; height: number; duration?: number }> {
    return new Promise((resolve, reject) => {
      const media = kind === 'image' ? new Image() : document.createElement('video');
      const timer = setTimeout(() => finish(new Error('Reading the reference timed out. Try another file.')), 15000);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        media.onload = null; media.onloadedmetadata = null; media.onerror = null;
        const data = media instanceof HTMLVideoElement
          ? { width: media.videoWidth, height: media.videoHeight, duration: media.duration }
          : { width: media.naturalWidth, height: media.naturalHeight };
        media.removeAttribute('src');
        if (media instanceof HTMLVideoElement) media.load();
        error ? reject(error) : resolve(data);
      };
      media.onerror = () => finish(new Error('The reference could not be decoded. Try another file.'));
      if (media instanceof HTMLVideoElement) { media.preload = 'metadata'; media.onloadedmetadata = () => finish(); }
      else media.onload = () => finish();
      media.src = url;
    });
  }
}
