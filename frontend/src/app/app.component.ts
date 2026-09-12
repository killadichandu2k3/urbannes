import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  currentTheme: 'dark' | 'light' = 'dark';

  constructor(public readonly auth: AuthService, private readonly router: Router) {}

  ngOnInit(): void {
    const saved = localStorage.getItem('urbannest-theme') as 'dark' | 'light' | null;
    if (saved) {
      this.currentTheme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      this.currentTheme = 'light';
    }
    this.applyTheme();
  }

  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('urbannest-theme', this.currentTheme);
    this.applyTheme();
  }

  private applyTheme(): void {
    if (this.currentTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/auth/login');
  }
}
