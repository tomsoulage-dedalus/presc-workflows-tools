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
| Tester les autorisations / Depot a verifier | Diagnostic du token saisi et des droits sur `owner/repo`, selon les actions cochees. Ne modifie aucune PR et n'enregistre pas le token. Le depot de test ne limite pas l'extension a ce depot. |
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

Le bouton **Tester les autorisations** verifie l'identite, l'acces au depot, la lecture des PR
et des revues (si une PR existe), ainsi que la lecture des issues si l'assignation est activee.
Il controle les scopes quand GitHub les expose et distingue les droits du compte sur le depot
des permissions accordees au token. Les erreurs 401, 403, 404, SSO et de limite de requetes sont
affichees explicitement : un token valide peut ne pas avoir acces a un depot prive.

Pour un token fine-grained, GitHub n'expose pas la liste de ses permissions dans ces reponses.
Un acces en lecture ne prouve pas le droit d'ecriture : le diagnostic reste donc **partiel** et
indique les permissions Write a confirmer dans les reglages du token. Il n'effectue aucune
demande de revue, assignation ou autre ecriture pour les tester.

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
depots et labels concernes. Le diagnostic est **active par defaut**. Le perimetre propose est
`dedalus-cis4u/orme-prescription` et `dedalus-cis4u/orme-prescription-api`, label `WORKFLOWS`.
Un choix deja enregistre est conserve,
y compris une desactivation ; decocher l'option puis enregistrer pour desactiver le diagnostic.
Si desactive, aucun appel de diagnostic GitHub/Jenkins n'est effectue et aucun element Jenkins
n'est affiche. Les reviewers, l'assignation, le tirage et les liens Jira restent independants.
Tous les labels configures doivent etre presents ; une liste de depots vide desactive les appels.
Le PAT existant est reutilise pour GitHub, jamais pour Jenkins, qui est interroge en anonyme.
Un PAT fine-grained doit aussi permettre la lecture des **Commit statuses**.

| Situation | Appels Jenkins automatiques |
| --- | --- |
| PR fermee / mergee, hors depot ou hors labels | Aucun |
| Build vert, en cours ou absent | Aucun |
| PR ouverte du perimetre, build en echec hors Sonar | Un appel pour les stages, si le build n'est pas en cache |
| Echec de `[BUILD] build all` | Description du step en echec et log pour reconnaitre Prettier, sauf si deja en cache |
| Stage Sonar back/front en echec | Description du stage et logs des steps du scanner pour retrouver son rapport, sauf si deja en cache |

Seul le contexte `continuous-integration/jenkins/pr-merge` est pris en compte.
Les statuts des PR visibles sont recuperes en une requete GitHub groupee (100 PR maximum par
lot). Jenkins est limite a trois requetes simultanees pour le chargement automatique.

- **Liste des PR** : seul un build rouge recoit un badge avec le stage casse et un lien Jenkins.
  Le badge rouge plein est place juste apres le logo Jira, avant le titre de la PR
  (ou directement avant le titre si le lien Jira est absent).
  Les etapes connues utilisent des noms courts : **build**, **tests unitaires**, **image docker**,
  **deploiement**, **nexus**, **merge**, etc. Les noms complets restent dans le diagnostic.
  Une erreur explicite `error ... prettier/prettier` dans le step build affiche **prettier**.
  La simple presence du nom Prettier ou un avertissement ne suffit pas a classifier l'echec.
  Pour un stage Sonar en echec, le badge **sonar front** ou **sonar back** ouvre directement
  le rapport Sonar correspondant, sans prefixe `[analyse]`. Sans URL de rapport, ce badge
  reste du texte non cliquable, jamais un lien vers Jenkins.
- **Page d'une PR** : un panneau Jenkins apparait pour un build rouge. Le lien **Aller vers le build**
  ouvre Jenkins. Le bouton **Afficher le diagnostic** affiche les stages et leurs durees, puis les 60 dernieres lignes
  du log du premier step en echec du stage responsable. La recuperation du log coute au plus
  deux appels supplementaires. **Masquer le diagnostic** replie le contenu ; le rouvrir ne relance
  pas les appels reseau. **Copier le diagnostic** prepare un prompt pour investigation.
- **Correction Prettier avec Copilot** : le bouton **Fix Prettier with Copilot**, a cote du bouton
  du diagnostic, apparait uniquement pour une erreur Prettier confirmee. Apres confirmation,
  il reverifie le build courant et publie un commentaire `@copilot` demandant une correction
  limitee au formatage sur la branche de la PR. La demande peut consommer des credits Copilot.
  Un meme build ne recoit pas deux commentaires, meme apres un rechargement de page.
  Le PAT doit permettre les commentaires sur la PR et l'agent cloud doit etre active pour le depot.
  Le lien du commentaire confirme uniquement son envoi, pas le demarrage ou la reussite de l'agent.
  Aucun commentaire n'est publie automatiquement pendant la detection ou l'affichage.
- **Sonar back/front** : uniquement lorsqu'un de ces stages est `FAILED`, le panneau propose
  **Aller vers Sonar back/front** avec l'URL exacte du rapport extraite des logs de ce stage.
  La branche ou la PR du lien est conservee. Si les deux stages echouent, les deux liens sont proposes.
  Un stage Sonar reussi, ignore ou en cours ne declenche aucune recherche de rapport.
  Sans lien disponible, aucun message, avertissement console ni emplacement Sonar n'est affiche.
  Les vraies erreurs reseau/API restent journalisees. Le lien du build reste disponible.
- Le service worker **reverifie l'etat GitHub lors du chargement du diagnostic**, meme si le panneau
  est deja affiche : fermer/merger la PR ou passer au vert avant ce chargement empeche les appels Jenkins.
- Les stages et logs des builds termines sont conserves localement (100 entrees au total,
  resume, log et lien de rapport Sonar comptant chacun pour une entree). Les appels simultanes pour la meme ressource
  sont mutualises ; un build en cours ou un appel en erreur n'est pas mis en cache.
- Les mutations du DOM ne relancent pas les requetes pour les PR deja traitees. Les resultats
  sont renouveles a la navigation ou au rechargement de la page, sans polling.
- Les erreurs sont affichees explicitement. Le diagnostic peut etre retente au clic ; pour
  actualiser les badges de la liste apres une erreur, recharger la page.

Cette V1 ne consulte **pas l'API SonarQube** : seuls les liens publies par Jenkins sont utilises.
Elle ne recupere pas les rapports JUnit, ne surveille pas les
builds et ne poste aucun commentaire Copilot. Le serveur Jenkins est limite a
`https://ci-jenkins.orbis.dedalus.com`.

Apres mise a jour, recharger l'extension dans `chrome://extensions`, accepter l'acces au serveur
Jenkins si Chrome le demande, puis recharger GitHub.

Le logo Jenkins est embarque dans `jenkins-logo.js`, sans requete d'image externe.
Logo original par [Frontside](https://frontside.com), pour le [projet Jenkins](https://www.jenkins.io/),
sous licence [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
Source : [Jenkins Artwork](https://www.jenkins.io/artwork/).

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
