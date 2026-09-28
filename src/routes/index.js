const express = require('express');
const env = require('../config/env');
const { ok } = require('../utils/apiResponse');

const uploadRoutes = require('./uploadRoutes');
const policyRoutes = require('./policyRoutes');
const messageRoutes = require('./messageRoutes');

const router = express.Router();

router.get('/health', (req, res) =>
  ok(res, { status: 'up', pid: process.pid, uptimeSec: Math.round(process.uptime()) })
);

router.use('/upload', uploadRoutes);
router.use('/policies', policyRoutes);
router.use('/messages', messageRoutes);

// Dev-only CPU stress endpoint for demoing Task 2.1's restart behaviour.
if (env.NODE_ENV !== 'production') {
  const { stressCpu } = require('../controllers/debugController');
  router.get('/debug/cpu-stress', stressCpu);
}

module.exports = router;
