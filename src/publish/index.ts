import { config } from "../config.js";
import { logger } from "../logger.js";
import { AyrsharePublisher } from "./ayrshare.js";
import { BufferPublisher } from "./buffer.js";
import { MockPublisher } from "./mock.js";
import type { Publisher } from "./types.js";

export * from "./types.js";

let publisher: Publisher | null = null;

/** Resolve the configured publisher; fall back to the mock if creds are missing. */
export function getPublisher(): Publisher {
  if (publisher) return publisher;
  try {
    switch (config.publish.provider) {
      case "buffer":
        publisher = new BufferPublisher();
        break;
      case "ayrshare":
        publisher = new AyrsharePublisher();
        break;
      default:
        publisher = new MockPublisher();
    }
  } catch (err) {
    logger.warn({ err, provider: config.publish.provider }, "publisher init failed — using mock");
    publisher = new MockPublisher();
  }
  logger.info({ provider: publisher.name }, "publisher ready");
  return publisher;
}

export function setPublisher(p: Publisher): void {
  publisher = p;
}
