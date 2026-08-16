import React from "react";
import { Button, Dialog } from "nova-app";

const noop = () => {};

// Dialog rend son contenu dans un portail : la carte est configurée en
// `cardMode: single` avec un viewport dédié (voir `overrides.Dialog` dans
// `.design-sync/config.json`) pour que l'état ouvert reste visible.

export const Confirmation = () => (
  <Dialog
    open
    onOpenChange={noop}
    closeLabel="Fermer"
    title="Supprimer l’historique ?"
    description="Les transcriptions et les enregistrements conservés localement seront effacés définitivement."
    footer={
      <>
        <Button variant="ghost" size="md">
          Annuler
        </Button>
        <Button variant="danger" size="md">
          Supprimer
        </Button>
      </>
    }
  >
    <p style={{ fontSize: 14, lineHeight: 1.5 }}>
      Cette action porte sur 128 transcriptions et 42 enregistrements audio,
      soit environ 310 Mo. Les modèles téléchargés ne sont pas concernés.
    </p>
  </Dialog>
);
