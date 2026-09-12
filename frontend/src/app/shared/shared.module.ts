import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchAutocompleteComponent } from './search-autocomplete.component';

@NgModule({
  declarations: [SearchAutocompleteComponent],
  imports: [CommonModule, FormsModule],
  exports: [SearchAutocompleteComponent],
})
export class SharedModule {}
