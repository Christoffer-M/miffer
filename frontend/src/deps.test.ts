import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

// UndoBar.tsx points react-aria-components' ToastRegion at a spot with react-aria's
// UNSAFE_PortalProvider. That only works while both use the same copy of react-aria: with two,
// the provider sets a context the region never reads, and Undo quietly renders off screen.
test("react-aria is the copy react-aria-components uses", () => {
  const ours = createRequire(import.meta.url);
  const theirs = createRequire(ours.resolve("react-aria-components"));
  assert.equal(
    realpathSync(ours.resolve("react-aria")),
    realpathSync(theirs.resolve("react-aria")),
    "Set react-aria in package.json to the version react-aria-components depends on.",
  );
});
