import crypto from 'crypto';
import Razorpay from 'razorpay';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('booking-worker:razorpay');

const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

if (!KEY_ID || !KEY_SECRET) {
  logger.warn('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — payment order creation will fail until configured. See .env.example.');
}

const razorpay = (KEY_ID && KEY_SECRET) ? new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET }) : null;

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export async function createOrder(amountRupees: number, receipt: string): Promise<RazorpayOrder> {
  if (!razorpay) throw new Error('Razorpay is not configured (missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET)');

  const order = await razorpay.orders.create({
    amount: Math.round(amountRupees * 100),
    currency: 'INR',
    receipt,
    notes: { source: 'urbannes' },
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}
