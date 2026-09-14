import { Injectable } from '@angular/core';
import { PaymentOrder } from '../models';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
  prefill?: { name?: string; email?: string };
}

export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

@Injectable({ providedIn: 'root' })
export class RazorpayCheckoutService {

  open(order: PaymentOrder, opts: { description?: string; userEmail?: string; userName?: string }): Promise<RazorpaySuccessResponse> {
    return new Promise((resolve, reject) => {
      if (!window.Razorpay) {
        reject(new Error('Payment widget failed to load — check your connection and try again.'));
        return;
      }
      const rz = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'UrbanNes',
        description: opts.description,
        theme: { color: '#d9622b' },
        prefill: { name: opts.userName, email: opts.userEmail },
        handler: (response) => resolve(response),
        modal: { ondismiss: () => reject(new Error('dismissed')) },
      });
      rz.open();
    });
  }
}
