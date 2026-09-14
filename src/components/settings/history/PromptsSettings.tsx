import React from "react";

import { HistorySettings } from "./HistorySettings";

/**
 * Prompts — les prompts que Nova a écrits à partir des dictées.
 *
 * Le Style prompt transforme une dictée en prompt structuré pour une IA. Ces
 * prompts restaient mélangés à toutes les autres dictées de l'historique, alors
 * qu'on les cherche pour les réutiliser. La page reprend l'historique — mêmes
 * lignes, même copie, même favori, même recherche — limité à ce Style : aucune
 * donnée nouvelle, aucun second stockage.
 */
export const PromptsSettings: React.FC = () => (
  <HistorySettings variant="prompts" />
);

export default PromptsSettings;
