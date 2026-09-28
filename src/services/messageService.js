const ScheduledMessage = require('../models/ScheduledMessage');
const { resolveSchedule } = require('../utils/resolveSchedule');

async function scheduleMessage({ message, day, time, timezoneOffsetMinutes = 0 }) {
  if (!message || !String(message).trim()) {
    const err = new Error('message is required');
    err.status = 400;
    throw err;
  }
  if (!day || !time) {
    const err = new Error('day and time are required');
    err.status = 400;
    throw err;
  }

  let scheduledAt;
  try {
    scheduledAt = resolveSchedule({ day, time, timezoneOffsetMinutes });
  } catch (err) {
    err.status = 400;
    throw err;
  }

  if (scheduledAt.getTime() <= Date.now()) {
    const err = new Error('Resolved schedule time is in the past');
    err.status = 400;
    throw err;
  }

  const doc = await ScheduledMessage.create({
    message: message.trim(),
    day: String(day),
    time: String(time),
    timezoneOffsetMinutes,
    scheduledAt,
    status: 'pending',
  });

  return doc.toObject();
}

async function getScheduledMessage(id) {
  return ScheduledMessage.findById(id).lean();
}

async function listScheduledMessages({ status, page = 1, limit = 20 }) {
  const filter = status ? { status } : {};
  const skip = (Number(page) - 1) * Number(limit);
  const [results, total] = await Promise.all([
    ScheduledMessage.find(filter).sort({ scheduledAt: 1 }).skip(skip).limit(Number(limit)).lean(),
    ScheduledMessage.countDocuments(filter),
  ]);
  return { total, page: Number(page), limit: Number(limit), results };
}

module.exports = { scheduleMessage, getScheduledMessage, listScheduledMessages };
