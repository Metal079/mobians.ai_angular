import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import { AppComponent } from './app.component';
import { AuthService } from './auth/auth.service';
import { SharedService } from './shared.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: false,
            versionUpdates: of(),
            unrecoverable: of(),
            checkForUpdate: async () => false,
            activateUpdate: async () => true
          }
        },
        {
          provide: SharedService,
          useValue: {
            getUserData: () => of(null),
            getUserDataValue: () => null,
            getReferenceImageValue: () => null
          }
        },
        {
          provide: AuthService,
          useValue: {
            sessionInvalid$: of(),
            validateSession: async () => true
          }
        }
      ]
    })
      .overrideComponent(AppComponent, {
        set: { template: '<div>test-host</div>' }
      })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it("restores 606's theme during app startup", () => {
    localStorage.setItem('panel-theme', '606');
    const fixture = TestBed.createComponent(AppComponent);

    fixture.detectChanges();

    expect(document.body.classList.contains('theme-606')).toBeTrue();
    localStorage.removeItem('panel-theme');
    document.body.classList.remove('theme-606');
  });
});
