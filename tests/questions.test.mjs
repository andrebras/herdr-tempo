// Tests for questions.js: which questions are new, and how the list groups them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { unannounced } from "../mods/tempo/questions.js";

const q = (number, project, created_at = "2026-01-31T09:05:00Z") => ({ number, project, created_at });

test("the first read, or a mark from an older panel, announces nothing", () => {
  const all = [q(1, "alpha"), q(2, "beta")];
  assert.deepEqual(unannounced(all, null), { fresh: [], keys: ["1:alpha", "2:beta"] });
  assert.deepEqual(unannounced(all, "2026-01-31T09:05:00Z").fresh, []);
});

test("two questions asked in the same second are both new", () => {
  const all = [q(1, "alpha"), q(2, "alpha"), q(3, "alpha")];
  const { fresh } = unannounced(all, ["1:alpha"]);
  assert.deepEqual(
    fresh.map((x) => x.number),
    [2, 3],
  );
});

test("the same number in another project is another question", () => {
  const { fresh } = unannounced([q(1, "alpha"), q(1, "beta")], ["1:alpha"]);
  assert.deepEqual(fresh, [q(1, "beta")]);
});

test("new questions come oldest first, and the mark keeps only open ones", () => {
  const all = [q(5, "beta", "2026-01-31T10:00:00Z"), q(4, "alpha", "2026-01-31T11:00:00Z")];
  const { fresh, keys } = unannounced(all, ["9:gone"]);
  assert.deepEqual(
    fresh.map((x) => x.number),
    [5, 4],
  );
  assert.deepEqual(keys, ["4:alpha", "5:beta"]);
});
