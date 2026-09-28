const { ok } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/asyncHandler');

/**
 * Dev-only endpoint that burns CPU for a while so a reviewer can trigger
 * and observe the Task 2.1 CPU-threshold restart on demand, without an
 * external load-testing tool.
 *
 * IMPORTANT: the busy-work runs in short chunks separated by
 * setImmediate() yields, rather than one long unbroken while-loop. A fully
 * unbroken loop starves the event loop, which also blocks the CpuMonitor's
 * own setInterval sampler from ticking - so no samples get recorded DURING
 * the stress, and the monitor only sees one high reading right after it
 * ends (never reaching CPU_CONSECUTIVE_SAMPLES). Yielding periodically
 * keeps the process legitimately CPU-hot while still letting the sampler
 * run on schedule, which is what actually demonstrates the restart.
 *
 * NOT mounted in production (see routes/index.js).
 */
const stressCpu = asyncHandler(async (req, res) => {
  const durationMs = Math.min(parseInt(req.query.durationMs, 10) || 8000, 30000);
  const end = Date.now() + durationMs;

  while (Date.now() < end) {
    const chunkEnd = Date.now() + 50; // burn CPU for a 50ms chunk...
    // eslint-disable-next-line no-empty
    while (Date.now() < chunkEnd) {
      for (let i = 0; i < 1e5; i += 1) Math.sqrt(i);
    }
    await new Promise((resolve) => setImmediate(resolve)); // ...then yield briefly
  }

  return ok(res, { message: `Burned CPU for ~${durationMs}ms`, pid: process.pid });
});

module.exports = { stressCpu };
