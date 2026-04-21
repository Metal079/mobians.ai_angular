import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { of } from 'rxjs';

import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: { get: () => ({ subscribe: () => {} }), post: () => ({ subscribe: () => {} }) } },
        {
          provide: SwPush,
          useValue: {
            isEnabled: true,
            subscription: of(null),
            requestSubscription: async () => ({ endpoint: '', expirationTime: null, getKey: () => null }),
            unsubscribe: async () => {}
          }
        }
      ]
    });
    service = TestBed.inject(NotificationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
