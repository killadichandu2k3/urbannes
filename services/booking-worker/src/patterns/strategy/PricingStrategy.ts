// ============================================================================
// PATTERN: STRATEGY — swappable pricing algorithms (flat / surge /
// early-bird) selected at runtime based on demand and timing, without the
// booking flow itself knowing which one is active.
// ============================================================================

import { SeatSelection } from '../builder/BookingBuilder';

export interface PricingContext {
  demandFactor: number; // 0..1
  isWeekend: boolean;
  hoursUntilEvent: number;
}

export interface PricingStrategy {
  readonly name: string;
  calculate(seats: SeatSelection[], basePrice: number, context: PricingContext): number;
}

const TIER_MULTIPLIER: Record<SeatSelection['tier'], number> = { PLATINUM: 2.0, GOLD: 1.5, SILVER: 1.0 };

export class FlatPricingStrategy implements PricingStrategy {
  readonly name = 'flat';
  calculate(seats: SeatSelection[], basePrice: number): number {
    return seats.reduce((sum, s) => sum + basePrice * TIER_MULTIPLIER[s.tier], 0);
  }
}

export class SurgePricingStrategy implements PricingStrategy {
  readonly name = 'surge';
  calculate(seats: SeatSelection[], basePrice: number, ctx: PricingContext): number {
    const surge = 1 + Math.min(ctx.demandFactor, 1) * 1.5;
    const weekendBump = ctx.isWeekend ? 1.1 : 1.0;
    return seats.reduce((sum, s) => sum + basePrice * TIER_MULTIPLIER[s.tier] * surge * weekendBump, 0);
  }
}

export class EarlyBirdPricingStrategy implements PricingStrategy {
  readonly name = 'early-bird';
  calculate(seats: SeatSelection[], basePrice: number, ctx: PricingContext): number {
    const discount = ctx.hoursUntilEvent > 168 ? 0.2 : ctx.hoursUntilEvent > 72 ? 0.1 : 0;
    return seats.reduce((sum, s) => sum + basePrice * TIER_MULTIPLIER[s.tier] * (1 - discount), 0);
  }
}

const STRATEGIES: Record<string, PricingStrategy> = {
  flat: new FlatPricingStrategy(),
  surge: new SurgePricingStrategy(),
  'early-bird': new EarlyBirdPricingStrategy(),
};

export function pickStrategy(requested: string | undefined, ctx: PricingContext): PricingStrategy {
  if (requested && STRATEGIES[requested]) return STRATEGIES[requested];
  if (ctx.hoursUntilEvent > 72) return STRATEGIES['early-bird'];
  if (ctx.demandFactor > 0.7) return STRATEGIES['surge'];
  return STRATEGIES['flat'];
}
