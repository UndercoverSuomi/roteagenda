import { Inbox, MoreHorizontal } from "lucide-react";
import { SuggestionCard } from "@/components/ui/suggestion-card";
import { EmptyState, ScreenHeader } from "@/components/ui/primitives";
import type { Locale, Translator } from "@/lib/i18n";
import type { AiSuggestion, Project } from "@/lib/types";

export function InboxScreen({
  suggestions,
  projects,
  editingSuggestionId,
  locale,
  t,
  onEditSuggestion,
  onUpdateSuggestion,
  onAccept,
  onReject,
  onOpenMore,
}: {
  suggestions: AiSuggestion[];
  projects: Project[];
  editingSuggestionId: string | null;
  locale: Locale;
  t: Translator;
  onEditSuggestion: (suggestionId: string | null) => void;
  onUpdateSuggestion: (suggestion: AiSuggestion) => void;
  onAccept: (suggestion: AiSuggestion, createdBy?: "ai" | "user") => void;
  onReject: (suggestionId: string) => void;
  onOpenMore: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-6 pt-3 md:px-8 md:pt-8 lg:px-10">
      <ScreenHeader
        title={t("inbox.title")}
        leftIcon={<Inbox className="h-5 w-5" />}
        rightIcon={<MoreHorizontal className="h-5 w-5" />}
        rightLabel={t("today.openMore")}
        onRight={onOpenMore}
      />
      <p className="mt-5 text-[13px] leading-6 text-[var(--muted)]">{t("inbox.hint")}</p>

      <div className="mt-6 space-y-4">
        {suggestions.length ? (
          suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              projects={projects}
              isEditing={editingSuggestionId === suggestion.id}
              compact
              locale={locale}
              t={t}
              onAccept={() => onAccept(suggestion)}
              onCreateTask={() => onAccept(suggestion, "user")}
              onReject={() => onReject(suggestion.id)}
              onEdit={() => onEditSuggestion(suggestion.id)}
              onCancelEdit={() => onEditSuggestion(null)}
              onUpdate={(updated) => {
                onUpdateSuggestion(updated);
                onEditSuggestion(null);
              }}
            />
          ))
        ) : (
          <EmptyState title={t("inbox.emptyTitle")} text={t("inbox.emptyText")} />
        )}
      </div>
    </div>
  );
}
