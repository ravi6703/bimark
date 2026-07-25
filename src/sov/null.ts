import type { SovSource } from "./types.js";

export class NullSovSource implements SovSource {
  readonly name = "mock";
  async score(_query: string): Promise<number> {
    return 0;
  }
}
