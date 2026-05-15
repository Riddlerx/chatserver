const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const router = express.Router();
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]);

const uploadDirectory = path.join(__dirname, "..", "public", "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    // Generate a secure random filename
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
  },
});

// Create the multer instance
const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 50 }, // 50MB file size limit (matching nginx)
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const mimetype = allowedMimeTypes.has(file.mimetype);
    const extname = allowedExtensions.has(extension);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "File upload only supports jpg, jpeg, png, gif, webp, and avif images",
      ),
    );
  },
});

router.post("/", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.message === "Unexpected field"
          ? "File upload only supports jpg, jpeg, png, gif, webp, and avif images."
          : err.message;
      return res.status(400).json({ error: message });
    }

    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Please select a file." });
    }

    return res.json({ filePath: `/uploads/${req.file.filename}` });
  });
});

module.exports = router;
