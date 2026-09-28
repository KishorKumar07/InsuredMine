/**
 * Dev convenience: starts a real, standalone mongod (downloaded/cached by
 * mongodb-memory-server) on a fixed local port, so the app can be run and
 * demoed against a real MongoDB without installing MongoDB or Docker.
 *
 * This is NOT used by the test suite (tests/setup.js spins up its own
 * throwaway instance per test run) and is NOT part of the production app -
 * it's purely a local "npm run mongo:dev"-style helper for manual testing.
 *
 * Usage:
 *   node scripts/startMemoryMongo.js
 *   # then, in another terminal:
 *   MONGO_URI=mongodb://127.0.0.1:27117/insuredmine npm run start:single
 */
const { MongoMemoryServer } = require('mongodb-memory-server');

const PORT = parseInt(process.env.DEV_MONGO_PORT, 10) || 27117;
const DB_NAME = process.env.DEV_MONGO_DB || 'insuredmine';

async function main() {
  const mongod = await MongoMemoryServer.create({
    instance: { port: PORT, dbName: DB_NAME },
  });
  const uri = `mongodb://127.0.0.1:${PORT}/${DB_NAME}`;
  // eslint-disable-next-line no-console
  console.log(`Dev MongoDB running at: ${uri}`);
  // eslint-disable-next-line no-console
  console.log('Press Ctrl+C to stop.');

  const shutdown = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start dev MongoDB:', err);
  process.exit(1);
});
