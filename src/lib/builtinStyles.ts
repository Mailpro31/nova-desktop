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
  "nova_style_voice_to_text",
];
