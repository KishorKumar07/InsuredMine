/**
 * Upload ingestion worker (Task 1.1).
 *
 * Runs in a separate worker_thread so parsing + inserting a 1000+ row
 * CSV/XLSX file never blocks the Node event loop that's serving HTTP
 * requests on the main thread.
 *
 * IMPORTANT: a Mongoose/MongoDB connection holds live sockets and cannot be
 * shared across threads, so this worker creates and owns its own mongoose
 * connection completely independent from the main thread's.
 */
const { parentPort, workerData } = require('worker_threads');
const mongoose = require('mongoose');
const fs = require('fs');

const env = require('../config/env');
const { parseSheetFile } = require('../utils/fileParser');
const { normalizeRow } = require('../utils/normalizeRow');

// Re-register every schema against THIS thread's OWN mongoose instance -
// models registered on the main thread's mongoose do not carry over here.
// Using the central models/index.js (rather than hand-picking files, as
// this used to do) means a new collection added there is automatically
// available here too, with no risk of the two require lists drifting apart.
const { Agent, User, Account, PolicyCategory, Carrier, Policy, UploadJob } = require('../models');

const BATCH_SIZE = 500;

function post(message) {
  if (parentPort) parentPort.postMessage(message);
}

async function run() {
  const { filePath, jobId, deleteFileAfter = true, mongoUri } = workerData;

  // Prefer the URI passed explicitly via workerData over env.MONGO_URI.
  // Under Jest, the test environment's `process` is a sandboxed copy whose
  // env mutations (tests/setup.js setting process.env.MONGO_URI for the
  // in-memory Mongo instance) do NOT propagate to a real OS-level
  // worker_thread, which is spawned against the actual Node process. Passing
  // it explicitly avoids relying on that inheritance at all, which is also
  // simply more explicit/robust for production use.
  await mongoose.connect(mongoUri || env.MONGO_URI, { maxPoolSize: 5 });

  const counts = { agents: 0, users: 0, accounts: 0, categories: 0, carriers: 0, policies: 0 };
  const errors = [];

  try {
    await UploadJob.findByIdAndUpdate(jobId, { status: 'processing', startedAt: new Date() });

    const rawRows = await parseSheetFile(filePath);
    const totalRows = rawRows.length;
    await UploadJob.findByIdAndUpdate(jobId, { totalRows });
    post({ type: 'progress', totalRows, processedRows: 0 });

    // Normalize everything first so we can fail individual bad rows without
    // losing the rest, and so batch upserts below work off clean data.
    const normalized = [];
    rawRows.forEach((raw, idx) => {
      const rowNumber = idx + 2; // +1 for 0-index, +1 for header row
      try {
        normalized.push({ rowNumber, data: normalizeRow(raw, rowNumber) });
      } catch (err) {
        errors.push({ row: rowNumber, message: err.message });
      }
    });

    // ---- Pass 1: upsert dimension collections (Agent, LOB, Carrier) ----
    // These have no foreign keys, so they can be upserted in any order,
    // ahead of Users/Accounts/Policies which reference them.
    const agentNames = [...new Set(normalized.map((r) => r.data.agent?.name).filter(Boolean))];
    const categoryNames = [...new Set(normalized.map((r) => r.data.category.categoryName))];
    const companyNames = [...new Set(normalized.map((r) => r.data.carrier.companyName))];

    await bulkUpsertByKey(Agent, 'name', agentNames);
    await bulkUpsertByKey(PolicyCategory, 'categoryName', categoryNames);
    await bulkUpsertByKey(Carrier, 'companyName', companyNames);

    const agentIdMap = await loadIdMap(Agent, 'name', agentNames);
    const categoryIdMap = await loadIdMap(PolicyCategory, 'categoryName', categoryNames);
    const carrierIdMap = await loadIdMap(Carrier, 'companyName', companyNames);

    counts.agents = agentIdMap.size;
    counts.categories = categoryIdMap.size;
    counts.carriers = carrierIdMap.size;

    // ---- Pass 2: upsert Users in batches, building firstName+dob+email -> _id ----
    const userIdMap = new Map(); // key: firstName|dob|email -> ObjectId
    const userKeyFor = (u) => `${u.firstName}|${u.dob ? u.dob.getTime() : ''}|${u.email || ''}`;

    for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
      const batch = normalized.slice(i, i + BATCH_SIZE);
      const seenInBatch = new Map();
      for (const r of batch) {
        const key = userKeyFor(r.data.user);
        if (!seenInBatch.has(key)) seenInBatch.set(key, r.data.user);
      }
      const ops = [...seenInBatch.values()].map((user) => ({
        updateOne: {
          filter: { firstName: user.firstName, dob: user.dob, email: user.email },
          update: { $set: user },
          upsert: true,
        },
      }));
      if (ops.length) await User.bulkWrite(ops, { ordered: false });

      const found = await User.find(
        { firstName: { $in: [...seenInBatch.values()].map((u) => u.firstName) } },
        { firstName: 1, dob: 1, email: 1 }
      ).lean();
      for (const doc of found) {
        userIdMap.set(userKeyFor({ firstName: doc.firstName, dob: doc.dob, email: doc.email }), doc._id);
      }

      post({ type: 'progress', totalRows, processedRows: Math.min(i + BATCH_SIZE, normalized.length) });
    }
    counts.users = userIdMap.size;

    // ---- Pass 3: upsert Accounts (accountName + userId) ----
    const accountIdMap = new Map(); // key: accountName|userId -> ObjectId
    for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
      const batch = normalized.slice(i, i + BATCH_SIZE);
      const seenInBatch = new Map();
      for (const r of batch) {
        const userId = userIdMap.get(userKeyFor(r.data.user));
        if (!userId) continue; // user upsert failed for some reason; skip, will surface as policy error below
        const key = `${r.data.account.accountName}|${userId}`;
        if (!seenInBatch.has(key)) {
          seenInBatch.set(key, { accountName: r.data.account.accountName, accountType: r.data.account.accountType, userId });
        }
      }
      const ops = [...seenInBatch.values()].map((acc) => ({
        updateOne: {
          filter: { accountName: acc.accountName, userId: acc.userId },
          update: { $set: acc },
          upsert: true,
        },
      }));
      if (ops.length) await Account.bulkWrite(ops, { ordered: false });

      const found = await Account.find(
        { userId: { $in: [...new Set([...seenInBatch.values()].map((a) => a.userId))] } },
        { accountName: 1, userId: 1 }
      ).lean();
      for (const doc of found) {
        accountIdMap.set(`${doc.accountName}|${doc.userId}`, doc._id);
      }
    }
    counts.accounts = accountIdMap.size;

    // ---- Pass 4: upsert Policies (policyNumber is globally unique) ----
    for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
      const batch = normalized.slice(i, i + BATCH_SIZE);
      const ops = [];
      for (const r of batch) {
        const { data, rowNumber } = r;
        const userId = userIdMap.get(userKeyFor(data.user));
        const categoryId = categoryIdMap.get(data.category.categoryName);
        const companyId = carrierIdMap.get(data.carrier.companyName);
        const agentId = data.agent ? agentIdMap.get(data.agent.name) : undefined;
        const accountId = userId ? accountIdMap.get(`${data.account.accountName}|${userId}`) : undefined;

        if (!userId || !categoryId || !companyId) {
          errors.push({ row: rowNumber, message: 'Could not resolve user/category/company reference for policy upsert' });
          continue;
        }

        ops.push({
          updateOne: {
            filter: { policyNumber: data.policy.policyNumber },
            update: {
              $set: {
                ...data.policy,
                userId,
                policyCategoryId: categoryId,
                companyId,
                agentId,
                accountId,
              },
            },
            upsert: true,
          },
        });
      }
      if (ops.length) {
        const result = await Policy.bulkWrite(ops, { ordered: false });
        // matchedCount (not modifiedCount): with timestamps on, a re-upload
        // "modifies" every row, and counting it as modified/inserted is misleading.
        // upserted + matched = every policy row written, new or existing.
        counts.policies += (result.upsertedCount || 0) + (result.matchedCount || 0);
      }
    }

    await UploadJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      processedRows: totalRows,
      insertedCounts: counts,
      errors,
      finishedAt: new Date(),
    });

    post({ type: 'done', counts, errors, totalRows });
  } catch (err) {
    await UploadJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      failureReason: err.message,
      errors,
      finishedAt: new Date(),
    }).catch(() => {});
    post({ type: 'error', message: err.message });
    throw err;
  } finally {
    if (deleteFileAfter) {
      fs.promises.unlink(filePath).catch(() => {});
    }
    await mongoose.disconnect();
  }
}

/** Upserts a batch of unique string values into `field` on `Model`, ignoring duplicates. */
async function bulkUpsertByKey(Model, field, values) {
  if (!values.length) return;
  const ops = values.map((value) => ({
    updateOne: {
      filter: { [field]: value },
      update: { $setOnInsert: { [field]: value } },
      upsert: true,
    },
  }));
  await Model.bulkWrite(ops, { ordered: false });
}

/** Loads a Map of value -> _id for the given field/values from Model. */
async function loadIdMap(Model, field, values) {
  const map = new Map();
  if (!values.length) return map;
  const docs = await Model.find({ [field]: { $in: values } }, { [field]: 1 }).lean();
  for (const doc of docs) map.set(doc[field], doc._id);
  return map;
}

run().catch((err) => {
  // Ensure the worker exits non-zero so the parent's 'error'/exit-code
  // handling can distinguish a hard crash from a clean finish.
  // eslint-disable-next-line no-console
  console.error('Upload worker failed:', err);
  process.exitCode = 1;
});
