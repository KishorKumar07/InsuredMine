const express = require('express');
const { validate } = require('../middlewares/validate');
const { searchPolicyQuery, aggregateQuery } = require('../validators/schemas');
const { searchByUsername, aggregateByUser, aggregateForOneUser } = require('../controllers/policyController');

const router = express.Router();

// GET /api/policies/search?username=...&page=&limit=   (Task 1.2)
router.get('/search', validate(searchPolicyQuery, 'query'), searchByUsername);

// GET /api/policies/aggregate?page=&limit=              (Task 1.3)
router.get('/aggregate', validate(aggregateQuery, 'query'), aggregateByUser);

// GET /api/policies/aggregate/:userId                   (Task 1.3, single user)
router.get('/aggregate/:userId', aggregateForOneUser);

module.exports = router;
