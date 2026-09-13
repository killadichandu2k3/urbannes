import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SeatMapComponent } from './seat-map.component';
import { TicketQrComponent } from './ticket-qr.component';

@NgModule({
  declarations: [SeatMapComponent, TicketQrComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: SeatMapComponent }]),
  ],
})
export class SeatMapModule {}
