/**
 * Regression test for a real bug found during manual smoke-testing:
 * GET /api/policies/search populates Policy.policyCategoryId / companyId /
 * agentId / accountId, but policyService.js only directly require()'d the
 * User and Policy models. Mongoose only knows about a model once its file
 * has been require()'d somewhere on that connection, so populate() for the
 * other four models threw "Schema hasn't been registered for model ...".
 *
 * It was masked in the other integration test files because each of them
 * imports Agent/Account/PolicyCategory/Carrier directly (to seed fixtures),
 * which incidentally registered the models before the query ran. This file
 * deliberately does NOT import those models directly - it only imports the
 * app and drives everything through mongoose IDs, the way an already-
 * populated production database + a fresh process actually would.
 */
const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../../src/app');

const app = createApp();

describe('model registration (populate across unrelated models)', () => {
  test('search results resolve category/carrier/agent/account without throwing', async () => {
    const db = mongoose.connection.db;

    const categoryId = new mongoose.Types.ObjectId();
    const carrierId = new mongoose.Types.ObjectId();
    const agentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const accountId = new mongoose.Types.ObjectId();

    await db.collection('policycategories').insertOne({ _id: categoryId, categoryName: 'Personal Auto' });
    await db.collection('carriers').insertOne({ _id: carrierId, companyName: 'Test Carrier' });
    await db.collection('agents').insertOne({ _id: agentId, name: 'Test Agent' });
    await db.collection('users').insertOne({ _id: userId, firstName: 'Regression Tester', email: 'reg@test.com' });
    await db.collection('accounts').insertOne({ _id: accountId, accountName: 'Regression Tester', userId });
    await db.collection('policies').insertOne({
      _id: new mongoose.Types.ObjectId(),
      policyNumber: 'REG-TEST-1',
      policyCategoryId: categoryId,
      companyId: carrierId,
      agentId,
      accountId,
      userId,
    });

    const res = await request(app).get('/api/policies/search').query({ username: 'Regression' });

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0].policyCategoryId.categoryName).toBe('Personal Auto');
    expect(res.body.data.results[0].companyId.companyName).toBe('Test Carrier');
    expect(res.body.data.results[0].agentId.name).toBe('Test Agent');
    expect(res.body.data.results[0].accountId.accountName).toBe('Regression Tester');
  });
});
