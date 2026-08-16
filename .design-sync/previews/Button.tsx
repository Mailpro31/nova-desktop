import React from "react";
import { Button } from "nova-app";

// La mise en page des cellules utilise des styles inline volontairement : le
// CSS du design system est compilé par Tailwind avant les aperçus, donc une
// classe utilitaire employée uniquement ici pourrait ne pas exister dans la
// feuille livrée. Les composants, eux, apportent leurs propres classes.
const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
};

export const Variants = () => (
  <div style={row}>
    <Button variant="primary">Enregistrer</Button>
    <Button variant="primary-soft">Transcrire</Button>
    <Button variant="secondary">Annuler</Button>
    <Button variant="danger">Supprimer l’historique</Button>
    <Button variant="danger-ghost">Réinitialiser</Button>
    <Button variant="ghost">Plus tard</Button>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Button size="sm">Petit</Button>
    <Button size="md">Moyen</Button>
    <Button size="lg">Grand</Button>
  </div>
);

export const Disabled = () => (
  <div style={row}>
    <Button disabled>Enregistrer</Button>
    <Button variant="secondary" disabled>
      Annuler
    </Button>
    <Button variant="danger" disabled>
      Supprimer
    </Button>
  </div>
);

export const DialogActions = () => (
  <div style={{ ...row, justifyContent: "flex-end", gap: 8 }}>
    <Button variant="ghost" size="md">
      Annuler
    </Button>
    <Button variant="primary" size="md">
      Télécharger le modèle
    </Button>
  </div>
);
