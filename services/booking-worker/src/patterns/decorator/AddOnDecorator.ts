// ============================================================================
// PATTERN: DECORATOR — add-ons (insurance, snacks, recliner, parking) wrap
// a base ticket price, each adding its own cost/line item, avoiding a
// combinatorial explosion of subclasses for every add-on combination.
// ============================================================================

export interface PricedLine {
  describe(): string;
  price(): number;
}

class BaseTicketLine implements PricedLine {
  constructor(private label: string, private basePrice: number) {}
  describe() { return this.label; }
  price() { return this.basePrice; }
}

abstract class AddOnDecorator implements PricedLine {
  constructor(protected wrapped: PricedLine) {}
  abstract describe(): string;
  abstract price(): number;
}

class InsuranceDecorator extends AddOnDecorator {
  private fee = 49;
  describe() { return `${this.wrapped.describe()} + Insurance`; }
  price() { return this.wrapped.price() + this.fee; }
}
class SnackComboDecorator extends AddOnDecorator {
  private fee = 250;
  describe() { return `${this.wrapped.describe()} + Snack Combo`; }
  price() { return this.wrapped.price() + this.fee; }
}
class ReclinerDecorator extends AddOnDecorator {
  private fee = 300;
  describe() { return `${this.wrapped.describe()} + Recliner`; }
  price() { return this.wrapped.price() + this.fee; }
}
class ParkingDecorator extends AddOnDecorator {
  private fee = 100;
  describe() { return `${this.wrapped.describe()} + Parking`; }
  price() { return this.wrapped.price() + this.fee; }
}

const DECORATOR_MAP: Record<string, { new (line: PricedLine): PricedLine }> = {
  INSURANCE: InsuranceDecorator,
  SNACK_COMBO: SnackComboDecorator,
  RECLINER: ReclinerDecorator,
  PARKING: ParkingDecorator,
};

export function priceAddOns(addOnCodes: string[]): { code: string; price: number }[] {
  return addOnCodes
    .filter((code) => DECORATOR_MAP[code])
    .map((code) => {
      const Decorator = DECORATOR_MAP[code];
      const decorated = new Decorator(new BaseTicketLine('base', 0));
      return { code, price: decorated.price() };
    });
}
