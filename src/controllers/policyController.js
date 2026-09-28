const { ok } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/asyncHandler');
const {
  searchPoliciesByUsername,
  getAggregatedPoliciesByUser,
  getAggregatedPoliciesForUser,
} = require('../services/policyService');

const searchByUsername = asyncHandler(async (req, res) => {
  const result = await searchPoliciesByUsername(req.query);
  return ok(res, result);
});

const aggregateByUser = asyncHandler(async (req, res) => {
  const result = await getAggregatedPoliciesByUser(req.query);
  return ok(res, result);
});

const aggregateForOneUser = asyncHandler(async (req, res) => {
  const result = await getAggregatedPoliciesForUser(req.params.userId);
  return ok(res, result);
});

module.exports = { searchByUsername, aggregateByUser, aggregateForOneUser };
