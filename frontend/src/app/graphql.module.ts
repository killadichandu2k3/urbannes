// ============================================================================
// Configures apollo-angular's underlying Apollo Client. Points at /graphql
// through NGINX (see proxy.conf.json for local dev), which reverse-proxies
// to the Apollo Gateway for schema composition across booking/analytics/
// auth subgraphs. This used to be /api/graphql, with Kong stripping the
// /api prefix before forwarding to NGINX's own /graphql route — now that
// Kong is gone, this calls NGINX's real route directly, with no prefix to
// strip anywhere.
//
// No auth header is set here anymore — AuthInterceptor (see
// core/services/auth.interceptor.ts) attaches a real per-user
// `Authorization: Bearer <jwt>` to every HttpClient request, including the
// ones HttpLink makes, which replaces the single hardcoded dev API key
// this used to send unconditionally before real auth existed.
// ============================================================================

import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { APOLLO_OPTIONS, ApolloModule } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { InMemoryCache } from '@apollo/client/core';

@NgModule({
  imports: [HttpClientModule, ApolloModule],
  providers: [
    {
      provide: APOLLO_OPTIONS,
      useFactory(httpLink: HttpLink) {
        return {
          link: httpLink.create({ uri: '/graphql' }),
          cache: new InMemoryCache(),
          defaultOptions: {
            watchQuery: { fetchPolicy: 'network-only' },
          },
        };
      },
      deps: [HttpLink],
    },
  ],
})
export class GraphQLModule {}
