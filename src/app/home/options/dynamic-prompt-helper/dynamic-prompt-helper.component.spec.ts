import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import {
  DynamicPromptTemplateListResponse,
  DynamicPromptLibraryResponse,
  DynamicPromptPreviewResponse,
  StableDiffusionService,
} from 'src/app/stable-diffusion.service';
import { AuthService } from 'src/app/auth/auth.service';

import { DynamicPromptApplyEvent, DynamicPromptHelperComponent } from './dynamic-prompt-helper.component';

const libraryResponse: DynamicPromptLibraryResponse = {
  wildcard_set: 'mobians-v1',
  categories: [],
  starter_templates: [],
  syntax_examples: [],
  defaults: {
    mode: 'random',
    preview_count: 4,
    max_generations: 32,
  },
};

const previewResponse: DynamicPromptPreviewResponse = {
  template: 'A {red|blue} hero',
  previews: ['A red hero', 'A blue hero'],
  seed: 123,
  mode: 'random',
  wildcard_set: 'mobians-v1',
};

class StableDiffusionServiceStub {
  getDynamicPromptLibrary() {
    return of(libraryResponse);
  }

  getUserDynamicPromptTemplates(_status?: unknown): ReturnType<StableDiffusionService['getUserDynamicPromptTemplates']> {
    return of({ templates: [] });
  }

  getUserDynamicPromptCategories(_status?: unknown): ReturnType<StableDiffusionService['getUserDynamicPromptCategories']> {
    return of({ categories: [] });
  }

  previewDynamicPrompt(_request?: unknown) {
    return of(previewResponse);
  }

  createUserDynamicPromptTemplate(data?: unknown) {
    const payload = data as { title?: string; description?: string; template?: string };
    return of({
      template: {
        id: 'template-created',
        title: payload.title,
        description: payload.description,
        template: payload.template,
        tags: [],
        status: 'private',
        author_display_name: 'User',
        upvote_count: 0,
        import_count: 0,
        has_upvoted: false,
        has_imported: false,
        preview_samples: [],
        examples: [],
      },
    });
  }

  updateUserDynamicPromptTemplate(templateId?: unknown, data?: unknown) {
    const payload = data as { title?: string; description?: string; template?: string };
    return of({
      template: {
        id: templateId as string,
        title: payload.title,
        description: payload.description,
        template: payload.template,
        tags: [],
        status: 'private',
        author_display_name: 'User',
        upvote_count: 0,
        import_count: 0,
        has_upvoted: false,
        has_imported: false,
        preview_samples: [],
        examples: [],
      },
    });
  }

  shareUserDynamicPromptTemplate(templateId?: unknown) {
    return of({ template: { id: templateId as string, status: 'approved' } });
  }

  unshareUserDynamicPromptTemplate(templateId?: unknown) {
    return of({ template: { id: templateId as string, status: 'private' } });
  }

  deleteUserDynamicPromptTemplate(_templateId?: unknown) {
    return of({ success: true });
  }

  shareUserDynamicPromptCategory() {
    return of({ category: { id: 'category-1', status: 'public' } });
  }

  unshareUserDynamicPromptCategory() {
    return of({ category: { id: 'category-1', status: 'private' } });
  }

  deleteUserDynamicPromptCategory(_categoryId?: unknown) {
    return of({ success: true });
  }
}

class AuthServiceStub {
  isLoggedIn() {
    return true;
  }
}

describe('DynamicPromptHelperComponent', () => {
  let component: DynamicPromptHelperComponent;
  let fixture: ComponentFixture<DynamicPromptHelperComponent>;
  let stableDiffusionService: StableDiffusionServiceStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicPromptHelperComponent],
      providers: [
        { provide: StableDiffusionService, useClass: StableDiffusionServiceStub },
        { provide: AuthService, useClass: AuthServiceStub },
      ],
    })
      .overrideComponent(DynamicPromptHelperComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(DynamicPromptHelperComponent);
    component = fixture.componentInstance;
    stableDiffusionService = TestBed.inject(StableDiffusionService) as unknown as StableDiffusionServiceStub;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits disabled dynamic config when applying an exact preview', () => {
    let applied: DynamicPromptApplyEvent | undefined;
    component.promptApplied.subscribe((event) => {
      applied = event;
    });

    component.applyPreview('A red hero');

    expect(applied?.source).toBe('preview');
    expect(applied?.prompt).toBe('A red hero');
    expect(applied?.dynamicPrompting.enabled).toBeFalse();
  });

  it('emits enabled dynamic config when applying a template', () => {
    let applied: DynamicPromptApplyEvent | undefined;
    component.promptApplied.subscribe((event) => {
      applied = event;
    });
    component.templateText.set('A {red|blue} hero');

    component.applyTemplate();

    expect(applied?.source).toBe('template');
    expect(applied?.prompt).toBe('A {red|blue} hero');
    expect(applied?.dynamicPrompting.enabled).toBeTrue();
    expect(applied?.dynamicPrompting.template).toBe('A {red|blue} hero');
    expect(applied?.dynamicPrompting.selected_preview_index).toBeUndefined();
    expect(applied?.dynamicPrompting.expansion_seed).toBeUndefined();
  });

  it('can reopen the tutorial after it has been closed', () => {
    component.tutorialVisible.set(true);

    component.closeTutorial();
    expect(component.tutorialVisible()).toBeFalse();

    component.openTutorial();
    expect(component.tutorialVisible()).toBeTrue();
  });

  it('does not share a template when confirmation is cancelled', () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    const shareSpy = spyOn(stableDiffusionService, 'shareUserDynamicPromptTemplate').and.callThrough();

    component.shareTemplate({
      id: 'template-1',
      title: 'Heroic Starter',
      description: '',
      template: 'A {heroic|playful} hero',
      tags: [],
      status: 'private',
      author_display_name: 'User',
      upvote_count: 0,
      import_count: 0,
      has_upvoted: false,
      has_imported: false,
      preview_samples: [],
      examples: [],
    } as any);

    expect(confirmSpy).toHaveBeenCalled();
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('shares a private template directly with the community', () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    const shareSpy = spyOn(stableDiffusionService, 'shareUserDynamicPromptTemplate').and.callThrough();
    component.myTemplates.set([
      {
        id: 'template-1',
        title: 'Heroic Starter',
        description: '',
        template: 'A {heroic|playful} hero',
        tags: [],
        status: 'private',
      } as any,
    ]);

    component.shareTemplate(component.myTemplates()[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(shareSpy).toHaveBeenCalledWith('template-1');
    expect(component.myTemplates()[0].status).toBe('approved');
    expect(component.helperMessage()).toBe('Template is now shared.');
  });

  it('unshares a public template directly from Mine', () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    const unshareSpy = spyOn(stableDiffusionService, 'unshareUserDynamicPromptTemplate').and.callThrough();
    component.myTemplates.set([
      {
        id: 'template-1',
        title: 'Heroic Starter',
        description: '',
        template: 'A {heroic|playful} hero',
        tags: [],
        status: 'approved',
      } as any,
    ]);

    component.shareTemplate(component.myTemplates()[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(unshareSpy).toHaveBeenCalledWith('template-1');
    expect(component.myTemplates()[0].status).toBe('private');
    expect(component.helperMessage()).toBe('Template is private again.');
  });

  it('does not share a category when confirmation is cancelled', () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    const shareSpy = spyOn(stableDiffusionService, 'shareUserDynamicPromptCategory').and.callThrough();

    component.shareCustomCategory({
      id: 'category-1',
      title: 'Mood Ideas',
      description: '',
      token: '__user/mood-ideas__',
      tags: [],
      status: 'private',
      entries: [],
      examples: [],
      item_count: 0,
      upvote_count: 0,
      import_count: 0,
      author_display_name: 'User',
      has_upvoted: false,
      has_imported: false,
      user_id: 'user-1',
    } as any);

    expect(confirmSpy).toHaveBeenCalled();
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('does not delete a category when confirmation is cancelled', () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    const deleteSpy = spyOn(stableDiffusionService, 'deleteUserDynamicPromptCategory').and.callThrough();

    component.deleteCustomCategory({
      id: 'category-1',
      title: 'Mood Ideas',
      description: '',
      token: '__user/mood-ideas__',
      tags: [],
      status: 'private',
      entries: [],
      examples: [],
      item_count: 0,
      upvote_count: 0,
      import_count: 0,
      author_display_name: 'User',
      has_upvoted: false,
      has_imported: false,
      user_id: 'user-1',
    } as any);

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('does not delete a template when confirmation is cancelled', () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    const deleteSpy = spyOn(stableDiffusionService, 'deleteUserDynamicPromptTemplate').and.callThrough();

    component.deleteTemplate({
      id: 'template-1',
      title: 'Imported Starter',
      description: '',
      template: 'A {heroic|playful} hero',
      tags: [],
      status: 'private',
      author_display_name: 'User',
      upvote_count: 0,
      import_count: 0,
      has_upvoted: false,
      has_imported: false,
      preview_samples: [],
      examples: [],
    } as any);

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('creates a saved template with explicit body content', () => {
    const createSpy = spyOn(stableDiffusionService, 'createUserDynamicPromptTemplate').and.callThrough();
    component.saveTitle.set('Hero Starter');
    component.saveDescription.set('Reusable hero prompt');
    component.templateText.set('A {heroic|playful} hero');

    component.saveCurrentTemplate();

    expect(createSpy).toHaveBeenCalledWith({
      title: 'Hero Starter',
      description: 'Reusable hero prompt',
      template: 'A {heroic|playful} hero',
    });
    expect(component.myTemplates()[0].title).toBe('Hero Starter');
    expect(component.myTemplates()[0].template).toBe('A {heroic|playful} hero');
    expect(component.saveTitle()).toBe('');
    expect(component.saveDescription()).toBe('');
    expect(component.templateText()).toBe('A {heroic|playful} hero');
  });

  it('edits a saved template body through the template editor', () => {
    const updateSpy = spyOn(stableDiffusionService, 'updateUserDynamicPromptTemplate').and.callThrough();
    component.myTemplates.set([
      {
        id: 'template-1',
        title: 'Old Starter',
        description: 'Old description',
        template: 'A {red|blue} hero',
        tags: [],
        status: 'private',
      } as any,
    ]);

    component.editTemplate(component.myTemplates()[0]);
    expect(component.editingTemplateId()).toBe('template-1');
    expect(component.saveTitle()).toBe('Old Starter');
    expect(component.saveDescription()).toBe('Old description');
    expect(component.templateText()).toBe('A {red|blue} hero');

    component.saveTitle.set('Updated Starter');
    component.saveDescription.set('Updated description');
    component.templateText.set('A {heroic|playful} hero');
    component.saveCurrentTemplate();

    expect(updateSpy).toHaveBeenCalledWith('template-1', {
      title: 'Updated Starter',
      description: 'Updated description',
      template: 'A {heroic|playful} hero',
    });
    expect(component.myTemplates()[0].title).toBe('Updated Starter');
    expect(component.myTemplates()[0].template).toBe('A {heroic|playful} hero');
    expect(component.editingTemplateId()).toBe('');
    expect(component.helperMessage()).toBe('Template updated.');
  });

  it('clears template editor state when starting a new saved template', () => {
    component.editTemplate({
      id: 'template-1',
      title: 'Old Starter',
      description: 'Old description',
      template: 'A {red|blue} hero',
      tags: [],
      status: 'private',
    } as any);
    component.previews.set(['A red hero']);

    component.resetTemplateEditor();

    expect(component.editingTemplateId()).toBe('');
    expect(component.saveTitle()).toBe('');
    expect(component.saveDescription()).toBe('');
    expect(component.templateText()).toBe('');
    expect(component.previews()).toEqual([]);
  });

  it('debounces preview refresh while editing the template', fakeAsync(() => {
    const previewSpy = spyOn(stableDiffusionService, 'previewDynamicPrompt').and.callThrough();
    component.dialogVisible.set(true);

    component.onTemplateInput({ target: { value: 'A {red' } } as unknown as Event);
    tick(200);
    component.onTemplateInput({ target: { value: 'A {red|blue} hero' } } as unknown as Event);

    tick(349);
    expect(previewSpy).not.toHaveBeenCalled();

    tick(1);
    expect(previewSpy).toHaveBeenCalledTimes(1);
    expect(component.previews()).toEqual(previewResponse.previews);

    const requestArg = previewSpy.calls.mostRecent().args[0];
    expect(requestArg).toBeDefined();

    const request = requestArg as { template: string; seed: number };
    expect(request.template).toBe('A {red|blue} hero');
    expect(request.seed).toEqual(jasmine.any(Number));
  }));

  it('clears example outputs when the template is emptied', fakeAsync(() => {
    const previewSpy = spyOn(stableDiffusionService, 'previewDynamicPrompt').and.callThrough();
    component.previews.set(['Old preview']);
    component.errorMessage.set('Old error');

    component.onTemplateInput({ target: { value: '' } } as unknown as Event);
    tick(400);

    expect(previewSpy).not.toHaveBeenCalled();
    expect(component.previews()).toEqual([]);
    expect(component.errorMessage()).toBe('');
  }));

  it('keeps existing previews visible while a refresh is pending', () => {
    const previewSubject = new Subject<DynamicPromptPreviewResponse>();
    spyOn(stableDiffusionService, 'previewDynamicPrompt').and.returnValue(previewSubject);

    component.previews.set(['Old preview']);
    component.templateText.set('A {red|blue} hero');

    component.requestPreview();

    expect(component.loadingPreview()).toBeTrue();
    expect(component.previews()).toEqual(['Old preview']);

    previewSubject.next(previewResponse);
    previewSubject.complete();

    expect(component.previews()).toEqual(previewResponse.previews);
    expect(component.loadingPreview()).toBeFalse();
  });

  it('keeps existing previews visible when a refresh fails', () => {
    spyOn(stableDiffusionService, 'previewDynamicPrompt').and.returnValue(
      throwError(() => ({ message: "Expected end of text, found '{'" }))
    );

    component.previews.set(['Old preview']);
    component.templateText.set('Broken {template');

    component.requestPreview();

    expect(component.previews()).toEqual(['Old preview']);
    expect(component.errorMessage()).toContain("Expected end of text");
    expect(component.loadingPreview()).toBeFalse();
  });

  it('filters community templates and categories from the same search term', () => {
    component.communityTemplates.set([
      {
        id: 'template-1',
        title: 'Hero Builder',
        description: 'Build a new hero prompt',
        template: 'hero prompt',
        tags: ['hero'],
        author_display_name: 'Metal',
      } as any,
      {
        id: 'template-2',
        title: 'Villain Builder',
        description: 'Build a new villain prompt',
        template: 'villain prompt',
        tags: ['villain'],
        author_display_name: 'Metal',
      } as any,
    ]);
    component.communityCategories.set([
      {
        id: 'category-1',
        title: 'Hero Poses',
        description: 'Pose ideas for heroes',
        token: '__hero/poses__',
        tags: ['pose'],
        examples: ['hero landing'],
        author_display_name: 'Metal',
      } as any,
      {
        id: 'category-2',
        title: 'Villain Scenes',
        description: 'Scene ideas for villains',
        token: '__villain/scenes__',
        tags: ['scene'],
        examples: ['villain throne room'],
        author_display_name: 'Metal',
      } as any,
    ]);

    component.communitySearch.set('hero');

    expect(component.filteredCommunityTemplates().map((item) => item.id)).toEqual(['template-1']);
    expect(component.filteredCommunityCategories().map((item) => item.id)).toEqual(['category-1']);
  });

  it('clears community imported state when an imported template is deleted', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const deleteSpy = spyOn(stableDiffusionService, 'deleteUserDynamicPromptTemplate').and.callThrough();

    component.myTemplates.set([
      {
        id: 'owned-template-1',
        source_template_id: 'community-template-1',
      } as any,
    ]);
    component.communityTemplates.set([
      {
        id: 'community-template-1',
        title: 'Community Template',
        has_imported: true,
        owned_template_id: 'owned-template-1',
      } as any,
    ]);

    component.deleteTemplate({
      id: 'owned-template-1',
      title: 'Imported Template',
      description: '',
      template: 'A hero',
      tags: [],
      status: 'private',
      author_display_name: 'User',
      upvote_count: 0,
      import_count: 0,
      has_upvoted: false,
      has_imported: false,
      source_template_id: 'community-template-1',
      preview_samples: [],
      examples: [],
    } as any);

    expect(deleteSpy).toHaveBeenCalledWith('owned-template-1');
    expect(component.myTemplates()).toEqual([]);
    expect(component.communityTemplates()[0].has_imported).toBeFalse();
    expect(component.communityTemplates()[0].owned_template_id).toBeNull();
  });

  it('clears community imported state when an imported category is deleted', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const deleteSpy = spyOn(stableDiffusionService, 'deleteUserDynamicPromptCategory').and.callThrough();

    component.myCategories.set([
      {
        id: 'owned-category-1',
        source_category_id: 'community-category-1',
      } as any,
    ]);
    component.communityCategories.set([
      {
        id: 'community-category-1',
        title: 'Community Category',
        has_imported: true,
        owned_category_id: 'owned-category-1',
      } as any,
    ]);

    component.deleteCustomCategory({
      id: 'owned-category-1',
      title: 'Imported Category',
      description: '',
      token: '__user/imported__',
      tags: [],
      status: 'private',
      entries: [],
      examples: [],
      item_count: 0,
      upvote_count: 0,
      import_count: 0,
      author_display_name: 'User',
      has_upvoted: false,
      has_imported: false,
      user_id: 'user-1',
      source_category_id: 'community-category-1',
    } as any);

    expect(deleteSpy).toHaveBeenCalledWith('owned-category-1');
    expect(component.myCategories()).toEqual([]);
    expect(component.communityCategories()[0].has_imported).toBeFalse();
    expect(component.communityCategories()[0].owned_category_id).toBeNull();
  });

  it('syncs template imported state from the current Mine list', () => {
    spyOn(stableDiffusionService, 'getUserDynamicPromptTemplates').and.returnValue(of({
      templates: [
        {
          id: 'owned-template-1',
          source_template_id: 'community-template-1',
        } as any,
      ],
    } as DynamicPromptTemplateListResponse));

    component.communityTemplates.set([
      {
        id: 'community-template-1',
        title: 'Community Template',
        has_imported: false,
        owned_template_id: null,
      } as any,
    ]);

    component.loadMyTemplates();

    expect(component.communityTemplates()[0].has_imported).toBeTrue();
    expect(component.communityTemplates()[0].owned_template_id).toBe('owned-template-1');
  });
});
