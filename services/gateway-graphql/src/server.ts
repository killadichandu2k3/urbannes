// ============================================================================
// gateway-graphql — the Apollo Gateway. This is the ONE GraphQL endpoint the
// frontend talks to. It does not implement any resolvers itself; at startup
// it introspects booking-api, analytics-api, and auth-api, composes their
// schemas into one supergraph, and at request time plans + executes a query
// across whichever subgraph(s) actually own the requested fields —
// including stitching together fields for the same entity (Venue,
// EventType) that live in two different subgraphs. auth-api's User/
// register/login types compose in the same way, just with no entities to
// stitch (nothing else extends User).
//
// NAMING NOTE — this is a different "gateway" from the NGINX `gateway`
// service (see gateway/nginx/nginx.conf). NGINX is the network-level
// public edge (reverse proxy, load balancing, rate limiting — previously
// fronted by Kong, which has since been removed). This Apollo Gateway is
// GraphQL-schema-composition-specific and only concerns itself with
// combining subgraphs. Both run, doing different jobs, and the naming
// collision is just an industry-wide overload of the word "gateway" —
// worth knowing, not a bug in this setup.
//
// IntrospectAndCompose (below) polls each subgraph's URL and recomposes the
// schema in-process — simplest thing that works for local dev, and fine
// for this project's scale. A real production setup would instead run
// `rover subgraph publish` from CI to push each subgraph's schema to Apollo
// Studio / GraphOS, and have the Gateway fetch a pre-composed supergraph
// schema from there instead of introspecting subgraphs live on every boot —
// that avoids a startup-time dependency on every subgraph being reachable
// and catches composition errors in CI instead of at runtime.
// ============================================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import http from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('gateway-graphql');
const PORT = Number(process.env.PORT || 4500);

const BOOKING_API_URL = process.env.BOOKING_API_GRAPHQL_URL || 'http://booking-api:4000/graphql';
const ANALYTICS_API_URL = process.env.ANALYTICS_API_GRAPHQL_URL || 'http://analytics-api:4300/graphql';
const AUTH_API_URL = process.env.AUTH_API_GRAPHQL_URL || 'http://auth-api:4600/graphql';

async function main() {
  const gateway = new ApolloGateway({
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: [
        { name: 'booking', url: BOOKING_API_URL },
        { name: 'analytics', url: ANALYTICS_API_URL },
        { name: 'auth', url: AUTH_API_URL },
      ],
      // Retry subgraph introspection on startup — a subgraph container can
      // legitimately still be booting when the gateway container starts
      // (Compose/K8s don't guarantee GraphQL-readiness ordering, only
      // process-started ordering), so fail fast is the wrong default here.
      pollIntervalInMs: 10_000,
    }),
    // Forward the original request's auth/context headers down to each
    // subgraph. auth-api's `me` query reads this to resolve the caller's
    // identity from their JWT; booking-api's resolvers read it to attach
    // the authenticated userId to mutations instead of trusting a
    // client-supplied field (see booking-api/src/graphql/resolvers.ts).
    buildService({ url }) {
      return new RemoteGraphQLDataSource({
        url,
        willSendRequest({ request, context }: any) {
          const headers = context?.headers;
          if (headers?.authorization) {
            request.http.headers.set('authorization', headers.authorization);
          }
        },
      });
    },
  });

  const app = express();
  const httpServer = http.createServer(app);

  const apollo = new ApolloServer({
    gateway,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });

  await apollo.start();

  app.use('/health', (_req, res) => res.json({ status: 'ok', service: 'gateway-graphql' }));

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    bodyParser.json(),
    expressMiddleware(apollo, {
      context: async ({ req }) => ({ headers: req.headers }),
    }),
  );

  httpServer.listen(PORT, () => {
    logger.info('gateway-graphql ready', {
      httpUrl: `http://localhost:${PORT}/graphql`,
      subgraphs: [BOOKING_API_URL, ANALYTICS_API_URL, AUTH_API_URL],
    });
  });
}

main().catch((err) => {
  logger.error('Fatal startup error — check that both subgraphs are reachable and their schemas compose cleanly', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
