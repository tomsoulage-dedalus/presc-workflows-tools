# GitHub PR Reviewers

Extension Chrome (Manifest V3) qui ajoute un reviewer / assignee sur une Pull Request GitHub,
soit en **cliquant sur un membre de l'equipe**, soit par **tirage au hasard**.

Les deux modes partagent la **meme liste de membres** et la **meme liste d'indisponibles** ;
on choisit dans les options lequel (ou les deux) afficher.

> Cette extension remplace `github-team-reviewers` et `github-random-reviewer`, qui ont ete fusionnees.

## Installation

1. Ouvrir `chrome://extensions`.
2. Activer le **Mode developpeur** (en haut a droite).
3. Cliquer sur **Charger l'extension non empaquetee** et selectionner le dossier
   `extensions/github-pr-reviewers`.

## Configuration

Clic droit sur l'icone de l'extension > **Options** (ou lien *Options* dans la popup).

| Option | Description |
| --- | --- |
| Token GitHub (PAT) | Requis pour appeler l'API. Stocke dans `chrome.storage.local`. |
| Membres de l'equipe | Un par ligne : `login` ou `login=Nom affiche`. L'ordre des lignes = l'ordre des boutons. Sert aussi de vivier pour le tirage. |
| En conges / indisponibles | Logins grises dans la liste et **exclus du tirage**. |
| Afficher la liste des membres | Affiche les boutons par membre. Active par defaut. |
| Afficher le tirage au hasard | Affiche le bouton `🎲 Au hasard`. Active par defaut. |
| Demander une revue | Ajoute la personne aux reviewers demandes. Active par defaut. |
| Assigner la PR | Ajoute la personne aux assignees. Active par defaut. |
| Exclure l'auteur de la PR | Retire l'auteur de la liste et du tirage. Active par defaut. |
| Tirage : remplacer les assignes existants | Supprime les assignes actuels avant d'assigner la personne tiree. |
| Afficher le lien Jira | Prefixe les titres de PR d'un logo Jira qui ouvre le ticket. Active par defaut. |

Au moins un affichage (liste / hasard) et au moins une action (revue / assignation) doivent rester coches.

Les valeurs par defaut vivent dans `defaults.js` (partage par le service worker et la page d'options).
Elles ne s'appliquent **que tant que rien n'a ete enregistre** : une fois les options sauvegardees,
ce sont les valeurs de `chrome.storage.local` qui priment. Le bouton *Valeurs par defaut* recharge
`defaults.js` dans le formulaire (il reste a cliquer sur *Enregistrer*).

Le tirage se fait parmi `membres - indisponibles - auteur - personnes deja sur la PR (reviewer, assignee ou ayant relu)`.

### Token requis

- Token classique : scope `repo`.
- Token fine-grained : `Pull requests: Read and write` + `Issues: Read and write` sur les depots concernes.

Le token n'est jamais envoye ailleurs que vers `https://api.github.com`.

## Utilisation

Sur une page `https://github.com/<owner>/<repo>/pull/<n>` (onglet **Conversation** uniquement ; le panneau
n'apparait pas sur `/files`, `/commits`, `/checks`...) :

- un panneau **Equipe** est injecte dans la barre laterale (section *Reviewers*), avec repli en panneau
  flottant en bas a droite si la sidebar n'est pas trouvee ;
- le bouton `🎲 Au hasard` fait defiler les logins candidats pendant ~1s (le de tourne), puis affiche
  le gagnant en vert ;
- chaque membre est un bouton avec son **avatar** et son **nom**, et porte un badge d'etat :
  `reviewer`, `assigne`, `reviewer + assigne`, `a relu`, `auteur`, `indisponible` ;
- les membres deja sur la PR et l'auteur sont **desactives** ;
- apres chaque action, le panneau se met a jour en place (pas de rechargement de page) et un toast
  confirme le resultat avec l'avatar de la personne ;
- le bouton `↻` force un rafraichissement de l'etat de la PR.

### Lien Jira

Sur la liste `https://github.com/<owner>/<repo>/pulls` et sur la page d'une PR (tous onglets), le titre
est prefixe d'un **logo Jira** des qu'il contient une cle de ticket (`fix(ORBISBUG-46494): ...`).
Un clic ouvre `https://dedalus.atlassian.net/browse/<CLE>` dans un nouvel onglet. Desactivable dans
les options (section *Jira*), effet immediat sans recharger la page.

Le code est isole dans `jira.js`, `jira-logo.js` et `jira.css` (entree `content_scripts` dediee).

Les memes controles sont disponibles dans la popup de l'extension (icone de la barre d'outils).

Les animations sont desactivees si le systeme est en `prefers-reduced-motion`.

### Diagnostic Jenkins (V1)

Dans les options, la section **Jenkins** permet d'activer le diagnostic et de choisir les
depots et labels concernes. Le diagnostic est **desactive par defaut** : cocher son activation
puis enregistrer pour l'utiliser. Le perimetre propose est `dedalus-cis4u/orme-prescription`,
label `WORKFLOWS`. Une activation deja enregistree est conservee ; decocher l'option pour la retirer.
Sans activation, aucun appel de diagnostic GitHub/Jenkins n'est effectue et aucun element Jenkins
n'est affiche. Les reviewers, l'assignation, le tirage et les liens Jira restent independants.
Tous les labels configures doivent etre presents ; une liste de depots vide desactive les appels.
Le PAT existant est reutilise pour GitHub, jamais pour Jenkins, qui est interroge en anonyme.
Un PAT fine-grained doit aussi permettre la lecture des **Commit statuses**.

| Situation | Appels Jenkins automatiques |
| --- | --- |
| PR fermee / mergee, hors depot ou hors labels | Aucun |
| Build vert, en cours ou absent | Aucun |
| PR ouverte du perimetre, build en echec | Un appel pour les stages, si le build n'est pas en cache |

Seul le contexte `continuous-integration/jenkins/pr-merge` est pris en compte.
Les statuts des PR visibles sont recuperes en une requete GitHub groupee (100 PR maximum par
lot). Jenkins est limite a trois requetes simultanees pour le chargement automatique.

- **Liste des PR** : seul un build rouge recoit un badge avec le stage casse et un lien Jenkins.
- **Page d'une PR** : un panneau Jenkins apparait pour un build rouge. Le bouton
  **Charger le diagnostic** affiche les stages et leurs durees, puis les 60 dernieres lignes
  du log du premier step en echec du stage responsable. La recuperation du log coute au plus
  deux appels supplementaires. **Copier le diagnostic** prepare un prompt pour investigation.
- Le service worker **reverifie l'etat GitHub au clic**, meme si le panneau est deja affiche :
  fermer/merger la PR ou passer au vert empeche tout nouvel appel Jenkins.
- Les stages et logs des builds termines sont conserves localement (100 entrees au total,
  resume et log comptant chacun pour une entree). Les appels simultanes pour la meme ressource
  sont mutualises ; un build en cours ou un appel en erreur n'est pas mis en cache.
- Les mutations du DOM ne relancent pas les requetes pour les PR deja traitees. Les resultats
  sont renouveles a la navigation ou au rechargement de la page, sans polling.
- Les erreurs sont affichees explicitement. Le diagnostic peut etre retente au clic ; pour
  actualiser les badges de la liste apres une erreur, recharger la page.

Cette V1 ne consulte **pas SonarQube**, ne recupere pas les rapports JUnit, ne surveille pas les
builds et ne poste aucun commentaire Copilot. Le serveur Jenkins est limite a
`https://ci-jenkins.orbis.dedalus.com`.

Apres mise a jour, recharger l'extension dans `chrome://extensions`, accepter l'acces au serveur
Jenkins si Chrome le demande, puis recharger GitHub.

### Verification locale

Sans dependance npm, avec Node.js 22 :

```bash
node --test extensions/github-pr-reviewers/tests/*.test.cjs
```

Le test de rendu navigateur est optionnel :

```bash
CHROME_BIN=/usr/bin/google-chrome node --test extensions/github-pr-reviewers/tests/*.test.cjs
```

## Icones

Les PNG de `icons/` sont generes par un script sans dependance :

```bash
python3 icons/generate-icons.py
```

## Limites

- GitHub.com uniquement (pas de GitHub Enterprise Server ; adapter `API_ROOT` dans `background.js` si besoin).
- Un utilisateur ne peut pas etre reviewer de sa propre PR.
- La personne choisie doit avoir acces au depot, sinon GitHub ignore l'assignement.
- Les demandes de revue par **equipe GitHub** (`team_reviewers`) ne sont pas gerees, uniquement les
  utilisateurs individuels.
