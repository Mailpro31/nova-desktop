import React from "react";
import { LicenseSettings } from "../license/LicenseSettings";
import { TierComparisonTable } from "../license/TierComparisonTable";

/**
 * « Compte » — palier actif, licence, comparatif des paliers. Anciennement
 * mélangé au bas de la section À propos ; sa propre section rend le palier
 * et l'abonnement faciles à retrouver.
 */
export const AccountSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <LicenseSettings />
      <TierComparisonTable />
    </div>
  );
};

export default AccountSettings;
