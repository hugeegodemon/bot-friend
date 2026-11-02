import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AmbientCadence, randomInteger } from "../src/cadence.js";

describe("ambient cadence", () => {
  it("chooses an inclusive target", () => {
    assert.equal(randomInteger(6, 12, 0), 6);
    assert.equal(randomInteger(6, 12, 0.999999), 12);
  });

  it("checks only after the selected number of human messages", () => {
    const cadence = new AmbientCadence(3, 3, () => 0);
    assert.equal(cadence.recordHumanMessage("channel"), false);
    assert.equal(cadence.recordHumanMessage("channel"), false);
    assert.equal(cadence.recordHumanMessage("channel"), true);
    assert.equal(cadence.recordHumanMessage("channel"), false);
  });

  it("tracks channels independently", () => {
    const cadence = new AmbientCadence(2, 2, () => 0);
    assert.equal(cadence.recordHumanMessage("a"), false);
    assert.equal(cadence.recordHumanMessage("b"), false);
    assert.equal(cadence.recordHumanMessage("a"), true);
    assert.equal(cadence.recordHumanMessage("b"), true);
  });
});
