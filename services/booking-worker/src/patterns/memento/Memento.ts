// ============================================================================
// PATTERN: MEMENTO — snapshot a booking row before a risky mutation (e.g.
// before a payment-confirmation write) so we can restore it in-process if a
// downstream step fails, without hand-writing ad-hoc undo logic per caller.
// The Postgres transaction is still the real rollback mechanism for the DB
// itself; this in-memory memento is for the in-flight JS object state used
// to build the reply/push payloads within one request's handling.
// ============================================================================

export class Memento<T> {
  private readonly snapshot: string;
  public readonly takenAt: string;
  constructor(state: T) {
    this.snapshot = JSON.stringify(state);
    this.takenAt = new Date().toISOString();
  }
  restore(): T {
    return JSON.parse(this.snapshot) as T;
  }
}

export class HistoryCaretaker<T> {
  private mementos: Memento<T>[] = [];
  save(state: T): void {
    this.mementos.push(new Memento(state));
    if (this.mementos.length > 5) this.mementos.shift();
  }
  undo(): T | undefined {
    return this.mementos.pop()?.restore();
  }
}
