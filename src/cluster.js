const cluster = require('cluster');
const env = require('./config/env');
const logger = require('./config/logger');

/**
 * Task 2.1 restart mechanism.
 *
 * The cluster PRIMARY never does app work itself - it only forks one (or
 * more) WORKER processes that run the real Express server (src/server.js).
 * Each worker runs its own CpuMonitor (see monitor/cpuMonitor.js). When a
 * worker's own CPU usage stays above the threshold for N consecutive
 * samples, that worker gracefully shuts itself down and exits with code 1.
 * The primary sees the exit and immediately forks a replacement, so the
 * server is "restarted" with near-zero downtime (other workers, if any,
 * keep serving traffic the whole time).
 *
 * This needs no extra dependency (pm2, forever, etc.) - Node's built-in
 * `cluster` module is enough - but the same CpuMonitor would work fine
 * under pm2 too (see README "Production alternative").
 */
if (cluster.isPrimary || cluster.isMaster) {
  logger.info(`Cluster primary ${process.pid} starting ${env.CLUSTER_WORKERS} worker(s)`);

  for (let i = 0; i < env.CLUSTER_WORKERS; i += 1) {
    cluster.fork();
  }

  // Crash-loop guard: a worker that dies immediately after starting (e.g.
  // EADDRINUSE, a bad DB URI, a startup exception) would otherwise be
  // re-forked instantly forever, pinning a CPU core and flooding the logs.
  // We track recent exit timestamps and back off with a short delay once
  // restarts are happening faster than this threshold.
  const RAPID_RESTART_WINDOW_MS = 10000;
  const RAPID_RESTART_LIMIT = 5;
  const BACKOFF_DELAY_MS = 5000;
  let recentExitTimestamps = [];

  cluster.on('exit', (worker, code, signal) => {
    logger.warn({ pid: worker.process.pid, code, signal }, 'Worker exited');
    if (code === 0) return; // clean exit (e.g. SIGTERM shutdown) -> no replacement needed

    const now = Date.now();
    recentExitTimestamps = recentExitTimestamps.filter((t) => now - t < RAPID_RESTART_WINDOW_MS);
    recentExitTimestamps.push(now);

    if (recentExitTimestamps.length > RAPID_RESTART_LIMIT) {
      logger.error(
        { restarts: recentExitTimestamps.length, windowMs: RAPID_RESTART_WINDOW_MS },
        `Crash-loop detected, backing off ${BACKOFF_DELAY_MS}ms before forking replacement`
      );
      setTimeout(() => cluster.fork(), BACKOFF_DELAY_MS);
      return;
    }

    logger.info('Forking replacement worker...');
    cluster.fork();
  });

  process.on('SIGTERM', () => {
    logger.info('Primary received SIGTERM, shutting down all workers');
    for (const id in cluster.workers) {
      cluster.workers[id].process.kill('SIGTERM');
    }
    process.exit(0);
  });
} else {
  // Worker process: run the actual Express app + CPU monitor + scheduler.
  require('./server').main().catch((err) => {
    logger.error({ err }, 'Worker failed to start');
    process.exit(1);
  });
}
