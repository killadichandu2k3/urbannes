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

      pollIntervalInMs: 10_000,
    }),

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

  let started = false;
  let attempts = 0;
  while (!started && attempts < 30) {
    try {
      await apollo.start();
      started = true;
    } catch (err: any) {
      attempts++;
      logger.warn(`Gateway failed to start, retrying (${attempts}/30)...`, { error: err.message });
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (!started) {
    throw new Error('Failed to start Apollo Gateway after 30 attempts');
  }

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
