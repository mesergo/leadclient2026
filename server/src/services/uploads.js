const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

fs.mkdirSync(config.uploadDir, { recursive: true });

// Uploads are served from the app's own origin, so only plain, non-scriptable types are
// accepted (no .html/.svg/.js/.xml ...) — see also the /uploads headers in index.js.
const IMAGE = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const AUDIO = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'];
const DOCS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.ppt', '.pptx', '.zip'];
const KINDS = { image: IMAGE, audio: AUDIO, file: [...IMAGE, ...AUDIO, ...DOCS] };
const extOf = (name) => path.extname(String(name || '')).toLowerCase();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${extOf(file.originalname)}`),
});

const make = (allowed) => multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (allowed.includes(extOf(file.originalname))
    ? cb(null, true)
    : cb(Object.assign(new Error('סוג קובץ לא נתמך'), { status: 400, expose: true }))),
});

const uploadImage = make(KINDS.image);
const uploadAudio = make(KINDS.audio);
const uploadFile = make(KINDS.file);
const fileUrl = (filename) => `/uploads/${filename}`;

// Response headers for a served upload: never sniffed; images/audio/PDF shown inline,
// anything else (incl. legacy .html/.svg uploads) downloaded and sandboxed (no script).
function staticHeaders(res, filePath) {
  const ext = extOf(filePath);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (ext === '.pdf') return;
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  if (!IMAGE.includes(ext) && !AUDIO.includes(ext)) res.setHeader('Content-Disposition', 'attachment');
}

module.exports = { upload: uploadFile, uploadImage, uploadAudio, uploadFile, fileUrl, staticHeaders };
