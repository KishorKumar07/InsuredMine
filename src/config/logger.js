const pino = require('pino');
const env = require('./env');

// pino-pretty is optional; fall back to plain JSON logs if it isn't installed
// so the app never fails to boot purely because of log formatting.
let transport;
if (env.NODE_ENV === 'development') {
  try {
    require.resolve('pino-pretty');
    transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } };
  } catch (_err) {
    transport = undefined;
  }
}

const logger = pino({
  level: process.env.LOG_LEVEL || (env.NODE_ENV === 'test' ? 'silent' : 'info'),
  transport,
});

module.exports = logger;
