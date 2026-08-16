# Nova — ce que fait le produit

Nova est une **application de dictée vocale pour poste de travail**, construite
en Tauri 2.x (Rust + React/TypeScript). Elle est **Windows-first** ; macOS et
Linux sont pris en charge.

## Le geste central

1. L'utilisateur maintient un raccourci global (défaut Campus : `Ctrl+Espace`),
   depuis **n'importe quelle application**.
2. Nova enregistre l'audio, filtre les silences (détection d'activité vocale).
3. L'audio est transcrit.
4. Le texte est reformulé selon un « Style ».
5. Le texte est collé dans le champ actif de l'application au premier plan.

Nova est donc **invisible la plupart du temps** : elle vit dans la barre des
tâches, se manifeste par une bulle d'enregistrement flottante, et l'utilisateur
ne revient dans sa fenêtre principale que pour régler ou consulter. Une
interface qui se comporte comme une destination web permanente serait un
contresens produit.

## Deux modes, un seul code

Un drapeau de compilation `VITE_NOVA_MODE=campus|personal` (défaut `personal`)
sélectionne le mode. Le mode personnel ne doit jamais régresser.

| | **Personal** | **Campus** |
|---|---|---|
| Transcription | modèles locaux téléchargés (Whisper, Parakeet), GPU local | serveur de l'établissement (Whisper sur GPU) |
| Reformulation | moteur local ou API, selon le palier | LLM du serveur de l'établissement |
| Compte | paliers payants (Free / Pro / Ultra / Business), quotas | membre de l'établissement, **illimité, aucun palier visible** |
| Entrée | choix d'un modèle à l'onboarding | e-mail + code à 6 chiffres |
| Données | tout reste sur la machine | tout reste sur le réseau de l'établissement |

## Styles

Un « Style » est une consigne de reformulation (ex. « Transcription
améliorée », « E-mail professionnel », styles personnalisés). Le style
**Automatique** est le défaut : Nova détecte l'application au premier plan et
choisit le style adapté ; à défaut, elle applique « Transcription améliorée »
(ponctuation, hésitations, mise en forme, **sans changer le sens**).

La détection de style est **toujours locale**, y compris en mode Campus : seule
la consigne textuelle part au serveur, jamais le nom de l'application.

## Fonctions annexes

- **Historique** : transcriptions et enregistrements conservés localement, avec
  durée de rétention réglable et lecteur audio.
- **Dictionnaire / lexique** : termes que le modèle doit reconnaître ; en
  Campus, dictionnaire partagé de l'établissement (lecture seule) + personnel,
  avec apprentissage automatique des corrections.
- **Snippets vocaux** : une expression prononcée insère un contenu.
- **Règles de formatage** : conventions d'écriture imposées par
  l'établissement + règles personnelles.
- **Mode commande** : sélectionner du texte, dicter une instruction
  (« traduis en anglais »), le texte sélectionné est remplacé.
- **Transcription de fichier** : déposer un WAV/MP3/M4A/OGG, récupérer le texte.
- **Réunion** : capture de réunion (mode personnel).

## Confidentialité — argument produit central

Aucun contenu de dictée n'est conservé côté serveur. La fenêtre active est lue
puis oubliée. En Campus, chaque établissement a **son** serveur : aucune donnée
partagée entre établissements, aucun cloud externe. Ce point doit être
perceptible dans l'interface — discrètement, jamais comme un argument marketing.
