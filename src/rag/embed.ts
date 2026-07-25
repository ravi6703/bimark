import { createHash } from "node:crypto";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Embedding providers (§18.4). The `mock` provider is deterministic and offline
 * — the same text always maps to the same unit vector, and semantically similar
 * strings (shared tokens) land closer together — so retrieval is testable
 * without a paid embedding API. `openai`/`voyage` call an OpenAI-compatible
 * `/embeddings` endpoint.
 */
export interface Embedder {
  readonly name: string;
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic hashed bag-of-words embedding. Each token is hashed into the
 * vector space and its bucket incremented; the vector is L2-normalised. Shared
 * vocabulary ⇒ higher cosine similarity, which is all retrieval needs at MVP
 * scale in tests/offline mode.
 */
export class MockEmbedder implements Embedder {
  readonly name = "mock";
  constructor(readonly dim = config.embed.dim) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dim).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) {
      vec[0] = 1; // avoid a zero vector (undefined cosine)
      return vec;
    }
    for (const tok of tokens) {
      const h = createHash("md5").update(tok).digest();
      const bucket = h.readUInt32BE(0) % this.dim;
      const sign = (h[4]! & 1) === 0 ? 1 : -1;
      vec[bucket]! += sign;
    }
    return l2normalize(vec);
  }
}

/** OpenAI-compatible embeddings endpoint (works for OpenAI and Voyage-style APIs). */
export class HttpEmbedder implements Embedder {
  readonly name: string;
  constructor(
    provider: string,
    readonly dim = config.embed.dim,
    private model = config.embed.model,
    private apiKey = config.embed.apiKey,
    private baseUrl = config.embed.baseUrl,
  ) {
    this.name = provider;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`embedding request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }
}

let embedder: Embedder | null = null;

export function getEmbedder(): Embedder {
  if (!embedder) {
    const p = config.embed.provider;
    if (p !== "mock" && config.embed.apiKey === "") {
      logger.warn(
        { provider: p },
        "EMBED_API_KEY missing — falling back to deterministic MockEmbedder",
      );
      embedder = new MockEmbedder();
    } else if (p === "mock") {
      embedder = new MockEmbedder();
    } else {
      embedder = new HttpEmbedder(p);
    }
  }
  return embedder;
}

export function setEmbedder(e: Embedder): void {
  embedder = e;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
