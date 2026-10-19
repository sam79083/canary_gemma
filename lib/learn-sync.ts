// Consolidated into ./learn-store (mergeLearnState/fetchRemote/pushRemote
// live there so plain `node --test` can cover the merge logic without runtime
// cross-imports). This file stays as a redirect so older imports keep working
// in the bundler; new code should import from ./learn-store directly.
export type { RemoteLearn } from "./learn-store";
export {
  fetchRemote,
  isEmptyState,
  loadMetaSavedAt,
  mergeLearnState,
  pushRemote,
  saveMetaSavedAt,
  slimStateForCloud,
} from "./learn-store";
