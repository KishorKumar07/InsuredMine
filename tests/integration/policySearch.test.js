const request = require('supertest');
const { createApp } = require('../../src/app');

const Agent = require('../../src/models/Agent');
const User = require('../../src/models/User');
const PolicyCategory = require('../../src/models/PolicyCategory');
const Carrier = require('../../src/models/Carrier');
const Policy = require('../../src/models/Policy');

const app = createApp();

async function seed() {
  const agent = await Agent.create({ name: 'Alex Watson' });
  const category = await PolicyCategory.create({ categoryName: 'Personal Auto' });
  const carrier = await Carrier.create({ companyName: 'Nationwide Mut Ins Co' });

  const userA = await User.create({ firstName: 'Lura Lucca', email: 'lura@example.com' });
  const userB = await User.create({ firstName: 'Torie Buchanan', email: 'torie@example.com' });

  await Policy.create([
    {
      policyNumber: 'POL-A-1',
      policyCategoryId: category._id,
      companyId: carrier._id,
      userId: userA._id,
      agentId: agent._id,
      premiumAmount: 100,
      policyStartDate: new Date('2020-01-01'),
    },
    {
      policyNumber: 'POL-A-2',
      policyCategoryId: category._id,
      companyId: carrier._id,
      userId: userA._id,
      agentId: agent._id,
      premiumAmount: 200,
      policyStartDate: new Date('2021-01-01'),
    },
    {
      policyNumber: 'POL-B-1',
      policyCategoryId: category._id,
      companyId: carrier._id,
      userId: userB._id,
      agentId: agent._id,
      premiumAmount: 50,
      policyStartDate: new Date('2019-01-01'),
    },
  ]);

  return { userA, userB, agent, category, carrier };
}

describe('GET /api/policies/search', () => {
  test('400 when username is missing', async () => {
    const res = await request(app).get('/api/policies/search');
    expect(res.status).toBe(400);
  });

  test('returns empty results for a name that matches nobody', async () => {
    await seed();
    const res = await request(app).get('/api/policies/search').query({ username: 'Nobody Here' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.results).toEqual([]);
  });

  test('finds policies by a partial, case-insensitive username match', async () => {
    await seed();
    const res = await request(app).get('/api/policies/search').query({ username: 'lura' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.results).toHaveLength(2);
    expect(res.body.data.results.every((p) => p.userId.firstName === 'Lura Lucca')).toBe(true);
  });

  test('populates category, carrier, and agent references', async () => {
    await seed();
    const res = await request(app).get('/api/policies/search').query({ username: 'Torie' });
    const [policy] = res.body.data.results;
    expect(policy.policyCategoryId.categoryName).toBe('Personal Auto');
    expect(policy.companyId.companyName).toBe('Nationwide Mut Ins Co');
    expect(policy.agentId.name).toBe('Alex Watson');
  });

  test('respects pagination', async () => {
    await seed();
    const res = await request(app).get('/api/policies/search').query({ username: 'Lura', page: 1, limit: 1 });
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.total).toBe(2);
  });
});
