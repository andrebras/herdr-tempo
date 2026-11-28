// How often the panel reads, looks and waits. Knows nothing about Herdr, so the tests run
// it under Node.js.

// How often to read the questions while the window shows, and while it is hidden, when
// nothing else says they changed. Each read starts tempo twice.
export const SHOWN_MS = 4000;
export const HIDDEN_MS = 30000;
// How often while the watch on Tempo's database works: it reads at once on every change,
// so the timer is only a safety net.
export const WATCHED_MS = 60000;
// How long to wait before watching again after a watch ended or couldn't start.
export const REWATCH_MS = 60000;
// How often to look for the tempo command again while it's missing, so the panel works
// once you install Tempo, without a restart.
export const FIND_MS = 30000;
// How often to look for another shown space. Cheap (no program runs), and it keeps the count
// on the Tempo button right while the panel is hidden, when it never draws.
export const SPACE_MS = 1000;
// How long any tempo command may run before it's stopped and counts as failed.
export const TEMPO_TIMEOUT_MS = 15000;

// How long to wait between timed reads: rarely while the watch reports every change,
// else often while the window shows and less while it is hidden.
export function readEvery(watched, visible) {
  if (watched) return WATCHED_MS;
  return visible ? SHOWN_MS : HIDDEN_MS;
}
