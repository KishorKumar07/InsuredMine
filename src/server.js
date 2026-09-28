const { createApp } = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDB, mongoose } = require('./config/db');
const { CpuMonitor } = require('./monitor/cpuMonitor');
const { MessageScheduler } = require('./scheduler/messageScheduler');
const { gracefulShutdown } = require('./utils/gracefulShutdown');

async function main() {
  await connectDB();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Server (pid ${process.pid}) listening on port ${env.PORT}`);
  });

  const shutdown = gracefulShutdown(server, { mongooseInstance: mongoose, exitCode: 0 });

  // ---- Task 2.1: CPU monitor -> graceful restart on sustained threshold ----
  const cpuMonitor = new CpuMonitor({
    onThresholdExceeded: (percent) => {
      logger.error({ percent }, `CPU usage sustained above ${env.CPU_THRESHOLD_PERCENT}% - restarting server`);
      // Exit code 1 signals "restart me" to the cluster primary (see cluster.js).
      // If running single-process (npm run start:single) there is no primary
      // to restart it, so we still shut down cleanly and rely on an external
      // supervisor (pm2/systemd/Docker) - this is called out in the README.
      gracefulShutdown(server, { mongooseInstance: mongoose, exitCode: 1 })('cpu-threshold');
    },
  });
  cpuMonitor.start();

  // ---- Task 2.2: scheduled message delivery ----
  const messageScheduler = new MessageScheduler();
  messageScheduler.start();

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  return { app, server, cpuMonitor, messageScheduler };
}

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, 'Fatal error during startup');
    process.exit(1);
  });
}

module.exports = { main };
