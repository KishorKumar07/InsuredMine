const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  // Expose the URI explicitly (rather than reaching into mongoose
  // connection internals) so other test files - e.g. the upload worker
  // thread, which opens its OWN connection - can point at the same
  // in-memory instance via process.env.MONGO_URI.
  process.env.MONGO_URI = uri;
  global.__MONGO_URI__ = uri;
  await mongoose.connect(uri, { maxPoolSize: 5 });
}, 60000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}, 30000);
