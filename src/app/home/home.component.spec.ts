import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { SharedService } from 'src/app/shared.service';
import { ImageEditorService } from '../image-editor/image-editor.service';
import { AccountCtaService } from '../auth/account-cta.service';
import { AuthService } from '../auth/auth.service';
import { StableDiffusionService } from '../stable-diffusion.service';
import { AprilFoolsService } from '../april-fools.service';

import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let editor: any;
  let gridImages: BehaviorSubject<unknown[]>;
  let generationsStarted: number;

  beforeEach(async () => {
    gridImages = new BehaviorSubject<unknown[]>([]);
    generationsStarted = 0;
    editor = { presentation: signal('dialog'), available: signal(true), context: signal(null),
      refresh: jasmine.createSpy().and.resolveTo(), showInline: jasmine.createSpy().and.callFake(() => editor.presentation.set('inline')),
      showGenerator: jasmine.createSpy().and.callFake(() => editor.presentation.set('hidden')), leaveImagePage: jasmine.createSpy() };
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: ImageEditorService, useValue: editor },
        { provide: AccountCtaService, useValue: { requestLogin: jasmine.createSpy() } },
        { provide: AuthService, useValue: { isLoggedIn: jasmine.createSpy().and.returnValue(true) } },
        { provide: StableDiffusionService, useValue: {} },
        { provide: AprilFoolsService, useValue: { isAprilFools: () => false } },
        {
          provide: SharedService,
          useValue: {
            getUserData: () => of(null),
            getImages: () => gridImages.asObservable(),
            notifyGenerationStarted: () => { generationsStarted++; },
            getReferenceImageValue: () => null
          }
        }
      ]
    })
      .overrideComponent(HomeComponent, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the Discord banner on every visit, with a link that opens Discord and is counted', () => {
    const tag = jasmine.createSpy('gtag');
    const originalTag = (window as any).gtag;
    (window as any).gtag = tag;
    try {
      fixture.detectChanges();
      const banner: HTMLElement = fixture.nativeElement.querySelector('p-message');
      expect(banner.textContent).toContain('Welcome to Mobians! Join the community on Discord');
      const link: HTMLAnchorElement = banner.querySelector('a')!;
      expect(link.href).toBe('https://discord.gg/mobians');
      expect(link.target).toBe('_blank');

      link.addEventListener('click', event => event.preventDefault());
      link.click();
      expect(tag).toHaveBeenCalledOnceWith('event', 'discord_link_click',
        { placement: 'home_banner', send_to: 'G-NQ1MYQTHLM' });
      // Nothing is stored about the banner, so it is there again on the next visit.
      expect(Object.keys(localStorage).some(key => key.includes('banner'))).toBeFalse();
    } finally {
      if (originalTag === undefined) delete (window as any).gtag;
      else (window as any).gtag = originalTag;
    }
  });

  it('puts the sign-up strip under finished images, which arrive through the grid and not through imagesChange', () => {
    fixture.detectChanges();
    const strip = () => fixture.nativeElement.querySelector('app-signup-nudge');
    expect(strip()).toBeNull();                                 // nothing generated yet

    component.onShowLoadingChange(true);
    fixture.detectChanges();
    component.onShowLoadingChange(false);                       // what a finished job does: stop loading, publish to the grid
    gridImages.next([{ UUID: 'a' }, { UUID: 'b' }]);
    fixture.detectChanges();
    expect(component.images).toEqual([]);                       // imagesChange was never emitted
    expect(strip()?.getAttribute('variant')).toBe('result');

    component.onShowLoadingChange(true);                        // the next job is waiting: the wait card takes over
    fixture.detectChanges();
    expect(strip()).toBeNull();
    component.onShowLoadingChange(false);
    gridImages.next([]);                                        // images cleared
    fixture.detectChanges();
    expect(strip()).toBeNull();
  });

  it('announces each generation once when it starts (the Account panel makes room for it on phones)', () => {
    fixture.detectChanges();
    component.onShowLoadingChange(true);
    component.onShowLoadingChange(true);                        // still the same job waiting
    expect(generationsStarted).toBe(1);
    component.onShowLoadingChange(false);
    expect(generationsStarted).toBe(1);
    component.onShowLoadingChange(true);                        // the next one
    expect(generationsStarted).toBe(2);
  });

  it('switches between Image sections without destroying the generator', async () => {
    fixture.detectChanges();
    const generator = fixture.nativeElement.querySelector('#generation-space');
    await component.chooseImageMode('edit'); fixture.detectChanges();
    expect(generator.hidden).toBeTrue();
    expect(editor.showInline).toHaveBeenCalledWith({ image: undefined });
    await component.chooseImageMode('generate'); fixture.detectChanges();
    expect(generator.hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('#generation-space')).toBe(generator);
  });

  it('opens sign-in without enabling editing for guests', async () => {
    (TestBed.inject(AuthService).isLoggedIn as jasmine.Spy).and.returnValue(false);
    await component.chooseImageMode('edit');
    expect(TestBed.inject(AccountCtaService).requestLogin).toHaveBeenCalled();
    expect(editor.showInline).not.toHaveBeenCalled();
  });

  it('does not reopen editing when an earlier availability response arrives late', async () => {
    let complete!: () => void;
    editor.refresh.and.returnValue(new Promise<void>(resolve => complete = resolve));
    const opening = component.chooseImageMode('edit');
    await component.chooseImageMode('generate'); complete(); await opening;
    expect(editor.showInline).not.toHaveBeenCalled(); expect(editor.presentation()).toBe('hidden');
  });
});
