const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');

if (!fs.existsSync(env.UPLOAD_TMP_DIR)) {
  fs.mkdirSync(env.UPLOAD_TMP_DIR, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xlsm']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, env.UPLOAD_TMP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error(`Unsupported file type "${ext}". Only .csv and .xlsx are allowed.`));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

module.exports = { upload };
