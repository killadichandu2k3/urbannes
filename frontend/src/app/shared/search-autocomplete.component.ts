import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, filter } from 'rxjs/operators';
import { GraphqlService } from '../core/services/graphql.service';
import { SearchResult } from '../core/models';

@Component({
  selector: 'app-search-autocomplete',
  templateUrl: './search-autocomplete.component.html',
})
export class SearchAutocompleteComponent implements OnInit, OnDestroy {
  @Output() select = new EventEmitter<SearchResult>();

  query = '';
  open = false;
  loading = false;
  activeIndex = -1;
  results: SearchResult[] = [];

  private readonly input$ = new Subject<string>();
  private sub: Subscription | null = null;

  constructor(private readonly graphql: GraphqlService) {}

  ngOnInit(): void {
    this.sub = this.input$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        filter((q) => q.trim().length > 0),
        switchMap((q) => {
          this.loading = true;
          return this.graphql.search(q, 8);
        }),
      )
      .subscribe({
        next: (results) => {
          this.results = results;
          this.loading = false;
          this.open = true;
          this.activeIndex = -1;
        },
        error: () => {
          this.results = [];
          this.loading = false;
        },
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onInput(): void {
    const q = this.query.trim();
    if (!q) {
      this.results = [];
      this.open = false;
      return;
    }
    this.input$.next(q);
  }

  highlight(text: string): string {
    const q = this.query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return `${text.slice(0, idx)}<mark>${text.slice(idx, idx + q.length)}</mark>${text.slice(idx + q.length)}`;
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.open || this.results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, this.results.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
    } else if (event.key === 'Enter' && this.activeIndex >= 0) {
      event.preventDefault();
      this.pick(this.results[this.activeIndex]);
    } else if (event.key === 'Escape') {
      this.open = false;
    }
  }

  pick(result: SearchResult): void {
    this.select.emit(result);
    this.query = result.title;
    this.open = false;
  }

  onBlur(): void {
    setTimeout(() => (this.open = false), 150);
  }
}
