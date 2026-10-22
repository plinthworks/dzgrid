/**
 * Timeouts for the tests that loop on purpose (Phase 4 step 13, flaky tests): vitest's default 5 s is
 * lost under load by a test that builds many grids. A longer timeout is never a skip: each use names
 * its test's time alone in a comment, and ROADMAP keeps them, so a slower test is still seen.
 */

/** A test that builds tens of grids in a loop (alone: about 4 s). */
export const SLOW_TEST_MS = 20_000;

/** A seeded walk: thousands of steps on a tree, each checked against its sheet (alone: 5–10 s). */
export const WALK_TEST_MS = 60_000;
