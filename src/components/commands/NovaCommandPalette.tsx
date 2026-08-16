import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { CornerDownLeft } from "lucide-react";

import CommandPaletteSurface from "./CommandPaletteSurface";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { commands, type SelectionCapture } from "@/bindings";
import { CampusApi } from "@/lib/campusApi";
import type { CampusSession } from "@/lib/campusSession";
import {
  ASK_NOVA,
  NOVA_COMMAND_SKILLS,
  targetLanguageName,
  type NovaCommandSkill,
} from "@/lib/commands/catalog";
import {
  clientCommandMessage,
  commandMessage,
  type CommandMessage,
} from "@/lib/commands/errors";
import { markMilestone } from "@/lib/milestones";

interface NovaCommandPaletteProps {
  /** `null` quand la palette s'ouvre directement sur une erreur de capture. */
  capture: SelectionCapture | null;
  session: CampusSession | null;
  initialError?: CommandMessage;
  onClose: () => void;
}

type Phase =
  | { name: "choosing" }
  | { name: "running"; skill: NovaCommandSkill }
  | { name: "result"; skill: NovaCommandSkill; result: string }
  | { name: "error"; message: CommandMessage };

/**
 * Palette Nova Commands.
 *
 * Quatre états, une seule surface : choisir, attendre, décider, ou expliquer
 * pourquoi rien n'a marché. Les erreurs vivent **dans** la palette et non dans
 * une notification fugace — celle de la capture arrive avant même que l'écran
 * n'apparaisse, et une bulle qui s'efface ne dit pas quoi faire ensuite.
 *
 * **Rien n'est remplacé automatiquement.** Le résultat passe toujours par un
 * aperçu, et le remplacement reste une décision explicite : tant que la couche
 * native n'est pas validée sur applications réelles, écraser le document sans
 * montrer le texte serait indéfendable. Copier est donc l'action principale,
 * et Remplacer reste secondaire.
 *
 * Échap ferme sans rien modifier — le presse-papiers a déjà été restauré par
 * la capture, il n'y a aucun effet de bord à défaire.
 */
export const NovaCommandPalette: React.FC<NovaCommandPaletteProps> = ({
  capture,
  session,
  initialError,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState<Phase>(
    initialError
      ? { name: "error", message: initialError }
      : { name: "choosing" },
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [askInstruction, setAskInstruction] = useState("");
  const [replaceBlocked, setReplaceBlocked] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = useCallback(
    async (skill: NovaCommandSkill, instruction: string) => {
      if (!capture || !session) return;
      setPhase({ name: "running", skill });
      setReplaceBlocked(false);

      try {
        // Le jeton n'est plus exposé au frontend : il est joint côté Rust.
        const response = await new CampusApi(session.server_url).executeCommand(
          instruction,
          capture.text,
        );
        const result = response.text?.trim() ?? "";
        if (!result) {
          setPhase({
            name: "error",
            message: clientCommandMessage("emptyResult"),
          });
          return;
        }
        // Jalon posé ici et nulle part ailleurs : commande partie **et**
        // réponse exploitable. Ouvrir la palette n'est pas un accomplissement.
        markMilestone("first_ai_skill_used");
        setPhase({ name: "result", skill, result });
      } catch {
        // Le détail réseau/serveur n'est pas actionnable, et le texte de
        // l'utilisateur n'apparaît jamais dans un message d'erreur.
        setPhase({ name: "error", message: clientCommandMessage("failed") });
      }
    },
    [capture, session],
  );

  const runPreset = useCallback(
    (skill: NovaCommandSkill) =>
      void run(skill, skill.instruction(targetLanguageName(i18n.language))),
    [run, i18n.language],
  );

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % NOVA_COMMAND_SKILLS.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (i) =>
          (i - 1 + NOVA_COMMAND_SKILLS.length) % NOVA_COMMAND_SKILLS.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      runPreset(NOVA_COMMAND_SKILLS[activeIndex]);
    }
  };

  const replace = async (result: string) => {
    if (!capture) return;
    const outcome = await commands.novaCommandReplace(result, capture.target);
    if (outcome.status === "error") {
      setReplaceBlocked(true);
      setPhase({ name: "error", message: commandMessage(outcome.error) });
      return;
    }
    onClose();
  };

  const copy = async (result: string) => {
    // Chemin totalement distinct de la mécanique expérimentale de Remplacer :
    // ici on écrit dans le presse-papiers et on s'arrête. Aucune restauration,
    // aucune frappe simulée, aucune fenêtre cible.
    await writeText(result);
    setCopied(true);
    window.setTimeout(onClose, 700);
  };

  return (
    <CommandPaletteSurface
      label={t("novaCommands.title")}
      onClose={onClose}
      onKeyDown={phase.name === "choosing" ? handleListKeyDown : undefined}
    >
      {phase.name === "choosing" && capture && (
        <div>
          <SelectionExcerpt text={capture.text} />

          <ul
            role="listbox"
            aria-label={t("novaCommands.title")}
            className="px-1.5 py-1.5"
          >
            {NOVA_COMMAND_SKILLS.map((skill, index) => {
              const Icon = skill.icon;
              const active = index === activeIndex;
              return (
                <li key={skill.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runPreset(skill)}
                    className={`flex w-full items-center gap-3 rounded-chip px-2.5 py-2 text-start transition-colors duration-[120ms] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      active ? "bg-accent/10" : "hover:bg-mid-gray/8"
                    }`}
                  >
                    <Icon
                      size={17}
                      strokeWidth={1.75}
                      className={`shrink-0 ${active ? "text-accent" : "text-text-secondary"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text">
                        {t(skill.nameKey)}
                      </span>
                    </span>
                    {/* Le chevron n'apparaît que sur la ligne active : il
                        indique ce qu'Entrée déclenchera, pas une décoration. */}
                    {active && (
                      <CornerDownLeft
                        size={14}
                        strokeWidth={2}
                        className="shrink-0 text-accent"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <form
            className="flex items-center gap-2 border-t border-hairline px-3 py-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              const instruction = askInstruction.trim();
              if (instruction) {
                // La consigne vient du champ, pas du catalogue : `ASK_NOVA`
                // n'en porte aucune, justement parce qu'elle est libre.
                void run(
                  { ...ASK_NOVA, instruction: () => instruction },
                  instruction,
                );
              }
            }}
          >
            <Input
              variant="compact"
              value={askInstruction}
              onChange={(event) => setAskInstruction(event.target.value)}
              placeholder={t("novaCommands.askPlaceholder")}
              aria-label={t("novaCommands.skill.ask.name")}
              className="flex-1 min-w-0"
            />
            <Button type="submit" size="sm" disabled={!askInstruction.trim()}>
              {t("novaCommands.ask")}
            </Button>
          </form>
        </div>
      )}

      {phase.name === "running" && (
        <div className="flex items-center gap-3 px-4 py-6" role="status">
          {/* Indicateur discret et honnête : aucun pourcentage ne peut être
              calculé, un faux progrès serait une invention. */}
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-accent border-t-transparent motion-safe:animate-spin"
          />
          <p className="text-sm text-text-secondary">
            {t("novaCommands.running")}
          </p>
        </div>
      )}

      {phase.name === "result" && (
        <>
          <header className="shrink-0 border-b border-hairline px-4 py-2.5">
            <h2 className="text-sm font-medium text-text">
              {t(phase.skill.nameKey)}
            </h2>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {/* L'original n'est montré que lorsqu'il y a quelque chose à
                comparer — une réécriture. Une explication ne se compare pas au
                texte qui l'a provoquée. */}
            {phase.skill.showsOriginal && capture && (
              <section className="mb-3">
                <SectionLabel>{t("novaCommands.original")}</SectionLabel>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                  {capture.text}
                </p>
              </section>
            )}
            {phase.skill.showsOriginal && (
              <SectionLabel>{t("novaCommands.result")}</SectionLabel>
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
              {phase.result}
            </p>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-3 py-2.5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("novaCommands.close")}
            </Button>
            {/* Remplacer reste secondaire tant que la couche native n'est pas
                validée : l'action sûre doit être la plus évidente. */}
            <Button
              variant="secondary"
              size="sm"
              disabled={replaceBlocked || !capture}
              onClick={() => void replace(phase.result)}
            >
              {t("novaCommands.replace")}
            </Button>
            <Button size="sm" onClick={() => void copy(phase.result)}>
              {copied ? t("novaCommands.copied") : t("novaCommands.copy")}
            </Button>
          </footer>
        </>
      )}

      {phase.name === "error" && (
        <div className="px-4 py-4">
          <h2 className="text-sm font-medium text-text">
            {t(phase.message.titleKey)}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            {t(phase.message.bodyKey)}
          </p>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t("novaCommands.close")}
            </Button>
          </div>
        </div>
      )}
    </CommandPaletteSurface>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
    {children}
  </h3>
);

/**
 * Rappel de ce sur quoi Nova va travailler. Tronqué : la palette montre assez
 * pour confirmer la bonne sélection, pas pour relire le document.
 */
const SelectionExcerpt: React.FC<{ text: string }> = ({ text }) => {
  const excerpt = text.length > 160 ? `${text.slice(0, 160)}…` : text;

  return (
    <p className="shrink-0 border-b border-hairline px-4 py-2.5 text-xs leading-relaxed text-text-secondary line-clamp-2">
      {excerpt}
    </p>
  );
};

export default NovaCommandPalette;
