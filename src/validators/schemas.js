const Joi = require('joi');

const searchPolicyQuery = Joi.object({
  username: Joi.string().trim().min(1).required(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const aggregateQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const scheduleMessageBody = Joi.object({
  message: Joi.string().trim().min(1).max(2000).required(),
  day: Joi.string().trim().required(),
  time: Joi.string().trim().required(),
  timezoneOffsetMinutes: Joi.number().integer().min(-840).max(840).default(0),
});

const listScheduledQuery = Joi.object({
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = { searchPolicyQuery, aggregateQuery, scheduleMessageBody, listScheduledQuery };
