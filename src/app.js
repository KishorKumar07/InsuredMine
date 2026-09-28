const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

// Register every schema on the shared mongoose instance up front. Several
// services populate() references to models they don't query directly
// (e.g. policyService populating Policy.policyCategoryId/companyId/agentId),
// and Mongoose only knows about a model once its file has been required
// somewhere - so we do that once, here, rather than relying on every
// service to remember its own indirect populate() dependencies.
require('./models');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
  }

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
