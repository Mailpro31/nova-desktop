import React from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ManagedBy } from "@/components/campus/ManagedBy";
import { CampusPrivacySummary } from "@/components/campus/CampusPrivacySummary";
import {
  campusOrganizationLabel,
  type CampusCapabilities,
} from "@/lib/campusPolicy";
import { useCampusStore } from "@/stores/campusStore";

const FEATURE_KEYS: Array<{
  capability: keyof CampusCapabilities;
  labelKey: string;
}> = [
  { capability: "dictation", labelKey: "campus.features.dictation" },
  { capability: "rewrite", labelKey: "campus.features.rewrite" },
  { capability: "styles", labelKey: "campus.features.styles" },
  {
    capability: "fileTranscription",
    labelKey: "campus.features.fileTranscription",
  },
];

export const CampusOrganizationSettings: React.FC = () => {
  const { t } = useTranslation();
  const context = useCampusStore((state) => state.context);
  const session = useCampusStore((state) => state.session);
  const connectionStatus = useCampusStore((state) => state.connectionStatus);
  const { organization, capabilities, privacy, authMethods, educationMode } =
    context;
  const role = organization.role
    ? t(`campus.roles.${organization.role}`)
    : null;
  const roleAndCohort = [role, organization.cohort].filter(Boolean).join(" · ");
  const organizationName = organization.shortName ?? organization.name;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-7">
      <div className="space-y-1 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
          {t("campus.page.eyebrow")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {campusOrganizationLabel(organization)}
        </h1>
        {roleAndCohort && (
          <p className="text-base text-text-secondary">{roleAndCohort}</p>
        )}
        {organization.managed && (
          <div className="pt-2">
            <ManagedBy organizationName={organizationName} />
          </div>
        )}
      </div>

      <section className="divide-y divide-hairline border-y border-hairline">
        <div className="py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">
            {t("campus.page.processing.label")}
          </p>
          <h2 className="mt-2 text-base font-semibold text-text">
            {connectionStatus === "connected"
              ? t("campus.page.processing.campusTitle")
              : t("campus.page.processing.localTitle")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">
            {connectionStatus === "connected"
              ? t("campus.page.processing.campusDescription")
              : t("campus.page.processing.localDescription")}
          </p>
        </div>

        <div className="py-1">
          <CampusPrivacySummary policy={privacy} />
        </div>

        <div className="py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">
            {t("campus.page.features")}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {FEATURE_KEYS.filter(
              ({ capability }) => capabilities[capability],
            ).map(({ capability, labelKey }) => (
              <li
                key={capability}
                className="flex items-center gap-2 text-sm text-text"
              >
                <Check size={15} className="text-success" aria-hidden="true" />
                {t(labelKey)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <details className="group border-b border-hairline pb-4">
        <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {t("campus.page.systemStatus")}
          <ChevronDown
            size={16}
            className="transition-transform duration-150 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-secondary">
              {t("campus.account.server")}
            </dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-text">
              {session?.server_url ?? t("campus.status.unavailable")}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">
              {t("campus.page.authMethod")}
            </dt>
            <dd className="mt-0.5 text-text">{authMethods.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">
              {t("campus.page.educationMode")}
            </dt>
            <dd className="mt-0.5 capitalize text-text">{educationMode}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
};

export default CampusOrganizationSettings;
