import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import http from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';
import fs from 'fs';
import path from 'path';
import { createLogger } from '@urbannes/shared';
import { resolvers } from './graphql/resolvers';
import { startPushBridge } from './ws/pushBridge';
import { requestReply } from './kafka/requestReply';

const logger = createLogger('booking-api');
const PORT = Number(process.env.PORT || 4000);

async function main() {
  const typeDefsRaw = fs.readFileSync(path.join(__dirname, 'graphql/schema.graphql'), 'utf-8');

  const schema = buildSubgraphSchema({ typeDefs: gql(typeDefsRaw), resolvers: resolvers as any });

  const app = express();
  const httpServer = http.createServer(app);

  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql/ws' });
  const serverCleanup = useServer({ schema }, wsServer);

  const apollo = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apollo.start();
  await startPushBridge();

  app.use('/health', (_req, res) => res.json({ status: 'ok', service: 'booking-api' }));

  app.get('/s/:code', async (req, res) => {
    try {
      const reply = await requestReply<{ code: string }, { targetUrl: string } | null>('RESOLVE_SHORT_LINK', {
        code: req.params.code,
      });
      if (!reply.ok || !reply.data) {
        res.status(404).send('Short link not found');
        return;
      }
      res.redirect(302, reply.data.targetUrl);
    } catch (err) {
      logger.error('Short link resolution failed', { error: (err as Error).message });
      res.status(504).send('Upstream timeout resolving short link');
    }
  });

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    bodyParser.json(),
    expressMiddleware(apollo, {
      context: async ({ req }) => ({ headers: req.headers }),
    }),
  );

  httpServer.listen(PORT, () => {
    logger.info(`booking-api ready`, { httpUrl: `http://localhost:${PORT}/graphql`, wsUrl: `ws://localhost:${PORT}/graphql/ws` });
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
