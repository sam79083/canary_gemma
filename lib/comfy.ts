// Minimal ComfyUI API client (local image generation).
//
// Same-machine only, exactly like Ollama: the page calls the user's own
// ComfyUI at http://127.0.0.1:8188. No tunnel, nothing leaves the PC.
// Flow: list checkpoints → queue SDXL workflow → poll history → view image.

export const DEFAULT_COMFY_URL = "http://127.0.0.1:8188";

export interface ComfyImageOut {
  filename: string;
  subfolder: string;
  type: string;
}

async function req(
  base: string,
  path: string,
  init?: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}${path}`, init);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Checkpoint filenames from the CheckpointLoaderSimple node definition. */
export async function listComfyCheckpoints(baseUrl: string): Promise<string[]> {
  let res: Response;
  try {
    res = await req(baseUrl, "/object_info/CheckpointLoaderSimple");
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("timeout");
    throw new Error("unreachable");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as {
    CheckpointLoaderSimple?: { input?: { required?: { ckpt_name?: [string[]] } } };
  };
  const names = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  return (Array.isArray(names) ? names : []).filter((n) => typeof n === "string");
}

/** Minimal SDXL text-to-image API workflow. Keys must be unique node ids. */
export function buildSDXLWorkflow(opts: {
  ckpt: string;
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
}): Record<string, unknown> {
  const { ckpt } = opts;
  const prompt = opts.prompt.slice(0, 2000);
  const negative = (opts.negative ?? "blurry, low quality, watermark, text").slice(0, 500);
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const steps = opts.steps ?? 24;
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed: Math.floor(Math.random() * 2 ** 31),
        steps,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "canary" } },
  };
}

/** Queue a workflow; resolves the prompt id. */
export async function queueComfyPrompt(
  baseUrl: string,
  workflow: Record<string, unknown>,
): Promise<string> {
  const clientId = Math.random().toString(36).slice(2);
  let res: Response;
  try {
    res = await req(
      baseUrl,
      "/prompt",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      },
      30000,
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("timeout");
    throw new Error("unreachable");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { prompt_id?: string; error?: string };
  if (data.error || !data.prompt_id) throw new Error(data.error || "queue-failed");
  return data.prompt_id;
}

/** Finished images for a prompt id (throws while still running). */
export async function readComfyHistory(
  baseUrl: string,
  promptId: string,
): Promise<ComfyImageOut[]> {
  const res = await req(baseUrl, `/history/${encodeURIComponent(promptId)}`, undefined, 15000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Record<
    string,
    { outputs?: Record<string, { images?: ComfyImageOut[] }> }
  >;
  const entry = data[promptId];
  if (!entry?.outputs) throw new Error("pending");
  const out: ComfyImageOut[] = [];
  for (const node of Object.values(entry.outputs)) {
    for (const img of node.images ?? []) out.push(img);
  }
  if (out.length === 0) throw new Error("pending");
  return out;
}

export function comfyViewUrl(baseUrl: string, img: ComfyImageOut): string {
  const q = new URLSearchParams({
    filename: img.filename,
    subfolder: img.subfolder ?? "",
    type: img.type ?? "output",
  });
  return `${baseUrl.replace(/\/+$/, "")}/view?${q.toString()}`;
}
