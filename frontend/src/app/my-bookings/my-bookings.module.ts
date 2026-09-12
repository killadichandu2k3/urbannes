import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MyBookingsComponent } from './my-bookings.component';

@NgModule({
  declarations: [MyBookingsComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: MyBookingsComponent }]),
  ],
})
export class MyBookingsModule {}
