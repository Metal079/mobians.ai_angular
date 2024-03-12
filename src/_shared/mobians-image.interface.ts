export interface MobiansImage {
    url?: string;
    width: number;
    height: number;
    aspectRatio: string;
    base64: string;
    UUID: string;
    rating?: boolean;
    timestamp?: Date;
    promptSummary?: string;
    thumbnailUrl?: string; // Add this line
  }
  