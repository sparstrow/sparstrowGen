import type { ProviderHealth } from "@sparstrow/shared";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { config } from "../config.js";
import { OllamaProvider } from "../providers/ollama.js";
import type { CliModelDiscovery } from "../providers/types.js";
import type { AgentBackend, AgentMessage, AgentResult, AgentSession, ExecOptions } from "./backend.js";

class SimpleSession implements AgentSession {
  constructor(
    public readonly messages: AsyncIterable<AgentMessage>,
    public readonly result: Promise<AgentResult>,
    private readonly abortCtrl: AbortController,
  ) {}

  cancel(): void {
    this.abortCtrl.abort();
  }
}

export function createOllamaBackend(provider = new OllamaProvider()): AgentBackend {
  return {
    id: "ollama",
    listModels(): string[] {
      return provider.listModels();
    },
    async discoverModels(): Promise<CliModelDiscovery> {
      try {
        const models = await provider.discoverModels();
        return { models, live: true, detail: null };
      } catch (err) {
        return {
          models: provider.listModels(),
          live: false,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    },
    async execute(prompt: string, opts: ExecOptions = {}, signal?: AbortSignal): Promise<AgentSession> {
      const abortCtrl = new AbortController();
      if (signal) {
        if (signal.aborted) abortCtrl.abort();
        else signal.addEventListener("abort", () => abortCtrl.abort(), { once: true });
      }

      const model = opts.model ?? "llama3.2";
      const startTime = Date.now();

      async function* generateMessages(): AsyncGenerator<AgentMessage> {
        // Simple initial yield of status
        yield { type: "status", status: "started", timestamp: new Date().toISOString() };
      }

      const resultPromise = (async (): Promise<AgentResult> => {
        try {
          const turn = await provider.chat(
            {
              model,
              system: opts.systemPrompt ?? "",
              maxTokens: 4096,
              messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
              tools: [],
            },
            abortCtrl.signal,
          );

          const durationMs = Date.now() - startTime;
          return {
            status: "completed",
            output: turn.text,
            durationMs,
          };
        } catch (err) {
          return {
            status: abortCtrl.signal.aborted ? "cancelled" : "failed",
            output: "",
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - startTime,
          };
        }
      })();

      return new SimpleSession(generateMessages(), resultPromise, abortCtrl);
    },
  };
}
