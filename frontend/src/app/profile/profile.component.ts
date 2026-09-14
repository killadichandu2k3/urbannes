import { Component } from '@angular/core';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
})
export class ProfileComponent {

  displayName = '';
  nameSaving = false;
  nameError = '';
  nameSaved = false;

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordSaving = false;
  passwordError = '';
  passwordSaved = false;

  constructor(public readonly auth: AuthService) {
    this.displayName = this.auth.currentUser?.displayName ?? '';
  }

  saveDisplayName(): void {
    const trimmed = this.displayName.trim();
    if (!trimmed) {
      this.nameError = 'Display name is required.';
      return;
    }
    this.nameSaving = true;
    this.nameError = '';
    this.nameSaved = false;
    this.auth.updateProfile({ displayName: trimmed }).subscribe({
      next: () => {
        this.nameSaving = false;
        this.nameSaved = true;
      },
      error: (err) => {
        this.nameSaving = false;
        this.nameError = err.message || 'Could not update your name. Try again.';
      },
    });
  }

  changePassword(): void {
    this.passwordError = '';
    this.passwordSaved = false;
    if (!this.currentPassword || !this.newPassword) {
      this.passwordError = 'Fill in both password fields.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'New password and confirmation do not match.';
      return;
    }
    this.passwordSaving = true;
    this.auth.changePassword({ currentPassword: this.currentPassword, newPassword: this.newPassword }).subscribe({
      next: () => {
        this.passwordSaving = false;
        this.passwordSaved = true;
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
      },
      error: (err) => {
        this.passwordSaving = false;
        this.passwordError = err.message || 'Could not change your password. Try again.';
      },
    });
  }
}
