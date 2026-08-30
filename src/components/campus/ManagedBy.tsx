import React from "react";
import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ManagedByProps {
  organizationName: string;
}

export const ManagedBy: React.FC<ManagedByProps> = ({ organizationName }) => {
  const { t } = useTranslation();

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
      <Building2 size={13} aria-hidden="true" />
      {t("campus.managedBy", { organization: organizationName })}
    </span>
  );
};
