import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage, MobiansImageMetadata } from 'src/_shared/mobians-image.interface';
import { interval } from 'rxjs';
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
  private base64StoreName = 'base64Store';

  models = ["sonicDiffusionV4", "fluffySonic"]
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
  };
  jobID: string = "";
  API_URL: string = "";
  referenceImage?: MobiansImage;
  currentSeed?: number;
  supporter: boolean = false;
  serverMember: boolean = false;

  // Pagination
  currentPageImages: MobiansImage[] = [];
  nextPageImages: MobiansImage[] = [];
  prevPageImages: MobiansImage[] = [];
  currentPageNumber = 1;
  imagesPerPage = 4; // Display 4 images per page (2 rows of 2 images each)
  totalPages = 1;
  isLoading: boolean = false;
  imageHistoryMetadata: MobiansImageMetadata[] = [];

  // DB variables
  private db: IDBDatabase | null = null;

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

  readonly VAPID_PUBLIC_KEY = "BDrvd3soyvIOUEp5c-qXV-833C8hJvO-6wE1GZquvs9oqWQ70j0W4V9RCa_el8gIpOBeCKkuyVwmnAdalvOMfLg";

  constructor(
    private stableDiffusionService: StableDiffusionService
    , private sharedService: SharedService
    , private messageService: MessageService
    , private notificationService: NotificationService
    , private swPush: SwPush
    , private memoryUsageService: MemoryUsageService
  ) {
    this.paginateImages = this.paginateImages.bind(this);

    this.debouncedSearch = this.debounce(() => {
      this.searchImages();
    }, 300); // Wait for 300ms after the last keystroke before searching
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.error("IndexedDB is not supported in this browser.");
        reject(new Error("IndexedDB is not supported"));
        return;
      }

      const request = indexedDB.open(this.dbName, 19); // Increment version number

      request.onerror = (event) => {
        console.error("Failed to open database:", event);
        reject(new Error("Failed to open database"));
      };

      request.onsuccess = (event) => {
        const db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = async (event) => {
        const db = request.result;

        // Create the main object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "UUID" });
          console.log("Object store created:", this.storeName);
        }

        // Create base64Store if it doesn't exist
        if (!db.objectStoreNames.contains('base64Store')) {
          db.createObjectStore('base64Store', { keyPath: "UUID" });
          console.log("Base64 store created");
        }

        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore(this.storeName);
          const base64Store = transaction.objectStore('base64Store');

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
          } catch (error) {
            console.warn("Full-text index not supported in this browser:", error);
          }

          let lastCursor: IDBValidKey | null = null;

          const migrateBase64Data = async () => {
            const request = lastCursor ? store.openCursor(lastCursor) : store.openCursor();

            request.onsuccess = async (event) => {
              if (event.target) {
                const cursor = (event.target as IDBRequest).result;

                if (cursor) {
                  const image = cursor.value;
                  console.log("Processing image:", image);

                  if (image.url) {
                    console.log("Migrating base64 data for image:", image.UUID);
                    await base64Store.put({ UUID: image.UUID, base64: image.url });

                    delete image.url;
                    await cursor.update(image);
                    console.log("Base64 data migrated and removed from main store");
                  }

                  lastCursor = cursor.key;
                  cursor.continue();
                } else {
                  lastCursor = null;
                  console.log("No more entries to process");
                }
              }
            };

            request.onerror = (event: Event) => {
              console.error("Error processing entries:", event);
            };

            await new Promise((resolve) => {
              if (transaction.oncomplete !== null) {
                transaction.oncomplete = () => {
                  resolve(undefined);
                };
              } else {
                resolve(undefined);
              }
            });

            if (lastCursor !== null) {
              await migrateBase64Data();
            }
          };

          await migrateBase64Data();
        }
      };

      request.onblocked = (event) => {
        console.error("Database access blocked:", event);
        reject(new Error("Database access blocked"));
      };
    });
  }

  async ngOnInit() {
    this.subscription = this.sharedService.getPrompt().subscribe(value => {
      this.generationRequest.prompt = value;
    });

    this.debouncedSearch = this.debounce(() => {
      this.searchImages();
    }, 300); // Wait for 300ms after the last keystroke before searching

    try {
      await this.openDatabase();
      console.log('Database and object stores created/updated successfully');
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
        image.base64 = image.base64.includes('data:') ? image.base64.split(',')[1] : image.base64;
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
        this.supporter = userData.has_required_role;
        this.serverMember = userData.is_member_of_your_guild;
        console.log('premium member!');
        this.onDiscordLoginSuccess(userData);
      }
    });

    const storedUserData = localStorage.getItem('discordUserData');
    if (storedUserData) {
      const userData = JSON.parse(storedUserData);
      this.supporter = userData.has_required_role;
      this.serverMember = userData.is_member_of_your_guild;
      this.sharedService.setUserData(userData);
    }
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.referenceImageSubscription) {
      this.referenceImageSubscription.unsubscribe();
    }

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
    if (selectElement.value == "autismMix") {
      this.generationRequest.guidance_scale = 4;
    }
    else {
      this.generationRequest.guidance_scale = 7;
    }
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

    // Save model
    localStorage.setItem("model", this.generationRequest.model);
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
    localStorage.removeItem("prompt-input");
    localStorage.removeItem("negative-prompt-input");
    localStorage.removeItem("custom-denoise");
    localStorage.removeItem("seed-input");
    localStorage.removeItem("cfg");
    localStorage.removeItem("aspect-ratio");
    localStorage.removeItem("fast-pass-code");
    this.generationRequest.prompt = "";
    this.generationRequest.negative_prompt = this.defaultNegativePrompt;
    this.generationRequest.strength = 0.8;
    this.generationRequest.seed = undefined;
    this.generationRequest.guidance_scale = 7;
    this.generationRequest.model = "sonicDiffusionV4";
    this.changeAspectRatio("square");

    this.loadSettings();

    // reset images
    this.imagesChange.emit([]);
  }

  // Load the next page of images
  async loadImagePage(pageNumber: number) {
    const images = this.imageHistoryMetadata.slice((pageNumber - 1) * this.imagesPerPage, pageNumber * this.imagesPerPage);
    const uuids = images.map(image => image.UUID);

    let intermediateImages: any[] = [...images]

    try {
      const db = await this.openDatabase();
      const transaction = db.transaction('base64Store', 'readonly');
      const store = transaction.objectStore('base64Store');

      // Create a promise for each UUID
      const requests = uuids.map((uuid, index) => {
        return new Promise((resolve, reject) => {
          const request = store.get(uuid);
          request.onsuccess = (event) => {
            const result = request.result;
            if (result) {
              const base64 = result.base64.includes('data:') ? result.base64.split(',')[1] : result.base64;
              // Convert to base64 URL
              intermediateImages[index].url = 'data:image/png;base64,' + base64;
              // intermediateImages[index].promptSummary = this.generationRequest.prompt.slice(0, 50) + '...'; // Truncate prompt summary
              // intermediateImages[index].height = result.height;
              // intermediateImages[index].width = result.width;
              // intermediateImages[index].aspectRatio = result.aspectRatio;
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
      const db = await this.openDatabase();
      const transaction = db.transaction('base64Store', 'readonly');
      const store = transaction.objectStore('base64Store');

      const request = store.get(image.UUID);

      request.onsuccess = (event) => {
        const result = request.result;
        if (result) {
          const base64 = result.base64.includes('data:') ? result.base64.split(',')[1] : result.base64;

          // Convert to base64 URL
          image.url = 'data:image/png;base64,' + base64;
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

  // Send job to django api and retrieve job id.
  submitJob(upscale: boolean = false) {
    if (upscale) {
      this.generationRequest.job_type = "upscale";
    }

    // Disable generation button
    this.enableGenerationButton = false;

    // Hide canvas if it exists
    this.showInpaintingCanvas = false;

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
      this.generationRequest.image = this.referenceImage.base64 ? this.referenceImage.base64 : this.referenceImage.url!.split(',')[1];
    }

    this.sharedService.setGenerationRequest(this.generationRequest);

    // set loading to true and submit job
    this.loadingChange.emit(true);
    this.stableDiffusionService.submitJob(this.generationRequest)
      .subscribe(
        response => {
          console.log(response);  // handle the response

          this.getJob(response.job_id);
        },
        error => {
          console.error(error);  // handle error
          this.showError(error);  // show the error modal
          this.imagesChange.emit(this.images);
          this.loadingChange.emit(false);
          this.enableGenerationButton = true;
          this.generationRequest.mask_image = undefined;
        }
      );

    // reset seed to default if it was changed
    if (defaultSeed) {
      this.generationRequest.seed = undefined;
    }
  }

  // check for status of job
  getJob(job_id: string) {
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
        concatMap(() => this.stableDiffusionService.getJob(getJobInfo).pipe(
          retryWhen(errors =>
            errors.pipe(
              // use the scan operator to track the number of attempts
              scan((retryCount, err) => {
                // if retryCount reaches 3 or error status is not 500, throw error
                if (retryCount >= 3 || err.status !== 500) {
                  throw err;
                }
                console.log("retrying... Attempt #" + (retryCount + 1) + " of 3");
                return retryCount + 1;
              }, 0),
              // delay retrying the request for 1 second1
              delayWhen(() => timer(1000))
            )
          )
        )),
        // Store the response for use in finalize
        tap(response => lastResponse = response),
        // Only continue the stream while the job is incomplete
        takeWhile(response => !(jobComplete = (response.status === 'completed')), true),
        // Once the stream completes, do any cleanup if necessary
        finalize(async () => {
          if (this.enableNotifications) {
            this.notificationService.playDing();
            this.notificationService.sendPushNotification();
          }
          if (jobComplete && lastResponse) {
            console.log(lastResponse);
            const generatedImages = lastResponse.result.map((base64String: string) => {
              return {
                base64: base64String,
                width: this.generationRequest.width,
                height: this.generationRequest.height,
                aspectRatio: this.aspectRatio.aspectRatio,
                UUID: uuidv4(),
                rated: false,
                timestamp: new Date(),
                prompt: this.generationRequest.prompt,
                promptSummary: this.generationRequest.prompt.slice(0, 50) + '...', // Truncate prompt summary
                url: 'data:image/png;base64,' + base64String // Generate URL
              };
            });
            this.images = generatedImages;
            this.sharedService.setImages(this.images);

            // Calculate the total number of pages
            this.totalPages++;
            this.currentPageNumber++;

            // Add the images to the image history metadata
            this.imageHistoryMetadata.unshift(...generatedImages.map((image: MobiansImage) => { 
              return { UUID: image.UUID, prompt: image.prompt!, promptSummary: image.promptSummary, timestamp: image.timestamp!, aspectRatio: image.aspectRatio, width: image.width };
            }));

            try {
              const db = await this.openDatabase();
              const transaction = db.transaction([this.storeName, 'base64Store'], 'readwrite');
              const store = transaction.objectStore(this.storeName);
              const base64Store = transaction.objectStore('base64Store');

              for (const image of generatedImages) {
                // Save the image metadata
                const imageMetadata = { ...image };
                delete imageMetadata.base64; // Remove the base64 data from metadata
                delete imageMetadata.url; // Remove the URL from metadata
                store.put(imageMetadata);

                // Save the base64 data separately
                base64Store.put({ UUID: image.UUID, base64: image.base64 });
              }
            } catch (error) {
              console.error('Failed to store image data', error);
            }

            this.loadingChange.emit(false);
            this.enableGenerationButton = true;
          }
        })
      )
      .subscribe(
        response => {
          if (response.status === undefined) {
            const error = { error: { detail: "Job not found. Please try again later." } };
            console.error(error)
            this.showError(error);  // show the error modal
            this.enableGenerationButton = true;
            this.loadingChange.emit(false);
            subscription.unsubscribe();
          } else if (response.status === 'failed' || response.status === 'error') {
            this.handleFailedJob(response);
            subscription.unsubscribe();
          } else {
            console.log("queue position: " + response.queue_position ?? 0);
            this.queuePositionChange.emit(response.queue_position ?? 0);
          }
        },
        error => {
          console.error(error)
          this.showError(error);  // show the error modal
          this.enableGenerationButton = true;
          this.loadingChange.emit(false);
        }
      );
  }

  // Add this method to your class
  private handleFailedJob(response: any) {
    console.error('Job failed or encountered an error:', response);
    this.showError({ error: { detail: `Job ${response.status}: ${response.error || 'Unknown error occurred'}` } });
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
    this.sharedService.enableInstructions();
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

  openImageDetails(image: MobiansImage) {
    // Implement the logic to open the image details modal or view
    console.log('Opening image details for:', image);

    // Set the reference image to the selected image
    this.referenceImage = image;
    this.generationRequest.image = image.url!.split(',')[1];
    this.sharedService.setReferenceImage(image);

    // update prompt
    if (image.prompt) {
      this.generationRequest.prompt = image.prompt;
      this.sharedService.setPrompt(image.prompt!);
    }
  }

  toggleOptions() {
    const historyCollapse = document.getElementById('historyCollapse');
    if (historyCollapse) {
      historyCollapse.classList.remove('show');
    }
  }

  toggleHistory() {
    const optionsCollapse = document.getElementById('collapseExample');
    if (optionsCollapse) {
      optionsCollapse.classList.remove('show');
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
                base64: ""
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
      this.currentPageNumber = 1;
      this.totalPages = Math.ceil(results.length / this.imagesPerPage);

      // Load the first page of images
      this.currentPageImages = await this.paginateImages(1);

    } catch (error) {
      console.error("Error accessing database:", error);
    } finally {
      this.isSearching = false;
    }
  }

  private async fallbackSearch(store: IDBObjectStore, query: string): Promise<MobiansImage[]> {
    const index = store.index('timestamp');
    return new Promise((resolve, reject) => {
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

      image.base64 = ''; // Clear the base64 data
      image.url = ''; // Clear the URL
      // image.prompt = ''; // Clear the prompt
      // image.promptSummary = ''; // Clear the prompt summary
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
    try {
      const db = await this.openDatabase();
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
      transaction = db.transaction(this.base64StoreName, 'readwrite');
      const base64Store = transaction.objectStore(this.base64StoreName);
      const base64Request = base64Store.clear();

      base64Request.onsuccess = (event) => {
        console.log('All base64 data deleted from IndexedDB');
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
}
