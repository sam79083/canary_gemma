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

/** Checkpoint (.safetensors) + GGUF diffusion model filenames. */
export async function listComfyCheckpoints(baseUrl: string): Promise<string[]> {
  try {
    await req(baseUrl, "/system_stats", undefined, 8000);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("timeout");
    throw new Error("unreachable");
  }
  const [ckpt, unet] = await Promise.all([
    listFromNode(baseUrl, "CheckpointLoaderSimple", "ckpt_name"),
    listFromNode(baseUrl, "UnetLoaderGGUF", "unet_name"),
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of [...ckpt, ...unet]) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

async function listFromNode(
  baseUrl: string,
  node: string,
  field: string,
): Promise<string[]> {
  let res: Response;
  try {
    res = await req(baseUrl, `/object_info/${node}`);
  } catch {
    return [];
  }
  if (!res.ok) return [];
  try {
    const data = (await res.json()) as Record<
      string,
      { input?: { required?: Record<string, [string[]]> } }
    >;
    const names = data?.[node]?.input?.required?.[field]?.[0] ?? [];
    return (Array.isArray(names) ? names : []).filter((n) => typeof n === "string");
  } catch {
    return [];
  }
}

/** FLUX GGUF text-to-image workflow (native nodes, no custom packs). */
export function buildFLUXGGUFWorkflow(opts: {
  unet: string;
  clipL?: string;
  clipT5?: string;
  vae?: string;
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
}): Record<string, unknown> {
  const prompt = opts.prompt.slice(0, 2000);
  const negative = (opts.negative ?? "").slice(0, 500);
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const steps = opts.steps ?? 20;
  return {
    "1": { class_type: "UnetLoaderGGUF", inputs: { unet_name: opts.unet } },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: opts.clipL ?? "clip_l.safetensors",
        clip_name2: opts.clipT5 ?? "t5xxl_fp8_e4m3fn.safetensors",
        type: "flux",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: opts.vae ?? "ae.safetensors" },
    },
    "4": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
    "5": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["2", 0] } },
    "6": {
      class_type: "EmptySD3LatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "7": {
      class_type: "ModelSamplingFlux",
      inputs: { model: ["1", 0], max_shift: 1.15, base_shift: 0.5, width, height },
    },
    "8": {
      class_type: "BasicScheduler",
      inputs: { model: ["7", 0], scheduler: "simple", steps, denoise: 1 },
    },
    "9": {
      class_type: "BasicGuider",
      inputs: { model: ["7", 0], conditioning: ["4", 0] },
    },
    "11": { class_type: "RandomNoise", inputs: { noise_seed: Math.floor(Math.random() * 2 ** 31) } },
    "12": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "13": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["11", 0],
        guider: ["9", 0],
        sampler: ["12", 0],
        sigmas: ["8", 0],
        latent_image: ["6", 0],
      },
    },
    "15": { class_type: "VAEDecode", inputs: { samples: ["13", 0], vae: ["3", 0] } },
    "16": { class_type: "SaveImage", inputs: { images: ["15", 0], filename_prefix: "canary" } },
  };
}
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
