/**
 * Chunking (§18.3): ~500–800 tokens per chunk with light overlap, preserving
 * section/slide boundaries so a chunk stays coherent. We approximate tokens as
 * words × 1.3 (a decent English heuristic) to avoid a tokenizer dependency.
 */

export interface ChunkOptions {
  targetTokens?: number; // aim per chunk
  maxTokens?: number; // hard cap before forcing a split
  overlapTokens?: number; // carry-over between adjacent chunks
}

const WORDS_PER_TOKEN = 1 / 1.3;

function tokensToWords(tokens: number): number {
  return Math.max(1, Math.round(tokens * WORDS_PER_TOKEN));
}

/** Split raw text into coherent chunks, respecting blank-line/section breaks. */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const targetWords = tokensToWords(opts.targetTokens ?? 650);
  const maxWords = tokensToWords(opts.maxTokens ?? 800);
  const overlapWords = tokensToWords(opts.overlapTokens ?? 80);

  // Segments = paragraphs / slides separated by blank lines. These are the
  // natural boundaries we try not to cut across.
  const segments = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const chunks: string[] = [];
  let current: string[] = []; // words in the in-progress chunk
  let carry: string[] = []; // overlap words carried from the previous chunk

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join(" "));
    carry = current.slice(Math.max(0, current.length - overlapWords));
    current = [...carry];
  };

  for (const seg of segments) {
    const segWords = seg.split(/\s+/);

    // A single oversized segment is hard-split on word count.
    if (segWords.length > maxWords) {
      flush();
      current = [];
      for (let i = 0; i < segWords.length; i += maxWords - overlapWords) {
        const slice = segWords.slice(i, i + maxWords);
        chunks.push(slice.join(" "));
      }
      carry = [];
      continue;
    }

    if (current.length + segWords.length > targetWords && current.length > carry.length) {
      flush();
    }
    current.push(...segWords);

    if (current.length >= maxWords) flush();
  }

  if (current.length > carry.length) chunks.push(current.join(" "));

  // De-dupe an accidental trailing chunk that is only carry-over.
  return chunks.filter((c, i) => i === 0 || c !== chunks[i - 1]);
}
