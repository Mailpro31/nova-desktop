// Couleur pastel associée à chaque Style de reformulation.
//
// Les Styles Nova connus ont une teinte fixe et distincte ; tout Style
// personnalisé reçoit une pastel stable dérivée de son identifiant (hachage →
// teinte). Utilisé pour la pastille dans les réglages et pour le mini-menu de
// sélection près de la bulle. Les couleurs restent douces (pastel) pour coller
// au langage visuel Apple/Nova.

const FIXED: Record<string, string> = {
  auto: "#B8C0CC", // gris-bleu neutre : Style « Automatique »
  default_improve_transcriptions: "#AEBEEC", // bleu Nova (défaut)
  nova_style_email: "#F6BBC6", // rose
  nova_style_messages: "#AEE6D2", // menthe
  nova_style_prompt: "#CBB9F2", // lilas
  nova_style_todo: "#F2D9A6", // or
  nova_style_notes: "#9FD8F0", // ciel
  nova_style_meeting: "#F0B7A4", // corail doux
  nova_style_voice_to_text: "#C7E3A8", // vert tendre
};

// Palette pastel de repli pour les Styles personnalisés (parcourue par hachage).
const FALLBACK = [
  "#F3B7D0",
  "#B7D8F3",
  "#C4EBC0",
  "#F3D8A8",
  "#D6C2F0",
  "#A9E4DE",
  "#F0C0A8",
  "#C0D0F0",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Couleur pastel stable pour un Style, d'après son identifiant. */
export function styleColor(id: string): string {
  if (FIXED[id]) return FIXED[id];
  return FALLBACK[hashString(id) % FALLBACK.length];
}
