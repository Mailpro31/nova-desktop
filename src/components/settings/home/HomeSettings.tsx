import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, FileAudio } from "lucide-react";

import NovaOrb from "./NovaOrb";
import { useHomeState, type HeroSituation } from "./useHomeState";
import { CampusFileTranscribeModal } from "./CampusFileTranscribeModal";
import { Button } from "../../ui/Button";
import { KeyboardShortcut } from "../../ui/KeyboardShortcut";
import { isCampusMode } from "@/lib/mode";
import { formatRelativeTime } from "@/utils/dateFormat";
import type { SidebarSection } from "../../Sidebar";

interface HomeSettingsProps {
  onNavigate?: (section: SidebarSection) => void;
}

/**
 * Accueil de Nova — le centre de contrôle calme.
 *
 * Un seul accueil pour les deux distributions : le contenu s'adapte, la page
 * ne se dédouble pas. Il répond à quatre questions, dans cet ordre : Nova
 * est-il prêt ? comment m'en servir maintenant ? qu'est-ce qui est actif ?
 * qu'est-ce qui reste à découvrir ?
 *
 * Il **évolue avec l'usage** : tant que rien n'a été dicté, le héros explique
 * le geste et la liste de démarrage est visible ; ensuite le héros se resserre
 * et la liste disparaît d'elle-même. Personne ne doit lire « appuyez sur
 * Ctrl+Espace pour commencer » pendant six mois.
 *
 * Ce qu'il ne fait pas : afficher un statut déjà porté par la barre latérale,
 * montrer du texte dicté, ni empiler des cartes. Voir le compte rendu d'étape
 * pour ce qui en a été retiré et pourquoi.
 */
export const HomeSettings: React.FC<HomeSettingsProps> = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const home = useHomeState();
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const campusMode = isCampusMode();

  const compact = !home.isNewUser;

  return (
    <>
      <section
        className="flex flex-col items-center text-center"
        // Assez d'air pour que le héros respire, assez peu pour qu'une
        // fenêtre de 620 px laisse voir le début de la liste de démarrage.
        style={{
          paddingTop: compact ? 16 : 28,
          paddingBottom: compact ? 24 : 32,
        }}
      >
        <NovaOrb state={home.orb} size={compact ? 40 : 64} />

        <h1
          className="mt-5 font-semibold tracking-[-0.015em] text-text"
          style={{ fontSize: compact ? 20 : 26 }}
          // L'état est annoncé, pas seulement peint : l'orbe ne le porte jamais
          // seule.
          aria-live="polite"
        >
          {t(`home.hero.${home.situation}.title`)}
        </h1>

        <HeroAction
          situation={home.situation}
          shortcut={home.shortcut}
          onNavigate={onNavigate}
        />
      </section>

      {/* « Qu'est-ce qui est actif ? » — des rangées, pas des cartes : quatre
          couples libellé/valeur ne forment pas quatre regroupements. */}
      <section aria-labelledby="home-active">
        <h2
          id="home-active"
          className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary"
        >
          {t("home.active.title")}
        </h2>
        <dl>
          <ActiveRow
            label={t("home.active.style")}
            value={home.styleName ?? t("home.active.styleAutomatic")}
            onClick={() => onNavigate?.("postprocessing")}
          />
          {home.engineKey && (
            <ActiveRow
              label={t("home.active.engine")}
              value={t(`home.engine.${home.engineKey}`)}
            />
          )}
          {home.microphoneName && (
            <ActiveRow
              label={t("home.active.microphone")}
              value={home.microphoneName}
            />
          )}
          {home.lastDictationAt !== null && (
            // Un horodatage, jamais le contenu : l'accueil peut être vu
            // par-dessus l'épaule de l'utilisateur.
            <ActiveRow
              label={t("home.active.lastDictation")}
              value={formatRelativeTime(
                String(home.lastDictationAt),
                i18n.language,
              )}
              onClick={() => onNavigate?.("history")}
            />
          )}
        </dl>
      </section>

      {home.showChecklist && (
        <section className="mt-[32px]" aria-labelledby="home-checklist">
          <h2
            id="home-checklist"
            className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
          >
            {t("home.checklist.title")}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {home.checklist.map((item) => (
              <ChecklistRow
                key={item.id}
                label={t(item.labelKey)}
                done={item.done}
                onClick={
                  item.target && !item.done
                    ? () => onNavigate?.(item.target!)
                    : undefined
                }
              />
            ))}
          </ul>
        </section>
      )}

      {/* Transcription de fichier : seule porte d'entrée de cette capacité
          dans tout le produit, donc elle reste ici — ce n'est pas un raccourci
          redondant vers une destination de la barre latérale. */}
      {campusMode && (
        <section className="mt-[32px] border-t border-hairline pt-[20px]">
          <button
            type="button"
            onClick={() => setFileModalOpen(true)}
            className="flex w-full items-center gap-3 rounded-chip px-2 py-2 text-start transition-colors duration-[140ms] cursor-pointer hover:bg-mid-gray/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <FileAudio
              size={17}
              strokeWidth={1.75}
              className="shrink-0 text-text-secondary"
              aria-hidden="true"
            />
            <span className="flex-1 text-sm text-text">
              {t("campus.files.actionButton")}
            </span>
            <ChevronRight
              size={15}
              strokeWidth={2}
              className="shrink-0 text-text-secondary"
              aria-hidden="true"
            />
          </button>
        </section>
      )}

      <CampusFileTranscribeModal
        isOpen={fileModalOpen}
        onClose={() => setFileModalOpen(false)}
      />
    </>
  );
};

/**
 * L'action qui suit l'état. Un raccourci quand il y en a un, un bouton vers
 * l'endroit où le problème se règle sinon — jamais un raccourci inventé.
 */
const HeroAction: React.FC<{
  situation: HeroSituation;
  shortcut: string | null;
  onNavigate?: (section: SidebarSection) => void;
}> = ({ situation, shortcut, onNavigate }) => {
  const { t } = useTranslation();

  if (situation === "checking") return null;

  // Pendant une dictée, aucune action : l'utilisateur parle ou attend.
  if (situation === "listening" || situation === "processing") return null;

  // Le texte est dans le presse-papiers — c'est la seule chose à savoir, et la
  // touche à presser vaut mieux qu'un bouton vers les réglages.
  if (situation === "insertionFailed") {
    return (
      <>
        <p className="mt-2 max-w-[380px] text-sm leading-relaxed text-text-secondary">
          {t("home.hero.insertionFailed.detail")}
        </p>
        <p className="mt-3">
          <KeyboardShortcut binding="Ctrl+V" size="sm" />
        </p>
      </>
    );
  }

  if (situation === "ready" || situation === "campusLocal") {
    return (
      <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-text-secondary">
        {shortcut && <KeyboardShortcut binding={shortcut} />}
        <span>{t("home.hero.dictateHint")}</span>
        {situation === "campusLocal" && (
          <span className="w-full text-xs">
            {t("home.hero.campusLocal.detail")}
          </span>
        )}
      </p>
    );
  }

  return (
    <>
      <p className="mt-2 max-w-[380px] text-sm leading-relaxed text-text-secondary">
        {t(`home.hero.${situation}.detail`)}
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-4"
        onClick={() => onNavigate?.("configuration")}
      >
        {t("home.hero.openSettings")}
      </Button>
    </>
  );
};

const ActiveRow: React.FC<{
  label: string;
  value: string;
  onClick?: () => void;
}> = ({ label, value, onClick }) => {
  const content = (
    <>
      <dt className="shrink-0 text-sm text-text-secondary">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-end text-sm text-text">
        {value}
      </dd>
    </>
  );

  if (!onClick) {
    return (
      <div className="flex items-center gap-4 border-b border-hairline px-2 py-2.5 last:border-b-0">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 border-b border-hairline px-2 py-2.5 text-start transition-colors duration-[140ms] cursor-pointer last:border-b-0 hover:bg-mid-gray/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {content}
      <ChevronRight
        size={15}
        strokeWidth={2}
        className="shrink-0 text-text-secondary"
        aria-hidden="true"
      />
    </button>
  );
};

const ChecklistRow: React.FC<{
  label: string;
  done: boolean;
  onClick?: () => void;
}> = ({ label, done, onClick }) => {
  const { t } = useTranslation();

  const inner = (
    <>
      {/* La coche et le cercle vide se distinguent par leur forme autant que
          par leur couleur ; l'état est aussi énoncé pour les lecteurs d'écran. */}
      <span
        aria-hidden="true"
        className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border transition-colors duration-[160ms] ${
          done
            ? "border-accent bg-accent/12 text-accent"
            : "border-hairline-strong text-transparent"
        }`}
      >
        <Check size={10} strokeWidth={3} />
      </span>
      <span
        className={`flex-1 text-sm transition-colors duration-[160ms] ${
          done ? "text-text-secondary" : "text-text"
        }`}
      >
        {label}
      </span>
      <span className="sr-only">
        {done ? t("home.checklist.done") : t("home.checklist.todo")}
      </span>
    </>
  );

  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-2.5 rounded-chip px-2 py-1.5 text-start transition-colors duration-[140ms] cursor-pointer hover:bg-mid-gray/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {inner}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-2 py-1.5">{inner}</div>
      )}
    </li>
  );
};

export default HomeSettings;
