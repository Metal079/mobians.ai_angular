import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage, MobiansImageMetadata } from 'src/_shared/mobians-image.interface';
import { interval, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { takeWhile, finalize, concatMap, tap, retryWhen, scan, delayWhen, skip } from 'rxjs/operators';
import { SharedService } from 'src/app/shared.service';
import { Subscription } from 'rxjs';
import { timer } from 'rxjs';
import { MessageService } from 'primeng/api';
import { v4 as uuidv4 } from 'uuid';
import { NotificationService } from 'src/app/notification.service';
import { SwPush } from '@angular/service-worker';
import { environment } from 'src/environments/environment';
import { MemoryUsageService } from 'src/app/memory-usage.service';
import { DialogService } from 'primeng/dynamicdialog';
import { AddLorasComponent } from '../add-loras/add-loras.component';
import { BlobMigrationService } from 'src/app/blob-migration.service';
import { DestroyRef, inject } from '@angular/core';
import { GenerationLockService } from 'src/app/generation-lock.service';


@Component({
  selector: 'app-options',
  templateUrl: './options.component.html',
  styleUrls: ['./options.component.css'],
})
export class OptionsComponent implements OnInit {
  private subscription!: Subscription;
  private referenceImageSubscription!: Subscription;
  private dbName = 'ImageDatabase';
  private storeName = 'ImageStore';
  private blobStoreName = 'blobStore';

  models_types: { [model: string]: string; } = {
    "sonicDiffusionV4": "SD 1.5",
    "fluffySonic": "SD 1.5",
    "sonicDiffusionXL": "Pony",
    "autismMix": "Pony",
    "fluffySonicXL": "Pony",
    "novaFurryXL_V8B": "Illustrious"
  }
  enableGenerationButton: boolean = true;
  showLoading: boolean = false;
  showStrength: boolean = false;
  showInpainting: boolean = false;
  showInpaintingCanvas: boolean = false;
  enableNotifications: boolean = false;
  queuePosition?: number;
  images: MobiansImage[] = [];
  aspectRatio: AspectRatio = { width: 512, height: 512, model: "sonicDiffusionV4", aspectRatio: "square" };
  defaultNegativePrompt: string = "nsfw, 3d, EasyNegativeV2, worst quality, low quality, watermark, signature, simple background, bad anatomy, bad hands, deformed limbs, blurry, cropped, cross-eyed, extra arms, speech bubble, extra legs, extra limbs, bad proportions, poorly drawn hands, text, flat background";
  generationRequest: any = {
    prompt: "",
    image: undefined,
    image_UUID: undefined,
    mask_image: undefined,
    negative_prompt: this.defaultNegativePrompt,
    scheduler: 7,
    steps: 20,
    width: 512,
    height: 512,
    guidance_scale: 7,
    seed: undefined,
    batch_size: 4,
    strength: 0.7,
    job_type: "txt2img",
    model: "sonicDiffusionV4",
    fast_pass_code: undefined,
    is_dev_job: environment.isDevJob,
    loras: [],
    lossy_images: false,
  };
  jobID: string = "";
  // Add a simple flag to indicate a pending job
  hasPendingJob: boolean = false;
  // Track active polling subscription and cancel state
  private jobPollSub?: Subscription;
  private cancelInProgress: boolean = false;
  API_URL: string = "";
  referenceImage?: MobiansImage;
  currentSeed?: number;

  showMigration: boolean = false;

  // Discord login info
  loginInfo: any;
  supporter: boolean = false;
  serverMember: boolean = false;
  discordUserID: string = "";

  // Pagination
  currentPageImages: MobiansImage[] = [];
  nextPageImages: MobiansImage[] = [];
  prevPageImages: MobiansImage[] = [];
  currentPageNumber = 1;
  imagesPerPage = 4; // Display 4 images per page (2 rows of 2 images each)
  totalPages = 1;
  isLoading: boolean = false;
  imageHistoryMetadata: MobiansImageMetadata[] = [];
  blobUrls: string[] = [];

  // For Favorites tab
  favoritePageImages: MobiansImage[] = [];
  favoriteCurrentPageNumber: number = 1;
  favoriteTotalPages: number = 1;
  favoriteImagesPerPage: number = 4;
  favoriteSearchQuery: string = '';
  debouncedFavoriteSearch: () => void;

  // For storing favorite images metadata
  favoriteImageHistoryMetadata: MobiansImageMetadata[] = [];

  // New properties for menus
  showOptions: boolean = false;
  showHistory: boolean = false;
  showLoras: boolean = false;
  availableLoras: string[] = ['Loras1', 'Loras2', 'Loras3']; // Example Loras names

  // loras info
  showNSFWLoras: boolean = false;
  loraTagOptions: { optionLabel: string, optionValue: string, count: number }[] = [];
  selectedTags: string[] = [];
  loras: any[] = [];
  loraSearchQuery: string = '';
  filteredLoras: any[] = [];
  selectedLoras: any[] = [];
  maxLoras: number = 3;

  // to show full sized lora image
  displayModal: boolean = false;
  selectedImageUrl: string | null = null;

  // DB variables
  private db: IDBDatabase | null = null;

  // Persistence keys
  private readonly pendingJobKey = 'mobians:pending-job';
  private readonly queueEtaKey = 'mobians:queue-eta';
  private readonly pendingMaxAgeMs = 24 * 60 * 60 * 1000; // 24h max age for pending jobs

  // Sorting
  selectedSortOption: string = 'timestamp';
  sortOrder: 'asc' | 'desc' = 'desc';
  searchQuery: string = '';
  dropdownOptions: { label: string, value: string }[] = [
    { label: 'Date', value: 'timestamp' },
    { label: 'Alphabetical', value: 'promptSummary' }
  ];
  debouncedSearch: () => void;
  isSearching: boolean = false;

  @Input() inpaintMask?: string;

  @Output() imagesChange = new EventEmitter<any>();
  @Output() loadingChange = new EventEmitter<any>();
  @Output() aspectRatioChange = new EventEmitter<AspectRatio>();
  @Output() inpaintingChange = new EventEmitter<boolean>();
  @Output() queuePositionChange = new EventEmitter<number>();
  @Output() imageModalOpen = new EventEmitter<boolean>();
  @Output() etaChange = new EventEmitter<number | undefined>();

  readonly VAPID_PUBLIC_KEY = "BDrvd3soyvIOUEp5c-qXV-833C8hJvO-6wE1GZquvs9oqWQ70j0W4V9RCa_el8gIpOBeCKkuyVwmnAdalvOMfLg";
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private stableDiffusionService: StableDiffusionService
    , private sharedService: SharedService
    , private messageService: MessageService
    , private notificationService: NotificationService
    , private swPush: SwPush
    , private memoryUsageService: MemoryUsageService
    , private dialogService: DialogService
    , private blobMigrationService: BlobMigrationService
    , private lockService: GenerationLockService
  ) {
    // Load in loras info
    this.loadLoras();

    this.paginateImages = this.paginateImages.bind(this);

    this.debouncedSearch = this.debounce(() => {
      this.searchImages();
    }, 300); // Wait for 300ms after the last keystroke before searching

    this.debouncedFavoriteSearch = this.debounce(() => {
      this.favoriteSearchImages();
    }, 300); // Wait for 300ms after the last keystroke before searching

    this.blobMigrationService.progress$.subscribe(
      () => {
        this.showMigration = true;
      },
      () => {
        this.showMigration = false;
      },
      () => {
        this.showMigration = false;
      }
    );

    // Cross-tab updates to queue position / ETA
    window.addEventListener('storage', (e) => {
      if (e.key === this.queueEtaKey && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.queue_position != null) this.queuePositionChange.emit(data.queue_position);
          if (data.eta != null) this.etaChange.emit(data.eta);
        } catch {}
      }
      if (e.key === this.pendingJobKey) {
        // If another tab started or finished a job, update button state
        const pending = this.getPendingJob();
        this.enableGenerationButton = !pending;
        this.loadingChange.emit(!!pending);
      }
    });
  }

  //#region Create and open the database
  async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.error("IndexedDB is not supported in this browser.");
        reject(new Error("IndexedDB is not supported"));
        return;
      }

      const request = indexedDB.open(this.dbName, 37); // Increment version number

      request.onerror = (event) => {
        console.error("Failed to open database:", event);
        reject(new Error("Failed to open database"));
      };

      request.onsuccess = (event) => {
        const db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // Now, wait for the transaction to complete
        const upgradeTransaction = request.transaction;

        upgradeTransaction!.oncomplete = () => {
          console.log("Upgrade transaction completed.");
        };

        upgradeTransaction!.onerror = (event) => {
          console.error("Upgrade transaction failed:", event);
          reject(new Error("Upgrade transaction failed"));
        };

        // Create the main object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "UUID" });
          console.log("Object store created:", this.storeName);
        }

        // Create blobStore if it doesn't exist
        if (!db.objectStoreNames.contains('blobStore')) {
          db.createObjectStore('blobStore', { keyPath: "UUID" });
          console.log("blobStore store created");
        }

        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore(this.storeName);

          if (!store.indexNames.contains('timestamp')) {
            store.createIndex('timestamp', 'timestamp', { unique: false });
            console.log("Timestamp index created");
          }

          if (!store.indexNames.contains('prompt')) {
            store.createIndex('prompt', 'prompt', { unique: false });
            console.log("Prompt index created");
          }

          // Try to create a full-text index on 'prompt'
          try {
            if (!store.indexNames.contains('promptFullText')) {
              // Use 'any' type to bypass TypeScript checking for the 'type' property
              (store as any).createIndex('promptFullText', 'prompt', { type: 'text' });
              console.log("Full-text prompt index created");
            }

            // Create 'favorite' index if it doesn't exist
            if (!store.indexNames.contains('favorite')) {
              store.createIndex('favorite', 'favorite', { unique: false });
              console.log("Favorite index created");
            }
          } catch (error) {
            console.warn("Full-text index not supported in this browser:", error);
          }

          // Iterate over all existing records and set 'favorite' to false if missing
          try {
            const allRequest = store.getAll();
            allRequest.onsuccess = () => {
              const allRecords = allRequest.result as MobiansImage[];
              allRecords.forEach(record => {
                if (typeof record.favorite !== 'boolean') {
                  record.favorite = false;
                  store.put(record);
                }
              });
              console.log("All existing records have been initialized with 'favorite' property.");
            };
            allRequest.onerror = (event) => {
              console.error("Error initializing 'favorite' property for existing records:", event);
            };
          } catch (error) {
            console.error("Error during records initialization:", error);
          }
        }
      };

      request.onblocked = (event) => {
        console.error("Database access blocked:", event);
        reject(new Error("Database access blocked"));
      };
    });
  }
  //#endregion

  async migrateBase64ToBlobStore() {
    const db = await this.getDatabase();
    const batchSize = 100; // Adjust batch size as needed

    let cursorPosition: IDBValidKey | undefined = undefined;
    let hasMore = true;

    if (!db.objectStoreNames.contains('base64Store')) {
      console.log("No base64Store object store found. Migration not required.");
      return
    }

    while (hasMore) {
      const batch = await this.readBatch(db, cursorPosition, batchSize);
      if (batch.length > 0) {
        cursorPosition = batch[batch.length - 1].UUID; // Update cursor position
        await this.processBatch(batch, db);
      } else {
        hasMore = false; // No more records to process
      }
    }

    console.log('Migration completed.');
  }

  async readBatch(db: IDBDatabase, startAfter: IDBValidKey | undefined, batchSize: number): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
      const transaction = db.transaction('base64Store', 'readonly');
      const base64Store = transaction.objectStore('base64Store');
      const request = startAfter
        ? base64Store.openCursor(IDBKeyRange.lowerBound(startAfter, true)) // Exclude startAfter
        : base64Store.openCursor();

      const batch: any[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && batch.length < batchSize) {
          batch.push(cursor.value);
          cursor.continue();
        } else {
          resolve(batch);
        }
      };

      request.onerror = (event) => {
        console.error('Error reading batch:', event);
        reject(event);
      };
    });
  }

  async processBatch(batch: any[], db: IDBDatabase) {
    for (const data of batch) {
      const uuid = data.UUID;
      const base64Data = data.base64;

      try {
        let blob = this.blobMigrationService.base64ToBlob(base64Data);
        blob = await this.blobMigrationService.convertToWebP(blob);

        // Open a new transaction for each write operation
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(['blobStore', 'base64Store'], 'readwrite');
          const base64Store = transaction.objectStore('base64Store');
          const blobStore = transaction.objectStore('blobStore');

          const blobRequest = blobStore.put({ UUID: uuid, blob: blob });
          blobRequest.onsuccess = () => {
            // Delete the base64 data
            const deleteRequest = base64Store.delete(uuid);
            deleteRequest.onsuccess = () => {
              resolve();
            };
            deleteRequest.onerror = (error) => {
              console.error('Error deleting base64 data:', error);
              reject(error);
            };
          };
          blobRequest.onerror = (error) => {
            console.error('Error storing blob:', error);
            reject(error);
          };
        });
      } catch (error) {
        console.error('Error processing data:', error);
      }
    }
  }


  async ngOnInit() {
    this.subscription = this.sharedService.getPrompt().subscribe(value => {
      this.generationRequest.prompt = value;
    });

    try {
      await this.getDatabase();
      console.log('Database and object stores created/updated successfully');

      // Perform data migration here
      await this.migrateBase64ToBlobStore();

      await this.loadSettings();
    } catch (error) {
      console.error('Failed to open or upgrade database:', error);
      // Handle the error appropriately
    }

    this.sharedService.setGenerationRequest(this.generationRequest);
    this.updateSharedPrompt();

    this.referenceImageSubscription = this.sharedService.getReferenceImage().subscribe(image => {
      if (image) {
        this.generationRequest.job_type = "img2img";
        image.blob = image.blob
        this.generationRequest.image = image.base64;
        this.referenceImage = image;

        // Set the aspect ratio
        this.changeAspectRatio(image.aspectRatio);
      } else {
        this.generationRequest.job_type = "txt2img";
        this.generationRequest.image = undefined;
        this.referenceImage = undefined;
      }
    });

    // Discord userdata check
    this.sharedService.getUserData().subscribe(userData => {
      if (userData) {
        // If we dont have discordUserID, we need them to login again
        if (userData.discord_user_id) {
          this.loginInfo = userData;
          console.log('premium member!');
          this.onDiscordLoginSuccess(userData);
        }
      }
    });

    const storedUserData = localStorage.getItem('discordUserData');
    if (storedUserData) {
      const userData = JSON.parse(storedUserData);
      this.supporter = userData.has_required_role;
      this.serverMember = userData.is_member_of_your_guild;
      this.sharedService.setUserData(userData);
    }

    // Resume any pending job (respect max age)
    const pending = this.getPendingJob();
    if (pending) {
      this.jobID = pending.job_id;
      this.hasPendingJob = true;
      if (pending.createdAt && (Date.now() - pending.createdAt > this.pendingMaxAgeMs)) {
        // Too old to resume; restore settings and clear pending
        this.handleExpiredPendingJob(pending);
      } else {
        this.enableGenerationButton = false;
        this.loadingChange.emit(true);
        // Rehydrate minimal request context if available
        if (pending.request) {
          this.generationRequest = { ...this.generationRequest, ...pending.request };
          this.sharedService.setGenerationRequest(this.generationRequest);
        }
        this.getJob(pending.job_id);
      }
    }
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.referenceImageSubscription) {
      this.referenceImageSubscription.unsubscribe();
    }

    // Revoke all object URLs to prevent memory leaks
    this.blobUrls.forEach((url) => URL.revokeObjectURL(url));

    // Clear arrays
    this.prevPageImages = [];
    this.currentPageImages = [];
    this.nextPageImages = [];
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['inpaintMask'] && changes['inpaintMask'].currentValue != undefined) {
      this.inpaintMask = changes['inpaintMask'].currentValue;
      if (changes['inpaintMask'].currentValue == undefined) {
        this.generationRequest.mask_image = undefined;
        this.generationRequest.job_type = "img2img";
      }
      else {
        this.generationRequest.mask_image = this.inpaintMask!;
        this.generationRequest.job_type = "inpainting";
      }
    }
  }

  changeModel(event: any) {
    let selectElement = event.target as HTMLSelectElement;
    this.generationRequest.model = selectElement.value;

    // If the model selected is SDXL, change the CFG to 4 by default, else 7
    if (selectElement.value == "autismMix" || selectElement.value == "novaFurryXL_V8B") {
      this.generationRequest.guidance_scale = 4;
    }
    else {
      this.generationRequest.guidance_scale = 7;
    }

    this.filterLoras();
    this.refreshLoraFiltersList();

    // Remove any selected loras that are not available for the selected model
    this.selectedLoras = this.selectedLoras.filter(lora => this.filteredLoras.includes(lora));
    this.generationRequest.loras = this.selectedLoras;
  }

  changeAspectRatioSelector(event: any) {
    let selectElement = event.target as HTMLSelectElement;
    this.changeAspectRatio(selectElement.value);
  }

  changeAspectRatio(aspectRatio: string) {
    if (aspectRatio == 'square') {
      this.aspectRatio = { width: 512, height: 512, model: "sonicDiffusionV4", aspectRatio: "square" };
      this.generationRequest.width = 512;
      this.generationRequest.height = 512;
    }
    else if (aspectRatio == 'portrait') {
      this.aspectRatio = { width: 512, height: 768, model: "sonicDiffusionV4", aspectRatio: "portrait" };
      this.generationRequest.width = 512;
      this.generationRequest.height = 768;
    }
    else if (aspectRatio == 'landscape') {
      this.aspectRatio = { width: 768, height: 512, model: "sonicDiffusionV4", aspectRatio: "landscape" };
      this.generationRequest.width = 768;
      this.generationRequest.height = 512;
    }

    // Emit the aspectRatio object itself.
    this.aspectRatioChange.emit(this.aspectRatio);

    // Remove inpainting and strength elements
    this.showInpainting = false;
    this.showStrength = false;
    this.inpaintingChange.emit(this.showInpainting);

    // Clear the images array
    this.images = [];
    this.imagesChange.emit(this.images);

    this.sharedService.setGenerationRequest(this.generationRequest);
  }

  // Update the prompt to the shared service
  updateSharedPrompt() {
    this.sharedService.setPrompt(this.generationRequest.prompt);
  }

  // Save session storage info of changed settings
  saveSettings() {
    // Save prompt
    localStorage.setItem("prompt-input", this.generationRequest.prompt);

    // Save negative prompt
    localStorage.setItem("negative-prompt-input", this.generationRequest.negative_prompt);

    // Save denoise strength
    if (this.generationRequest.strength != undefined) {
      localStorage.setItem("custom-denoise", this.generationRequest.strength.toString());
    }

    // Save seed
    if (this.generationRequest.seed == undefined) {
      localStorage.removeItem("seed-input");
    }
    else if (this.generationRequest.seed != undefined) {
      localStorage.setItem("seed-input", this.generationRequest.seed.toString());
    }

    // Save cfg
    if (this.generationRequest.steps != undefined) {
      localStorage.setItem("cfg", this.generationRequest.guidance_scale.toString());
    }

    // Save aspect ratio
    localStorage.setItem("aspect-ratio", this.aspectRatio.aspectRatio);

    // Save fast pass code
    if (this.generationRequest.fast_pass_code == undefined || this.generationRequest.fast_pass_code.trim() == "") {
      this.generationRequest.fast_pass_code = undefined;
      localStorage.removeItem("fast-pass-code");
    }
    else if (this.generationRequest.fast_pass_code != undefined && this.generationRequest.fast_pass_code.trim() != "") {
      // Convert fast_pass_code to lowercase and remove whitespace
      this.generationRequest.fast_pass_code = this.generationRequest.fast_pass_code.toLowerCase().replace(/\s/g, '');
      localStorage.setItem("fast-pass-code", this.generationRequest.fast_pass_code);
    }

    // Save if lossy images are enabled
    localStorage.setItem("lossy-images", this.generationRequest.lossy_images.toString());

    // Save model
    localStorage.setItem("model", this.generationRequest.model);

    // Save showNSFWLoras
    localStorage.setItem("showNSFWLoras", this.showNSFWLoras.toString());
  }

  // Load session storage info of changed settings
  async loadSettings() {
    // Load other settings as before
    if (localStorage.getItem("prompt-input") != null) {
      this.generationRequest.prompt = localStorage.getItem("prompt-input")!;
    }
    if (localStorage.getItem("negative-prompt-input") != null) {
      this.generationRequest.negative_prompt = localStorage.getItem("negative-prompt-input")!;
    }
    if (localStorage.getItem("custom-denoise") != null) {
      this.generationRequest.strength = parseFloat(localStorage.getItem("custom-denoise")!);
    }
    if (localStorage.getItem("seed-input") != null) {
      this.generationRequest.seed = parseInt(localStorage.getItem("seed-input")!);
    }
    if (localStorage.getItem("cfg") != null) {
      this.generationRequest.guidance_scale = parseInt(localStorage.getItem("cfg")!);
    }
    if (localStorage.getItem("aspect-ratio") != null) {
      this.changeAspectRatio(localStorage.getItem("aspect-ratio")!);
    }
    if (localStorage.getItem("fast-pass-code") != null) {
      this.generationRequest.fast_pass_code = localStorage.getItem("fast-pass-code")!;
    }
    if (localStorage.getItem("model") != null) {
      this.generationRequest.model = localStorage.getItem("model")!;
    }
    if (localStorage.getItem("lossy-images") != null) {
      this.generationRequest.lossy_images = localStorage.getItem("lossy-images") == 'true';
    }
    if (localStorage.getItem("showNSFWLoras") != null) {
      this.showNSFWLoras = localStorage.getItem("showNSFWLoras") == 'true';
    }

    try {
      // Use the new queryImages function to load the initial set of images
      await this.searchImages();
      this.currentPageImages = await this.paginateImages(1);
      console.log('Current page images:', this.currentPageImages);
    } catch (error) {
      console.error("Error accessing database:", error);
    }
  }

  // Reset session storage info of changed settings and reset view
  resetSessionStorage() {
    // Confirm before clearing saved options
    if (!confirm('Are you sure you want to reset all saved options? This will clear your saved preferences.')) {
      return;
    }
    localStorage.removeItem("prompt-input");
    localStorage.removeItem("negative-prompt-input");
    localStorage.removeItem("custom-denoise");
    localStorage.removeItem("seed-input");
    localStorage.removeItem("cfg");
    localStorage.removeItem("aspect-ratio");
    localStorage.removeItem("fast-pass-code");
    localStorage.removeItem('discordUserData');
    localStorage.removeItem('showNSFWLoras');
    this.generationRequest.prompt = "";
    this.generationRequest.negative_prompt = this.defaultNegativePrompt;
    this.generationRequest.strength = 0.8;
    this.generationRequest.seed = undefined;
    this.generationRequest.guidance_scale = 7;
    this.generationRequest.model = "sonicDiffusionV4";
    this.loginInfo = null;
    this.showNSFWLoras = false;
    this.sharedService.setUserData(null);
    this.changeAspectRatio("square");

    this.loadSettings();

    // reset images
    this.imagesChange.emit([]);
  }

  // Load the next page of images
  async loadImagePage(pageNumber: number) {
    // Delete all blob URLs to prevent memory leaks
    this.blobUrls.forEach((url) => URL.revokeObjectURL(url));

    const images = this.imageHistoryMetadata.slice((pageNumber - 1) * this.imagesPerPage, pageNumber * this.imagesPerPage);
    const uuids = images.map(image => image.UUID);

    let intermediateImages: any[] = [...images]

    try {
      const db = await this.getDatabase();
      const transaction = db.transaction('blobStore', 'readonly');
      const store = transaction.objectStore('blobStore');

      // Create a promise for each UUID
      const requests = uuids.map((uuid, index) => {
        return new Promise((resolve, reject) => {
          const request = store.get(uuid);
          request.onsuccess = async (event) => {
            const result = request.result;
            if (result) {
              let blob = result.blob;

              // Convert to URL
              intermediateImages[index].url = URL.createObjectURL(blob);
              this.blobUrls.push(intermediateImages[index].url);
            }
            resolve(undefined);
          };
          request.onerror = () => {
            reject(`Failed to load image data for UUID: ${uuid}`);
          };
        });
      });

      // Wait for all requests to complete
      await Promise.all(requests);

    } catch (error) {
      console.error('Failed to load image data', error);
    }

    return intermediateImages;
  }

  async loadImageData(image: MobiansImage) {
    if (image.url) {
      return; // Image data is already loaded
    }

    try {
      const db = await this.getDatabase();
      const transaction = db.transaction('blobStore', 'readonly');
      const store = transaction.objectStore('blobStore');

      const request = store.get(image.UUID);

      request.onsuccess = (event) => {
        const result = request.result;
        if (result) {
          const blob = result.blob

          // Convert to object URL and track it for cleanup
          image.url = URL.createObjectURL(blob);
          this.blobUrls.push(image.url);
        }
      };

      await new Promise((resolve) => {
        transaction.oncomplete = () => {
          resolve(undefined);
        };
      });
    } catch (error) {
      console.error('Failed to load image data', error);
    }
  }

  private safeRevoke(url?: string) {
    if (url) {
      try { URL.revokeObjectURL(url); } catch { /* no-op */ }
    }
  }

  // Send job to django api and retrieve job id.
  async submitJob(upscale: boolean = false) {
    if (upscale) {
      this.generationRequest.job_type = "upscale";
    }

    // Prevent multi-tab concurrency
    if (this.lockService.isLockedByOther()) {
      this.messageService.add({ severity: 'warn', summary: 'Generation running', detail: 'Another tab is generating. Please wait or close other tabs.' });
      return;
    }
    if (!this.lockService.tryAcquire()) {
      this.messageService.add({ severity: 'warn', summary: 'Please wait', detail: 'A generation is already in progress.' });
      return;
    }

    // Disable generation button
    this.enableGenerationButton = false;

    // Hide canvas if it exists
    this.showInpaintingCanvas = false;

    // Ensure client id is attached for server-side dedupe if supported
    this.generationRequest.client_id = this.notificationService.userId;

    // Save settings to session storage
    this.saveSettings();
    this.inpaintingChange.emit(this.showInpaintingCanvas);

    // Change seed to random number if default seed is selected
    let defaultSeed: boolean;
    if (this.generationRequest.seed == undefined || this.generationRequest.seed == -1) {
      defaultSeed = true;
      this.generationRequest.seed = Math.floor(Math.random() * 100000000);
    }
    else {
      defaultSeed = false;
    }
    this.currentSeed = this.generationRequest.seed;

    // set reference image if there is one
    if (this.referenceImage && (this.generationRequest.image == undefined || this.generationRequest.image == "")) {
      // set image to base64 string if exists and non- "", else set to url
      this.generationRequest.image = await this.blobMigrationService.blobToBase64(this.referenceImage.blob!);
    }

    this.sharedService.setGenerationRequest(this.generationRequest);

    // set loading to true and submit job
    this.loadingChange.emit(true);
    this.hasPendingJob = true;
    this.stableDiffusionService.submitJob(this.generationRequest)
      .subscribe(
        response => {
          // Persist pending job so we can resume after refresh
          this.savePendingJob(response.job_id, {
            prompt: this.generationRequest.prompt,
            width: this.generationRequest.width,
            height: this.generationRequest.height,
            job_type: this.generationRequest.job_type,
            model: this.generationRequest.model,
            client_id: this.generationRequest.client_id
          });

          this.getJob(response.job_id);
        },
        error => {
          console.error(error);  // handle error
          this.showError(error);  // show the error modal
          this.imagesChange.emit(this.images);
          this.loadingChange.emit(false);
          this.enableGenerationButton = true;
          this.generationRequest.mask_image = undefined;
          this.lockService.release();
        }
      );

    // reset seed to default if it was changed
    if (defaultSeed) {
      this.generationRequest.seed = undefined;
    }
  }

  // Action to cancel a pending/running job
  cancelPendingJob() {
    const id = this.jobID || this.getPendingJob()?.job_id;
    if (!id) return;
    this.cancelInProgress = true;
    this.enableGenerationButton = false;
    this.stableDiffusionService.cancelJob(id).subscribe({
      next: () => {
        // Stop polling if active
        this.jobPollSub?.unsubscribe();
        this.jobPollSub = undefined;

        this.hasPendingJob = false;
        this.jobID = "";
        this.removePendingJob?.();
        this.enableGenerationButton = true;
        this.loadingChange.emit(false);
        this.queuePositionChange.emit(0);
        this.etaChange.emit(undefined);
        // Release generation lock on cancel
        this.lockService.release();
        this.messageService.add?.({ severity: 'success', summary: 'Cancelled', detail: 'Generation cancelled.' });
        // Reset cancel flag after handling
        this.cancelInProgress = false;
      },
      error: (err) => {
        this.enableGenerationButton = true;
        this.cancelInProgress = false;
        this.messageService.add?.({ severity: 'error', summary: 'Cancel failed', detail: 'Unable to cancel job.' });
        console.error(err);
      }
    });
  }

  // check for status of job
  getJob(job_id: string) {
    // Set current job id for cancel button
    this.jobID = job_id;

    let jobComplete = false;
    let lastResponse: any;

    const getJobInfo = {
      "job_id": job_id,
    }

    // Create an interval which fires every 1 second
    let subscription: Subscription; // Declare a variable to hold the subscription
    subscription = interval(1000)
      .pipe(
        // For each tick of the interval, call the service
        concatMap((): any => {
          if (!navigator.onLine) {
            // Emit a dummy "pending" shape to keep types consistent
            return of({ status: 'pending' } as any);
          }
          return this.stableDiffusionService.getJob(getJobInfo).pipe(
            retryWhen((errors: any) =>
              errors.pipe(
                // use the scan operator to track the number of attempts
                scan((retryCount: number, err: any) => {
                  // if retryCount reaches 5 or error status is not 500, throw error
                  if (retryCount >= 5 || (err.status && err.status !== 500)) {
                    throw err;
                  }
                  console.log("retrying... Attempt #" + (retryCount + 1) + " of 5");
                  return retryCount + 1;
                }, 0),
                // exponential backoff with cap
                delayWhen((attempt: number) => timer(Math.min(1000 * Math.pow(2, attempt), 10000)))
              )
            )
          );
        }),
        // Store the response for use in finalize
        tap((response: any) => lastResponse = response),
        // Only continue the stream while the job is incomplete
        takeWhile((response: any) => !(jobComplete = (response && response.status === 'completed')), true),
        takeUntilDestroyed(this.destroyRef),
        // Once the stream completes, do any cleanup if necessary
        finalize(async () => {
          // If this finalize was triggered by a cancel, skip notifications and any error popups
          if (this.cancelInProgress) {
            return;
          }
          if (this.enableNotifications) {
            this.notificationService.playDing();
            this.notificationService.sendPushNotification();
          }
          if (jobComplete && lastResponse) {
            console.log(lastResponse);
            const generatedImages = lastResponse.result.map((base64String: string) => {
              const blob = this.blobMigrationService.base64ToBlob(base64String)
              const blobUrl = URL.createObjectURL(blob);

              return {
                blob: blob,
                width: this.generationRequest.width,
                height: this.generationRequest.height,
                aspectRatio: this.aspectRatio.aspectRatio,
                UUID: uuidv4(),
                rated: false,
                timestamp: new Date(),
                prompt: this.generationRequest.prompt,
                promptSummary: this.generationRequest.prompt.slice(0, 50) + '...', // Truncate prompt summary
                url: blobUrl // Generate URL
              } as MobiansImage;
            });
            // Track created URLs for later revocation
            generatedImages.forEach((img: MobiansImage) => {
              if (img.url) this.blobUrls.push(img.url);
            });
            this.images = generatedImages;
            this.sharedService.disableInstructions();
            this.sharedService.setImages(this.images);

            // Calculate the total number of pages
            this.totalPages++;
            this.currentPageNumber++;

            // Convert to webp if image is png
            if (generatedImages[0].blob.type == "image/png") {
              for (let i = 0; i < generatedImages.length; i++) {
                generatedImages[i].blob = await this.blobMigrationService.convertToWebP(generatedImages[i].blob);
              }
            }

            // Add the images to the image history metadata
            this.imageHistoryMetadata.unshift(...generatedImages.map((image: MobiansImage) => {
              return { UUID: image.UUID, prompt: image.prompt!, promptSummary: image.promptSummary, timestamp: image.timestamp!, aspectRatio: image.aspectRatio, width: image.width, height: image.height, favorite: false } as MobiansImageMetadata;
            }));

            try {
              const db = await this.getDatabase();
               const transaction = db.transaction([this.storeName, 'blobStore'], 'readwrite');
               const store = transaction.objectStore(this.storeName);
               const blobStore = transaction.objectStore('blobStore');

               for (const image of generatedImages) {
                 // Save the image metadata
                 const imageMetadata: any = { ...image };
                 delete imageMetadata.blob; // Remove the base64 data from metadata
                 delete imageMetadata.url; // Remove the URL from metadata
                 store.put(imageMetadata);

                 // Save the base64 data separately
                 blobStore.put({ UUID: image.UUID, blob: image.blob });
               }
            } catch (error) {
              console.error('Failed to store image data', error);
            }

            this.loadingChange.emit(false);
            this.enableGenerationButton = true;
            this.removePendingJob();
            this.lockService.release();
          } else {
            // failed or not found
            this.removePendingJob();
            this.lockService.release();
          }
        })
      )
      .subscribe(
        (response: any) => {
          if (!response || response.status === undefined) {
            const error = { error: { detail: "Job not found. Please try again later." } };
            console.error(error)
            this.showError(error);  // show the error modal
            this.enableGenerationButton = true;
            this.loadingChange.emit(false);
            this.removePendingJob();
            this.lockService.release();
            subscription.unsubscribe();
          } else if (response.status === 'failed' || response.status === 'error') {
            this.handleFailedJob(response);
            this.removePendingJob();
            this.lockService.release();
            subscription.unsubscribe();
          } else {
            // Persist queue position and ETA so other tabs / reloads can reflect state
            this.queuePositionChange.emit(response.queue_position ?? 0);
            this.etaChange.emit(response.eta ?? undefined);
            this.saveQueueEta(response.queue_position, response.eta);
          }
        },
        (error: any) => {
          // Suppress 404/409 if it resulted from a user-initiated cancel
          if (this.cancelInProgress && (error?.status === 404 || error?.status === 409)) {
            return;
          }
          console.error(error)
          this.showError(error);  // show the error modal
          this.enableGenerationButton = true;
          this.loadingChange.emit(false);
          this.removePendingJob();
          this.lockService.release();
        }
      );

    // Track active polling subscription so we can stop it on cancel
    this.jobPollSub = subscription;
  }

  // Add this method to your class
  private handleFailedJob(response: any) {
    console.error('Job failed or encountered an error:', response);
    this.showError({ error: { detail: `Job ${response.status}: ${response.message || 'Unknown error occurred'}` } });
    this.enableGenerationButton = true;
    this.loadingChange.emit(false);
  }

  enableInpaintCanvas() {
    this.showInpaintingCanvas = !this.showInpaintingCanvas;
    this.inpaintingChange.emit(this.showInpaintingCanvas);
  }

  showError(error: any) {
    // Default error message
    let errorMessage = 'There was an error attempting to generate your image. Website is possibly down. Try out generating on CivitAi as an alternative. https://civitai.com/models/1493';

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

  removeReferenceImage() {
    this.referenceImage = undefined;
    this.generationRequest.image = undefined;
    this.sharedService.setReferenceImage(null);
    this.sharedService.setGenerationRequest(this.generationRequest);

    // If there are no images to unexpand enable the instructions
    if (this.images.length == 0) {
      this.sharedService.enableInstructions();
    }
    else {

    }
  }

  enableNotification() {
    const userId = uuidv4()
    this.notificationService.userId = userId;

    if (this.enableNotifications) {
      this.notificationService.subscribeToNotifications();
    }
  }

  openImageModal() {
    this.imageModalOpen.emit(true);
  }

  async openImageDetails(image: MobiansImage) {
    // Implement the logic to open the image details modal or view
    console.log('Opening image details for:', image);

    // Get blob info from url
    fetch(image.url!)
      .then(response => response.blob())
      .then(async blob => {

        // Convert to png if generationRequest.lossy_images is false
        if (!this.generationRequest.lossy_images) {
          blob = await this.blobMigrationService.convertWebPToPNG(blob);

          // Replace the object URL safely and track the new one
          this.safeRevoke(image.url);
          const newUrl = URL.createObjectURL(blob);
          image.url = newUrl;
          this.blobUrls.push(newUrl);
        }

        // Set the reference image to the selected image
        image.blob = blob;
        this.referenceImage = image;
        this.generationRequest.image = image.blob;
        this.sharedService.setReferenceImage(image);

        // update prompt
        if (image.prompt) {
          this.generationRequest.prompt = image.prompt;
          this.sharedService.setPrompt(image.prompt!);
        }
      });
  }

  toggleOptions() {
    const historyCollapse = document.getElementById('historyCollapse');
    if (historyCollapse) {
      historyCollapse.classList.remove('show');
    }

    const lorasCollapse = document.getElementById('lorasCollapse');
    if (lorasCollapse) {
      lorasCollapse.classList.remove('show');
    }
  }

  toggleHistory() {
    const optionsCollapse = document.getElementById('collapseExample');
    if (optionsCollapse) {
      optionsCollapse.classList.remove('show');
    }

    const lorasCollapse = document.getElementById('lorasCollapse');
    if (lorasCollapse) {
      lorasCollapse.classList.remove('show');
    }
  }

  toggleLoras() {
    const optionsCollapse = document.getElementById('collapseExample');
    if (optionsCollapse) {
      optionsCollapse.classList.remove('show');
    }

    const historyCollapse = document.getElementById('historyCollapse');
    if (historyCollapse) {
      historyCollapse.classList.remove('show');
    }
  }

  debounce(func: Function, wait: number): (...args: any[]) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: any[]) => {
      const later = () => {
        timeout = null;
        func(...args);
      };
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(later, wait);
    };
  }

  // Modified searchImages function
  async searchImages() {
    this.isSearching = true;
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      const query = this.searchQuery.trim().toLowerCase();
      console.log('Search query:', query);  // Log the search query

      let results: MobiansImage[];

      // Check if full-text index exists and the browser supports IDBIndex.getAll
      if (store.indexNames.contains('promptFullText') && 'getAll' in IDBIndex.prototype) {
        try {
          const index = store.index('promptFullText');
          console.log('Using full-text index:', index.name);  // Log the index being used

          // Log the total count of items in the index
          const countRequest = index.count();
          countRequest.onsuccess = () => {
            console.log('Total items in index:', countRequest.result);
          };

          const request = index.getAll();  // Remove the IDBKeyRange for now

          results = await new Promise<MobiansImage[]>((resolve, reject) => {
            request.onsuccess = () => {
              const searchResults = request.result as MobiansImage[];
              const projectedResults = searchResults.map(item => ({
                UUID: item.UUID,
                prompt: item.prompt,
                promptSummary: item.prompt?.slice(0, 50) + '...', // Truncate prompt summary
                timestamp: item.timestamp,
                aspectRatio: item.aspectRatio,
                width: item.width,
                height: item.height,
                favorite: item.favorite
              }));
              console.log('Full-text search results:', projectedResults);
              console.log('Number of results:', projectedResults.length);

              resolve(projectedResults);
            };
            request.onerror = (event) => {
              console.error('Error in full-text search:', event);
              reject(request.error);
            };
          });

          // If results are empty, fall back to regular search
          if (results.length === 0) {
            console.log('Full-text search returned no results, falling back to regular search');
            results = await this.fallbackSearch(store, query);
          }
        } catch (error) {
          console.warn("Full-text search failed, falling back to regular search:", error);
          results = await this.fallbackSearch(store, query);
        }
      } else {
        console.log('Full-text index not available, using regular search');
        results = await this.fallbackSearch(store, query);
      }

      // Filter results based on the query
      results = results.filter(image =>
        image.prompt && image.prompt.toLowerCase().includes(query)
      );

      // sort the results by timestamp in descending order
      results.sort((a, b) => {
        const timestampA = a.timestamp ? a.timestamp.getTime() : 0;
        const timestampB = b.timestamp ? b.timestamp.getTime() : 0;
        return timestampB - timestampA;
      });

      console.log('Filtered results:', results.length);
      const memoryUsage = this.memoryUsageService.roughSizeOfArrayOfObjects(results);
      console.log(`Approximate memory usage: ${memoryUsage} bytes`);

      // ... (rest of your code for sorting and pagination)
      this.imageHistoryMetadata = results;
      this.favoriteImageHistoryMetadata = results.filter(image => image.favorite);
      this.currentPageNumber = 1;
      this.totalPages = Math.ceil(results.length / this.imagesPerPage);

      // Load the first page of images
      this.currentPageImages = await this.paginateImages(1);

      this.updateFavoriteImages();

    } catch (error) {
      console.error("Error accessing database:", error);
    } finally {
      this.isSearching = false;
    }
  }

  private async fallbackSearch(store: IDBObjectStore, query: string): Promise<MobiansImage[]> {
    const index = store.index('timestamp');
    return new Promise<MobiansImage[]>((resolve, reject) => {
      const cursorRequest = index.openCursor(null, 'prev');
      const matchingImages: MobiansImage[] = [];

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          const metadata = cursor.value as MobiansImage;
          matchingImages.push(metadata);  // Add all images, we'll filter later
          cursor.continue();
        } else {
          console.log('Fallback search found', matchingImages.length, 'images');
          resolve(matchingImages);
        }
      };

      cursorRequest.onerror = (event) => {
        console.error('Error in fallback search:', event);
        reject(new Error('Failed to open cursor'));
      };
    });
  }


  async paginateImages(pageNumber: number): Promise<MobiansImage[]> {
    try {
      const queriedImages = await this.loadImagePage(pageNumber);
      console.log('Current page images:', queriedImages);
      return queriedImages;
    } catch (error) {
      console.error('Error in paginateImages:', error);
      throw error;
    }
  }


  async loadSoroundingImages(pageNumber: number) {
    // First check if current page images are already loaded
    console.log('this.currentPageImages:', this.currentPageImages);
    if (this.currentPageImages.length == 0 || !this.currentPageImages[0].url) {
      this.currentPageImages = await this.paginateImages(pageNumber);
    }

    // Check if next page images are already loaded
    console.log('this.nextPageImages:', this.nextPageImages);
    if (this.nextPageImages.length == 0 || (!this.nextPageImages[0].url && pageNumber + 1 < this.totalPages)) {
      this.nextPageImages = await this.paginateImages(pageNumber + 1);
    }

    // Check if previous page images are already loaded
    console.log('this.prevPageImages:', this.prevPageImages);
    if (this.prevPageImages.length == 0 || (!this.prevPageImages[0].url && pageNumber - 1 > 0)) {
      this.prevPageImages = await this.paginateImages(pageNumber - 1);
    }
  }

  // Cache DB connection (not sure it was worth it)
  private async getDatabase(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = await this.openDatabase();
    }
    return this.db;
  }

  async queryImages(
    sortField: string,
    sortOrder: 'asc' | 'desc',
    page: number,
    itemsPerPage: number,
    searchQuery: string = ''
  ): Promise<MobiansImage[]> {
    const db = await this.getDatabase();
    const transaction = db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const index = store.index(sortField);

    const direction: IDBCursorDirection = sortOrder === 'asc' ? 'next' : 'prev';

    return new Promise<MobiansImage[]>((resolve, reject) => {
      const images: MobiansImage[] = [];
      const skipCount = (page - 1) * itemsPerPage;
      let isSkipped = false;

      const request = index.openCursor(null, direction);

      request.onerror = () => reject(new Error('Failed to open cursor'));
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          if (skipCount !== 0 && !isSkipped) {
            cursor.advance(skipCount);
            isSkipped = true;
          }
          else {
            const metadata = cursor.value as MobiansImage;
            if (
              searchQuery === '' ||
              metadata.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              metadata.promptSummary?.toLowerCase().includes(searchQuery.toLowerCase())
            ) {
              // If url is missing get it from base64Store
              if (!metadata.url) {
                this.loadImageData(metadata);
              }

              images.push(metadata);
              if (images.length >= itemsPerPage) {
                resolve(images);
                return;
              }
            }
            cursor.continue();
          }
        } else {
          resolve(images);
        }
      };
    });
  }

  async previousPage() {
    this.currentPageImages = this.clearBase64Data(this.currentPageImages);
    this.currentPageImages = [];
    this.currentPageNumber--;
    this.currentPageImages = await this.paginateImages(this.currentPageNumber);

    console.log('Current page number:', this.currentPageNumber);
    console.log('Current page images:', this.currentPageImages);
    console.log('Prev page images:', this.prevPageImages);
    console.log('Next page images:', this.nextPageImages);
  }

  async nextPage() {
    this.currentPageImages = this.clearBase64Data(this.currentPageImages);
    this.currentPageImages = [];
    this.currentPageNumber++;
    this.currentPageImages = await this.paginateImages(this.currentPageNumber);

    console.log('Current page number:', this.currentPageNumber);
    console.log('Current page images:', this.currentPageImages);
    console.log('Prev page images:', this.prevPageImages);
    console.log('Next page images:', this.nextPageImages);
  }

  clearBase64Data(images: MobiansImage[]) {
    for (const image of images) {
      if (image.UUID == this.referenceImage?.UUID) {
        continue; // Skip the reference image
      }

      // Skip the wipe if the image is in the current favorite list page
      if (this.favoriteImageHistoryMetadata.find(item => item.UUID === image.UUID)) {
        continue;
      }

      URL.revokeObjectURL(image.url!);
      image.url = ''; // Clear the URL
    }
    return images;
  }

  sortImages() {
    // if (this.selectedSortOption === 'timestamp') {
    //   this.currentPageImages.sort((a, b) => {
    //     const timestampA = a.timestamp ? a.timestamp.getTime() : 0;
    //     const timestampB = b.timestamp ? b.timestamp.getTime() : 0;
    //     return this.sortOrder === 'asc' ? timestampA - timestampB : timestampB - timestampA;
    //   });
    // } else if (this.selectedSortOption === 'promptSummary') {
    //   this.currentPageImages.sort((a, b) => {
    //     const summaryA = a.promptSummary ? a.promptSummary.toLowerCase() : '';
    //     const summaryB = b.promptSummary ? b.promptSummary.toLowerCase() : '';
    //     return this.sortOrder === 'asc' ? summaryA.localeCompare(summaryB) : summaryB.localeCompare(summaryA);
    //   });
    // }
    // // Add more sorting options as needed

    // this.paginateImages();
    // this.searchImages();
  }

  reverseSortOrder() {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    // this.sortImages();
  }

  async deleteAllImages() {
    // Confirm before deleting all images
    if (!confirm('Are you sure you want to permanently delete your entire image history? This cannot be undone.')) {
      return;
    }
     try {
       const db = await this.getDatabase();
       let transaction = db.transaction(this.storeName, 'readwrite');
       const store = transaction.objectStore(this.storeName);

       const request = store.clear();

       request.onsuccess = (event) => {
         console.log('All images deleted from IndexedDB');
         this.currentPageImages = [];
         this.currentPageNumber = 1;
         this.totalPages = 1;
       };

       // Delete second table too
       transaction = db.transaction(this.blobStoreName, 'readwrite');
       const blobstore = transaction.objectStore(this.blobStoreName);
       const blobRequest = blobstore.clear();

       blobRequest.onsuccess = (event) => {
         console.log('All blob data deleted from IndexedDB');
       };

       request.onerror = (event) => {
         console.error('Failed to delete images from IndexedDB', event);
       };

       // Wait for the transaction to complete before proceeding
       await new Promise((resolve) => {
         transaction.oncomplete = () => {
           resolve(undefined);
         };
       });
     } catch (error) {
       console.error('Failed to open database', error);
     }
  }

  // Example function called after successful Discord login
  onDiscordLoginSuccess(userData: any) {
    localStorage.setItem('discordUserData', JSON.stringify(userData));
  }

  onFastPassCodeChange(event: any) {
    this.generationRequest.fast_pass_code = event.target.value.toLowerCase().replace(/\s/g, '');
  }

  openAddLorasDialog() {
    // Ensure the user is logged in before opening the dialog
    console.log('Login info:', this.loginInfo);
    if (!this.loginInfo) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error Message',
        detail: 'You must be logged in to suggest LoRAs. (Discord button in the FAQ section)',
        life: 3000
      });
      return;
    }

    // Detect screen width to adjust dialog size for mobile and desktop
    const screenWidth = window.innerWidth;
    let dialogWidth = '50%'; // Default for desktop

    if (screenWidth <= 600) {
      dialogWidth = '90%'; // Set to 90% for mobile screens
    }

    // Open the dialog with the dynamic width
    this.dialogService.open(AddLorasComponent, {
      header: 'Request Loras To Be Added!',
      width: dialogWidth
    });
  }


  loadLoras() {
    this.stableDiffusionService.getLoras().pipe(
      takeUntilDestroyed()
    ).subscribe({
      next: (response: any[]) => {
        this.loras = response;
        this.filterLoras();
        this.refreshLoraFiltersList();
      },
      error: (error) => {
        console.error('Error loading Loras:', error);
      }
    });
  }

  filterLoras() {
    // First filter by model type
    this.filteredLoras = this.loras.filter(lora => lora.base_model === this.models_types[this.generationRequest.model]);

    // Filter by nsfw (ie. Hide nsfw if showNSFWLoras is false)
    if (!this.showNSFWLoras) {
      this.filteredLoras = this.filteredLoras.filter(lora => !lora.is_nsfw);
    }

    // Then filter by search query
    this.filteredLoras = this.filteredLoras.filter(lora =>
      (lora.name.toLowerCase().includes(this.loraSearchQuery.toLowerCase()) || lora.version.toLowerCase().includes(this.loraSearchQuery.toLowerCase()))
    );

    // Sort by most uses
    this.filteredLoras = this.filteredLoras.sort((a, b) => b.uses - a.uses);

    // Filter by selected filters
    if (this.selectedTags.length > 0) {
      this.filteredLoras = this.filteredLoras.filter(lora => lora.tags.some((tag: string) => this.selectedTags.includes(tag)));
    }
  }

  // Function to select a LoRA
  selectLora(lora: any) {
    // Make sure the user doesn't select more than 3 LoRAs
    if (this.selectedLoras.length >= this.maxLoras) {
      alert('You can only select up to 3 LoRAs at a time.');
    }
    // If selecting an already selected LoRA, remove it
    else if (this.selectedLoras.find(item => item === lora)) {
      this.removeLora(lora);
    }
    else {
      lora.strength = 1.0; // Set the default strength to 1.0
      this.selectedLoras.push(lora);
      this.generationRequest.loras = this.selectedLoras;

      // Add the trigger prompt, if it exists to the prompt input (only if it's not already there)
      if (lora.trigger_words) {
        // Check if the prompt already contains the trigger words and single out the missing ones
        const missing_trigger_words: string[] = [];

        // seperate this.generationRequest.prompt into an array of words and remove any whitespace and sanitize
        let prompt_words = this.generationRequest.prompt.split(',');
        prompt_words = prompt_words.map((word: string) => word.trim().toLowerCase());

        // sanitize trigger words and check if they are in the prompt
        let trigger_words = lora.trigger_words;
        trigger_words = trigger_words.map((word: string) => word.trim().toLowerCase());

        trigger_words.forEach((element: string) => {
          if (!prompt_words.includes(element)) {
            missing_trigger_words.push(element);
          }
        });

        // Add missing trigger words if they exists
        missing_trigger_words.forEach((element: String) => {
          this.generationRequest.prompt += ', ' + element;
        });
        this.sharedService.setPrompt(this.generationRequest.prompt);
      }
    }
  }

  // Function to update the strength of a LoRA
  updateStrength(lora: any, newStrength: number) {
    const loraItem = this.selectedLoras.find(item => item === lora);
    if (loraItem) {
      loraItem.strength = newStrength;
    }
  }

  // Function to remove a selected LoRA
  removeLora(lora: any) {
    this.selectedLoras = this.selectedLoras.filter(item => item !== lora);
    this.generationRequest.loras = this.selectedLoras;

    // Remove the trigger prompt from the prompt input
    if (lora.trigger_words) {
      // sanitize trigger words
      let trigger_words = lora.trigger_words;
      trigger_words = trigger_words.map((word: string) => word.trim().toLowerCase());

      trigger_words.forEach((element: String) => {
        this.generationRequest.prompt = this.generationRequest.prompt.replace(', ' + element, '');
      });
      this.sharedService.setPrompt(this.generationRequest.prompt);
    }
  }

  // Method to open the modal with the full-sized image
  openImageModalLoraPreview(imageUrl: string) {
    this.selectedImageUrl = imageUrl;
    this.displayModal = true;
  }

  // Optional: Method to close the modal (if needed)
  closeModal() {
    this.displayModal = false;
    this.selectedImageUrl = null;
  }

  //#region Favorite Images
  toggleFavorite(image: MobiansImage) {
    image.favorite = !image.favorite;
    this.updateImageInDB(image);
    this.updateFavoriteImages();
  }

  async deleteImage(image: MobiansImage) {
    // Remove from current images arrays
    this.currentPageImages = this.currentPageImages.filter(img => img.UUID !== image.UUID);
    this.imageHistoryMetadata = this.imageHistoryMetadata.filter(img => img.UUID !== image.UUID);

    // Update total pages
    this.totalPages = Math.ceil(this.imageHistoryMetadata.length / this.imagesPerPage);

    // Delete from favorites if necessary
    if (image.favorite) {
      this.favoritePageImages = this.favoritePageImages.filter(img => img.UUID !== image.UUID);
      this.favoriteImageHistoryMetadata = this.favoriteImageHistoryMetadata.filter(img => img.UUID !== image.UUID);
      this.favoriteTotalPages = Math.ceil(this.favoriteImageHistoryMetadata.length / this.favoriteImagesPerPage);
    }

    // Delete the image from IndexedDB
    this.deleteImageFromDB(image);

    // After deleting a single image we want to load the next image into this page to replace the deleted one if there are any
    const nextImageIndex = this.imagesPerPage * (this.currentPageNumber) - 1;
    if (this.imageHistoryMetadata.length > nextImageIndex) {
      await this.loadImageData(this.imageHistoryMetadata[nextImageIndex]);
      this.currentPageImages.push(this.imageHistoryMetadata[nextImageIndex]);
    }

    // Do the same for the favorite images
    const nextFavoriteImageIndex = this.favoriteImagesPerPage * (this.favoriteCurrentPageNumber) - 1;
    if (this.favoriteImageHistoryMetadata.length > nextFavoriteImageIndex) {
      await this.loadImageData(this.favoriteImageHistoryMetadata[nextFavoriteImageIndex]);
      this.favoritePageImages.push(this.favoriteImageHistoryMetadata[nextFavoriteImageIndex]);
    }
  }

  async updateImageInDB(image: MobiansImage) {
    try {
      // Remove excess fields, we only need the favorite field
      let imageMetadata: MobiansImage = { ...image };
      if (imageMetadata.blob) {
        delete imageMetadata.blob;
      }
      if (imageMetadata.url) {
        delete imageMetadata.url;
      }

      const db = await this.getDatabase();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      store.put(imageMetadata);
      console.log('Image favorited:', imageMetadata);
    } catch (error) {
      console.error('Failed to update image in IndexedDB', error);
    }
  }

  async deleteImageFromDB(image: MobiansImage) {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName, 'blobStore'], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const blobStore = transaction.objectStore('blobStore');

      // Delete from metadata store
      store.delete(image.UUID!);

      // Delete from blobStore
      blobStore.delete(image.UUID!);
    } catch (error) {
      console.error('Failed to delete image from IndexedDB', error);
    }
  }

  updateFavoriteImages() {
    if (this.favoriteSearchQuery) {
      const filteredImages = this.imageHistoryMetadata;
      this.favoriteImageHistoryMetadata = this.imageHistoryMetadata.filter(image => image.favorite);

      // Only show images that match the search query
      this.favoriteImageHistoryMetadata = this.favoriteImageHistoryMetadata.filter(image =>
        image.prompt && image.prompt.toLowerCase().includes(this.favoriteSearchQuery.toLowerCase())
      );
    }
    else {
      this.favoriteImageHistoryMetadata = this.imageHistoryMetadata.filter(image => image.favorite);
    }
    this.favoriteTotalPages = Math.ceil(this.favoriteImageHistoryMetadata.length / this.favoriteImagesPerPage);

    if (this.favoriteCurrentPageNumber > this.favoriteTotalPages) {
      this.favoriteCurrentPageNumber = 1;
    }

    this.paginateFavoriteImages(this.favoriteCurrentPageNumber).then(images => {
      this.favoritePageImages = images;
    });
  }

  async paginateFavoriteImages(pageNumber: number): Promise<MobiansImage[]> {
    try {
      const queriedImages = await this.loadFavoriteImagePage(pageNumber);
      return queriedImages;
    } catch (error) {
      console.error('Error in paginateFavoriteImages:', error);
      throw error;
    }
  }

  async loadFavoriteImagePage(pageNumber: number) {
    const images = this.favoriteImageHistoryMetadata.slice(
      (pageNumber - 1) * this.favoriteImagesPerPage,
      pageNumber * this.favoriteImagesPerPage
    );
    const uuids = images.map(image => image.UUID);

    let intermediateImages: any[] = [...images];

    try {
      const db = await this.getDatabase();
       const transaction = db.transaction('blobStore', 'readonly');
       const store = transaction.objectStore('blobStore');

       const requests = uuids.map((uuid, index) => {
         return new Promise((resolve, reject) => {
           const request = store.get(uuid);
           request.onsuccess = async (event) => {
             const result = request.result;
             if (result) {
               let blob = result.blob;

               // Convert to URL
               intermediateImages[index].url = URL.createObjectURL(blob);
               this.blobUrls.push(intermediateImages[index].url);
             }
             resolve(undefined);
           };
           request.onerror = () => {
             reject(`Failed to load image data for UUID: ${uuid}`);
           };
         });
       });

       await Promise.all(requests);

    } catch (error) {
      console.error('Failed to load image data', error);
    }

    return intermediateImages;
  }

  async previousFavoritePage() {
    this.favoriteCurrentPageNumber--;
    this.favoritePageImages = await this.paginateFavoriteImages(this.favoriteCurrentPageNumber);
  }

  async nextFavoritePage() {
    this.favoriteCurrentPageNumber++;
    this.favoritePageImages = await this.paginateFavoriteImages(this.favoriteCurrentPageNumber);
  }

  async favoriteSearchImages() {
    this.isSearching = true;
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      const query = this.favoriteSearchQuery.trim().toLowerCase();
      console.log('Doing favorite Search query:', query);

      let favoritedResults: MobiansImage[] = [];

      // Helper function to project results
      const projectResults = (searchResults: MobiansImage[]): MobiansImage[] => {
        return searchResults.map(item => ({
          UUID: item.UUID,
          prompt: item.prompt,
          promptSummary: item.prompt?.slice(0, 50) + '...', // Truncate prompt summary
          timestamp: item.timestamp,
          aspectRatio: item.aspectRatio,
          width: item.width,
          height: item.height,
          favorite: item.favorite
        }));
      };

      // **Step 1: Fetch Favorited Images**
      if (store.indexNames.contains('favorite') && 'getAll' in IDBIndex.prototype) {
        try {
          const favoriteIndex = store.index('favorite');
          console.log('Using favorite index:', favoriteIndex.name);

          const favRequest = favoriteIndex.getAll(IDBKeyRange.only(true));

          favoritedResults = await new Promise<MobiansImage[]>((resolve, reject) => {
            favRequest.onsuccess = () => {
              const favResults = favRequest.result as MobiansImage[];
              const projectedFavResults = projectResults(favResults);
              console.log('Favorited images:', projectedFavResults);
              console.log('Number of favorited images:', projectedFavResults.length);
              resolve(projectedFavResults);
            };
            favRequest.onerror = (event) => {
              console.error('Error fetching favorited images:', event);
              reject(favRequest.error);
            };
          });
        } catch (error) {
          console.warn("Fetching favorited images failed:", error);
          // **Fallback: Use a cursor to iterate and find favorited images**
          favoritedResults = await new Promise<MobiansImage[]>((resolve, reject) => {
            const favResults: MobiansImage[] = [];
            const cursorRequest = store.openCursor();

            cursorRequest.onsuccess = (event) => {
              const cursor = (event.target as IDBRequest).result;
              if (cursor) {
                const image = cursor.value as MobiansImage;
                if (image.favorite === true) { // Explicitly check for true
                  favResults.push({
                    UUID: image.UUID,
                    prompt: image.prompt,
                    promptSummary: image.prompt?.slice(0, 50) + '...',
                    timestamp: image.timestamp,
                    aspectRatio: image.aspectRatio,
                    width: image.width,
                    height: image.height,
                    favorite: image.favorite
                  });
                }
                cursor.continue();
              } else {
                console.log('Cursor iteration complete. Favorited images:', favResults);
                resolve(favResults);
              }
            };

            cursorRequest.onerror = (event) => {
              console.error('Error iterating with cursor:', event);
              reject(cursorRequest.error);
            };
          });
        }
      } else {
        console.log('Favorite index not available, using cursor to fetch favorited images');
        // **Fallback: Use a cursor to iterate and find favorited images**
        favoritedResults = await new Promise<MobiansImage[]>((resolve, reject) => {
          const favResults: MobiansImage[] = [];
          const cursorRequest = store.openCursor();

          cursorRequest.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
              const image = cursor.value as MobiansImage;
              if (image.favorite === true) { // Explicitly check for true
                favResults.push({
                  UUID: image.UUID,
                  prompt: image.prompt,
                  promptSummary: image.prompt?.slice(0, 50) + '...',
                  timestamp: image.timestamp,
                  aspectRatio: image.aspectRatio,
                  width: image.width,
                  height: image.height,
                  favorite: image.favorite
                });
              }
              cursor.continue();
            } else {
              console.log('Cursor iteration complete. Favorited images:', favResults);
              resolve(favResults);
            }
          };

          cursorRequest.onerror = (event) => {
            console.error('Error iterating with cursor:', event);
            reject(cursorRequest.error);
          };
        });
      }

      // **Step 2: Apply Prompt Search Filter to Favorited Images**
      let filteredResults = favoritedResults.filter(image =>
        image.prompt && image.prompt.toLowerCase().includes(query)
      );

      // **Step 3: Sort the Results by Timestamp (Descending)**
      filteredResults.sort((a, b) => {
        const timestampA = a.timestamp ? a.timestamp.getTime() : 0;
        const timestampB = b.timestamp ? b.timestamp.getTime() : 0;
        return timestampB - timestampA;
      });

      console.log('Filtered results:', filteredResults.length);
      const memoryUsage = this.memoryUsageService.roughSizeOfArrayOfObjects(filteredResults);
      console.log(`Approximate memory usage: ${memoryUsage} bytes`);

      // **Update the UI or any other necessary actions**
      this.favoriteImageHistoryMetadata = filteredResults;
      this.favoriteTotalPages = Math.ceil(this.favoriteImageHistoryMetadata.length / this.favoriteImagesPerPage);

      if (this.favoriteCurrentPageNumber > this.favoriteTotalPages) {
        this.favoriteCurrentPageNumber = 1;
      }

      this.paginateFavoriteImages(this.favoriteCurrentPageNumber).then(images => {
        this.favoritePageImages = images;
      });

    } catch (error) {
      console.error("Error accessing database:", error);
      // **Optional: Provide Error Feedback**
      this.messageService.add({
        severity: 'error',
        summary: 'Search Failed',
        detail: 'Unable to perform favorite image search.'
      });
       } finally {
      this.isSearching = false;
    }
  }
  //#endregion

  toggleFilter(filter: string) {
    const index = this.selectedTags.indexOf(filter);
    if (index > -1) {
      // If filter is already active, remove it
      this.selectedTags.splice(index, 1);
    } else {
      // Otherwise, add it
      this.selectedTags.push(filter);
    }
    this.filterLoras();
  }

  refreshLoraFiltersList() {
    // Start fresh
    this.loraTagOptions = [];
  
    // First, just count occurrences
    this.filteredLoras.forEach((lora: any) => {
      lora.tags.forEach((tag: string) => {
        // Try to find existing option by optionValue (which we won't alter later)
        let existing = this.loraTagOptions.find(option => option.optionValue === tag);
        if (!existing) {
          this.loraTagOptions.push({ 
            optionLabel: tag, 
            optionValue: tag, // keep original tag here for lookups 
            count: 1 
          });
        } else {
          existing.count++;
        }
      });
    });
  
    // Sort by count now that counting is complete
    this.loraTagOptions.sort((a, b) => b.count - a.count);
  
    // Now, after sorting and finalizing counts, modify the displayed label
    this.loraTagOptions.forEach(option => {
      option.optionLabel = `${option.optionValue} (${option.count})`;
    });
  }

  // Persistence helpers
  private getPendingJob(): { job_id: string; request?: any; createdAt?: number } | null {
    const raw = localStorage.getItem(this.pendingJobKey);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  private savePendingJob(job_id: string, request?: any) {
    try {
      localStorage.setItem(this.pendingJobKey, JSON.stringify({ job_id, request, createdAt: Date.now() }));
    } catch {}
  }

  private removePendingJob() {
    localStorage.removeItem(this.pendingJobKey);
    localStorage.removeItem(this.queueEtaKey);
  }

  private saveQueueEta(queue_position?: number, eta?: number) {
    try {
      localStorage.setItem(this.queueEtaKey, JSON.stringify({ queue_position, eta, ts: Date.now() }));
    } catch {}
  }

  private handleExpiredPendingJob(pending: { job_id: string; request?: any; createdAt?: number }) {
    // Restore previous settings if we have them
    if (pending.request) {
      this.generationRequest = { ...this.generationRequest, ...pending.request };
      this.sharedService.setGenerationRequest(this.generationRequest);
    }
    // Clear pending and release any lock just in case
    this.removePendingJob();
    this.lockService.release();
    // Re-enable UI
    this.enableGenerationButton = true;
    this.loadingChange.emit(false);
    // Inform the user
    this.messageService.add({
      severity: 'info',
      summary: 'Job expired',
      detail: 'Your previous job is older than 24 hours and can’t be resumed. Your settings were restored — click Generate to try again.',
      life: 6000
    });
  }
}
