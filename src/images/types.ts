export interface GeneratedImage {
  mimeType: string;
  data: Buffer;
  modelUsed: string;
}

export interface ImageGenerator {
  readonly name: string;
  generate(prompt: string): Promise<GeneratedImage>;
}
