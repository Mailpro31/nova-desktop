import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  BookOpenText,
  GraduationCap,
  History,
  House,
  Link2,
  MessageSquareText,
  Mic,
  NotebookPen,
  Pencil,
  Sparkles,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import { useIsSectionVisible, type SidebarSection } from "@/components/Sidebar";
import {
  tourCardsFor,
  TOUR_REPLAY_EVENT,
  isTourSeen,
  markTourSeen,
} from "@/lib/featureTour";

const ICONS: Record<string, LucideIcon> = {
  dictation: House,
  voiceCommands: Mic,
  styles: Sparkles,
  commands: BookOpen,
  aiSkills: Wand2,
  reader: BookOpenText,
  dictionary: Pencil,
  courseNotes: NotebookPen,
  notes: NotebookPen,
  prompts: MessageSquareText,
  meeting: Users,
  learn: GraduationCap,
  history: History,
  connections: Link2,
};

interface FeatureTourProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (section: SidebarSection) => void;
}

/** Une fonctionnalité par carte ; Échap, la croix et « Passer » ferment et marquent la visite vue. */
export const FeatureTour: React.FC<FeatureTourProps> = ({
  open,
  onClose,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const cards = tourCardsFor(useIsSectionVisible());
  const total = cards.length;
  const card = cards[Math.min(index, total - 1)];
  const last = index === total - 1;
  const Icon = ICONS[card.id] ?? Sparkles;

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, total - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, total]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("featureTour.title")}
      closeLabel={t("featureTour.close")}
      closeOnBackdrop={false}
      contentFades={false}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            {t("featureTour.skip")}
          </Button>
          {index > 0 && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => setIndex(index - 1)}
            >
              {t("featureTour.previous")}
            </Button>
          )}
          <Button
            size="md"
            onClick={() => (last ? onClose() : setIndex(index + 1))}
          >
            {last ? t("featureTour.finish") : t("featureTour.next")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-card bg-accent/10 text-accent">
          <Icon size={32} strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h3 className="text-xl font-semibold text-text">
          {t(`featureTour.cards.${card.id}.title`)}
        </h3>
        <p
          className="text-base leading-relaxed text-text-secondary"
          aria-live="polite"
        >
          {t(`featureTour.cards.${card.id}.text`)}
        </p>
        {card.section && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              onNavigate(card.section!);
              onClose();
            }}
          >
            {t("featureTour.open")}
          </Button>
        )}
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-label={t("featureTour.progress", {
            current: index + 1,
            total,
          })}
          className="h-1.5 w-full overflow-hidden rounded-full bg-mid-gray/20"
        >
          <div
            className="h-full bg-accent motion-safe:transition-[width] motion-safe:duration-200"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <p className="text-xs text-text-secondary">
          {t("featureTour.progress", { current: index + 1, total })}
        </p>
      </div>
    </Dialog>
  );
};

/** Lance la visite une seule fois, et à chaque « Revoir la visite ». */
export const FeatureTourGate: React.FC<{
  onNavigate: (section: SidebarSection) => void;
}> = ({ onNavigate }) => {
  const [open, setOpen] = useState(() => !isTourSeen());

  useEffect(() => {
    const replay = () => setOpen(true);
    window.addEventListener(TOUR_REPLAY_EVENT, replay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, replay);
  }, []);

  const close = useCallback(() => {
    markTourSeen();
    setOpen(false);
  }, []);

  return <FeatureTour open={open} onClose={close} onNavigate={onNavigate} />;
};

export default FeatureTourGate;
