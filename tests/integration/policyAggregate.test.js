const request = require('supertest');
const { createApp } = require('../../src/app');

const User = require('../../src/models/User');
const PolicyCategory = require('../../src/models/PolicyCategory');
const Carrier = require('../../src/models/Carrier');
const Policy = require('../../src/models/Policy');

const app = createApp();

async function seed() {
  const category = await PolicyCategory.create({ categoryName: 'Homeowners' });
  const carrier = await Carrier.create({ companyName: 'Integon Gen Ins Corp' });
  const userA = await User.create({ firstName: 'Lura Lucca', email: 'lura@example.com' });
  const userB = await User.create({ firstName: 'Torie Buchanan', email: 'torie@example.com' });

  await Policy.create([
    { policyNumber: 'AGG-1', policyCategoryId: category._id, companyId: carrier._id, userId: userA._id, premiumAmount: 100 },
    { policyNumber: 'AGG-2', policyCategoryId: category._id, companyId: carrier._id, userId: userA._id, premiumAmount: 250.5 },
    { policyNumber: 'AGG-3', policyCategoryId: category._id, companyId: carrier._id, userId: userB._id, premiumAmount: 75 },
  ]);

  return { userA, userB };
}

describe('GET /api/policies/aggregate', () => {
  test('groups policies by user with total count and total premium', async () => {
    await seed();
    const res = await request(app).get('/api/policies/aggregate');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);

    const lura = res.body.data.results.find((r) => r.firstName === 'Lura Lucca');
    expect(lura.totalPolicies).toBe(2);
    expect(lura.totalPremium).toBeCloseTo(350.5);
    expect(lura.policies).toHaveLength(2);
  });

  test('sorts users by descending policy count', async () => {
    await seed();
    const res = await request(app).get('/api/policies/aggregate');
    const counts = res.body.data.results.map((r) => r.totalPolicies);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});

describe('GET /api/policies/aggregate/:userId', () => {
  test('returns aggregated info for a single user', async () => {
    const { userA } = await seed();
    const res = await request(app).get(`/api/policies/aggregate/${userA._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalPolicies).toBe(2);
    expect(res.body.data.policies[0].category).toBe('Homeowners');
    expect(res.body.data.policies[0].carrier).toBe('Integon Gen Ins Corp');
  });

  test('400 for an invalid userId', async () => {
    const res = await request(app).get('/api/policies/aggregate/not-an-id');
    expect(res.status).toBe(400);
  });
});
