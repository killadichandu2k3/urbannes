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

    QRCode.toDataURL(this.bookingId, { width: 168, margin: 1 })
      .then((url) => (this.dataUrl = url))
      .catch(() => (this.dataUrl = ''));
  }
}
