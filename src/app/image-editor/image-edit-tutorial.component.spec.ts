import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ImageEditTutorialComponent } from './image-edit-tutorial.component';
import { ImageEditorService } from './image-editor.service';

describe('Image editing tutorial pages', () => {
  let fixture: ComponentFixture<ImageEditTutorialComponent>;
  let editor: any;
  const draft = { characterId:'mica', lookId:'day', prompt:'Keep my instruction' };
  const findButton = (text: string): HTMLButtonElement => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
    .find(button => button.textContent?.includes(text))!;
  const open = async () => {
    editor.tutorialVisible.set(true); fixture.detectChanges(); await fixture.whenStable();
  };

  beforeEach(async () => {
    editor = { tutorialVisible:signal(false), context:signal(draft), pending:signal(false),
      dismissTutorial:jasmine.createSpy().and.callFake(() => editor.tutorialVisible.set(false)) };
    await TestBed.configureTestingModule({ imports:[ImageEditTutorialComponent], providers:[
      provideNoopAnimations(), { provide:ImageEditorService, useValue:editor },
    ] }).compileComponents();
    fixture = TestBed.createComponent(ImageEditTutorialComponent);
    fixture.detectChanges(); await open();
  });
  afterEach(() => fixture.destroy());

  it('shows the reference, base, result, and instruction on Next without changing the edit draft', () => {
    expect(fixture.nativeElement.querySelectorAll('img').length).toBe(2);
    findButton('Next: References').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('img').length).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Image 2 · Reference');
    expect(fixture.nativeElement.textContent).toContain('Image 1 · Before');
    expect(fixture.nativeElement.querySelector('blockquote').textContent).toContain('rabbit from image 2');
    expect(fixture.nativeElement.querySelector('[aria-current="step"]').textContent).toContain('Reference images');
    expect(editor.context()).toBe(draft); expect(editor.pending()).toBeFalse();
    expect(editor.dismissTutorial).not.toHaveBeenCalled();
  });

  it('supports Back and direct page navigation, returning the content to the top', () => {
    findButton('2. Reference images').click(); fixture.detectChanges();
    const content = fixture.nativeElement.querySelector('.p-dialog-content');
    const scrollTop = spyOnProperty(content, 'scrollTop', 'set');
    findButton('Back').click(); fixture.detectChanges();
    expect(scrollTop).toHaveBeenCalledWith(0);
    expect(fixture.nativeElement.querySelector('[aria-current="step"]').textContent).toContain('Simple edits');
    expect(fixture.nativeElement.querySelector('blockquote').textContent).toContain('starry night');
    expect(editor.dismissTutorial).not.toHaveBeenCalled();
  });

  it('finishes from the second page and starts on the first page when reopened', async () => {
    findButton('Next: References').click(); fixture.detectChanges();
    findButton('Start editing').click(); fixture.detectChanges(); await fixture.whenStable();
    expect(editor.dismissTutorial).toHaveBeenCalledTimes(1);
    expect(editor.tutorialVisible()).toBeFalse();
    await open();
    expect(fixture.nativeElement.querySelector('[aria-current="step"]').textContent).toContain('Simple edits');
    expect(editor.context()).toBe(draft);
  });

  it('lets users skip without having to visit both pages', () => {
    findButton('Skip tutorial').click(); fixture.detectChanges();
    expect(editor.dismissTutorial).toHaveBeenCalledTimes(1);
    expect(editor.tutorialVisible()).toBeFalse();
    expect(editor.context()).toBe(draft);
  });
});
