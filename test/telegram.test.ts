import { describe, expect, it } from "vitest";
import {
  cb,
  parseCallback,
  morningPitchMessage,
  draftPreviewMessage,
} from "../src/telegram/messages.js";
import type { PitchPair } from "../src/agents/dailyPitch.js";
import type { Draft } from "../src/types.js";

describe("callback_data encode/parse (WF-2 / WF-5)", () => {
  it("round-trips every action within Telegram's 64-byte limit", () => {
    const cases = [cb.pickA(42), cb.pickB(43), cb.twoMore("abc123"), cb.skip("abc123"), cb.approve(9), cb.edit(9), cb.reject(9)];
    for (const data of cases) {
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(parseCallback(data)).not.toBeNull();
    }
  });

  it("parses actions and ids", () => {
    expect(parseCallback("pickA:42")).toEqual({ action: "pickA", id: "42" });
    expect(parseCallback("skip:grp")).toEqual({ action: "skip", id: "grp" });
    expect(parseCallback("bogus:1")).toBeNull();
    expect(parseCallback("garbage")).toBeNull();
  });
});

describe("morning pitch message (§4.1 shape)", () => {
  it("renders A/B options and the four-button keyboard", () => {
    const pitch: PitchPair = {
      A: { angle: "Angle A", pillar: "Skills-based hiring", asset_id: 10, why_now: "now A" },
      B: { angle: "Angle B", pillar: "Employability outcomes", asset_id: 11, why_now: "now B" },
      promptVersion: "v1",
    };
    const { text, buttons } = morningPitchMessage(pitch, 1, 2, "grp");
    expect(text).toContain("Angle A");
    expect(text).toContain("Angle B");
    expect(buttons.flat()).toHaveLength(4);
    expect(buttons[0]![0]!.callback_data).toBe("pickA:1");
    expect(buttons[1]![1]!.callback_data).toBe("skip:grp");
  });
});

describe("draft preview message (§9 gate)", () => {
  const base: Draft = {
    id: 5,
    topic_id: 1,
    platform: "linkedin",
    body: "A grounded draft.",
    variants: [],
    claims_used: [],
    low_source: false,
    media_asset_id: null,
    model_used: "mock",
    prompt_version: "v1",
    reviewer_result: { verdict: "pass", flags: [], notes: "" },
    review_retries: 0,
    status: "pending_approval",
    created_at: new Date(),
    repetitive: false,
    similar_to_draft_id: null,
  };

  it("shows approve/edit/reject buttons", () => {
    const { buttons } = draftPreviewMessage(base);
    expect(buttons[0]!.map((b) => b.callback_data)).toEqual(["approve:5", "edit:5", "reject:5"]);
  });

  it("surfaces the low_source credibility warning", () => {
    const { text } = draftPreviewMessage({ ...base, low_source: true });
    expect(text).toContain("low source");
  });

  it("surfaces an escalated reviewer flag", () => {
    const { text } = draftPreviewMessage({
      ...base,
      reviewer_result: { verdict: "flag", flags: ["unverified claim"], notes: "cut the stat" },
    });
    expect(text).toContain("reviewer flagged");
  });
});
