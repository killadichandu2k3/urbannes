import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import http from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';
import fs from 'fs';
import path from 'path';
import { createLogger } from '@urbannes/shared';
import { resolvers } from './graphql/resolvers';
import { initDataSource } from './orm/data-source';

const logger = createLogger('auth-api');
const PORT = Number(process.env.PORT || 4600);

async function main() {

  await initDataSource();
  logger.info('TypeORM data source initialized');

  const typeDefsRaw = fs.readFileSync(path.join(__dirname, 'graphql/schema.graphql'), 'utf-8');
  const schema = buildSubgraphSchema({ typeDefs: gql(typeDefsRaw), resolvers: resolvers as any });

  const app = express();
  const httpServer = http.createServer(app);

  const apollo = new ApolloServer({
    schema,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });

  await apollo.start();

  app.use('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-api' }));

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    bodyParser.json(),
    expressMiddleware(apollo, {

      context: async ({ req }) => ({ headers: req.headers }),
    }),
  );

  httpServer.listen(PORT, () => {
    logger.info('auth-api ready', { httpUrl: `http://localhost:${PORT}/graphql` });
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
