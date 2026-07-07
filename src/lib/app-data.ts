import { DEFAULT_AI_MODEL_ID } from "@/lib/ai-models";
import type { Locale } from "@/lib/i18n";
import type { AppData } from "@/lib/types";

export function createEmptyAppData(locale: Locale = "de"): AppData {
  return {
    user: {
      id: "",
      name: "",
      email: "",
    },
    settings: {
      aiModel: DEFAULT_AI_MODEL_ID,
      locale,
    },
    projects: [],
    tasks: [],
    notes: [],
    suggestions: [],
  };
}
