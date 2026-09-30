// Consolidated into ./learn-store (chooseState/fetchRemote/pushRemote live
// there so plain `node --test` can cover the merge logic without runtime
// cross-imports). This file stays as a redirect so older imports keep working
// in the bundler; new code should import from ./learn-store directly.
export type { RemoteLearn } from "./learn-store";
export {
  chooseState,
  fetchRemote,
  isEmptyState,
  loadMetaSavedAt,
  pushRemote,
  saveMetaSavedAt,
} from "./learn-store";
