// Styles INTÉGRÉS de Nova (presets d'origine). Doit rester synchronisé avec
// `settings::default_post_process_prompts` et `licensing::BUILTIN_STYLE_IDS`
// côté Rust. Tout Style hors de cette liste est un Style PERSONNEL (Ultra).
export const BUILTIN_STYLE_IDS: readonly string[] = [
  "default_improve_transcriptions",
  "nova_style_email",
  "nova_style_messages",
  "nova_style_prompt",
  "nova_style_todo",
  "nova_style_notes",
  "nova_style_meeting",
  "nova_style_voice_to_text",
];

// Styles inclus dans le palier Free — doit rester synchronisé avec
// `licensing::FREE_STYLE_IDS` côté Rust. Exactement trois : « Transcription
// améliorée », « E-mail » et « Notes ». Les autres presets intégrés
// nécessitent Nova Pro (`all_styles`) ; les Styles personnels, Nova Ultra
// (`custom_styles`).
export const FREE_STYLE_IDS: readonly string[] = [
  "default_improve_transcriptions",
  "nova_style_email",
  "nova_style_notes",
];

// Fonctionnalité de palier requise pour appliquer un Style donné. Un Style
// gratuit ne requiert rien (null) ; un preset intégré payant requiert
// « all_styles » (Nova Pro) ; un Style personnel requiert « custom_styles »
// (Nova Ultra). Le mode « Automatique » requiert aussi Pro (« all_styles »).
export function styleLockFeature(id: string): string | null {
  if (id === "auto") return "all_styles";
  if (FREE_STYLE_IDS.includes(id)) return null;
  return BUILTIN_STYLE_IDS.includes(id) ? "all_styles" : "custom_styles";
}
