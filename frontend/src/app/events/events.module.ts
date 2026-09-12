import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../shared/shared.module';
import { EventsComponent } from './events.component';

@NgModule({
  declarations: [EventsComponent],
  imports: [
    CommonModule,
    SharedModule,
    RouterModule.forChild([{ path: '', component: EventsComponent }]),
  ],
})
export class EventsModule {}
