const os = require('os');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Task 2.1: real-time CPU utilization tracking with restart-on-threshold.
 *
 * Windows (this dev machine's OS) always returns [0,0,0] from
 * os.loadavg(), so system load average is not a usable signal here.
 * Instead we sample THIS PROCESS's own CPU usage via process.cpuUsage(),
 * which works cross-platform and is what a Node server operator actually
 * cares about (this process hogging a core), not overall system noise.
 *
 * process.cpuUsage() returns cumulative microseconds of user+system CPU
 * time consumed by this process. Taking a delta over a wall-clock interval
 * and dividing by (interval * numCores) gives the percentage of total
 * available CPU capacity this process is using - i.e. 100% means the
 * process is fully saturating one core on an otherwise idle multi-core
 * machine only if we DON'T divide by numCores; we deliberately divide by a
 * single core's capacity (not all cores) because that mirrors what tools
 * like `top`/Task Manager show per-process, and is the more intuitive
 * "how hot is this one Node process running" number to alarm on.
 */
class CpuMonitor {
  constructor({
    thresholdPercent = env.CPU_THRESHOLD_PERCENT,
    intervalMs = env.CPU_SAMPLE_INTERVAL_MS,
    consecutiveSamplesRequired = env.CPU_CONSECUTIVE_SAMPLES,
    onThresholdExceeded = () => {},
  } = {}) {
    this.thresholdPercent = thresholdPercent;
    this.intervalMs = intervalMs;
    this.consecutiveSamplesRequired = consecutiveSamplesRequired;
    this.onThresholdExceeded = onThresholdExceeded;

    this._timer = null;
    this._lastCpuUsage = process.cpuUsage();
    this._lastSampleTime = process.hrtime.bigint();
    this._consecutiveHighSamples = 0;
    this._lastPercent = 0;
    this._triggered = false;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._sample(), this.intervalMs);
    this._timer.unref?.(); // don't keep the process alive just for monitoring
    logger.info(
      { threshold: this.thresholdPercent, intervalMs: this.intervalMs, samples: this.consecutiveSamplesRequired },
      'CPU monitor started'
    );
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  getLastPercent() {
    return this._lastPercent;
  }

  _sample() {
    const currentUsage = process.cpuUsage();
    const now = process.hrtime.bigint();

    const userDeltaUs = currentUsage.user - this._lastCpuUsage.user;
    const sysDeltaUs = currentUsage.system - this._lastCpuUsage.system;
    const cpuDeltaUs = userDeltaUs + sysDeltaUs;

    const elapsedNs = now - this._lastSampleTime;
    const elapsedUs = Number(elapsedNs) / 1000;

    this._lastCpuUsage = currentUsage;
    this._lastSampleTime = now;

    if (elapsedUs <= 0) return;

    const percent = (cpuDeltaUs / elapsedUs) * 100;
    this._lastPercent = Math.round(percent * 100) / 100;

    logger.debug({ percent: this._lastPercent }, 'CPU sample');

    if (this._lastPercent >= this.thresholdPercent) {
      this._consecutiveHighSamples += 1;
      logger.warn(
        { percent: this._lastPercent, threshold: this.thresholdPercent, consecutive: this._consecutiveHighSamples },
        'CPU usage above threshold'
      );
    } else {
      this._consecutiveHighSamples = 0;
    }

    if (this._consecutiveHighSamples >= this.consecutiveSamplesRequired && !this._triggered) {
      this._triggered = true; // fire once; the process is about to restart
      logger.error(
        { percent: this._lastPercent, samples: this._consecutiveHighSamples },
        'CPU threshold sustained -> triggering restart'
      );
      this.onThresholdExceeded(this._lastPercent);
    }
  }
}

module.exports = { CpuMonitor, numCpus: os.cpus().length };
