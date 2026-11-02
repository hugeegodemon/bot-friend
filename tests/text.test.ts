import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeDiscordText, splitDiscordMessage } from "../src/text.js";

describe("Discord text helpers", () => {
  it("removes bot mentions", () => {
    assert.equal(sanitizeDiscordText("嗨 <@!123>  在嗎", "123"), "嗨 在嗎");
  });

  it("splits long messages without losing content", () => {
    const chunks = splitDiscordMessage("一二三四五 六七八九十", 6);
    assert.ok(chunks.every((chunk) => chunk.length <= 6));
    assert.equal(chunks.join("").replace(/ /g, ""), "一二三四五六七八九十");
  });
});
