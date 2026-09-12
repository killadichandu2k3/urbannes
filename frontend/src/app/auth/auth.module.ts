// ============================================================================
// One lazy chunk owns both LoginComponent and RegisterComponent, each under
// its own child path — loaded via a SINGLE top-level route (see
// app-routing.module.ts's `loadChildren` on path 'auth'), not two separate
// loadChildren calls for the same module. `/auth/login` and `/auth/register`
// is a one-segment-longer URL than `/login`/`/register`, traded here for
// never lazy-loading the same chunk twice or juggling which component an
// empty child path should resolve to.
// ============================================================================

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LoginComponent } from './login.component';
import { RegisterComponent } from './register.component';

@NgModule({
  declarations: [LoginComponent, RegisterComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild([
      { path: 'login', component: LoginComponent },
      { path: 'register', component: RegisterComponent },
    ]),
  ],
})
export class AuthModule {}
