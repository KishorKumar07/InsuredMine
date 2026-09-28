const mongoose = require('mongoose');
const User = require('../models/User');
const Policy = require('../models/Policy');
const { escapeRegex } = require('../utils/escapeRegex');

// NOTE: Policy.populate() below references PolicyCategory/Carrier/Agent/
// Account, which must be registered on this mongoose instance even though
// this file doesn't query them directly. That registration is guaranteed
// once, up front, by require('../models') in app.js - don't remove that.

/**
 * Task 1.2: search policy info by username.
 *
 * The sample sheet has no dedicated "username" column, so we treat
 * `firstname` (the full name string in the sheet) as the username to
 * search on. Matching is case-insensitive and partial (substring), which
 * is friendlier for a UI search box than an exact match.
 */
async function searchPoliciesByUsername({ username, page = 1, limit = 20 }) {
  if (!username || !username.trim()) {
    const err = new Error('username query parameter is required');
    err.status = 400;
    throw err;
  }

  const regex = new RegExp(escapeRegex(username.trim()), 'i');
  const matchingUsers = await User.find({ firstName: regex }, { _id: 1 }).lean();
  const userIds = matchingUsers.map((u) => u._id);

  if (!userIds.length) {
    return { total: 0, page: Number(page), limit: Number(limit), results: [] };
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [results, total] = await Promise.all([
    Policy.find({ userId: { $in: userIds } })
      .populate('userId', 'firstName email phone state zipCode')
      .populate('policyCategoryId', 'categoryName')
      .populate('companyId', 'companyName')
      .populate('agentId', 'name')
      .populate('accountId', 'accountName accountType')
      .sort({ policyStartDate: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Policy.countDocuments({ userId: { $in: userIds } }),
  ]);

  return { total, page: Number(page), limit: Number(limit), results };
}

/**
 * Task 1.3: aggregated policy info per user - total policy count, total
 * premium, and the list of policies, grouped via the aggregation pipeline.
 */
async function getAggregatedPoliciesByUser({ page = 1, limit = 20 }) {
  const skip = (Number(page) - 1) * Number(limit);

  const pipeline = [
    {
      $group: {
        _id: '$userId',
        totalPolicies: { $sum: 1 },
        totalPremium: { $sum: { $ifNull: ['$premiumAmount', 0] } },
        policies: {
          $push: {
            policyNumber: '$policyNumber',
            policyStartDate: '$policyStartDate',
            policyEndDate: '$policyEndDate',
            premiumAmount: '$premiumAmount',
            policyCategoryId: '$policyCategoryId',
            companyId: '$companyId',
          },
        },
      },
    },
    { $sort: { totalPolicies: -1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: Number(limit) },
          {
            $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' },
          },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              userId: '$_id',
              firstName: '$user.firstName',
              email: '$user.email',
              totalPolicies: 1,
              totalPremium: { $round: ['$totalPremium', 2] },
              policies: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await Policy.aggregate(pipeline);
  const data = result?.data || [];
  const total = result?.totalCount?.[0]?.count || 0;

  return { total, page: Number(page), limit: Number(limit), results: data };
}

/**
 * Aggregated policies for a single user by userId.
 */
async function getAggregatedPoliciesForUser(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const err = new Error('Invalid userId');
    err.status = 400;
    throw err;
  }

  const pipeline = [
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $lookup: { from: 'policycategories', localField: 'policyCategoryId', foreignField: '_id', as: 'category' },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: 'carriers', localField: 'companyId', foreignField: '_id', as: 'carrier' },
    },
    { $unwind: { path: '$carrier', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$userId',
        totalPolicies: { $sum: 1 },
        totalPremium: { $sum: { $ifNull: ['$premiumAmount', 0] } },
        policies: {
          $push: {
            policyNumber: '$policyNumber',
            policyStartDate: '$policyStartDate',
            policyEndDate: '$policyEndDate',
            premiumAmount: '$premiumAmount',
            category: '$category.categoryName',
            carrier: '$carrier.companyName',
          },
        },
      },
    },
    {
      $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        firstName: '$user.firstName',
        email: '$user.email',
        totalPolicies: 1,
        totalPremium: { $round: ['$totalPremium', 2] },
        policies: 1,
      },
    },
  ];

  const [result] = await Policy.aggregate(pipeline);
  return result || { userId, totalPolicies: 0, totalPremium: 0, policies: [] };
}

module.exports = { searchPoliciesByUsername, getAggregatedPoliciesByUser, getAggregatedPoliciesForUser };
