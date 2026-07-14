export const AI_MODEL_OPTIONS = [
  { id: "openai-gpt-5-5", label: "OpenAI GPT-5.5" },
  { id: "glm-5-2", label: "GLM 5.2" },
  // ID historisch "kimi-k2-7" (gespeicherte Nutzer-Prefs); real ist K2.6
  // hinterlegt, seit OpenRouter K2.7 nur noch als Code-Variante führt.
  { id: "kimi-k2-7", label: "Kimi K2.6" },
  { id: "qwen-3-7-plus", label: "Qwen 3.7 Plus" },
  { id: "qwen-3-7-max", label: "Qwen 3.7 Max" },
  { id: "minimax-m3", label: "MiniMax M3" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
] as const;

export type AiModelId = (typeof AI_MODEL_OPTIONS)[number]["id"];

export const DEFAULT_AI_MODEL_ID: AiModelId = "openai-gpt-5-5";

// Entspricht der Obergrenze der Enhance-Route (Appwrite-Attribut: 8192).
export const MAX_NOTE_LENGTH = 8000;

export function isAiModelId(value: string): value is AiModelId {
  return AI_MODEL_OPTIONS.some((option) => option.id === value);
}

export function getAiModelLabel(modelId: AiModelId) {
  return AI_MODEL_OPTIONS.find((option) => option.id === modelId)?.label ?? modelId;
}
