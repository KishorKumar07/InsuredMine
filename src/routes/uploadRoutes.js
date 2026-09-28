const express = require('express');
const { upload } = require('../middlewares/upload');
const { uploadFile, getUploadStatus } = require('../controllers/uploadController');

const router = express.Router();

// POST /api/upload  (multipart/form-data, field name: "file")
router.post('/', upload.single('file'), uploadFile);

// GET /api/upload/:jobId
router.get('/:jobId', getUploadStatus);

module.exports = router;
