import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { AccountCtaService } from 'src/app/auth/account-cta.service';
import { AuthService } from 'src/app/auth/auth.service';
import { DynamicPromptLibraryStateService } from 'src/app/dynamic-prompt-library-state.service';
import { SharedService } from 'src/app/shared.service';
import {
  DynamicPromptCommunityTemplate,
  DynamicPromptCategory,
  DynamicPromptCustomCategory,
  DynamicPromptStarterTemplate,
  DynamicPromptVoteReward,
  StableDiffusionService,
} from 'src/app/stable-diffusion.service';
import { DynamicPromptingConfig } from 'src/_shared/generation-request.interface';

export interface DynamicPromptApplyEvent {
  prompt: string;
  dynamicPrompting: DynamicPromptingConfig;
  source: 'template' | 'preview';
}

type DynamicPromptHelperPanel = 'starters' | 'community' | 'mine';

@Component({
  selector: 'app-dynamic-prompt-helper',
  templateUrl: './dynamic-prompt-helper.component.html',
  styleUrls: ['./dynamic-prompt-helper.component.css'],
  imports: [CommonModule, DialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicPromptHelperComponent implements OnDestroy {
  readonly currentPrompt = input('');
  readonly disabled = input(false);
  readonly active = input(false);
  readonly promptApplied = output<DynamicPromptApplyEvent>();

  private readonly stableDiffusionService = inject(StableDiffusionService);
  private readonly dynamicPromptLibraryState = inject(DynamicPromptLibraryStateService);
  private readonly authService = inject(AuthService);
  private readonly accountCtaService = inject(AccountCtaService);
  private readonly sharedService = inject(SharedService);
  private readonly launcherButton = viewChild<ElementRef<HTMLButtonElement>>('launcherButton');
  private readonly tutorialStorageKey = 'mobians:dynamic-prompt-tutorial-seen';
  private readonly autoPreviewDelayMs = 350;

  private autoPreviewTimer: ReturnType<typeof setTimeout> | undefined;
  private previewRequestId = 0;
  private lastPreviewedTemplate = '';

  readonly dialogStyle = { width: '90vw', maxWidth: '860px' };
  readonly dialogContentStyle = { maxHeight: '72vh', overflow: 'auto' };
  readonly tutorialStyle = { width: '90vw', maxWidth: '620px' };

  readonly dialogVisible = signal(false);
  readonly tutorialVisible = signal(false);
  readonly library = this.dynamicPromptLibraryState.library;
  readonly templateText = signal('');
  readonly selectedTemplateId = signal('');
  readonly expansionSeed = signal(this.randomSeed());
  readonly previews = signal<string[]>([]);
  readonly loadingLibrary = this.dynamicPromptLibraryState.loading;
  readonly loadingPreview = signal(false);
  readonly activePanel = signal<DynamicPromptHelperPanel>('starters');
  readonly communityTemplates = signal<DynamicPromptCommunityTemplate[]>([]);
  readonly communityCategories = signal<DynamicPromptCustomCategory[]>([]);
  readonly myTemplates = signal<DynamicPromptCommunityTemplate[]>([]);
  readonly myCategories = signal<DynamicPromptCustomCategory[]>([]);
  readonly communitySearch = signal('');
  readonly loadingCommunity = signal(false);
  readonly loadingCommunityCategories = signal(false);
  readonly loadingMine = signal(false);
  readonly loadingMyCategories = signal(false);
  readonly savingTemplate = signal(false);
  readonly savingCategory = signal(false);
  readonly editingTemplateId = signal('');
  readonly saveTitle = signal('');
  readonly saveDescription = signal('');
  readonly editingCategoryId = signal('');
  readonly categoryTitle = signal('');
  readonly categoryDescription = signal('');
  readonly categoryEntries = signal('');
  readonly helperMessage = signal('');
  readonly errorMessage = signal('');

  readonly starterTemplates = computed(() => this.library()?.starter_templates ?? []);
  readonly categories = computed(() => this.library()?.categories ?? []);
  readonly syntaxExamples = computed(() => this.library()?.syntax_examples ?? []);
  readonly canSaveTemplate = computed(() => this.templateText().trim().length > 0 && this.saveTitle().trim().length >= 3 && !this.savingTemplate());
  readonly canSaveCategory = computed(() => this.categoryTitle().trim().length >= 3 && this.parseCategoryEntries().length > 0 && !this.savingCategory());
  readonly filteredCommunityTemplates = computed(() => {
    const search = this.normalizedCommunitySearch();
    if (!search) {
      return this.communityTemplates();
    }

    return this.communityTemplates().filter((template) => this.matchesSearch(search, [
      template.title,
      template.description,
      template.template,
      template.author_display_name,
      ...(template.tags ?? []),
    ]));
  });
  readonly filteredCommunityCategories = computed(() => {
    const search = this.normalizedCommunitySearch();
    if (!search) {
      return this.communityCategories();
    }

    return this.communityCategories().filter((category) => this.matchesSearch(search, [
      category.title,
      category.description,
      category.token,
      category.author_display_name,
      ...(category.tags ?? []),
      ...(category.examples ?? []),
    ]));
  });

  openDialog(): void {
    if (this.disabled()) return;
    this.dialogVisible.set(true);

    const prompt = this.currentPrompt().trim();
    if (prompt && !this.templateText()) {
      this.templateText.set(prompt);
    }

    if (!this.hasSeenTutorial()) {
      this.tutorialVisible.set(true);
    }

    if (!this.library()) {
      this.loadLibrary();
      return;
    }

    if (this.templateText().trim() && (this.lastPreviewedTemplate !== this.templateText().trim() || !this.previews().length)) {
      this.requestPreview();
    }
  }

  ngOnDestroy(): void {
    this.clearScheduledPreviewRefresh();
    this.previewRequestId += 1;
  }

  selectPanel(panel: DynamicPromptHelperPanel): void {
    this.activePanel.set(panel);
    this.errorMessage.set('');
    this.helperMessage.set('');

    if (panel === 'community' && this.communityTemplates().length === 0) {
      this.loadCommunityTemplates();
    }
    if (panel === 'community' && this.communityCategories().length === 0) {
      this.loadCommunityCategories();
    }
    if (panel === 'mine') {
      this.loadMyTemplates();
      this.loadMyCategories();
    }
  }

  onDialogVisibleChange(visible: boolean): void {
    this.dialogVisible.set(visible);
    if (!visible) {
      this.clearScheduledPreviewRefresh();
      this.loadingPreview.set(false);
      this.launcherButton()?.nativeElement.focus();
    }
  }

  openTutorial(): void {
    this.tutorialVisible.set(true);
  }

  closeTutorial(): void {
    this.markTutorialSeen();
    this.tutorialVisible.set(false);
  }

  onTutorialVisibleChange(visible: boolean): void {
    if (!visible) {
      this.markTutorialSeen();
    }
    this.tutorialVisible.set(visible);
  }

  selectStarter(template: DynamicPromptStarterTemplate): void {
    this.selectedTemplateId.set(template.id);
    this.templateText.set(template.template);
    this.errorMessage.set('');
    this.requestPreview();
  }

  insertCategory(category: DynamicPromptCategory): void {
    const currentTemplate = this.templateText().trim();
    const separator = currentTemplate ? ', ' : '';
    this.templateText.set(`${currentTemplate}${separator}${category.token}`);
    this.errorMessage.set('');
    this.schedulePreviewRefresh();
  }

  useSyntaxExample(template: string): void {
    this.templateText.set(template);
    this.errorMessage.set('');
    this.requestPreview();
  }

  onTemplateInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.templateText.set(target?.value ?? '');
    this.selectedTemplateId.set('');
    this.schedulePreviewRefresh();
  }

  onCommunitySearchInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.communitySearch.set(target?.value ?? '');
  }

  onSaveTitleInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.saveTitle.set(target?.value ?? '');
  }

  onSaveDescriptionInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.saveDescription.set(target?.value ?? '');
  }

  onCategoryTitleInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.categoryTitle.set(target?.value ?? '');
  }

  onCategoryDescriptionInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.categoryDescription.set(target?.value ?? '');
  }

  onCategoryEntriesInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.categoryEntries.set(target?.value ?? '');
  }

  shufflePreview(): void {
    this.expansionSeed.set(this.randomSeed());
    this.requestPreview();
  }

  requestPreview(): void {
    this.clearScheduledPreviewRefresh();
    const template = this.templateText().trim();
    if (!template) {
      this.errorMessage.set('Add a template before previewing.');
      this.lastPreviewedTemplate = '';
      return;
    }

    const requestId = ++this.previewRequestId;
    this.loadingPreview.set(true);
    this.errorMessage.set('');
    this.stableDiffusionService.previewDynamicPrompt({
      template,
      seed: this.expansionSeed(),
    }).subscribe({
      next: (response) => {
        if (requestId !== this.previewRequestId || template !== this.templateText().trim()) {
          return;
        }
        this.previews.set(response.previews);
        this.expansionSeed.set(response.seed);
        this.lastPreviewedTemplate = template;
        this.loadingPreview.set(false);
      },
      error: (error: unknown) => {
        if (requestId !== this.previewRequestId || template !== this.templateText().trim()) {
          return;
        }
        this.lastPreviewedTemplate = '';
        this.errorMessage.set(this.extractErrorMessage(error));
        this.loadingPreview.set(false);
      },
    });
  }

  applyTemplate(): void {
    const template = this.templateText().trim();
    if (!template) return;

    this.promptApplied.emit({
      prompt: template,
      source: 'template',
      dynamicPrompting: {
        enabled: true,
        template,
      },
    });
    this.dialogVisible.set(false);
    this.launcherButton()?.nativeElement.focus();
  }

  applyPreview(preview: string): void {
    this.promptApplied.emit({
      prompt: preview,
      source: 'preview',
      dynamicPrompting: {
        enabled: false,
        template: preview,
      },
    });
    this.dialogVisible.set(false);
    this.launcherButton()?.nativeElement.focus();
  }

  previewTemplate(template: DynamicPromptCommunityTemplate): void {
    this.activePanel.set('starters');
    this.selectedTemplateId.set('');
    this.templateText.set(template.template);
    this.errorMessage.set('');
    this.requestPreview();
  }

  applyCommunityTemplate(template: DynamicPromptCommunityTemplate): void {
    this.templateText.set(template.template);
    this.applyTemplate();
  }

  loadCommunityTemplates(): void {
    this.loadingCommunity.set(true);
    this.errorMessage.set('');
    this.stableDiffusionService.listDynamicPromptTemplates({
      search: this.communitySearch().trim() || undefined,
      sort: 'top',
      page_size: 20,
    }).subscribe({
      next: (response) => {
        this.communityTemplates.set(response.templates || []);
        this.loadingCommunity.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractErrorMessage(error));
        this.loadingCommunity.set(false);
      },
    });
  }

  searchCommunity(): void {
    this.loadCommunityTemplates();
    this.loadCommunityCategories();
  }

  loadCommunityCategories(): void {
    this.loadingCommunityCategories.set(true);
    this.errorMessage.set('');
    this.stableDiffusionService.listDynamicPromptCategories({
      search: this.communitySearch().trim() || undefined,
      sort: 'top',
      page_size: 20,
    }).subscribe({
      next: (response) => {
        this.communityCategories.set(response.categories || []);
        this.loadingCommunityCategories.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractErrorMessage(error));
        this.loadingCommunityCategories.set(false);
      },
    });
  }

  loadMyTemplates(): void {
    if (!this.ensureLoggedIn('Sign in to save and import prompt templates.')) return;
    this.loadingMine.set(true);
    this.errorMessage.set('');
    this.stableDiffusionService.getUserDynamicPromptTemplates().subscribe({
      next: (response) => {
        const templates = response.templates || [];
        this.myTemplates.set(templates);
        this.syncCommunityTemplateImports(templates);
        this.loadingMine.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractErrorMessage(error));
        this.loadingMine.set(false);
      },
    });
  }

  loadMyCategories(): void {
    if (!this.ensureLoggedIn('Sign in to create custom prompt categories.')) return;
    this.loadingMyCategories.set(true);
    this.errorMessage.set('');
    this.stableDiffusionService.getUserDynamicPromptCategories().subscribe({
      next: (response) => {
        const categories = response.categories || [];
        this.myCategories.set(categories);
        this.syncCommunityCategoryImports(categories);
        this.loadingMyCategories.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractErrorMessage(error));
        this.loadingMyCategories.set(false);
      },
    });
  }

  saveCurrentTemplate(): void {
    if (!this.ensureLoggedIn('Sign in to save prompt templates.')) return;
    const template = this.templateText().trim();
    const title = this.saveTitle().trim();
    if (!template || title.length < 3) {
      this.errorMessage.set('Add a title and dynamic template before saving.');
      return;
    }

    this.savingTemplate.set(true);
    this.errorMessage.set('');
    this.helperMessage.set('');
    const payload = {
      title,
      description: this.saveDescription().trim(),
      template,
    };
    const editingId = this.editingTemplateId();
    const request = editingId
      ? this.stableDiffusionService.updateUserDynamicPromptTemplate(editingId, payload)
      : this.stableDiffusionService.createUserDynamicPromptTemplate(payload);
    const wasImportedTemplate = editingId
      ? this.myTemplates().find((item) => item.id === editingId)?.source_template_id
      : null;

    request.subscribe({
      next: (response) => {
        const savedTemplate = response.template;
        const nextTemplates = editingId
          ? this.myTemplates().map((item) => item.id === savedTemplate.id ? savedTemplate : item)
          : [savedTemplate, ...this.myTemplates()];
        this.myTemplates.set(nextTemplates);
        this.syncCommunityTemplateImports(nextTemplates);
        this.editingTemplateId.set('');
        this.saveTitle.set('');
        this.saveDescription.set('');
        this.helperMessage.set(
          editingId
            ? (wasImportedTemplate && !savedTemplate.source_template_id
                ? 'Template updated. It is now your own version and can be shared.'
                : 'Template updated.')
            : 'Saved to Mine. Share it when it is ready for the community.'
        );
        this.savingTemplate.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractErrorMessage(error));
        this.savingTemplate.set(false);
      },
    });
  }

  editTemplate(template: DynamicPromptCommunityTemplate): void {
    this.editingTemplateId.set(template.id);
    this.saveTitle.set(template.title);
    this.saveDescription.set(template.description || '');
    this.templateText.set(template.template || '');
    this.selectedTemplateId.set('');
    this.errorMessage.set('');
    this.helperMessage.set('');
  }

  resetTemplateEditor(): void {
    this.editingTemplateId.set('');
    this.saveTitle.set('');
    this.saveDescription.set('');
    this.templateText.set('');
    this.selectedTemplateId.set('');
    this.previews.set([]);
    this.errorMessage.set('');
  }

  saveCustomCategory(): void {
    if (!this.ensureLoggedIn('Sign in to create custom prompt categories.')) return;
    const payload = {
      title: this.categoryTitle().trim(),
      description: this.categoryDescription().trim(),
      entries: this.parseCategoryEntries(),
    };
    if (payload.title.length < 3 || payload.entries.length === 0) {
      this.errorMessage.set('Add a category title and at least one prompt idea.');
      return;
    }

    this.savingCategory.set(true);
    this.errorMessage.set('');
    this.helperMessage.set('');
    const editingId = this.editingCategoryId();
    const request = editingId
      ? this.stableDiffusionService.updateUserDynamicPromptCategory(editingId, payload)
      : this.stableDiffusionService.createUserDynamicPromptCategory(payload);

    request.subscribe({
      next: (response) => {
        const category = response.category;
        this.myCategories.update((categories) => {
          if (categories.some((item) => item.id === category.id)) {
            return categories.map((item) => item.id === category.id ? category : item);
          }
          return [category, ...categories];
        });
        this.resetCategoryEditor();
        this.helperMessage.set(editingId ? 'Category updated.' : 'Category saved. Use its chip in Starters or share it from Mine.');
        this.loadLibrary(true);
        this.savingCategory.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractErrorMessage(error));
        this.savingCategory.set(false);
      },
    });
  }

  editCustomCategory(category: DynamicPromptCustomCategory): void {
    this.editingCategoryId.set(category.id);
    this.categoryTitle.set(category.title);
    this.categoryDescription.set(category.description || '');
    this.categoryEntries.set((category.entries || []).join('\n'));
  }

  resetCategoryEditor(): void {
    this.editingCategoryId.set('');
    this.categoryTitle.set('');
    this.categoryDescription.set('');
    this.categoryEntries.set('');
  }

  insertCustomCategory(category: DynamicPromptCustomCategory): void {
    this.insertCategory({
      id: category.token.replace(/^__|__$/g, ''),
      label: category.title,
      token: category.token,
      description: category.description || 'Custom prompt category',
      examples: category.examples || [],
    });
    this.activePanel.set('starters');
    this.helperMessage.set(`${category.title} was added to the template.`);
  }

  shareCustomCategory(category: DynamicPromptCustomCategory): void {
    if (!this.ensureLoggedIn('Sign in to share custom categories.')) return;
    if (!this.canShareCategory(category)) {
      this.errorMessage.set('Imported categories cannot be shared to the community.');
      return;
    }
    const action = category.status === 'public' ? 'make private again' : 'share with the community';
    if (!window.confirm(`Are you sure you want to ${action} "${category.title}"?`)) {
      return;
    }
    const request = category.status === 'public'
      ? this.stableDiffusionService.unshareUserDynamicPromptCategory(category.id)
      : this.stableDiffusionService.shareUserDynamicPromptCategory(category.id);
    request.subscribe({
      next: (response) => {
        this.replaceMyCategory(response.category);
        this.helperMessage.set(response.category.status === 'public' ? 'Category is now shared.' : 'Category is private again.');
        this.loadLibrary(true);
      },
      error: (error: unknown) => this.errorMessage.set(this.extractErrorMessage(error)),
    });
  }

  deleteCustomCategory(category: DynamicPromptCustomCategory): void {
    if (!this.ensureLoggedIn('Sign in to manage custom categories.')) return;
    if (!window.confirm(`Delete category "${category.title}"? This cannot be undone.`)) {
      return;
    }
    this.stableDiffusionService.deleteUserDynamicPromptCategory(category.id).subscribe({
      next: () => {
        const nextCategories = this.myCategories().filter((item) => item.id !== category.id);
        this.myCategories.set(nextCategories);
        this.syncCommunityCategoryImports(nextCategories);
        if (this.editingCategoryId() === category.id) {
          this.resetCategoryEditor();
        }
        this.helperMessage.set('Category removed.');
        this.loadLibrary(true);
      },
      error: (error: unknown) => this.errorMessage.set(this.extractErrorMessage(error)),
    });
  }

  deleteTemplate(template: DynamicPromptCommunityTemplate): void {
    if (!this.ensureLoggedIn('Sign in to manage saved templates.')) return;
    if (!window.confirm(`Delete template "${template.title}"? This cannot be undone.`)) {
      return;
    }
    this.stableDiffusionService.deleteUserDynamicPromptTemplate(template.id).subscribe({
      next: () => {
        const nextTemplates = this.myTemplates().filter((item) => item.id !== template.id);
        this.myTemplates.set(nextTemplates);
        this.syncCommunityTemplateImports(nextTemplates);
        if (this.editingTemplateId() === template.id) {
          this.resetTemplateEditor();
        }
        this.helperMessage.set('Template removed.');
      },
      error: (error: unknown) => this.errorMessage.set(this.extractErrorMessage(error)),
    });
  }

  shareTemplate(template: DynamicPromptCommunityTemplate): void {
    if (!this.ensureLoggedIn('Sign in to share templates with the community.')) return;
    if (!this.canShareTemplate(template)) {
      this.errorMessage.set('Imported templates cannot be shared to the community.');
      return;
    }
    const action = this.isTemplateShared(template) ? 'make private again' : 'share with the community';
    if (!window.confirm(`Are you sure you want to ${action} "${template.title}"?`)) {
      return;
    }
    const request = this.isTemplateShared(template)
      ? this.stableDiffusionService.unshareUserDynamicPromptTemplate(template.id)
      : this.stableDiffusionService.shareUserDynamicPromptTemplate(template.id);
    request.subscribe({
      next: (response) => {
        this.replaceMyTemplate(response.template);
        if (this.communityTemplates().some((item) => item.id === template.id) || this.activePanel() === 'community') {
          this.loadCommunityTemplates();
        }
        this.helperMessage.set(this.isTemplateShared(response.template) ? 'Template is now shared.' : 'Template is private again.');
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractErrorMessage(error));
      },
    });
  }

  toggleUpvote(template: DynamicPromptCommunityTemplate): void {
    if (!this.ensureLoggedIn('Sign in to upvote community templates.')) return;
    const request = template.has_upvoted
      ? this.stableDiffusionService.removeDynamicPromptTemplateUpvote(template.id)
      : this.stableDiffusionService.upvoteDynamicPromptTemplate(template.id);
    request.subscribe({
      next: (response) => {
        this.replaceCommunityTemplate(response.template);
        if (!template.has_upvoted) {
          this.applyVoteReward(response.vote_reward);
        }
      },
      error: (error: unknown) => this.errorMessage.set(this.extractErrorMessage(error)),
    });
  }

  importTemplate(template: DynamicPromptCommunityTemplate): void {
    if (!this.ensureLoggedIn('Sign in to import community templates.')) return;
    if (!this.canImportTemplate(template)) {
      this.errorMessage.set(this.templateImportBlockedMessage(template));
      return;
    }
    this.stableDiffusionService.importDynamicPromptTemplate(template.id).subscribe({
      next: (response) => {
        const nextTemplates = this.myTemplates().some((item) => item.id === response.template.id)
          ? this.myTemplates()
          : [response.template, ...this.myTemplates()];
        this.myTemplates.set(nextTemplates);
        this.syncCommunityTemplateImports(nextTemplates);
        this.replaceCommunityTemplate({ ...template, has_imported: true, owned_template_id: response.template.id, import_count: template.import_count + 1 });
        this.helperMessage.set('Imported to Mine.');
      },
      error: (error: unknown) => this.errorMessage.set(this.extractErrorMessage(error)),
    });
  }

  toggleCategoryUpvote(category: DynamicPromptCustomCategory): void {
    if (!this.ensureLoggedIn('Sign in to upvote community categories.')) return;
    const request = category.has_upvoted
      ? this.stableDiffusionService.removeDynamicPromptCategoryUpvote(category.id)
      : this.stableDiffusionService.upvoteDynamicPromptCategory(category.id);
    request.subscribe({
      next: (response) => {
        this.replaceCommunityCategory(response.category);
        if (!category.has_upvoted) {
          this.applyVoteReward(response.vote_reward);
        }
      },
      error: (error: unknown) => this.errorMessage.set(this.extractErrorMessage(error)),
    });
  }

  private applyVoteReward(voteReward: DynamicPromptVoteReward | null | undefined): void {
    if (typeof voteReward?.voter_balance_after !== 'number') {
      return;
    }

    this.authService.updateCredits(voteReward.voter_balance_after);
    if (voteReward.voter_credits_awarded > 0) {
      this.helperMessage.set(`Vote recorded. You earned ${voteReward.voter_credits_awarded} credits.`);
    }
  }

  importCategory(category: DynamicPromptCustomCategory): void {
    if (!this.ensureLoggedIn('Sign in to import community categories.')) return;
    if (!this.canImportCategory(category)) {
      this.errorMessage.set(this.categoryImportBlockedMessage(category));
      return;
    }
    this.stableDiffusionService.importDynamicPromptCategory(category.id).subscribe({
      next: (response) => {
        const nextCategories = this.myCategories().some((item) => item.id === response.category.id)
          ? this.myCategories()
          : [response.category, ...this.myCategories()];
        this.myCategories.set(nextCategories);
        this.syncCommunityCategoryImports(nextCategories);
        this.replaceCommunityCategory({ ...category, has_imported: true, owned_category_id: response.category.id, import_count: category.import_count + 1 });
        this.helperMessage.set('Imported to Mine.');
        this.loadLibrary(true);
      },
      error: (error: unknown) => this.errorMessage.set(this.extractErrorMessage(error)),
    });
  }

  isTemplateShared(template: DynamicPromptCommunityTemplate): boolean {
    return template.status === 'approved';
  }

  isOwnedByCurrentUser(userId: string | null | undefined): boolean {
    const currentUserId = this.sharedService.getUserDataValue()?.user_id;
    return !!userId && !!currentUserId && userId === currentUserId;
  }

  canImportTemplate(template: DynamicPromptCommunityTemplate): boolean {
    return !template.has_imported && !this.isOwnedByCurrentUser(template.user_id) && !template.source_template_id;
  }

  canImportCategory(category: DynamicPromptCustomCategory): boolean {
    return !category.has_imported && !this.isOwnedByCurrentUser(category.user_id) && !category.source_category_id;
  }

  canShareTemplate(template: DynamicPromptCommunityTemplate): boolean {
    return this.isTemplateShared(template) || !template.source_template_id;
  }

  canShareCategory(category: DynamicPromptCustomCategory): boolean {
    return category.status === 'public' || !category.source_category_id;
  }

  templateImportLabel(template: DynamicPromptCommunityTemplate): string {
    if (this.isOwnedByCurrentUser(template.user_id)) {
      return 'Yours';
    }
    if (template.source_template_id) {
      return 'Imported Copy';
    }
    return template.has_imported ? 'Imported' : 'Import';
  }

  categoryImportLabel(category: DynamicPromptCustomCategory): string {
    if (this.isOwnedByCurrentUser(category.user_id)) {
      return 'Yours';
    }
    if (category.source_category_id) {
      return 'Imported Copy';
    }
    return category.has_imported ? 'Imported' : 'Import';
  }

  templateShareLabel(template: DynamicPromptCommunityTemplate): string {
    if (this.isTemplateShared(template)) {
      return 'Unshare';
    }
    return template.source_template_id ? 'Imported Copy' : 'Share';
  }

  categoryShareLabel(category: DynamicPromptCustomCategory): string {
    if (category.status === 'public') {
      return 'Unshare';
    }
    return category.source_category_id ? 'Imported Copy' : 'Share';
  }

  communityAuthorLabel(authorDisplayName: string | null | undefined, userId: string | null | undefined): string {
    if (this.isOwnedByCurrentUser(userId)) {
      return 'Created by you';
    }
    return `Created by ${authorDisplayName?.trim() || 'Mobians user'}`;
  }

  importedTemplateSourceLabel(template: DynamicPromptCommunityTemplate): string {
    return `Imported from ${template.source_author_display_name?.trim() || 'Mobians user'}`;
  }

  templateStatusLabel(template: DynamicPromptCommunityTemplate): string {
    return this.isTemplateShared(template) ? 'public' : template.status;
  }

  private templateImportBlockedMessage(template: DynamicPromptCommunityTemplate): string {
    if (this.isOwnedByCurrentUser(template.user_id)) {
      return 'You cannot import your own template.';
    }
    if (template.source_template_id) {
      return 'Imported community templates cannot be imported again.';
    }
    return 'Template already imported.';
  }

  private categoryImportBlockedMessage(category: DynamicPromptCustomCategory): string {
    if (this.isOwnedByCurrentUser(category.user_id)) {
      return 'You cannot import your own category.';
    }
    if (category.source_category_id) {
      return 'Imported community categories cannot be imported again.';
    }
    return 'Category already imported.';
  }

  private loadLibrary(forceRefresh = false): void {
    this.errorMessage.set('');
    const request = forceRefresh
      ? this.dynamicPromptLibraryState.refresh()
      : this.dynamicPromptLibraryState.ensureLoaded();
    request.subscribe({
      next: (library) => {
        if (!this.templateText().trim() && library.starter_templates.length > 0) {
          this.selectStarter(library.starter_templates[0]);
        } else if (this.templateText().trim()) {
          this.requestPreview();
        }
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractErrorMessage(error));
      },
    });
  }

  private hasSeenTutorial(): boolean {
    return localStorage.getItem(this.tutorialStorageKey) === 'true';
  }

  private markTutorialSeen(): void {
    localStorage.setItem(this.tutorialStorageKey, 'true');
  }

  private ensureLoggedIn(message: string): boolean {
    if (this.authService.isLoggedIn()) return true;
    this.accountCtaService.requestLogin({
      reason: 'generic',
      title: 'Sign in to save prompts',
      message,
    });
    return false;
  }

  private parseCategoryEntries(): string[] {
    const entries: string[] = [];
    for (const rawEntry of this.categoryEntries().split(/\r?\n/)) {
      const entry = rawEntry.trim().replace(/\s+/g, ' ');
      if (entry && !entries.includes(entry)) {
        entries.push(entry);
      }
    }
    return entries;
  }

  private replaceCommunityTemplate(template: DynamicPromptCommunityTemplate): void {
    this.communityTemplates.update((templates) => templates.map((item) => item.id === template.id ? template : item));
  }

  private replaceCommunityCategory(category: DynamicPromptCustomCategory): void {
    this.communityCategories.update((categories) => categories.map((item) => item.id === category.id ? category : item));
  }

  private replaceMyTemplate(template: DynamicPromptCommunityTemplate): void {
    this.myTemplates.update((templates) => templates.map((item) => item.id === template.id ? template : item));
  }

  private replaceMyCategory(category: DynamicPromptCustomCategory): void {
    this.myCategories.update((categories) => categories.map((item) => item.id === category.id ? category : item));
  }

  private syncCommunityTemplateImports(myTemplates: DynamicPromptCommunityTemplate[]): void {
    const importedTemplateIdsBySource = new Map(
      myTemplates
        .filter((item) => item.source_template_id)
        .map((item) => [item.source_template_id as string, item.id] as const)
    );

    this.communityTemplates.update((templates) => templates.map((template) => {
      const syncedOwnedId = importedTemplateIdsBySource.get(template.id) ?? null;

      if (syncedOwnedId) {
        return template.has_imported && template.owned_template_id === syncedOwnedId
          ? template
          : { ...template, has_imported: true, owned_template_id: syncedOwnedId };
      }

      return template.has_imported || template.owned_template_id
        ? { ...template, has_imported: false, owned_template_id: null }
        : template;
    }));
  }

  private syncCommunityCategoryImports(myCategories: DynamicPromptCustomCategory[]): void {
    const importedCategoryIdsBySource = new Map(
      myCategories
        .filter((item) => item.source_category_id)
        .map((item) => [item.source_category_id as string, item.id] as const)
    );

    this.communityCategories.update((categories) => categories.map((category) => {
      const syncedOwnedId = importedCategoryIdsBySource.get(category.id) ?? null;

      if (syncedOwnedId) {
        return category.has_imported && category.owned_category_id === syncedOwnedId
          ? category
          : { ...category, has_imported: true, owned_category_id: syncedOwnedId };
      }

      return category.has_imported || category.owned_category_id
        ? { ...category, has_imported: false, owned_category_id: null }
        : category;
    }));
  }

  private normalizedCommunitySearch(): string {
    return this.communitySearch().trim().toLowerCase();
  }

  private matchesSearch(search: string, values: Array<string | null | undefined>): boolean {
    return values.some((value) => value?.toLowerCase().includes(search));
  }

  private randomSeed(): number {
    return Math.floor(Math.random() * 1_000_000_000);
  }

  private schedulePreviewRefresh(): void {
    this.clearScheduledPreviewRefresh();
    this.errorMessage.set('');

    if (!this.templateText().trim()) {
      this.previews.set([]);
      this.lastPreviewedTemplate = '';
      this.loadingPreview.set(false);
      return;
    }

    this.autoPreviewTimer = setTimeout(() => {
      this.autoPreviewTimer = undefined;
      this.requestPreview();
    }, this.autoPreviewDelayMs);
  }

  private clearScheduledPreviewRefresh(): void {
    if (this.autoPreviewTimer !== undefined) {
      clearTimeout(this.autoPreviewTimer);
      this.autoPreviewTimer = undefined;
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const maybeHttpError = error as { error?: { detail?: string } | string; message?: string };
      const message = typeof maybeHttpError.error === 'string'
        ? maybeHttpError.error
        : maybeHttpError.error?.detail || maybeHttpError.message;
      if (typeof message === 'string') {
        if (message.includes('dynamic_prompt_templates') || message.includes('custom_categories') || message.includes('relation "')) {
          return 'Community prompt sharing is not available yet.';
        }
        return message;
      }
    }
    return 'Unable to load dynamic prompt ideas right now.';
  }
}
