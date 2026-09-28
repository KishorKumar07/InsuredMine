const request = require('supertest');
const { createApp } = require('../../src/app');
const ScheduledMessage = require('../../src/models/ScheduledMessage');
const Message = require('../../src/models/Message');
const { MessageScheduler } = require('../../src/scheduler/messageScheduler');

const app = createApp();

function futureDayTime(msFromNow) {
  const d = new Date(Date.now() + msFromNow);
  const day = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return { day, time };
}

describe('POST /api/messages/schedule', () => {
  test('validates required fields', async () => {
    const res = await request(app).post('/api/messages/schedule').send({});
    expect(res.status).toBe(400);
  });

  test('rejects a schedule time in the past', async () => {
    const res = await request(app)
      .post('/api/messages/schedule')
      .send({ message: 'hello', day: '2000-01-01', time: '00:00' });
    expect(res.status).toBe(400);
  });

  test('rejects malformed time', async () => {
    const { day } = futureDayTime(60_000);
    const res = await request(app)
      .post('/api/messages/schedule')
      .send({ message: 'hello', day, time: 'not-a-time' });
    expect(res.status).toBe(400);
  });

  test('creates a pending scheduled message for a valid future day/time', async () => {
    const { day, time } = futureDayTime(5 * 60_000);
    const res = await request(app).post('/api/messages/schedule').send({ message: 'Happy Birthday!', day, time });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.message).toBe('Happy Birthday!');

    const stored = await ScheduledMessage.findById(res.body.data._id);
    expect(stored).not.toBeNull();
    expect(stored.status).toBe('pending');
  });
});

describe('GET /api/messages/schedule/:id and listing', () => {
  test('fetches a single scheduled message by id', async () => {
    const { day, time } = futureDayTime(60_000);
    const created = await request(app).post('/api/messages/schedule').send({ message: 'x', day, time });
    const res = await request(app).get(`/api/messages/schedule/${created.body.data._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('x');
  });

  test('lists scheduled messages filtered by status', async () => {
    const { day, time } = futureDayTime(60_000);
    await request(app).post('/api/messages/schedule').send({ message: 'a', day, time });
    await request(app).post('/api/messages/schedule').send({ message: 'b', day, time });

    const res = await request(app).get('/api/messages/schedule').query({ status: 'pending' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);
  });
});

describe('MessageScheduler delivery', () => {
  test('delivers a due message into the Message collection and marks it completed', async () => {
    const scheduled = await ScheduledMessage.create({
      message: 'Deliver me',
      day: '2020-01-01',
      time: '00:00',
      scheduledAt: new Date(Date.now() - 1000), // already due
      status: 'pending',
    });

    const scheduler = new MessageScheduler({ pollIntervalMs: 999999 });
    await scheduler._pollOnce();

    const updated = await ScheduledMessage.findById(scheduled._id);
    expect(updated.status).toBe('completed');
    expect(updated.resultingMessageId).toBeDefined();

    const delivered = await Message.findById(updated.resultingMessageId);
    expect(delivered.message).toBe('Deliver me');
  });

  test('does not deliver a message whose time has not yet arrived', async () => {
    await ScheduledMessage.create({
      message: 'Not yet',
      day: '2099-01-01',
      time: '00:00',
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      status: 'pending',
    });

    const scheduler = new MessageScheduler({ pollIntervalMs: 999999 });
    await scheduler._pollOnce();

    const count = await Message.countDocuments({ message: 'Not yet' });
    expect(count).toBe(0);
  });

  test('recovers a message that was due while the "server was down" (simulated restart)', async () => {
    // Simulate: message became due 10 minutes ago, but no poller was running
    // (e.g. the process had just been restarted by the CPU monitor).
    await ScheduledMessage.create({
      message: 'Missed while down',
      day: '2020-01-01',
      time: '00:00',
      scheduledAt: new Date(Date.now() - 10 * 60 * 1000),
      status: 'pending',
    });

    // A fresh scheduler instance starting up (as would happen on process boot)
    const scheduler = new MessageScheduler({ pollIntervalMs: 999999 });
    await scheduler._pollOnce();

    const delivered = await Message.findOne({ message: 'Missed while down' });
    expect(delivered).not.toBeNull();
  });
});
