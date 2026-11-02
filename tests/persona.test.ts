import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPersonaPrompt, NO_REPLY_TOKEN } from "../src/persona.js";

describe("Jiibao persona", () => {
  it("loads the editable persona card with group-chat safeguards", async () => {
    const prompt = await loadPersonaPrompt("personas/jiibao.md");
    assert.match(prompt, /吉伊堡/);
    assert.match(prompt, /自信不是自大/);
    assert.match(prompt, /直接不是刻薄/);
    assert.match(prompt, /自然比展現人設重要/);
    assert.match(prompt, /普通聊天不需要把每句話處理成一個問題/);
    assert.match(prompt, /不複製任何既有角色/);
    assert.ok(prompt.includes(NO_REPLY_TOKEN));
  });
});
