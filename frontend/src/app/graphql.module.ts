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
