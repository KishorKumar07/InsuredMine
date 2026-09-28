const { ok } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { scheduleMessage, getScheduledMessage, listScheduledMessages } = require('../services/messageService');

const createScheduledMessage = asyncHandler(async (req, res) => {
  const result = await scheduleMessage(req.body);
  return ok(res, result, 201);
});

const getScheduledMessageById = asyncHandler(async (req, res) => {
  const result = await getScheduledMessage(req.params.id);
  if (!result) return ok(res, null, 404);
  return ok(res, result);
});

const listScheduled = asyncHandler(async (req, res) => {
  const result = await listScheduledMessages(req.query);
  return ok(res, result);
});

module.exports = { createScheduledMessage, getScheduledMessageById, listScheduled };
