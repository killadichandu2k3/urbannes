import 'dotenv/config';
import express from 'express';
import { createLogger } from '@urbannest/shared';
import { startNotificationConsumer } from './kafka/consumer';

const logger = createLogger('notification-service:bootstrap');
const PORT = Number(process.env.PORT || 4100);

async function main() {
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'notification-service' }));
  app.listen(PORT, () => logger.info(`Health endpoint listening on :${PORT}`));

  await startNotificationConsumer();
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
