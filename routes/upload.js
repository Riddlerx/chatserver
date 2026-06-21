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
  "application/pdf",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
]);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".pdf", ".mp4", ".webm", ".mp3", ".wav"]);

const uploadDirectory = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    // We will handle the extension later after verifying the file type
    cb(null, crypto.randomUUID());
  },
});

// Create the multer instance
const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 10 }, // 10MB file size limit
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
        "File upload only supports images, pdfs, mp4/webm videos, and mp3/wav audio",
      ),
    );
  },
});

router.post("/", async (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.message === "Unexpected field"
          ? "File upload only supports images, pdfs, mp4/webm videos, and mp3/wav audio."
          : err.message;
      return res.status(400).json({ error: message });
    }

    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Please select a file." });
    }

    try {
      // Securely determine the file extension based on content using file-type
      const fileTypeModule = await import("file-type");
      const fileType = await fileTypeModule.fileTypeFromFile(req.file.path);

      if (!fileType || !allowedMimeTypes.has(fileType.mime) || !allowedExtensions.has(`.${fileType.ext}`)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Invalid or unsupported file content." });
      }

      let ext = `.${fileType.ext}`;
  
      // Re-encode images to a canonical format to strip metadata and remove polyglot payloads
      try {
        const sharp = require('sharp');
        if (fileType && fileType.mime && fileType.mime.startsWith('image/')) {
          // Handle GIFs: reject animated GIFs to be safe
          if (fileType.ext === 'gif') {
            // Quarantine GIFs (or optionally create a static thumbnail)
            const quarantineDir = path.join(uploadDirectory, 'quarantine');
            fs.mkdirSync(quarantineDir, { recursive: true });
            const qname = req.file.filename + (ext || '.gif') + '.' + Date.now();
            const qpath = path.join(quarantineDir, qname);
            fs.renameSync(req.file.path, qpath);
            console.warn(`Quarantined GIF upload (animated/unsupported): ${qpath}`);
            return res.status(400).json({ error: 'Animated GIFs are not supported. Upload a static image.' });
          }

          // Re-encode to JPEG (canonical) to strip metadata and normalize bytes
          const tmpOut = req.file.path + '.reencoded';
          await sharp(req.file.path).rotate().jpeg({ quality: 85 }).toFile(tmpOut);
          // Replace original file with re-encoded output
          fs.unlinkSync(req.file.path);
          fs.renameSync(tmpOut, req.file.path);

          // Force extension to .jpg
          ext = '.jpg';
        }
      } catch (reErr) {
        // If re-encoding fails, remove file and fail closed
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        console.error('Image re-encoding failed', reErr);
        return res.status(500).json({ error: 'Failed to process image upload.' });
      }

      const newFilename = req.file.filename + ext;
      const newPath = path.join(uploadDirectory, newFilename);
      fs.renameSync(req.file.path, newPath);

      return res.json({ filePath: `/uploads/${newFilename}` });
    } catch (error) {
      try { fs.unlinkSync(req.file.path); } catch (_) {} // Delete on error safely
      return res.status(500).json({ error: "Error processing uploaded file." });
    }
  });
});

module.exports = router;
