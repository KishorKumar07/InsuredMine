const ScheduledMessage = require('../models/ScheduledMessage');
const Message = require('../models/Message');
const env = require('../config/env');
const logger = require('../config/logger');

// A claimed job that hasn't finished within this window is assumed orphaned.
const STALE_PROCESSING_MS = 60 * 1000;

/**
 * Task 2.2 delivery mechanism.
 *
 * Deliberately NOT a setTimeout/setInterval-per-job or an in-memory queue:
 * Task 2.1 can kill and restart this very process at any moment (on
 * sustained high CPU), which would silently drop any in-memory timers.
 * Instead, every scheduled message is a persisted document with a
 * `scheduledAt` instant, and a lightweight poller periodically claims and
 * delivers anything that is due - including jobs that came due WHILE the
 * server was down, since the query is a plain "scheduledAt <= now" scan,
 * not a relative countdown.
 *
 * The claim step (findOneAndUpdate pending->processing) is atomic, so if
 * this ever runs with multiple cluster workers/processes polling the same
 * collection, a given ScheduledMessage is only ever delivered once.
 */
class MessageScheduler {
  constructor({ pollIntervalMs = env.SCHEDULER_POLL_INTERVAL_MS } = {}) {
    this.pollIntervalMs = pollIntervalMs;
    this._timer = null;
    this._running = false;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._pollOnce(), this.pollIntervalMs);
    this._timer.unref?.();
    logger.info({ intervalMs: this.pollIntervalMs }, 'Message scheduler started');
    // Also run once immediately so missed jobs (server was down) are
    // recovered right away instead of waiting a full interval.
    this._pollOnce();
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async _pollOnce() {
    if (this._running) return; // don't overlap runs if one poll takes longer than the interval
    this._running = true;
    try {
      // Drain all currently-due jobs, not just one, each poll tick.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const now = new Date();
        // Also reclaim jobs stuck in 'processing' (the worker that claimed
        // them died before delivering, e.g. a CPU-triggered restart).
        const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
        const claimed = await ScheduledMessage.findOneAndUpdate(
          {
            $or: [
              { status: 'pending', scheduledAt: { $lte: now } },
              { status: 'processing', updatedAt: { $lte: staleBefore } },
            ],
          },
          { $set: { status: 'processing' }, $inc: { attempts: 1 } },
          { sort: { scheduledAt: 1 }, new: true }
        );
        if (!claimed) break;
        await this._deliver(claimed);
      }
    } catch (err) {
      logger.error({ err }, 'Message scheduler poll failed');
    } finally {
      this._running = false;
    }
  }

  async _deliver(scheduledMessage) {
    try {
      const msg = await Message.create({
        message: scheduledMessage.message,
        scheduledMessageId: scheduledMessage._id,
        deliveredAt: new Date(),
      });
      await ScheduledMessage.findByIdAndUpdate(scheduledMessage._id, {
        status: 'completed',
        processedAt: new Date(),
        resultingMessageId: msg._id,
      });
      logger.info({ id: scheduledMessage._id.toString() }, 'Scheduled message delivered');
    } catch (err) {
      logger.error({ id: scheduledMessage._id.toString(), err }, 'Failed to deliver scheduled message');
      await ScheduledMessage.findByIdAndUpdate(scheduledMessage._id, {
        status: 'pending', // put it back so the next poll retries it
        lastError: err.message,
      }).catch(() => {});
    }
  }
}

module.exports = { MessageScheduler };
