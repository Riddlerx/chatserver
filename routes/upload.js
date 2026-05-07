const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const router = express.Router();

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
    // Allow only images
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase(),
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("File upload only supports images (jpeg, jpg, png, gif)"));
  },
});

router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Please select a file." });
  }
  res.json({ filePath: `/uploads/${req.file.filename}` });
});

module.exports = router;
