// ============================================================
// services/rag/router.js — HTTP layer ONLY.
// No business logic here — every route just calls into
// ingest.js / query.js / delete.js / stats.js. If a route
// returns the wrong status code or shape, this is the only
// file to look at; if the DATA is wrong, look in the module
// the route calls into instead.
// ============================================================

import { ingestFile } from "./ingest.js";
import { askRag } from "./query.js";
import { deleteDocuments } from "./delete.js";
import { getRagStats } from "./stats.js";
import { supportedExtensions } from "../utils/extractor.js";

export async function createRagRouter() {
  const express = await import("express").then((m) => m.default);
  const multer = await import("multer").then((m) => m.default); // npm i multer
  const upload = multer({ storage: multer.memoryStorage() });

  const router = express.Router();

  // Upload ANY supported file type — multipart/form-data, field "file"
  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: "No file uploaded (field name: 'file')" });
      }

      const result = await ingestFile(
        {
          buffer: req.file.buffer,
          fileName: req.file.originalname,
          documentId: req.body?.documentId,
        },
        { ...req.body, collection: req.body?.collection },
      );

      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Deprecated alias — kept only so old clients pointing at /upload-pdf
  // don't break. Accepts EITHER:
  //   (a) multipart/form-data with a "file" field (like /upload), or
  //   (b) a JSON body with { base64 | path | dataUrl | buffer }
  router.post("/upload-pdf", upload.single("file"), async (req, res) => {
    try {
      const fileInput = req.file
        ? {
            buffer: req.file.buffer,
            fileName: req.file.originalname,
            documentId: req.body?.documentId,
          }
        : req.body;

      const result = await ingestFile(fileInput, req.body?.options || req.body || {});
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.post("/ask", async (req, res) => {
    try {
      const result = await askRag(req.body.question, req.body);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // DELETE /delete                (wipes everything)
  // DELETE /delete?collection=x   (wipes one collection)
  // DELETE /delete?documentId=y   (removes one document)
  router.delete("/delete", async (req, res) => {
    try {
      const collection = req.query.collection || req.body?.collection;
      const documentId = req.query.documentId || req.body?.documentId;

      const result = await deleteDocuments({ collection, documentId });

      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.get("/documents", async (_req, res) => {
    try {
      const stats = await getRagStats();
      res.json({ ok: true, ...stats });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/supported-types", (_req, res) => {
    res.json({ ok: true, extensions: supportedExtensions() });
  });

  return router;
}