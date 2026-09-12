// ============================================================================
// Backend-driven autocomplete, hitting analytics-api's `search` resolver
// through the Apollo Gateway — a real system-design pattern, not a demo:
//
//   input -> debounceTime(250ms) -> distinctUntilChanged -> switchMap(query)
//
// debounceTime: waits for the user to pause typing before firing a
// request, so a fast typist doesn't generate one network round-trip per
// keystroke — this is the standard autocomplete pattern in any real
// system (search-as-you-type at any real scale rate-limits itself this
// way, client-side, before it ever reaches the backend).
//
// distinctUntilChanged: skips a request if the debounced value is
// identical to the last one sent (e.g. type "ab", backspace, retype "ab"
// within the debounce window) — avoids a redundant round-trip.
//
// switchMap: if a new keystroke arrives while a previous search request
// is still in flight, switchMap CANCELS the stale request and starts the
// new one. Without this, a slow response to an earlier, now-outdated
// query could resolve AFTER a newer one and overwrite fresher results
// with stale ones — a real race condition real autocomplete UIs hit.
//
// Backend side: analytics-api's `search` resolver queries Postgres
// directly, cache-aside through Redis (see services/analytics-api/src/
// graphql/resolvers.ts and cache/statsCache.ts) — this traffic never
// touches booking-api's Kafka request/reply write path, matching how a
// real system routes read-heavy, latency-tolerant, eventually-consistent-
// is-fine workloads (search, autocomplete, browsing) away from the
// primary/OLTP path.
// ============================================================================

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
