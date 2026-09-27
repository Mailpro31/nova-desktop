import { useCapability } from "@/hooks/useOrganizationContext";
import {
  organizationSettingsTools,
  type OrganizationSettingsTools,
} from "@/lib/organization/settingsTools";
import { announcedTypeFrom } from "@/lib/organization/wording";
import { useOrganizationStore } from "@/stores/organizationStore";

/**
 * Ce que l'organisation ouvre, lu dans ses capacités et sa nature annoncée.
 *
 * Partagé par Réglages et par Apprendre : le cours AI Essentials doit apparaître
 * aux mêmes conditions dans les deux, sinon l'un le proposerait quand l'autre le
 * cache.
 */
export function useOrganizationSettingsTools(): OrganizationSettingsTools {
  const aiSkillsCapability = useCapability("aiSkills");
  const aiSkillsPolicyEnabled = useOrganizationStore(
    (state) => state.context.aiSkillsPolicy.enabled,
  );
  const organizationType = useOrganizationStore((state) =>
    announcedTypeFrom(
      state.serverIdentity?.organizationType,
      state.config?.organization_type,
    ),
  );
  return organizationSettingsTools({
    aiSkillsCapability,
    aiSkillsPolicyEnabled,
    organizationType,
  });
}
