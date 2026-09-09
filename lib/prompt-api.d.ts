// Chrome Prompt API (Gemma on-device) has no TS types — declare loosely.
interface LanguageModelSession {
  promptStreaming(prompt: string): AsyncIterable<string>;
  prompt(prompt: string): Promise<string>;
  append(text: string): Promise<void>;
  destroy(): void;
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

export type { LanguageModelSession };
export {};
