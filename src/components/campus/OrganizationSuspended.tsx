import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui";
import { campusOrganizationLabel } from "@/lib/campusPolicy";
import { refreshCampusContext, useCampusStore } from "@/stores/campusStore";

/**
 * Écran bloquant d'un membre suspendu.
 *
 * L'organisation — ou son annuaire, au départ d'une personne — a suspendu le
 * compte : Nova n'offre plus rien sur ce poste, pas même le repli Personal.
 * Rien n'est supprimé ; dès que `/api/me` répond de nouveau, le store lève
 * l'écran de lui-même.
 */
export const OrganizationSuspended: React.FC = () => {
  const { t } = useTranslation();
  const organizationName = useCampusStore((state) =>
    state.config ? campusOrganizationLabel(state.context.organization) : null,
  );
  const [checking, setChecking] = useState(false);

  const checkAgain = async () => {
    setChecking(true);
    try {
      await refreshCampusContext();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-text px-6 py-8 gap-5 overflow-y-auto">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
        <Ban width={24} height={24} aria-hidden="true" />
      </div>
      <div className="max-w-[480px] w-full flex flex-col items-center gap-2 text-center">
        <h1 className="text-[26px] font-semibold tracking-[-0.015em] leading-tight">
          {t("campus.suspended.screenTitle")}
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          {organizationName
            ? t("campus.suspended.screenDescriptionNamed", {
                organization: organizationName,
              })
            : t("campus.suspended.screenDescription")}
        </p>
        <p className="text-xs text-text-secondary leading-relaxed">
          {t("campus.suspended.nothingDeleted")}
        </p>
      </div>
      <Button
        variant="secondary"
        onClick={() => void checkAgain()}
        disabled={checking}
      >
        {t("campus.suspended.checkAgain")}
      </Button>
    </div>
  );
};

export default OrganizationSuspended;
