import OpenAI from "openai";

import { DEFAULT_MODEL, TRANSLATE_TIMEOUT_MS } from "@/lib/constants";
import { getServerEnv } from "@/lib/env";
import { logError } from "@/lib/logger";
import { toPlainText } from "@/lib/utils";

function getClient(): OpenAI {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your environment variables.");
  }

  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

function extractTextFromResponse(response: OpenAI.Responses.Response): string {
  if (response.output_text && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const outputs = response.output ?? [];

  for (const item of outputs) {
    if (item.type !== "message") {
      continue;
    }

    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

function extractUsage(response: OpenAI.Responses.Response) {
  const usage = response.usage as
    | {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      }
    | undefined;

  return {
    promptTokens: usage?.input_tokens ?? null,
    completionTokens: usage?.output_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;

  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      timer.unref?.();

      promise.then(resolve).catch(reject);
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function tryGenerate(params: {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const temperature = attempt === 0 ? 0.7 : 0.45;

    const response = await withTimeout(
      params.client.responses.create({
        model: params.model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: params.systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: params.userPrompt }],
          },
        ],
        temperature,
        max_output_tokens: 1000,
      }),
      TRANSLATE_TIMEOUT_MS,
      "OpenAI response",
    );

    const result = toPlainText(extractTextFromResponse(response));
    if (result) {
      return {
        text: result,
        usage: extractUsage(response),
      };
    }
  }

  return null;
}

export async function translateWithOpenAI(params: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
}): Promise<{
  text: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}> {
  const env = getServerEnv();
  const client = getClient();
  const envModel = env.OPENAI_MODEL || DEFAULT_MODEL;
  const modelCandidates = Array.from(new Set([params.model, envModel, DEFAULT_MODEL].filter(Boolean))) as string[];

  let lastError: unknown;

  for (const model of modelCandidates) {
    try {
      const generated = await tryGenerate({
        client,
        model,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
      });

      if (!generated) {
        continue;
      }

      return {
        text: generated.text,
        model,
        ...generated.usage,
      };
    } catch (error) {
      logError(
        "openai_translate_error",
        "Translation attempt failed for model candidate.",
        { model },
        error,
      );
      lastError = error;
    }
  }

  throw lastError || new Error("Translation generation returned an empty response.");
}
