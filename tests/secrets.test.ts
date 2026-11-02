import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactSecrets } from "../src/secrets.js";

describe("redactSecrets", () => {
  it("redacts GitHub fine-grained tokens without retaining the value", () => {
    const token = `github_pat_${"A".repeat(82)}`;
    const result = redactSecrets(`請看 ${token}`);
    assert.deepEqual(result.detected, ["GitHub Personal Access Token"]);
    assert.equal(result.text.includes(token), false);
    assert.match(result.text, /已遮蔽/);
  });

  it("leaves normal conversation unchanged", () => {
    assert.deepEqual(redactSecrets("今晚打積分嗎？"), {
      text: "今晚打積分嗎？",
      detected: [],
    });
  });
});
