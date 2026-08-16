import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { emit } from "@tauri-apps/api/event";

import { PageHeader } from "../../shell/PageHeader";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { CAMPUS_CAPABILITIES, DATA_ROWS } from "./campusCapabilities";
import { useCampusStatus } from "../../../hooks/useCampusStatus";
import { useOrganization } from "../../../hooks/useOrganization";
import { commands } from "@/bindings";
import { clearCampusSession } from "@/lib/campusSession";

interface Profile {
  role: string;
  cohort: string;
}

/**
 * Page « Établissement » — la surface institutionnelle de Nova Campus.
 *
 * Elle répond à cinq questions et s'arrête là : à quel établissement suis-je
 * relié, dans quel état est cette liaison, que fournit-il, que se passe-t-il
 * hors ligne, et où vont mes données.
 *
 * **Ce n'est pas une console d'administration.** Le serveur possède bien des
 * points de terminaison d'administration et une interface web dédiée ; les
 * exposer ici transformerait l'application étudiante en outil de gestion, et
 * afficherait des commandes qu'un étudiant n'a pas le droit d'exécuter.
 *
 * Aucun nom d'établissement n'est codé en dur : tout vient de `/api/me`.
 */
export const CampusOrganizationSettings: React.FC = () => {
  const { t } = useTranslation();
  const { session, connection, serverName, refresh } = useCampusStatus();
  const organization = useOrganization();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    commands
      .getCampusMe()
      .then((result) => {
        if (cancelled || result.status !== "ok") return;
        setProfile({ role: result.data.role, cohort: result.data.cohort });
      })
      .catch(() => {
        // Profil illisible : les lignes correspondantes disparaissent plutôt
        // que d'afficher un rôle inventé.
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const logout = async () => {
    setConfirmLogout(false);
    await clearCampusSession();
    await emit("campus-session-changed");
    refresh();
  };

  return (
    <>
      <PageHeader
        // Le nom de l'établissement n'est le titre que lorsqu'il vient du
        // serveur. Dérivé du nom d'hôte, il resterait une supposition — on
        // affiche alors le titre générique et l'hôte en donnée.
        title={
          organization?.authoritative
            ? organization.name
            : t("campus.organization.title")
        }
        description={t("campus.organization.subtitle")}
      />

      <section aria-labelledby="campus-identity">
        <SectionTitle id="campus-identity">
          {t("campus.organization.identityTitle")}
        </SectionTitle>
        <dl>
          {organization && !organization.authoritative && (
            <Row
              label={t("campus.account.server")}
              value={serverName ?? organization.name}
            />
          )}
          {session && (
            <Row label={t("campus.account.email")} value={session.email} />
          )}
          {/* Rôle et cohorte n'existent que si le serveur les renseigne :
              beaucoup de comptes n'en ont pas. */}
          {profile?.role && (
            <Row label={t("campus.account.role")} value={profile.role} />
          )}
          {profile?.cohort && (
            <Row label={t("campus.account.cohort")} value={profile.cohort} />
          )}
          <Row
            label={t("campus.organization.connection")}
            value={
              connection === "connected"
                ? t("campus.status.connected")
                : connection === "local"
                  ? t("campus.status.localActive")
                  : t("campus.account.checking")
            }
          />
        </dl>
      </section>

      <section className="mt-[32px]" aria-labelledby="campus-provides">
        <SectionTitle id="campus-provides">
          {t("campus.provides.title")}
        </SectionTitle>
        {/* Quand le serveur est injoignable, la liste décrit ce qui reviendra,
            pas ce qui marche à cet instant : le dire évite de la lire comme un
            démenti de l'état affiché juste au-dessus. */}
        {connection === "local" && (
          <p className="mb-2 text-xs leading-relaxed text-warning">
            {t("campus.provides.paused")}
          </p>
        )}
        <ul>
          {CAMPUS_CAPABILITIES.map((capability) => (
            <li
              key={capability.id}
              className="border-b border-hairline py-2.5 last:border-b-0"
            >
              <p className="text-sm text-text">{t(capability.titleKey)}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                {t(capability.descriptionKey)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Le repli local est décrit en permanence, pas seulement quand il
          survient : savoir à l'avance ce qui restera disponible évite la
          surprise le jour où le serveur tombe. */}
      <section className="mt-[32px]" aria-labelledby="campus-offline">
        <SectionTitle id="campus-offline">
          {t("campus.offline.title")}
        </SectionTitle>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("campus.offline.body")}
        </p>
      </section>

      <section className="mt-[32px]" aria-labelledby="campus-data">
        <SectionTitle id="campus-data">{t("campus.data.title")}</SectionTitle>
        <dl>
          {DATA_ROWS.map((row) => (
            <Row
              key={row.id}
              label={t(row.labelKey)}
              value={t(
                row.location === "device"
                  ? "campus.data.onDevice"
                  : "campus.data.onCampus",
              )}
            />
          ))}
        </dl>
        {/* Formulation strictement descriptive : aucune promesse de
            chiffrement, de conformité ni de non-conservation, faute de
            garantie technique vérifiable depuis l'application. */}
        <p className="mt-3 text-xs leading-relaxed text-text-secondary">
          {t("campus.data.note")}
        </p>
      </section>

      {session && (
        <section className="mt-[32px] border-t border-hairline pt-[20px]">
          <div className="flex items-center justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmLogout(true)}
            >
              {t("campus.account.logout")}
            </Button>
          </div>
        </section>
      )}

      {/* Se déconnecter oblige à refaire l'authentification par e-mail et code
          à usage unique : le coût est réel, la confirmation est justifiée. */}
      <Dialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title={t("campus.account.logoutConfirmTitle")}
        description={t("campus.account.logoutConfirmDescription")}
        closeLabel={t("common.close")}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmLogout(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void logout()}>
              {t("campus.account.logoutConfirmButton")}
            </Button>
          </div>
        }
      >
        <></>
      </Dialog>
    </>
  );
};

const SectionTitle: React.FC<{ id: string; children: React.ReactNode }> = ({
  id,
  children,
}) => (
  <h2
    id={id}
    className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary"
  >
    {children}
  </h2>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-2.5 last:border-b-0">
    <dt className="shrink-0 text-sm text-text-secondary">{label}</dt>
    <dd className="min-w-0 break-words text-end text-sm text-text">{value}</dd>
  </div>
);

export default CampusOrganizationSettings;
