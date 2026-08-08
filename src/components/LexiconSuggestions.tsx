import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { commands } from "@/bindings";
import { useSettings } from "../hooks/useSettings";

/**
 * Apprentissage progressif du lexique — surface utilisateur.
 *
 * Composant sans rendu : il écoute l'évènement `lexicon-suggestion` (émis par
 * le backend quand un terme récurrent est prêt à être proposé) et affiche une
 * invite discrète « Vouliez-vous dire « X » ? » avec deux choix EXPLICITES —
 * Ajouter (au lexique) ou Ignorer (définitivement). Rien n'est jamais ajouté
 * sans ce clic : le backend se contente de compter les occurrences.
 */
export function LexiconSuggestions() {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const learningEnabled = settings?.lexicon_learning_enabled ?? true;
  // Termes déjà proposés durant cette session — évite de reproposer en boucle.
  const shownTerms = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!learningEnabled) return;

    let cancelled = false;

    const accept = async (term: string) => {
      try {
        await commands.acceptLexiconSuggestion(term);
        await refreshSettings();
        toast.success(t("lexiconLearning.added", { term }));
      } catch (e) {
        console.warn("Failed to accept lexicon suggestion:", e);
      }
    };

    const ignore = async (term: string) => {
      try {
        await commands.dismissLexiconSuggestion(term);
      } catch (e) {
        console.warn("Failed to dismiss lexicon suggestion:", e);
      }
    };

    const showPending = async () => {
      let terms: string[] = [];
      try {
        terms = await commands.getLexiconSuggestions();
      } catch (e) {
        console.warn("Failed to load lexicon suggestions:", e);
        return;
      }
      if (cancelled) return;
      for (const term of terms) {
        if (shownTerms.current.has(term)) continue;
        shownTerms.current.add(term);
        toast(t("lexiconLearning.suggestionTitle", { term }), {
          id: `lexicon-suggestion:${term}`,
          description: t("lexiconLearning.suggestionDescription"),
          duration: 15000,
          action: {
            label: t("lexiconLearning.add"),
            onClick: () => {
              void accept(term);
            },
          },
          cancel: {
            label: t("lexiconLearning.ignore"),
            onClick: () => {
              void ignore(term);
            },
          },
        });
      }
    };

    // Au montage (des suggestions peuvent déjà être prêtes) puis à chaque
    // nouvel évènement émis par le backend.
    void showPending();
    const unlisten = listen("lexicon-suggestion", () => {
      void showPending();
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [learningEnabled, refreshSettings, t]);

  return null;
}

export default LexiconSuggestions;
