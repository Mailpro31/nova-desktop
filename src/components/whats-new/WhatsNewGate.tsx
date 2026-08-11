import React, { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { showAttentionToast } from "../../lib/attentionNotifications";
import { findReleaseNoteToShow } from "./releaseNotes";
import type { ReleaseNote } from "./releaseNotes";
import { WhatsNewModal } from "./WhatsNewModal";

export const WhatsNewGate: React.FC = () => {
  const { t } = useTranslation();
  const { settings, isLoading, updateSetting } = useSettings();
  const [note, setNote] = useState<ReleaseNote | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dismissedVersionRef = useRef<string | null>(null);
  const notifiedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !settings || !settings.show_whats_new_on_update) {
      setIsOpen(false);
      setNote(null);
      return;
    }

    let cancelled = false;

    const loadReleaseNote = async () => {
      try {
        const currentVersion = await getVersion();
        if (cancelled) return;

        const releaseNote = findReleaseNoteToShow({
          currentVersion,
          lastSeenVersion: settings.whats_new_last_seen_version ?? "",
        });

        if (!releaseNote || notifiedVersionRef.current === releaseNote.version)
          return;

        notifiedVersionRef.current = releaseNote.version;
        void updateSetting("whats_new_last_seen_version", releaseNote.version);
        showAttentionToast("info", t("whatsNew.updatedNotice"), {
          description: t("whatsNew.updatedVersion", {
            version: releaseNote.version,
          }),
          action: {
            label: t("whatsNew.view"),
            onClick: () => {
              setNote(releaseNote);
              setIsOpen(true);
            },
          },
        });
      } catch (error) {
        console.error("Failed to load release notes:", error);
      }
    };

    void loadReleaseNote();

    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    settings,
    settings?.show_whats_new_on_update,
    settings?.whats_new_last_seen_version,
    t,
    updateSetting,
  ]);

  const dismiss = () => {
    if (!note) return;

    dismissedVersionRef.current = note.version;
    setIsOpen(false);
    void updateSetting("whats_new_last_seen_version", note.version);
  };

  if (!note) return null;

  return <WhatsNewModal note={note} open={isOpen} onDismiss={dismiss} />;
};
