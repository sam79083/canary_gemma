// Trial budgets, shared by server counter (lib/trial.ts) and client UI.
// Kept dependency-free so the browser bundle can import it (no fs/os).
export const TRIAL_GEMINI_LIMIT = 10;
export const TRIAL_HF_LIMIT = 10;
