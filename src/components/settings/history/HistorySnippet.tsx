import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { isOrganizationMode } from "@/lib/mode";
import { loadOrganizationSession } from "@/lib/organizationSession";
import { OrganizationApi, campusErrorText } from "@/lib/organizationApi";

interface HistorySnippetProps {
  text: string;
  disabled?: boolean;
}

/**
 * Faire d'une dictée un snippet. L'élève a déjà dit ce texte une fois : il
 * choisit ce qu'il dira la prochaine fois pour le retrouver, en une ou
 * plusieurs façons séparées par une virgule. Le snippet est enregistré sur le
 * serveur de l'établissement, comme ceux de la section Snippets.
 */
export const HistorySnippet: React.FC<HistorySnippetProps> = ({
  text,
  disabled,
}) => {
  const { t } = useTranslation();
  const triggerId = useId();
  const contentId = useId();
  const [editing, setEditing] = useState(false);
  const [trigger, setTrigger] = useState("");
  const [content, setContent] = useState(text);
  const [saving, setSaving] = useState(false);

  if (!isOrganizationMode()) return null;

  const save = async () => {
    const session = await loadOrganizationSession();
    if (!session) {
      toast.error(t("settings.history.snippet.error"));
      return;
    }
    setSaving(true);
    try {
      await new OrganizationApi(session.server_url).addSnippet(
        trigger.trim(),
        content.trim(),
      );
      toast.success(
        t("settings.history.snippet.saved", { trigger: trigger.trim() }),
      );
      setEditing(false);
      setTrigger("");
    } catch (err) {
      toast.error(
        campusErrorText(err, t("settings.history.snippet.error")) ||
          t("settings.history.snippet.error"),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setContent(text);
            setEditing(true);
          }}
        >
          <MessageSquarePlus size={14} strokeWidth={2} aria-hidden="true" />
          {t("settings.history.snippet.start")}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-card border border-hairline px-3.5 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label htmlFor={triggerId} className="text-xs text-text-secondary">
        {t("settings.history.snippet.trigger")}
      </label>
      <Input
        id={triggerId}
        type="text"
        value={trigger}
        onChange={(event) => setTrigger(event.target.value)}
        placeholder={t("organization.snippets.triggerPlaceholder")}
        className="text-sm"
        autoFocus
      />
      <p className="text-xs text-text-secondary">
        {t("organization.snippets.aliases", {
          example: "mon matricule, mon numéro étudiant",
        })}
      </p>
      <label htmlFor={contentId} className="text-xs text-text-secondary">
        {t("organization.snippets.contentLabel")}
      </label>
      <textarea
        id={contentId}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        className="w-full resize-y rounded-control border border-hairline-strong bg-inset px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={saving || !trigger.trim() || !content.trim()}
        >
          {t("settings.history.snippet.save")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => setEditing(false)}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
};

export default HistorySnippet;
