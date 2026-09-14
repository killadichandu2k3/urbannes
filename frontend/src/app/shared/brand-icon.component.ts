import { Component, Input, OnChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

const ICON_CACHE = new Map<string, Observable<SafeHtml>>();

@Component({
  selector: 'app-brand-icon',
  template: `<span class="brand-icon" [innerHTML]="svg$ | async"></span>`,
})
export class BrandIconComponent implements OnChanges {
  @Input() name = '';

  svg$: Observable<SafeHtml> = of('');

  constructor(private readonly http: HttpClient, private readonly sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    if (!this.name) return;
    if (!ICON_CACHE.has(this.name)) {
      ICON_CACHE.set(
        this.name,
        this.http.get(`assets/brand-icons/${this.name}.svg`, { responseType: 'text' }).pipe(
          map((raw) => raw.replace('<svg ', '<svg fill="currentColor" ')),
          map((raw) => this.sanitizer.bypassSecurityTrustHtml(raw)),
          catchError(() => of('')),
          shareReplay(1),
        ),
      );
    }
    this.svg$ = ICON_CACHE.get(this.name)!;
  }
}
