import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchAutocompleteComponent } from './search-autocomplete.component';
import { BrandIconComponent } from './brand-icon.component';

@NgModule({
  declarations: [SearchAutocompleteComponent, BrandIconComponent],
  imports: [CommonModule, FormsModule],
  exports: [SearchAutocompleteComponent, BrandIconComponent],
})
export class SharedModule {}
