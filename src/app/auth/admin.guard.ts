import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { SharedService } from '../shared.service';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(
    private shared: SharedService,
    private router: Router
  ) {}

  canActivate(): boolean {
    const user = this.shared.getUserDataValue();
    
    // Check if user is logged in and has admin/mod role
    if (user && user.has_required_role === true) {
      return true;
    }
    
    // Redirect non-admins to home
    this.router.navigate(['/']);
    return false;
  }
}
