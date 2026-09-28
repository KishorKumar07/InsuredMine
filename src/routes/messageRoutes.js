const express = require('express');
const { validate } = require('../middlewares/validate');
const { scheduleMessageBody, listScheduledQuery } = require('../validators/schemas');
const {
  createScheduledMessage,
  getScheduledMessageById,
  listScheduled,
} = require('../controllers/messageController');

const router = express.Router();

// POST /api/messages/schedule  { message, day, time, timezoneOffsetMinutes? }  (Task 2.2)
router.post('/schedule', validate(scheduleMessageBody, 'body'), createScheduledMessage);

// GET /api/messages/schedule/:id
router.get('/schedule/:id', getScheduledMessageById);

// GET /api/messages/schedule?status=&page=&limit=
router.get('/schedule', validate(listScheduledQuery, 'query'), listScheduled);

module.exports = router;
