// ============================================================================
// RAZORPAY CHECKOUT — wraps the third-party `Razorpay` global (loaded via
// <script> in index.html — see its comment) behind one typed method, so
// no other file in this app needs to know Razorpay's callback-based API
// shape. Mirrors this app's existing pattern of isolating a third-party
// SDK behind one small service (see graphql-ws.service.ts for the
// graphql-ws equivalent).
// ============================================================================

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
  /**
   * Opens the Checkout widget for the given order. Resolves with the
   * signed payment response on success, or rejects with a plain 'dismissed'
   * error if the user closes the widget without paying — the caller
   * decides what "cancelled" means for its own UI state.
   */
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
