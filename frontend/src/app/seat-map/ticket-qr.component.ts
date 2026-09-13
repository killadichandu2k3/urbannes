import { Component, Input, OnChanges } from '@angular/core';
import QRCode from 'qrcode';

@Component({
  selector: 'app-ticket-qr',
  template: `<img *ngIf="dataUrl" [src]="dataUrl" [alt]="'Ticket QR for booking ' + bookingId" class="ticket-qr-img" />`,
})
export class TicketQrComponent implements OnChanges {
  @Input() bookingId = '';
  dataUrl = '';

  ngOnChanges(): void {
    if (!this.bookingId) return;
    // The QR encodes just the booking id — a real gate scanner would look
    // this up against GET_BOOKING server-side rather than trust anything
    // embedded in the code itself, same principle as the payment
    // signature check: the code is a pointer, not a credential.
    QRCode.toDataURL(this.bookingId, { width: 168, margin: 1 })
      .then((url) => (this.dataUrl = url))
      .catch(() => (this.dataUrl = ''));
  }
}
