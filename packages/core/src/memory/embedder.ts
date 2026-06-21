import { EMBEDDING_MODEL } from "@sparstrow/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Lazy singleton around fastembed (BGE-small-en-v1.5, 384-dim, ONNX on CPU).
 * First init downloads the quantized model (~100MB) into dataDir/models.
 * If init fails (missing prebuild, blocked download), vector search is
 * disabled and hybrid search degrades to FTS-only.
 */

type FlagEmbeddingT = {
  passageEmbed(texts: string[], batchSize?: number): AsyncGenerator<number[][]>;
  queryEmbed(query: string): Promise<number[]>;
};

let model: FlagEmbeddingT | null = null;
let initPromise: Promise<boolean> | null = null;
let initError: string | null = null;

export function embedderStatus(): { ready: boolean; model: string; detail: string | null } {
  return {
    ready: model != null,
    model: EMBEDDING_MODEL,
    detail: initError ?? (model ? null : initPromise ? "initializing…" : "not started"),
  };
}

export function initEmbedder(): Promise<boolean> {
  if (model) return Promise.resolve(true);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const { FlagEmbedding, EmbeddingModel } = await import("fastembed");
      logger.info("initializing embedder (downloads model on first run)…");
      model = (await FlagEmbedding.init({
        model: EmbeddingModel.BGESmallENV15,
        cacheDir: config.modelCacheDir,
        showDownloadProgress: false,
      })) as unknown as FlagEmbeddingT;
      logger.info("embedder ready: BGE-small-en-v1.5");
      return true;
    } catch (err) {
      initError = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "embedder init failed — semantic search disabled");
      return false;
    }
  })();
  return initPromise;
}

export function isEmbedderReady(): boolean {
  return model != null;
}

export async function embedPassages(texts: string[]): Promise<Float32Array[]> {
  if (!model) throw new Error("embedder not ready");
  const out: Float32Array[] = [];
  for await (const batch of model.passageEmbed(texts, 8)) {
    for (const vec of batch) out.push(Float32Array.from(vec));
  }
  return out;
}

export async function embedQuery(text: string): Promise<Float32Array> {
  if (!model) throw new Error("embedder not ready");
  return Float32Array.from(await model.queryEmbed(text));
}
