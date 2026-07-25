import { describe, expect, it } from "vitest";
import { TelegramClient } from "../src/telegram/client.js";

describe("TelegramClient.sendPhoto (§20 image approval preview)", () => {
  it("dry-runs without a token instead of touching the network", async () => {
    const client = new TelegramClient("");
    const { messageId } = await client.sendPhoto({
      photoUrl: "https://example.test/api/media/1",
      caption: "A caption",
      buttons: [[{ text: "Approve", callback_data: "approve:1" }]],
    });
    expect(messageId).toBeNull();
  });
});
