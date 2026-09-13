// ============================================================================
// RAZORPAY — order creation + payment verification, isolated in one module
// so the rest of booking-worker never imports the Razorpay SDK directly.
// Runs in Razorpay TEST MODE by default (test key prefix `rzp_test_`) —
// test mode is permanently free, needs no live business verification, and
// uses Razorpay's published test card/UPI numbers (see docs/PAYMENTS.md).
// Swapping to live mode later is a key-pair change only, nothing here.
// ============================================================================

import crypto from 'crypto';
import Razorpay from 'razorpay';
import { createLogger } from '@urbannest/shared';

const logger = createLogger('booking-worker:razorpay');

const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

if (!KEY_ID || !KEY_SECRET) {
  logger.warn('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — payment order creation will fail until configured. See .env.example.');
}

const razorpay = (KEY_ID && KEY_SECRET) ? new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET }) : null;

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
}

/** Amount is the booking's finalPrice in rupees; Razorpay's API wants paise (integer). */
export async function createOrder(amountRupees: number, receipt: string): Promise<RazorpayOrder> {
  if (!razorpay) throw new Error('Razorpay is not configured (missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET)');
  
  const order = await razorpay.orders.create({
    amount: Math.round(amountRupees * 100),
    currency: 'INR',
    receipt,
    notes: { source: 'urbannest' },
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

/**
 * Razorpay's checkout returns (order_id, payment_id, signature) to the
 * frontend on success. The signature is HMAC-SHA256 of `${order_id}|${payment_id}`
 * keyed with our secret — verifying it server-side is the ONLY way to know
 * the payment is real rather than a client claiming success without paying.
 * This function is the entire trust boundary for handleConfirmPayment.
 */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}
