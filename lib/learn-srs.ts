// Re-export of the SRS core for UI code (bundler resolves this fine).
// The canonical implementation lives in ./learn-store so plain
// `node --test` can cover it without runtime cross-imports.
export type { CardState } from "./learn-store";
export { addDays, dayStr, initCard, isDue, isLeech, reviewCard } from "./learn-store";
