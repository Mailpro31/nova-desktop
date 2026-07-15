import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

// Renvoyé par la commande Rust `get_week_stat` (absente des bindings tant que le
// build de debug n'a pas régénéré les types → lecture souple via invoke brut).
type WeekStat = {
  words: number;
  chars: number;
  minutes: number;
  resets_at: number;
};

/**
 * Statistique de valeur de la semaine (« X mots dictés »). Rappel de valeur, pas
 * un quota : texte sobre, gris, sans barre ni accent. S'affiche dès qu'au moins
 * un mot a été dicté cette semaine.
 */
export const WeekStat: React.FC = () => {
  const { t } = useTranslation();
  const [stat, setStat] = useState<WeekStat | null>(null);

  useEffect(() => {
    invoke<WeekStat>("get_week_stat")
      .then(setStat)
      .catch(() => setStat(null));
  }, []);

  if (!stat || stat.words <= 0) return null;

  return (
    <div className="px-4 py-3 flex flex-col gap-0.5">
      <span className="text-sm text-text-primary tabular-nums">
        {t("weekStat.words", { count: stat.words })}
      </span>
      {stat.minutes > 0 && (
        <span className="text-[12px] text-text-secondary">
          {t("weekStat.minutes", { count: stat.minutes })}
        </span>
      )}
    </div>
  );
};

export default WeekStat;
