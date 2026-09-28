const logger = require('../config/logger');

/**
 * Stops accepting new HTTP connections, lets in-flight requests finish
 * (bounded by a timeout), closes the DB connection, then exits.
 * Used both for signal-based shutdown and for the CPU-triggered restart.
 *
 * NOTE: server.close()'s callback only fires once every in-flight request
 * has finished. A handler that occupies the event loop for a long time
 * (e.g. the dev-only /api/debug/cpu-stress endpoint, by design, or a real
 * pathological handler) delays that callback - which is exactly the
 * scenario the forceTimer below exists to bound: after timeoutMs we stop
 * waiting and exit anyway, skipping a clean mongoose.disconnect(). The
 * cluster primary still forks a healthy replacement either way (see
 * cluster.js), so overall availability is unaffected; only that one
 * worker's shutdown was "hard" instead of "graceful". This is called out
 * explicitly in the README's CPU monitor demo section.
 */
function gracefulShutdown(server, { mongooseInstance, timeoutMs = 10000, exitCode = 0 } = {}) {
  let called = false;
  return function shutdown(reason) {
    if (called) return;
    called = true;
    logger.info({ reason }, 'Starting graceful shutdown');

    const forceTimer = setTimeout(() => {
      logger.warn('Graceful shutdown timed out, forcing exit');
      process.exit(exitCode);
    }, timeoutMs);
    forceTimer.unref?.();

    server.close(async () => {
      try {
        if (mongooseInstance) await mongooseInstance.disconnect();
      } catch (err) {
        logger.error({ err }, 'Error disconnecting MongoDB during shutdown');
      } finally {
        clearTimeout(forceTimer);
        logger.info('Graceful shutdown complete');
        process.exit(exitCode);
      }
    });
  };
}

module.exports = { gracefulShutdown };
