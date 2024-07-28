import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { interval } from 'rxjs';
import { takeWhile, finalize, concatMap, tap, retryWhen, scan, delayWhen } from 'rxjs/operators';
import { SharedService } from 'src/app/shared.service';
import { Subscription } from 'rxjs';
import { timer } from 'rxjs';
import { MessageService } from 'primeng/api';
import { v4 as uuidv4 } from 'uuid';
import { NotificationService } from 'src/app/notification.service';
import { SwPush } from '@angular/service-worker';


@Component({
  selector: 'app-options',
  templateUrl: './options.component.html',
  styleUrls: ['./options.component.css'],
})
export class OptionsComponent {
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
    fast_pass_code: undefined
  };
  jobID: string = "";
  API_URL: string = "";
  referenceImage?: MobiansImage;
  currentSeed?: number;
  supporter: boolean = false;
  serverMember: boolean = false;
  userGeneratedImages: MobiansImage[] = [];

  // Pagination
  paginatedImages: MobiansImage[] = [];
  currentPage = 1;
  imagesPerPage = 4; // Display 8 images per page (2 rows of 4 images each)
  totalPages = 1;

  // Sorting
  selectedSortOption: string = 'timestamp';
  sortOrder: 'asc' | 'desc' = 'desc';
  searchQuery: string = '';
  filteredImages: MobiansImage[] = [];
  dropdownOptions: { label: string, value: string }[] = [
    { label: 'Date', value: 'timestamp' },
    { label: 'Alphabetical', value: 'promptSummary' }
  ];

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
  ) {
    this.paginateImages = this.paginateImages.bind(this);
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.error("IndexedDB is not supported in this browser.");
        reject(new Error("IndexedDB is not supported"));
        return;
      }

      const request = indexedDB.open(this.dbName, 18); // Increment version number

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

    // Existing code...
    this.userGeneratedImages.forEach(image => {
      if (image.blobUrl) {
        URL.revokeObjectURL(image.blobUrl);
        delete image.blobUrl;
      }
    });
    // Clear arrays
    this.userGeneratedImages = [];
    this.filteredImages = [];
    this.paginatedImages = [];
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

    // If the model selected is SDXL, change the aspect ratio to the corresponding XL aspect ratio
    // if (this.generationRequest.model == "sonicDiffusionXL") {
    //   if (selectElement.value == 'portrait') {
    //     this.changeAspectRatio('portrait-xl');
    //   }
    //   else if (selectElement.value == 'landscape') {
    //     this.changeAspectRatio('landscape-xl');
    //   }
    //   else {
    //     this.changeAspectRatio(selectElement.value);
    //   }

    // }
    // else {
    //   this.changeAspectRatio(selectElement.value);
    // }
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
    // else if (aspectRatio == 'square-xl') {
    //   this.aspectRatio = { width: 512, height: 512, model: "sonicDiffusionXL", aspectRatio: "portrait-xl" };
    //   this.generationRequest.width = 1024;
    //   this.generationRequest.height = 1024;
    // }
    // else if (aspectRatio == 'portrait-xl') {
    //   this.aspectRatio = { width: 512, height: 658, model: "sonicDiffusionXL", aspectRatio: "portrait-xl" };
    //   this.generationRequest.width = 896;
    //   this.generationRequest.height = 1152;
    // }
    // else if (aspectRatio == 'landscape-xl') {
    //   this.aspectRatio = { width: 658, height: 512, model: "sonicDiffusionXL", aspectRatio: "landscape-xl" };
    //   this.generationRequest.width = 1152;
    //   this.generationRequest.height = 896;
    // }

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
      const db = await this.openDatabase();
      const transaction = db.transaction([this.storeName, this.base64StoreName], 'readonly');
      const metadataStore = transaction.objectStore(this.storeName);
      const base64Store = transaction.objectStore(this.base64StoreName);
      const index = metadataStore.index('timestamp');

      // Count total records
      const countRequest = metadataStore.count();
      countRequest.onsuccess = (event) => {
        const totalCount = (event.target as IDBRequest<number>).result;

        let count = 0;
        const newestImages: MobiansImage[] = [];

        // Open a cursor on the designated object store:
        const cursor = index.openCursor(null, 'prev');
        cursor.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor && count < 8) {
            const metadata = cursor.value;

            // Fetch the base64 data
            const request = base64Store.get(metadata.UUID);
            request.onsuccess = function (event: Event) {
              const result = (event.target as IDBRequest).result;
              const base64Data = result ? result.base64 : '';

              newestImages.push({ ...metadata, base64: base64Data });
              count++;
              cursor.continue();
            };
          } else {
            // We've got our 8 newest images or reached the end
            this.userGeneratedImages = newestImages;

            // Calculate the total number of pages using the total count
            this.totalPages = Math.ceil(totalCount / this.imagesPerPage);

            if (newestImages.length > 0) {
              // Display the first page of images
              this.paginateImages();
            } else {
              // No images found, reset the pagination variables
              this.currentPage = 1;
              this.totalPages = Math.max(1, this.totalPages); // Ensure at least 1 page
              this.paginatedImages = [];
            }
          }
        };
      };

      countRequest.onerror = (event) => {
        console.error("Error counting records:", event);
      };
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

  async loadImageData(image: MobiansImage) {
    if (image.base64) {
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
          // Instead of storing the full base64 string, create a blob URL
          const blob = this.base64ToBlob(result.base64);
          image.blobUrl = URL.createObjectURL(blob);
          image.base64 = result.base64.includes('data:') ? result.base64.split(',')[1] : result.base64;
          image.url = 'data:image/png;base64,' + image.base64;
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

  // Helper function to convert base64 to Blob
  base64ToBlob(base64: string): Blob {
    // Check if the base64 string includes the data URL prefix
    const base64Data = base64.includes('data:') ? base64.split(',')[1] : base64;

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: 'image/png' });
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

            // Add the generated images to userGeneratedImages array
            this.userGeneratedImages.push(...generatedImages);

            // Sort the userGeneratedImages array based on the timestamp in descending order
            this.userGeneratedImages.sort((a, b) => {
              const timestampA = a.timestamp ? a.timestamp.getTime() : 0;
              const timestampB = b.timestamp ? b.timestamp.getTime() : 0;
              return timestampB - timestampA;
            });

            // Calculate the total number of pages
            this.totalPages = Math.ceil(this.userGeneratedImages.length / this.imagesPerPage);

            // Display the current page of images
            this.paginateImages();

            // update the view
            this.sortImages();

            try {
              const db = await this.openDatabase();
              const transaction = db.transaction([this.storeName, 'base64Store'], 'readwrite');
              const store = transaction.objectStore(this.storeName);
              const base64Store = transaction.objectStore('base64Store');

              for (const image of generatedImages) {
                // Save the image metadata
                const imageMetadata = { ...image };
                delete imageMetadata.base64; // Remove the base64 data from metadata
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

  searchImages() {
    if (this.searchQuery.trim() === '') {
      this.filteredImages = [...this.userGeneratedImages];
    } else {
      const lowercaseQuery = this.searchQuery.toLowerCase();
      this.filteredImages = this.userGeneratedImages.filter(image =>
        // try first with prompt then with promptSummary if prompt is not available
        image.prompt && image.prompt.toLowerCase().includes(lowercaseQuery) ||
        image.promptSummary && image.promptSummary.toLowerCase().includes(lowercaseQuery)
      );
    }
    this.currentPage = 1;
    this.totalPages = Math.ceil(this.filteredImages.length / this.imagesPerPage);
    this.paginateImages();
  }

  async paginateImages() {
    console.log('paginateImages this:', this);  // Log context
    const startIndex = (this.currentPage - 1) * this.imagesPerPage;
    const endIndex = startIndex + this.imagesPerPage;
    this.paginatedImages = this.filteredImages.slice(startIndex, endIndex);

    // Load image data for the current page
    for (const image of this.paginatedImages) {
      await this.loadImageData(image);
    }
  }

  async previousPage() {
    if (this.currentPage > 1) {
      // Unload image data for the current page (unless theyre currently being viewed in the modal) (this.userGeneratedImages)
      for (const image of this.paginatedImages) {
        if (!this.images.includes(image)) {
          image.base64 = "";
        }
      }

      this.currentPage--;
      await this.paginateImages();
    }
  }

  async nextPage() {
    if (this.currentPage < this.totalPages) {
      // Unload image data for the current page
      for (const image of this.paginatedImages) {
        if (!this.images.includes(image)) {
          image.base64 = "";
        }
      }

      this.currentPage++;
      await this.paginateImages();
    }
  }

  sortImages() {
    if (this.selectedSortOption === 'timestamp') {
      this.userGeneratedImages.sort((a, b) => {
        const timestampA = a.timestamp ? a.timestamp.getTime() : 0;
        const timestampB = b.timestamp ? b.timestamp.getTime() : 0;
        return this.sortOrder === 'asc' ? timestampA - timestampB : timestampB - timestampA;
      });
    } else if (this.selectedSortOption === 'promptSummary') {
      this.userGeneratedImages.sort((a, b) => {
        const summaryA = a.promptSummary ? a.promptSummary.toLowerCase() : '';
        const summaryB = b.promptSummary ? b.promptSummary.toLowerCase() : '';
        return this.sortOrder === 'asc' ? summaryA.localeCompare(summaryB) : summaryB.localeCompare(summaryA);
      });
    }
    // Add more sorting options as needed

    this.paginateImages();
    this.searchImages();
  }

  reverseSortOrder() {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    this.sortImages();
  }

  async deleteAllImages() {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const request = store.clear();

      request.onsuccess = (event) => {
        console.log('All images deleted from IndexedDB');
        this.userGeneratedImages = [];
        this.filteredImages = [];
        this.paginatedImages = [];
        this.currentPage = 1;
        this.totalPages = 1;
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
