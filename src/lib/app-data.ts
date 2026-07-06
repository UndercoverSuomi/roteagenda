import { DEFAULT_AI_MODEL_ID } from "@/lib/ai-models";
import type { AppData } from "@/lib/types";

export function createEmptyAppData(): AppData {
  return {
    user: {
      id: "",
      name: "",
      email: "",
    },
    settings: {
      aiModel: DEFAULT_AI_MODEL_ID,
    },
    projects: [],
    tasks: [],
    rawNotes: [],
    suggestions: [],
  };
}
