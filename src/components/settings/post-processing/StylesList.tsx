import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Lock, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AutoStyleSettings } from "./AutoStyleSettings";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { getStatus, TIER_FOR_FEATURE } from "../license/TierBadge";
import { useCampusStore } from "@/stores/campusStore";
import { useSettings } from "../../../hooks/useSettings";
import { commands, type LLMPrompt } from "@/bindings";
import { BUILTIN_STYLE_IDS, styleLockFeature } from "@/lib/builtinStyles";
import { isCampusMode } from "@/lib/mode";

/** Ordre d'affichage des presets : du plus courant au plus spécialisé. */
const STYLE_ORDER = [
  "default_improve_transcriptions",
  "nova_style_email",
  "nova_style_messages",
  "nova_style_notes",
  "nova_style_todo",
  "nova_style_prompt",
  "nova_style_voice_to_text",
  "nova_style_meeting",
];

/**
 * « Réunion » pilote le mode réunion, absent de la distribution campus : l'y
 * proposer donnerait accès à un Style dont le contexte n'existe pas.
 */
const CAMPUS_HIDDEN = new Set(["nova_style_meeting"]);

interface StyleItem {
  id: string;
  name: string;
  description: string;
  /**
   * Provenance, et non simple catégorie d'affichage : elle décide aussi de
   * l'autorisation. Un Style d'organisation n'exige aucun palier personnel —
   * l'établissement paie déjà son déploiement.
   */
  kind: "builtin" | "organization" | "personal";
  /** Fonctionnalité de palier manquante, `null` si le Style est accessible. */
  lockedBy: string | null;
}

/**
 * Le choix du Style d'écriture — comment Nova rédige une dictée.
 *
 * Surface partagée par les deux distributions : la liste, les verrous de palier
 * et la gestion des Styles personnels y vivent une seule fois. Les pages ne
 * font qu'ajouter ce qui leur est propre.
 *
 * Le mot « prompt » n'apparaît nulle part : c'est le nom interne du champ, pas
 * une notion que l'utilisateur a à connaître. Il choisit une manière d'écrire.
 *
 * Une seule indication d'état actif — coche et fond léger — jamais un aplat de
 * couleur ni un bouton. Sélectionner applique immédiatement : pas de
 * confirmation pour un réglage réversible d'un clic.
 */
export const StylesList: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, refreshSettings } = useSettings();
  const campusMode = isCampusMode();

  const [features, setFeatures] = useState<Record<string, boolean> | null>(
    null,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<StyleItem | null>(null);

  useEffect(() => {
    void getStatus().then((status) => setFeatures(status?.features ?? {}));
  }, []);

  const prompts = (getSetting("post_process_prompts") ?? []) as LLMPrompt[];
  const activeId = getSetting("post_process_selected_prompt_id") ?? "auto";

  // En campus, l'établissement fournit l'accès : aucun palier ne s'applique.
  const lockFor = useMemo(
    () => (id: string) => {
      if (campusMode || features === null) return null;
      const feature = styleLockFeature(id);
      return feature && !features[feature] ? feature : null;
    },
    [campusMode, features],
  );

  // Publiés par l'organisation, et distincts des réglages de l'utilisateur :
  // ils ne s'y écrivent pas, ne s'y modifient pas, et disparaissent avec la
  // session. Voir `organization_packages.rs`.
  const organizationStyles = useCampusStore(
    (state) => state.organizationCatalog?.styles,
  );

  const organization = useMemo<StyleItem[]>(
    () =>
      (organizationStyles ?? []).map((style) => ({
        id: style.id,
        name: style.name,
        description: "",
        kind: "organization" as const,
        // Jamais verrouillé par un palier : l'autorisation vient de
        // l'appartenance à l'organisation et des policies, pas d'Ultra.
        lockedBy: null,
      })),
    [organizationStyles],
  );

  const { builtins, personal } = useMemo(() => {
    const visible = prompts.filter(
      (p) => !(campusMode && CAMPUS_HIDDEN.has(p.id)),
    );
    const toItem = (p: LLMPrompt): StyleItem => {
      const isBuiltin = BUILTIN_STYLE_IDS.includes(p.id);
      return {
        id: p.id,
        name: p.name,
        description: isBuiltin
          ? t(`campus.styles.descriptions.${p.id}`, "")
          : "",
        kind: isBuiltin ? "builtin" : "personal",
        lockedBy: lockFor(p.id),
      };
    };

    const items = visible.map(toItem);
    return {
      builtins: items
        .filter((i) => i.kind === "builtin")
        .sort((a, b) => STYLE_ORDER.indexOf(a.id) - STYLE_ORDER.indexOf(b.id)),
      personal: items.filter((i) => i.kind === "personal"),
    };
  }, [prompts, campusMode, lockFor, t]);

  // Créer un Style demande Nova Ultra en personnel ; en campus c'est ouvert.
  const canEdit = campusMode || (features?.custom_styles ?? false);
  const autoLock = lockFor("auto");

  const select = (id: string) => {
    void updateSetting("post_process_selected_prompt_id", id).catch(() => {
      toast.error(t("styles.error.save"));
    });
  };

  const save = async () => {
    const name = draftName.trim();
    const text = draftText.trim();
    if (!name || !text) return;
    try {
      if (editing === "new") {
        const result = await commands.addPostProcessPrompt(name, text);
        await refreshSettings();
        if (result.status === "ok") select(result.data.id);
      } else if (editing) {
        await commands.updatePostProcessPrompt(editing, name, text);
        await refreshSettings();
      }
      setEditing(null);
    } catch {
      toast.error(t("styles.error.save"));
    }
  };

  const remove = async (id: string) => {
    setPendingDelete(null);
    try {
      await commands.deletePostProcessPrompt(id);
      await refreshSettings();
      if (editing === id) setEditing(null);
      if (activeId === id) select("auto");
    } catch {
      toast.error(t("styles.error.delete"));
    }
  };

  return (
    <div className="flex flex-col gap-[32px]">
      <section aria-labelledby="styles-auto">
        <SectionTitle id="styles-auto">
          {t("styles.section.automatic")}
        </SectionTitle>
        <StyleRow
          name={t("settings.postProcessing.autoStyle.option")}
          description={t("campus.styles.descriptions.auto", "")}
          active={activeId === "auto"}
          lockedBy={autoLock}
          onSelect={() => select("auto")}
        />
        {/* Comportement réel, pas une promesse : Nova lit le nom de la fenêtre
            au premier plan et applique le Style correspondant. */}
        <p className="mt-2 px-2 text-xs leading-relaxed text-text-secondary">
          {t("styles.automaticHow")}
        </p>

        {/* Les réglages d'« Automatique » n'apparaissent que lorsqu'il est
            actif — et désormais dans les deux distributions. Ils vivaient
            auparavant dans l'éditeur de Styles personnel, donc invisibles en
            campus : la liste noire de confidentialité y était inatteignable. */}
        {activeId === "auto" && !autoLock && (
          <div className="mt-4">
            <AutoStyleSettings
              prompts={prompts.map((p) => ({ id: p.id, name: p.name }))}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="styles-builtin">
        <SectionTitle id="styles-builtin">
          {t("styles.section.builtin")}
        </SectionTitle>
        <ul>
          {builtins.map((item) => (
            <li key={item.id}>
              <StyleRow
                name={item.name}
                description={item.description}
                active={activeId === item.id}
                lockedBy={item.lockedBy}
                onSelect={() => select(item.id)}
              />
            </li>
          ))}
        </ul>
      </section>

      {organization.length > 0 && (
        <section aria-labelledby="styles-organization">
          <SectionTitle id="styles-organization">
            {t("styles.section.organization")}
          </SectionTitle>
          <ul>
            {organization.map((item) => (
              <li key={item.id}>
                <StyleRow
                  name={item.name}
                  description={item.description}
                  active={activeId === item.id}
                  lockedBy={item.lockedBy}
                  onSelect={() => select(item.id)}
                />
              </li>
            ))}
          </ul>
          {/* Ni modification ni suppression : ce contenu appartient à
              l'organisation. Un bouton « supprimer » ne pourrait signifier que
              « jusqu'à la prochaine synchronisation », ce qui n'est ni une
              suppression ni un refus. */}
          <p className="px-2 py-2 text-sm text-text-secondary">
            {t("styles.organizationManaged")}
          </p>
        </section>
      )}

      {(personal.length > 0 || canEdit) && (
        <section aria-labelledby="styles-personal">
          <SectionTitle id="styles-personal">
            {t("styles.section.personal")}
          </SectionTitle>

          {personal.length === 0 ? (
            <p className="px-2 py-2 text-sm text-text-secondary">
              {t("styles.emptyPersonal")}
            </p>
          ) : (
            <ul>
              {personal.map((item) => (
                <li key={item.id}>
                  <StyleRow
                    name={item.name}
                    description={item.description}
                    active={activeId === item.id}
                    lockedBy={item.lockedBy}
                    onSelect={() => select(item.id)}
                    onEdit={
                      canEdit
                        ? () => {
                            const p = prompts.find((x) => x.id === item.id);
                            if (!p) return;
                            setDraftName(p.name);
                            setDraftText(p.prompt);
                            setEditing(p.id);
                          }
                        : undefined
                    }
                    onDelete={
                      canEdit ? () => setPendingDelete(item) : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {canEdit && editing === null && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                setDraftName("");
                setDraftText("");
                setEditing("new");
              }}
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              {t("settings.postProcessing.prompts.createNew")}
            </Button>
          )}

          {!canEdit && personal.length === 0 && (
            <p className="mt-2 px-2 text-xs text-text-secondary">
              {t("settings.postProcessing.prompts.ultraOnly")}
            </p>
          )}

          {/* Un Style personnel est une instruction rédigée par l'utilisateur :
              rien ne permet de la retrouver après suppression. */}
          <Dialog
            open={pendingDelete !== null}
            onOpenChange={(open) => !open && setPendingDelete(null)}
            title={t("settings.postProcessing.prompts.deletePrompt")}
            description={pendingDelete?.name ?? ""}
            closeLabel={t("common.close")}
            footer={
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingDelete(null)}
                >
                  {t("settings.postProcessing.prompts.cancel")}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => pendingDelete && void remove(pendingDelete.id)}
                >
                  {t("common.delete")}
                </Button>
              </div>
            }
          >
            <></>
          </Dialog>

          {editing !== null && (
            // Deux champs, rien de plus : un nom et la consigne. Un éditeur
            // complet par défaut ferait passer la création pour une tâche
            // technique.
            <div className="mt-3 flex flex-col gap-3 rounded-card border border-hairline p-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text">
                  {t("settings.postProcessing.prompts.promptLabel")}
                </span>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  variant="compact"
                  placeholder={t(
                    "settings.postProcessing.prompts.promptLabelPlaceholder",
                  )}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text">
                  {t("settings.postProcessing.prompts.promptInstructions")}
                </span>
                <Textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  variant="compact"
                  placeholder={t(
                    "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                  )}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(null)}
                >
                  {t("settings.postProcessing.prompts.cancel")}
                </Button>
                <Button
                  size="sm"
                  disabled={!draftName.trim() || !draftText.trim()}
                  onClick={() => void save()}
                >
                  {editing === "new"
                    ? t("settings.postProcessing.prompts.createPrompt")
                    : t("settings.postProcessing.prompts.updatePrompt")}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

const SectionTitle: React.FC<{ id: string; children: React.ReactNode }> = ({
  id,
  children,
}) => (
  <h2
    id={id}
    className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary"
  >
    {children}
  </h2>
);

interface StyleRowProps {
  name: string;
  description: string;
  active: boolean;
  lockedBy: string | null;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Une rangée, pas une carte. Huit Styles en huit rectangles ombrés
 * transformeraient un choix simple en catalogue.
 */
const StyleRow: React.FC<StyleRowProps> = ({
  name,
  description,
  active,
  lockedBy,
  onSelect,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`flex items-start gap-3 border-b border-hairline transition-colors duration-[140ms] last:border-b-0 ${
        active ? "bg-accent/6" : ""
      }`}
    >
      <button
        type="button"
        onClick={lockedBy ? undefined : onSelect}
        disabled={lockedBy !== null}
        aria-pressed={active}
        className={`flex min-w-0 flex-1 items-start gap-3 px-2 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
          lockedBy ? "cursor-not-allowed opacity-55" : "cursor-pointer"
        }`}
      >
        {/* L'état actif ne repose pas sur la couleur seule : une coche le
            double, et l'emplacement reste réservé pour que rien ne bouge. */}
        <span className="mt-0.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center">
          {active && (
            <Check
              size={15}
              strokeWidth={2.5}
              className="text-accent"
              aria-label={t("styles.active")}
            />
          )}
          {lockedBy && (
            <Lock
              size={13}
              strokeWidth={2}
              className="text-text-secondary"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`text-sm text-text ${active ? "font-medium" : ""}`}
            >
              {name}
            </span>
            {lockedBy && (
              <span className="text-[11px] uppercase tracking-wide text-text-secondary">
                {TIER_FOR_FEATURE[lockedBy]}
              </span>
            )}
          </span>
          {description && (
            <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">
              {description}
            </span>
          )}
        </span>
      </button>

      {(onEdit || onDelete) && (
        <div className="relative shrink-0 self-center pe-1">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={t("styles.rowActions")}
            aria-expanded={menuOpen}
            className="cursor-pointer rounded-chip p-1.5 text-text-secondary transition-colors duration-[140ms] hover:bg-mid-gray/10 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <MoreVertical size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          {menuOpen && (
            <>
              {/* Zone de sortie : un clic n'importe où referme le menu, sans
                  piéger le focus pour trois entrées. */}
              <div
                className="fixed inset-0 z-20"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute end-0 z-30 mt-1 w-40 rounded-card border border-hairline bg-surface py-1 shadow-floating">
                {onEdit && (
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    {t("settings.postProcessing.prompts.edit")}
                  </MenuItem>
                )}
                {onDelete && (
                  <MenuItem
                    danger
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {t("common.delete")}
                  </MenuItem>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, danger, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-start text-sm transition-colors duration-[140ms] hover:bg-mid-gray/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
      danger ? "text-danger" : "text-text"
    }`}
  >
    {children}
  </button>
);

export default StylesList;
