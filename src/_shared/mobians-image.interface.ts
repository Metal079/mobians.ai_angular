export interface MobiansImage {
    url?: string;
    width: number;
    height: number;
    aspectRatio: string;
    base64?: string;
    UUID: string;
    rating?: boolean;
    timestamp?: Date;
    prompt?: string;
    promptSummary?: string;
    loras?: any[];
    thumbnailUrl?: string; // Add this line
    blob?: Blob;
    favorite?: boolean;
  }
  
// Used just for the image history
export type MobiansImageMetadata = Pick<MobiansImage, 'UUID' | 'prompt' | 'promptSummary' | 'timestamp' | 'aspectRatio' | 'width' | 'height' | 'favorite' | 'loras'>;
