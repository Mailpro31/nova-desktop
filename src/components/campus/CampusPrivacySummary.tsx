import React from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CampusPrivacyPolicy } from "@/lib/campusPolicy";

interface CampusPrivacySummaryProps {
  policy: CampusPrivacyPolicy;
}

export const CampusPrivacySummary: React.FC<CampusPrivacySummaryProps> = ({
  policy,
}) => {
  const { t } = useTranslation();

  if (!policy.verified) {
    return (
      <div className="flex items-start gap-3 py-4">
        <ShieldCheck
          size={18}
          className="mt-0.5 shrink-0 text-text-secondary"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium text-text">
            {t("campus.privacy.institutionPolicyTitle")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            {t("campus.privacy.institutionPolicyDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-4">
      <ShieldCheck
        size={18}
        className="mt-0.5 shrink-0 text-success"
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-medium text-text">
          {policy.contentRetention === "not_stored"
            ? t("campus.privacy.notStoredTitle")
            : t("campus.privacy.privateByDesign")}
        </p>
        {policy.usageCounters === "counts_only" && (
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            {t("campus.privacy.countersOnly")}
          </p>
        )}
      </div>
    </div>
  );
};
