const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);

/**
 * Connect the given mongoose instance (default: the shared singleton) to MongoDB.
 * Worker threads must call this with their OWN mongoose require, since a
 * mongoose connection (and its socket) cannot be shared across threads.
 */
async function connectDB(uri = env.MONGO_URI, mongooseInstance = mongoose) {
  mongooseInstance.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
  });
  mongooseInstance.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  await mongooseInstance.connect(uri, {
    maxPoolSize: 10,
  });
  logger.info(`MongoDB connected -> ${uri}`);
  return mongooseInstance.connection;
}

async function disconnectDB(mongooseInstance = mongoose) {
  await mongooseInstance.disconnect();
}

module.exports = { connectDB, disconnectDB, mongoose };
