# Corpus de validation de la reformulation

Ce dossier contient les **fixtures de test** du moteur de reformulation de Nova
(Intelligence privée + Turbo). Objectif : vérifier, à chaque changement de
prompt, que la reformulation **comprend le sens** d'une dictée réelle — y compris
les hésitations et les **auto-corrections dites à voix haute** — **sans jamais**
réagir à des mots-clés ou à des commandes préétablies.

## Fichiers

- `corpus.fr.json` — **100** dictées réelles en **français** (hésitations,
  auto-corrections, réordonnancements, argot, anglicismes, phrases incomplètes,
  ponctuation orale).
- `corpus.en.json` — **100** dictées réelles en **anglais**, avec ses propres expressions
  idiomatiques (ce n'est **pas** une traduction du FR).
- `style-prompts.json` — copie des consignes persistées de Style. Le harnais
  applique ensuite le contrat compact et versionné `rewrite-v2`, comme le Rust ;
  ces consignes restent le repli des Styles personnalisés.

## Schéma d'un cas

```jsonc
{
  "id": "fr-autocorrection-001",
  "category": "auto-correction", // priorité du corpus
  "style": "nova_style_todo", // id de Style (cf. settings.rs)
  "dictation": "…", // texte dicté BRUT (transcription)
  "expected": "…", // résultat idéal attendu (référence humaine)
  "must_include": ["…"], // sous-chaînes qui DOIVENT apparaître (optionnel)
  "must_exclude": ["ah non", "en fait"], // sous-chaînes INTERDITES (optionnel)
  "notes": "…", // intention du cas
}
```

Les Styles disponibles (`style`) :
`default_improve_transcriptions`, `nova_style_email`, `nova_style_messages`,
`nova_style_prompt`, `nova_style_todo`, `nova_style_notes`,
`nova_style_meeting`, `nova_style_voice_to_text`.

## Pourquoi `must_include` / `must_exclude`

Une sortie de LLM libre ne se compare pas au caractère près : deux formulations
correctes diffèrent. Le harnais accepte donc un cas si **l'une** de ces
conditions est vraie :

1. la sortie normalisée est **identique** à `expected` ; **ou**
2. **toutes** les `must_include` sont présentes **et aucune** `must_exclude`
   n'apparaît.

`must_exclude` est le cœur du test d'auto-correction : la trace de l'hésitation
(« ah non en fait », « euh pardon », « scratch that ») ne doit **jamais**
survivre dans le résultat.

## Exécuter le harnais (golden test)

Le harnais ne tourne **pas** en CI par défaut (aucun modèle disponible). Il se
lance contre un endpoint **compatible OpenAI** (llama-server local de Nova, ou
un relais) :

```bash
NOVA_GOLDEN_LLM_URL="http://127.0.0.1:8080/v1/chat/completions" \
NOVA_GOLDEN_LLM_MODEL="nova-local" \
bun run golden:reformulation            # tout le corpus
bun run golden:reformulation -- --lang fr --category auto-correction  # filtré
```

Voir `scripts/reformulation-golden.ts` pour les options
(`--lang`, `--style`, `--category`, `--id`, `--limit`, `--json`).
