// Chrome Prompt API (Gemma on-device) has no TS types — declare loosely.
export interface PromptImage {
  mime: string;
  /** Raw base64 (no data: prefix). */
  data: string;
}

interface LanguageModelSession {
  promptStreaming(prompt: string): AsyncIterable<string>;
  prompt(prompt: string): Promise<string>;
  append(text: string): Promise<void>;
  destroy(): void;
  /** Photo-aware turn. Absent = text-only model (e.g. built-in Gemma). */
  promptWithImages?(prompt: string, images: PromptImage[]): AsyncIterable<string>;
}

interface LanguageModelMonitor extends EventTarget {}

interface LanguageModelNamespace {
  availability(): Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create(options?: {
    monitor?: (m: LanguageModelMonitor) => void;
    /** BCP 47 code Chrome accepts: de, en, es, fr, ja. Omit otherwise. */
    outputLanguage?: string;
  }): Promise<LanguageModelSession>;
}

declare global {
  const LanguageModel: LanguageModelNamespace | undefined;
}

export type { LanguageModelSession, PromptImage };
export {};
