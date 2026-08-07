import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { ToggleSwitch } from "../ui/ToggleSwitch";

interface VoiceCommandsProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const VoiceCommands: React.FC<VoiceCommandsProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const [enabled, setEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const value = (
      settings as (typeof settings & { voice_commands_enabled?: boolean })
    )?.voice_commands_enabled;
    setEnabled(value ?? true);
  }, [settings]);

  const change = async (next: boolean) => {
    setEnabled(next);
    setUpdating(true);
    try {
      await invoke("change_voice_commands_setting", { enabled: next });
      await refreshSettings();
    } catch {
      setEnabled(!next);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <ToggleSwitch
      checked={enabled}
      onChange={change}
      isUpdating={updating}
      label={t("voiceCommands.title")}
      description={t("voiceCommands.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
    />
  );
};
