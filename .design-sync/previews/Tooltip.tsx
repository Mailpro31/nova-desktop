import React, { useEffect, useRef, useState } from "react";
import { Tooltip } from "nova-app";

// Tooltip se positionne par rapport à un élément cible et se rend dans un
// portail : il faut donc l'ancrer sur un `targetRef` réel et n'afficher la
// bulle qu'après le premier rendu, quand le ref est renseigné. La carte est en
// `cardMode: single` (voir `overrides.Tooltip` dans `.design-sync/config.json`)
// pour que la bulle reste dans le cadre.

const anchorStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid rgb(128 128 128 / 0.3)",
  fontSize: 13,
};

export const BelowAnchor = () => {
  const ref = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ padding: "24px 0 120px" }}>
      <span ref={ref} style={anchorStyle}>
        Détection d’activité vocale
      </span>
      {mounted && (
        <Tooltip targetRef={ref} position="bottom">
          <p style={{ fontSize: 13, lineHeight: 1.5, textAlign: "center" }}>
            Filtre les silences avant d’envoyer l’audio au modèle. Les
            enregistrements très courts peuvent être ignorés.
          </p>
        </Tooltip>
      )}
    </div>
  );
};
