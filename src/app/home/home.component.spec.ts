import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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

  beforeEach(async () => {
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
