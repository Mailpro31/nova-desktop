import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  CheckSquare,
  Copy,
  FileText,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  Terminal,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { styleColor } from "@/lib/styleColors";
import { BUILTIN_STYLE_IDS } from "@/lib/builtinStyles";
import { commands, type LLMPrompt } from "@/bindings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

const STYLE_ORDER = [
  "auto",
  "default_improve_transcriptions",
  "nova_style_email",
  "nova_style_messages",
  "nova_style_prompt",
  "nova_style_todo",
  "nova_style_notes",
];

const HIDDEN_STYLE_IDS = new Set([
  "nova_style_meeting",
  "nova_style_voice_to_text",
]);

const STYLE_ICONS: Record<string, React.ElementType> = {
  auto: Sparkles,
  default_improve_transcriptions: Wand2,
  nova_style_email: Mail,
  nova_style_messages: MessageSquare,
  nova_style_prompt: Terminal,
  nova_style_todo: CheckSquare,
  nova_style_notes: FileText,
};

type StyleKind = "auto" | "builtin" | "custom";

interface StyleItem {
  id: string;
  name: string;
  description: string;
  kind: StyleKind;
}

interface StyleRowProps extends StyleItem {
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

const StyleRow: React.FC<StyleRowProps> = ({
  id,
  name,
  description,
  kind,
  active,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const Icon = STYLE_ICONS[id] ?? Sparkles;
  const badge =
    kind === "auto"
      ? t("settings.postProcessing.prompts.badgeAuto")
      : kind === "builtin"
        ? t("settings.postProcessing.prompts.badgeBuiltin")
        : t("settings.postProcessing.prompts.badgeCustom");

  return (
    <article
      className={`flex items-center gap-2 rounded-xl border bg-white p-2 transition-colors duration-150 ${
        active ? "border-accent/50" : "border-hairline hover:border-mid-gray/35"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: styleColor(id) }}
        >
          <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-text">
              {name}
            </span>
            <span className="shrink-0 rounded-full bg-mid-gray/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
              {badge}
            </span>
          </span>
          <span className="mt-1 line-clamp-1 block text-xs text-text-secondary">
            {description}
          </span>
        </span>
        {active && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <Check size={13} strokeWidth={2.5} aria-hidden="true" />
          </span>
        )}
      </button>

      <div className="flex shrink-0 items-center gap-1 border-l border-hairline pl-2">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`${t("settings.postProcessing.prompts.edit")} ${name}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-text-secondary hover:bg-mid-gray/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
        )}
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            aria-label={`${t("settings.postProcessing.prompts.duplicate")} ${name}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-text-secondary hover:bg-mid-gray/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Copy size={15} aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`${t("common.delete")} ${name}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-text-secondary hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
};

export const CampusStylesSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, refreshSettings } = useSettings();
  const prompts = (getSetting("post_process_prompts") ?? []) as LLMPrompt[];
  const selectedPromptId =
    getSetting("post_process_selected_prompt_id") ?? "auto";
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");

  useEffect(() => {
    if (editing === "new") {
      setDraftName("");
      setDraftText("");
      return;
    }
    if (editing) {
      const prompt = prompts.find((item) => item.id === editing);
      if (prompt) {
        setDraftName(prompt.name);
        setDraftText(prompt.prompt);
      }
    }
  }, [editing, prompts]);

  const items: StyleItem[] = [
    {
      id: "auto",
      name: t("settings.postProcessing.autoStyle.option"),
      description: t("campus.styles.descriptions.auto"),
      kind: "auto" as const,
    },
    ...prompts
      .filter((prompt) => !HIDDEN_STYLE_IDS.has(prompt.id))
      .map((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        description: BUILTIN_STYLE_IDS.includes(prompt.id)
          ? t(
              `campus.styles.descriptions.${prompt.id}`,
              prompt.prompt.slice(0, 120),
            )
          : prompt.prompt.slice(0, 120),
        kind: BUILTIN_STYLE_IDS.includes(prompt.id)
          ? ("builtin" as const)
          : ("custom" as const),
      })),
  ].sort((left, right) => {
    const leftIndex = STYLE_ORDER.indexOf(left.id);
    const rightIndex = STYLE_ORDER.indexOf(right.id);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return left.name.localeCompare(right.name);
  });

  const selectStyle = (id: string) => {
    void updateSetting("post_process_selected_prompt_id", id).catch((error) => {
      console.error("Failed to select style:", error);
      toast.error(t("settings.postProcessing.prompts.errors.save"));
    });
  };

  const duplicateStyle = (id: string) => {
    const prompt = prompts.find((item) => item.id === id);
    if (!prompt) return;
    setDraftName(
      `${prompt.name} (${t("settings.postProcessing.prompts.copySuffix")})`,
    );
    setDraftText(prompt.prompt);
    setEditing("new");
  };

  const editStyle = (id: string) => {
    const prompt = prompts.find((item) => item.id === id);
    if (!prompt) return;
    setDraftName(prompt.name);
    setDraftText(prompt.prompt);
    setEditing(id);
  };

  const saveStyle = async () => {
    if (!draftName.trim() || !draftText.trim()) return;
    try {
      if (editing === "new") {
        const result = await commands.addPostProcessPrompt(
          draftName.trim(),
          draftText.trim(),
        );
        if (result.status === "ok") {
          await refreshSettings();
          await updateSetting(
            "post_process_selected_prompt_id",
            result.data.id,
          );
        }
      } else if (editing) {
        await commands.updatePostProcessPrompt(
          editing,
          draftName.trim(),
          draftText.trim(),
        );
        await refreshSettings();
      }
      setEditing(null);
    } catch (error) {
      console.error("Failed to save style:", error);
      toast.error(t("settings.postProcessing.prompts.errors.save"));
    }
  };

  const deleteStyle = async (id: string) => {
    try {
      await commands.deletePostProcessPrompt(id);
      await refreshSettings();
      if (selectedPromptId === id) {
        await updateSetting("post_process_selected_prompt_id", "auto");
      }
    } catch (error) {
      console.error("Failed to delete style:", error);
      toast.error(t("settings.postProcessing.prompts.errors.delete"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex items-end justify-between gap-4 px-1">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-text">
            {t("sidebar.styles")}
          </h1>
          <p className="text-base text-text-secondary">
            {t("campus.styles.subtitle")}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing("new")}>
          <Plus size={14} className="mr-1" aria-hidden="true" />
          {t("settings.postProcessing.prompts.createNew")}
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <StyleRow
            key={item.id}
            {...item}
            active={selectedPromptId === item.id}
            onSelect={() => selectStyle(item.id)}
            onEdit={
              item.kind === "custom" ? () => editStyle(item.id) : undefined
            }
            onDuplicate={
              item.kind === "builtin"
                ? () => duplicateStyle(item.id)
                : undefined
            }
            onDelete={
              item.kind === "custom"
                ? () => void deleteStyle(item.id)
                : undefined
            }
          />
        ))}
      </div>

      {editing && (
        <section className="space-y-4 rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-base font-semibold text-text">
            {editing === "new"
              ? t("settings.postProcessing.prompts.createNew")
              : t("settings.postProcessing.prompts.edit")}
          </h2>
          <div className="space-y-3">
            <label className="block space-y-1.5 text-sm font-medium text-text">
              {t("settings.postProcessing.prompts.promptLabel")}
              <Input
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                variant="compact"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-text">
              {t("settings.postProcessing.prompts.promptInstructions")}
              <Textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={() => void saveStyle()}
              disabled={!draftName.trim() || !draftText.trim()}
            >
              {editing === "new"
                ? t("settings.postProcessing.prompts.createPrompt")
                : t("settings.postProcessing.prompts.updatePrompt")}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setEditing(null)}
            >
              {t("settings.postProcessing.prompts.cancel")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};

export default CampusStylesSettings;
