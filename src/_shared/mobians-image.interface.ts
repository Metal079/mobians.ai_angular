import { RegionalPromptingConfig } from './regional-prompting.interface';

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
    regional_prompting?: RegionalPromptingConfig;
    thumbnailUrl?: string;
    blob?: Blob;
    favorite?: boolean;
    // New fields for enhanced history features
    tags?: string[];           // User-defined tags for organizing images
    model?: string;            // Model used for generation (for display in hover)
    seed?: number;             // Seed used for generation
    negativePrompt?: string;   // Negative prompt used
    cfg?: number;              // CFG scale used
    syncPriority?: number;     // Priority for cross-device sync (higher = sync first)
    lastModified?: Date;       // Last time the image metadata was modified
  }

// Tag definition for user-created collections
export interface ImageTag {
  id: string;           // Unique tag ID
  name: string;         // Display name
  color?: string;       // Optional color for visual distinction
  createdAt: Date;      // When the tag was created
  imageCount?: number;  // Cached count of images with this tag
}
  
// Used just for the image history
export type MobiansImageMetadata = Pick<MobiansImage, 
  'UUID' | 'prompt' | 'promptSummary' | 'timestamp' | 'aspectRatio' | 
  'width' | 'height' | 'favorite' | 'loras' | 'regional_prompting' | 'tags' | 'model' | 'seed' | 
  'negativePrompt' | 'cfg' | 'syncPriority' | 'lastModified'
>;
