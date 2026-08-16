import React from "react";

export type OrbState =
  | "checking"
  | "ready"
  | "listening"
  | "processing"
  | "attention"
  | "degraded";

interface NovaOrbProps {
  state: OrbState;
  size: number;
}

/**
 * L'orbe Nova sur l'accueil.
 *
 * Même identité que partout ailleurs — le dégradé radial et le halo lisent les
 * variables `--orb-*` posées par `orbTheme`, donc le thème choisi par
 * l'utilisateur s'y applique sans code supplémentaire.
 *
 * **Elle porte un état, elle ne décore pas.** Au repos elle respire lentement ;
 * quand quelque chose attend l'utilisateur, elle s'immobilise et son halo
 * s'éteint. Une animation permanente et identique dans tous les cas ne dirait
 * rien et attirerait l'œil en continu sur un écran qu'on regarde longtemps.
 *
 * La couleur ne porte jamais l'information seule : l'état est toujours écrit à
 * côté, dans le titre du héros.
 *
 * Contenue par construction : dimension fixe en pixels, `flex: none`, et le
 * halo est un `box-shadow` — il ne participe pas à la mise en page et ne peut
 * donc pas déborder de son emplacement.
 */
export const NovaOrb: React.FC<NovaOrbProps> = ({ state, size }) => {
  const glow = GLOW[state];

  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 rounded-full ${ANIMATION[state]}`}
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 34% 30%," +
          " var(--orb-s0, #ffffff) 0%," +
          " var(--orb-s1, #dfe7fa) 18%," +
          " var(--orb-s2, #aebeec) 45%," +
          " var(--orb-s3, #93a6e0) 72%," +
          " var(--orb-s4, #7e92d6) 100%)",
        boxShadow: `inset 0 0 ${size / 8}px rgba(255,255,255,0.5), 0 0 ${size / 3}px rgba(var(--orb-glow, 126, 146, 214), ${glow})`,
        // Un état qui demande une action : l'orbe se retire visuellement au
        // profit du message, au lieu de continuer à rayonner comme si tout
        // allait bien.
        opacity: DIMMED.has(state) ? 0.55 : 1,
        filter: state === "attention" ? "saturate(0.35)" : undefined,
      }}
    />
  );
};

/**
 * Le mouvement dit l'activité, l'écrit dit l'état : l'orbe ne porte jamais
 * l'information seule, et `motion-safe:` la fige quand le mouvement est réduit
 * — l'écoute reste alors identifiable par son halo plein et son libellé.
 */
const ANIMATION: Record<OrbState, string> = {
  ready: "motion-safe:animate-[nova-orb-breath_3.2s_ease-in-out_infinite]",
  // Respiration plus ample et plus rapide : Nova est à l'écoute, pas au repos.
  listening: "motion-safe:animate-[nova-orb-listen_1.6s_ease-in-out_infinite]",
  processing: "motion-safe:animate-[nova-orb-work_1.1s_ease-in-out_infinite]",
  checking: "",
  attention: "",
  degraded: "",
};

/** États où l'orbe se retire au profit du message. */
const DIMMED = new Set<OrbState>(["checking", "attention", "degraded"]);

const GLOW: Record<OrbState, number> = {
  ready: 0.4,
  listening: 0.55,
  processing: 0.35,
  degraded: 0.18,
  checking: 0.12,
  attention: 0.08,
};

export default NovaOrb;
