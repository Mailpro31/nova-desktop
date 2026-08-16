# Navigation et inventaire des écrans

## Structure de la fenêtre principale

```
┌──────────────────────────────────────────────────┐
│  [barre latérale]  │  contenu défilant           │
│                    │  (centré, colonne unique)   │
│                    │                             │
├──────────────────────────────────────────────────┤
│  pied de page fixe (état, modèle ou serveur)     │
└──────────────────────────────────────────────────┘
```

- **Personal** : barre latérale de 160 px, logo Nova complet en tête, entrées
  avec carré de couleur par catégorie, entrée active en **bleu accent plein**.
- **Campus** : barre latérale de 176 px, orbe + mot « Nova », entrées avec
  icône ligne, entrée active en **pilule gris clair** (pas de bleu plein).
  S'y ajoute une **roue crantée ancrée en haut à droite** qui ouvre un
  **panneau latéral droit** (largeur 320 px, voile assombri + flou léger)
  reprenant les mêmes catégories.

Le panneau latéral Campus et la barre latérale Campus **coexistent
aujourd'hui** — redondance manifeste à trancher dans la refonte.

## Sections (mode personnel)

| Section          | Contenu                                                              |
| ---------------- | -------------------------------------------------------------------- |
| Accueil          | actions rapides, état, accès aux autres sections                     |
| Configuration    | sous-onglets Général / Modèles / Avancé                              |
| Styles           | activation, liste des styles, style automatique, lecture de contexte |
| Réunion          | capture de réunion                                                   |
| Personnalisation | thème, orbe, variables personnelles                                  |
| Compte           | palier actif, licence, comparatif des paliers, quotas                |
| Historique       | transcriptions, lecteur audio, rétention                             |
| Débogage         | masqué sauf `Ctrl+Maj+D` : journaux, chemins, sondes                 |
| À propos         | version, mises à jour, nouveautés                                    |

## Sections (mode Campus)

Ordre imposé : **Accueil · Styles · Historique · Réglages · Personnalisation**.
Masquées en Campus : Réunion, Compte, Débogage, À propos (l'à-propos vit dans
Réglages).

### Accueil Campus — état actuel

- Grand titre + sous-titre.
- Pastille d'état à droite : « Connecté à {serveur} » (vert) ou « Hors ligne »
  (orange).
- 4 cartes d'action : Dicter, Annuler, Style, Transcrire un fichier — chacune
  avec icône teintée et badge de raccourci clavier (`kbd`).
- Carte « Styles » : grille de pastilles colorées, coche sur le style actif,
  lien « Tout voir ».
- Carte « Récent » : 5 dernières transcriptions, horodatage + extrait 2 lignes.
- Encart confidentialité discret en bas.

### Réglages Campus (`CampusGeneralSettings`)

Sections : Raccourcis · Son · **Dictionnaire** · **Snippets vocaux** ·
**Règles de formatage** · Compte · Bulle · À propos.
Le dictionnaire et le formatage **ne sont pas des pages séparées** : ce sont
des sections de Réglages (règle produit, cf. `05`).

## Onboarding

Enchaînement des étapes (`App.tsx`) :

```
accessibility → [ model (personal) | campus (campus) ] → style → variables → tutorial → done
```

- **accessibility** : permissions micro/accessibilité (macOS et Windows).
- **model** (personnel) : choix et téléchargement d'un modèle.
- **campus** : Bienvenue → E-mail + serveur → Code à 6 chiffres → Prêt.
- **style** : choix du Style par défaut.
- **variables** : variables personnelles rapides.
- **tutorial** : première dictée guidée.

Un utilisateur qui revient avec une session valide passe directement à `done`.
Une session Campus valide **vaut** onboarding terminé.

Le repère de progression est une rangée de pastilles (`OnboardingStepShell`).

## Bulle d'enregistrement (fenêtre séparée)

Fenêtre flottante indépendante (`src/overlay/`), toujours au-dessus, sans
décoration. États : `listening` (barres de niveau animées, 9 barres),
`thinking` (progression), `error`, `success`. Contient un sélecteur de Style
(menu déroulant qui **redimensionne la fenêtre**), une roue crantée, une
étoile, une pastille de notification non lue, et se positionne en haut ou en
bas de l'écran. C'est la surface **la plus vue** du produit — et la plus
contrainte : quelques centaines de pixels de large.

## Bulle d'état Campus

Pastille flottante **déplaçable** (position persistée en `localStorage`),
affichant l'état du serveur, rafraîchie toutes les 30 s, avec menu contextuel
(réinitialiser la position, masquer).
