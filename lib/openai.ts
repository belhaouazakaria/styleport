import OpenAI from "openai";

import { DEFAULT_MODEL } from "@/lib/constants";
import { toPlainText } from "@/lib/utils";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function getClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your environment variables.");
  }

  return new OpenAI({ apiKey: OPENAI_API_KEY });
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

async function tryGenerate(params: {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const temperature = attempt === 0 ? 0.7 : 0.45;

    const response = await params.client.responses.create({
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
    });

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
  const client = getClient();
  const envModel = process.env.OPENAI_MODEL || DEFAULT_MODEL;
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
      lastError = error;
    }
  }

  throw lastError || new Error("Translation generation returned an empty response.");
}
