import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Plus,
  Trash2,
  Sparkles,
  Wand2,
  Mail,
  MessageSquare,
  Terminal,
  CheckSquare,
  FileText,
  MoreVertical,
  Copy,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "../../../hooks/useSettings";
import { styleColor } from "../../../lib/styleColors";
import { BUILTIN_STYLE_IDS } from "../../../lib/builtinStyles";
import { commands } from "@/bindings";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import type { LLMPrompt } from "@/bindings";
import type { SidebarSection } from "../../Sidebar";

interface CampusStylesSettingsProps {
  onNavigate?: (section: SidebarSection) => void;
}

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

const StyleCard: React.FC<{
  id: string;
  name: string;
  description: string;
  kind: "auto" | "builtin" | "custom";
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}> = ({
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
  const [showMenu, setShowMenu] = useState(false);
  const Icon = STYLE_ICONS[id] ?? Sparkles;
  const imageUrl = `/style-images/${id}.png`;
  const fallbackGradient = styleColor(id);

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseLeave={() => setShowMenu(false)}
      className={`group relative w-full h-36 rounded-3xl overflow-hidden text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
        active
          ? "ring-2 ring-accent ring-offset-2 shadow-lg"
          : "shadow-sm hover:shadow-lg hover:-translate-y-0.5"
      }`}
    >
      {/* Background image or gradient */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{
          backgroundImage: `url('${imageUrl}'), linear-gradient(135deg, ${fallbackGradient}, ${fallbackGradient})`,
        }}
      />

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

      {/* Actions menu */}
      {(onEdit || onDuplicate || onDelete) && (
        <div className="absolute top-3 right-3 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1.5 rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-colors"
          >
            <MoreVertical size={16} />
          </button>
          {showMenu && (
            <div
              className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-hairline py-1 z-30"
              onClick={(e) => e.stopPropagation()}
            >
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onEdit();
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text hover:bg-mid-gray/10"
                >
                  <Pencil size={14} />
                  {t("settings.postProcessing.prompts.edit")}
                </button>
              )}
              {onDuplicate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDuplicate();
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text hover:bg-mid-gray/10"
                >
                  <Copy size={14} />
                  {t("settings.postProcessing.prompts.duplicate")}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete();
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger hover:bg-mid-gray/10"
                >
                  <Trash2 size={14} />
                  {t("common.delete")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Active check */}
      {active && (
        <div className="absolute top-3 left-3 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-accent text-white shadow-sm">
          <Check size={14} strokeWidth={2.5} />
        </div>
      )}

      {/* Badge Intégré / Personnalisé / Automatique */}
      <div className="absolute top-3 left-3 z-10" style={active ? { left: '2.75rem' } : undefined}>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/30 text-white/90 backdrop-blur-sm">
          {kind === 'auto'
            ? t('settings.postProcessing.prompts.badgeAuto')
            : kind === 'builtin'
              ? t('settings.postProcessing.prompts.badgeBuiltin')
              : t('settings.postProcessing.prompts.badgeCustom')}
        </span>
      </div>

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 p-4 z-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm text-white">
            <Icon size={18} strokeWidth={1.75} />
          </span>
        </div>
        <h3 className="text-base font-semibold text-white truncate">{name}</h3>
        <p className="text-sm text-white/80 leading-snug line-clamp-2 mt-1 transition-all duration-300 max-h-0 opacity-0 group-hover:max-h-16 group-hover:opacity-100">
          {description}
        </p>
      </div>
    </button>
  );
};

export const CampusStylesSettings: React.FC<CampusStylesSettingsProps> = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, refreshSettings } = useSettings();

  const prompts = (getSetting("post_process_prompts") ?? []) as LLMPrompt[];
  const selectedPromptId =
    getSetting("post_process_selected_prompt_id") ?? "auto";

  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");

  useEffect(() => {
    if (editing && editing !== "new") {
      const p = prompts.find((prompt) => prompt.id === editing);
      if (p) {
        setDraftName(p.name);
        setDraftText(p.prompt);
      }
    } else if (editing === "new") {
      setDraftName("");
      setDraftText("");
    }
  }, [editing, prompts]);

  const allItems: {
    id: string;
    name: string;
    description: string;
    kind: "auto" | "builtin" | "custom";
  }[] = [
    {
      id: "auto",
      name: t("settings.postProcessing.autoStyle.option"),
      description: t("campus.styles.descriptions.auto", ""),
      kind: "auto",
    },
    ...prompts
      .filter((p) => !HIDDEN_STYLE_IDS.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: BUILTIN_STYLE_IDS.includes(p.id)
          ? t(`campus.styles.descriptions.${p.id}`, p.prompt.slice(0, 120))
          : p.prompt.slice(0, 120),
        kind: BUILTIN_STYLE_IDS.includes(p.id)
          ? ("builtin" as const)
          : ("custom" as const),
      })),
  ];

  const sortedItems = [...allItems].sort((a, b) => {
    const idxA = STYLE_ORDER.indexOf(a.id);
    const idxB = STYLE_ORDER.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleSelect = (id: string) => {
    updateSetting("post_process_selected_prompt_id", id).catch((e) => {
      console.error("Failed to select style:", e);
      toast.error(t("settings.postProcessing.prompts.errors.save"));
    });
  };

  const startCreate = () => {
    setEditing("new");
  };

  const startDuplicate = (id: string) => {
    const p = prompts.find((prompt) => prompt.id === id);
    if (!p) return;
    setDraftName(
      `${p.name} (${t("settings.postProcessing.prompts.copySuffix")})`,
    );
    setDraftText(p.prompt);
    setEditing("new");
  };

  const startEdit = (id: string) => {
    const p = prompts.find((prompt) => prompt.id === id);
    if (!p) return;
    setEditing(id);
    setDraftName(p.name);
    setDraftText(p.prompt);
  };

  const cancelEdit = () => setEditing(null);

  const handleSave = async () => {
    if (!draftName.trim() || !draftText.trim()) return;
    try {
      if (editing === "new") {
        const result = await commands.addPostProcessPrompt(
          draftName.trim(),
          draftText.trim(),
        );
        if (result.status === "ok") {
          await refreshSettings();
          updateSetting("post_process_selected_prompt_id", result.data.id).catch(
            () => {},
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

  const handleDelete = async (id: string) => {
    try {
      await commands.deletePostProcessPrompt(id);
      await refreshSettings();
      if (editing === id) setEditing(null);
      if (selectedPromptId === id) {
        updateSetting("post_process_selected_prompt_id", "auto").catch(() => {});
      }
    } catch (error) {
      console.error("Failed to delete style:", error);
      toast.error(t("settings.postProcessing.prompts.errors.delete"));
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-5">
      <div className="px-1 space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {t("sidebar.styles")}
        </h1>
        <p className="text-base text-text-secondary">
          {t("campus.styles.subtitle")}
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-hairline shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" strokeWidth={1.75} />
            <h2 className="text-base font-semibold">
              {t("campus.styles.listTitle")}
            </h2>
          </div>
          <Button variant="secondary" size="sm" onClick={startCreate}>
            <Plus size={14} className="mr-1" />
            {t("settings.postProcessing.prompts.createNew")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sortedItems.map((item) => {
            const active = selectedPromptId === item.id;
            const isCustom = item.kind === "custom";
            const isBuiltin = item.kind === "builtin";

            return (
              <StyleCard
                key={item.id}
                id={item.id}
                name={item.name}
                description={item.description}
                kind={item.kind}
                active={active}
                onSelect={() => handleSelect(item.id)}
                onEdit={isCustom ? () => startEdit(item.id) : undefined}
                onDuplicate={isBuiltin ? () => startDuplicate(item.id) : undefined}
                onDelete={isCustom ? () => handleDelete(item.id) : undefined}
              />
            );
          })}
        </div>
      </div>

      {editing !== null && (
        <div className="bg-white rounded-3xl border border-hairline shadow-sm p-5 space-y-4">
          <h2 className="text-base font-semibold">
            {editing === "new"
              ? t("settings.postProcessing.prompts.createNew")
              : t("settings.postProcessing.prompts.promptLabel")}
          </h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("settings.postProcessing.prompts.promptLabel")}
              </label>
              <Input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptLabelPlaceholder",
                )}
                variant="compact"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("settings.postProcessing.prompts.promptInstructions")}
              </label>
              <Textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                )}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              disabled={!draftName.trim() || !draftText.trim()}
            >
              {editing === "new"
                ? t("settings.postProcessing.prompts.createPrompt")
                : t("settings.postProcessing.prompts.updatePrompt")}
            </Button>
            <Button variant="secondary" size="md" onClick={cancelEdit}>
              {t("settings.postProcessing.prompts.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampusStylesSettings;
