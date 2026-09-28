const path = require('path');
const fs = require('fs');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../../src/app');

const Agent = require('../../src/models/Agent');
const User = require('../../src/models/User');
const Account = require('../../src/models/Account');
const PolicyCategory = require('../../src/models/PolicyCategory');
const Carrier = require('../../src/models/Carrier');
const Policy = require('../../src/models/Policy');
const UploadJob = require('../../src/models/UploadJob');

const app = createApp();
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'sample-small.csv');

// The upload worker_thread connects to MongoDB independently, using the
// mongoUri passed explicitly via workerData (see uploadService.js), which
// in turn comes from env.MONGO_URI / process.env.MONGO_URI. tests/setup.js
// sets that env var to the in-memory Mongo server's URI before any test
// runs, so the worker points at the same instance as the main thread's
// mongoose connection used in this file.

async function waitForJobCompletion(jobId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(app).get(`/api/upload/${jobId}`);
    if (['completed', 'failed'].includes(res.body.data.status)) return res.body.data;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Timed out waiting for upload job to complete');
}

describe('POST /api/upload (worker-thread ingestion)', () => {
  test('rejects requests with no file', async () => {
    const res = await request(app).post('/api/upload');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects unsupported file types', async () => {
    const txtPath = path.join(__dirname, '..', 'fixtures', 'not-allowed.txt');
    fs.writeFileSync(txtPath, 'hello');
    const res = await request(app).post('/api/upload').attach('file', txtPath);
    fs.unlinkSync(txtPath);
    expect(res.status).toBe(400);
  });

  test('parses a CSV via a worker thread and populates all 6 collections', async () => {
    const res = await request(app).post('/api/upload').attach('file', FIXTURE);
    expect(res.status).toBe(202);
    expect(res.body.data.jobId).toBeDefined();

    const job = await waitForJobCompletion(res.body.data.jobId);
    expect(job.status).toBe('completed');
    expect(job.totalRows).toBe(5);
    expect(job.errors).toHaveLength(0);

    // 2 distinct agents in the fixture (Alex Watson, John Snow); one blank agent row.
    expect(await Agent.countDocuments()).toBe(2);
    // "Lura Lucca" appears twice with the SAME email+dob -> dedups to 1 user.
    // Total distinct users: Lura Lucca, Torie Buchanan, Vergie Hardesty, Humberto Boykins = 4
    expect(await User.countDocuments()).toBe(4);
    // Accounts: Lura Lucca has 2 different account_name values -> 2 account docs for her.
    expect(await Account.countDocuments()).toBe(5);
    expect(await PolicyCategory.countDocuments()).toBe(3); // Commercial Auto, Personal Auto, Homeowners
    expect(await Carrier.countDocuments()).toBe(4);
    expect(await Policy.countDocuments()).toBe(5);

    const luraUser = await User.findOne({ firstName: 'Lura Lucca' }).lean();
    expect(luraUser).not.toBeNull();
    const luraPolicies = await Policy.find({ userId: luraUser._id }).lean();
    expect(luraPolicies).toHaveLength(2);
  }, 30000);

  test('re-uploading the same file is idempotent (no duplicate documents)', async () => {
    const res1 = await request(app).post('/api/upload').attach('file', FIXTURE);
    await waitForJobCompletion(res1.body.data.jobId);
    const policyCountAfterFirst = await Policy.countDocuments();

    const res2 = await request(app).post('/api/upload').attach('file', FIXTURE);
    await waitForJobCompletion(res2.body.data.jobId);
    const policyCountAfterSecond = await Policy.countDocuments();

    expect(policyCountAfterSecond).toBe(policyCountAfterFirst);
  }, 30000);
});

describe('GET /api/upload/:jobId', () => {
  test('returns 404 for an unknown job id', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/upload/${fakeId}`);
    expect(res.status).toBe(404);
  });

  test('returns job metadata for a real job', async () => {
    const job = await UploadJob.create({ originalFileName: 'x.csv', status: 'queued' });
    const res = await request(app).get(`/api/upload/${job._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('queued');
  });
});
