import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { logger } from "../logger.js";
import { ownedAssets, pillars } from "../db/repositories/index.js";
import { chunkText } from "./chunk.js";
import { getEmbedder } from "./embed.js";

/**
 * A source document after text extraction. Extraction from Drive/Notion/pptx/
 * pdf/docx (§18.1-2) plugs in ahead of this: each connector produces a
 * SourceDocument, and everything downstream (chunk → embed → store) is shared.
 */
export interface SourceDocument {
  sourceType: "gdrive" | "notion" | "deck" | "manual";
  sourceRef: string; // file id / url / path — the stable identity for hash-skip
  title: string;
  text: string;
  pillarHint?: string | null; // pillar name; resolved to an id at ingest time
}

export interface IngestResult {
  sourceRef: string;
  skipped: boolean; // unchanged since last ingest (hash match)
  chunks: number;
}

function fileHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Ingest one document: hash-skip if unchanged (§18.6 cost control), else chunk,
 * embed, and replace the source's chunks atomically.
 */
export async function ingestDocument(
  brandId: number,
  doc: SourceDocument,
): Promise<IngestResult> {
  const hash = fileHash(doc.text);
  const existing = await ownedAssets.hashesForSource(brandId, doc.sourceRef);
  if (existing.has(hash)) {
    logger.info({ sourceRef: doc.sourceRef }, "ingest: unchanged, skipping");
    return { sourceRef: doc.sourceRef, skipped: true, chunks: 0 };
  }

  let pillarHintId: number | null = null;
  if (doc.pillarHint) {
    const p = await pillars.findByName(brandId, doc.pillarHint);
    pillarHintId = p?.id ?? null;
  }

  const pieces = chunkText(doc.text);
  if (pieces.length === 0) {
    logger.warn({ sourceRef: doc.sourceRef }, "ingest: no chunks produced");
    return { sourceRef: doc.sourceRef, skipped: false, chunks: 0 };
  }

  const embeddings = await getEmbedder().embed(pieces);
  const rows = pieces.map((chunk_text, i) => ({
    source_type: doc.sourceType,
    title: doc.title,
    chunk_text,
    chunk_index: i,
    content_hash: hash,
    embedding: embeddings[i]!,
    pillar_hint: pillarHintId,
  }));

  const n = await ownedAssets.replaceSource(brandId, doc.sourceRef, rows);
  logger.info({ sourceRef: doc.sourceRef, chunks: n }, "ingest: stored");
  return { sourceRef: doc.sourceRef, skipped: false, chunks: n };
}

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);

/**
 * MVP filesystem loader: reads .txt/.md files from a directory as owned
 * material. PDF/DOCX/PPTX extraction (§18.2) plugs in here — detect the
 * extension, run the extractor, and yield the same SourceDocument shape.
 */
export function loadDocumentsFromDir(dir: string): SourceDocument[] {
  const docs: SourceDocument[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isFile()) continue;
    const ext = extname(name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) {
      logger.warn({ path }, "ingest: unsupported file type, skipping (add an extractor)");
      continue;
    }
    docs.push({
      sourceType: "manual",
      sourceRef: path,
      title: name.replace(ext, ""),
      text: readFileSync(path, "utf8"),
    });
  }
  return docs;
}

export async function ingestDir(brandId: number, dir: string): Promise<IngestResult[]> {
  const docs = loadDocumentsFromDir(dir);
  const results: IngestResult[] = [];
  for (const doc of docs) {
    results.push(await ingestDocument(brandId, doc));
  }
  return results;
}
