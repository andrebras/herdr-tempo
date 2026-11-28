// Tests for reads.js: which read of the questions counts, and when another is due.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Reads } from "../mods/tempo/reads.js";

test("a read asked for while one runs waits, and runs right after", () => {
  const reads = new Reads();
  const first = reads.start();
  assert.equal(reads.start(), null);
  reads.end(first);
  assert.equal(reads.again(), true);
  assert.equal(reads.again(), false, "asking clears it");
  assert.notEqual(reads.start(), null);
});

test("with nothing asked meanwhile, no read follows", () => {
  const reads = new Reads();
  reads.end(reads.start());
  assert.equal(reads.again(), false);
});

test("a read that must start now drops the older one", () => {
  const reads = new Reads();
  const older = reads.start();
  const now = reads.start(true);
  assert.equal(reads.current(older), false);
  assert.equal(reads.current(now), true);
});

test("the dropped read ending doesn't free the way while the newer one runs", () => {
  const reads = new Reads();
  const older = reads.start();
  const now = reads.start(true);
  reads.end(older);
  assert.equal(reads.start(), null, "the newer read still runs");
  reads.end(now);
  assert.equal(reads.again(), true);
  assert.notEqual(reads.start(), null);
});

test("reads one after another each count", () => {
  const reads = new Reads();
  const one = reads.start();
  assert.equal(reads.current(one), true);
  reads.end(one);
  const two = reads.start();
  assert.equal(reads.current(two), true);
  assert.equal(reads.current(one), false);
});
