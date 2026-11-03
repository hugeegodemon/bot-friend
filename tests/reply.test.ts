import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_BUBBLE_DELAY_MS,
  MIN_BUBBLE_DELAY_MS,
  parseGeneratedReply,
  parseGeneratedMessages,
  replyBubbleDelay,
} from "../src/reply.js";

describe("structured Discord replies", () => {
  it("parses multiple message bubbles", () => {
    assert.deepEqual(
      parseGeneratedMessages('{"messages":["第一句","第二句"]}'),
      ["第一句", "第二句"],
    );
  });

  it("extracts a bounded set of durable memories", () => {
    assert.deepEqual(
      parseGeneratedReply(
        '{"messages":["記住了"],"memories":["喜歡玩輔助","討厭香菜","第三條不該留下"]}',
      ),
      {
        messages: ["記住了"],
        memories: ["喜歡玩輔助", "討厭香菜"],
      },
    );
  });

  it("accepts fenced JSON and limits message count", () => {
    assert.deepEqual(
      parseGeneratedMessages('```json\n{"messages":["一","二","三"]}\n```', 2),
      ["一", "二"],
    );
  });

  it("turns blank-line-separated beats into separate bubbles", () => {
    assert.deepEqual(
      parseGeneratedMessages('{"messages":["先回一句\\n\\n再補一句"]}'),
      ["先回一句", "再補一句"],
    );
  });

  it("treats an empty array or no-reply token as silence", () => {
    assert.equal(parseGeneratedMessages('{"messages":[]}'), null);
    assert.equal(parseGeneratedMessages("<NO_REPLY>"), null);
  });

  it("falls back to one bubble for legacy plain text", () => {
    assert.deepEqual(parseGeneratedMessages("普通回覆"), ["普通回覆"]);
  });

  it("uses a bounded human-like delay", () => {
    assert.equal(replyBubbleDelay(0), MIN_BUBBLE_DELAY_MS);
    assert.equal(replyBubbleDelay(0.999999), MAX_BUBBLE_DELAY_MS);
  });
});
