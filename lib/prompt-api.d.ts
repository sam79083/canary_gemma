// Chrome Prompt API (Gemma on-device) has no TS types — declare loosely.
export interface PromptImage {
  mime: string;
  /** Raw base64 (no data: prefix). */
  data: string;
}

export interface ExpectedInput {
  type: "text" | "image" | "audio";
  languages?: string[];
}

export interface PromptContentPart {
  type: "text" | "image" | "audio";
  value: string | Blob | ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData;
}

export interface PromptMessage {
  role: "user" | "assistant" | "system";
  content: string | PromptContentPart[];
}

interface LanguageModelSession {
  promptStreaming(prompt: string | PromptMessage[]): AsyncIterable<string>;
  prompt(prompt: string | PromptMessage[]): Promise<string>;
  append(text: string | PromptMessage[]): Promise<void>;
  destroy(): void;
  /** Photo-aware turn. Absent = text-only model (e.g. cloud/local adapters). */
  promptWithImages?(prompt: string, images: PromptImage[]): AsyncIterable<string>;
}

interface LanguageModelMonitor extends EventTarget {}

interface LanguageModelNamespace {
  availability(options?: {
    expectedInputs?: ExpectedInput[];
    expectedOutputs?: { type: "text"; languages?: string[] }[];
  }): Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create(options?: {
    monitor?: (m: LanguageModelMonitor) => void;
    /** BCP 47 code Chrome accepts: de, en, es, fr, ja. Omit otherwise. */
    outputLanguage?: string;
    expectedInputs?: ExpectedInput[];
    expectedOutputs?: { type: "text"; languages?: string[] }[];
    initialPrompts?: PromptMessage[];
  }): Promise<LanguageModelSession>;
}

declare global {
  const LanguageModel: LanguageModelNamespace | undefined;
}

export type { LanguageModelSession, PromptImage };
export {};
