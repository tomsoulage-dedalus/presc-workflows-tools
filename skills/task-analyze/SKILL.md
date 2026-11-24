---
name: "task-analyze"
argument-hint: "[HORME-XXXX | ORBISBUG-XXXX]"
description: "Analyse un ticket Jira, ses commentaires et pièces jointes, investigue le code et sauvegarde un plan à valider, sans modifier le code ni créer de branche ou de PR."
---

# Task Analyze

Lire d'abord le [contrat commun](../WORKFLOW.md).

## 1. Recueillir le contexte complet

- Résoudre le ticket et lire ses champs : résumé, description, type, parent,
  priorité, composants, labels, liens, pièces jointes et critères d'acceptation.
- Récupérer **tous les commentaires**, avec pagination, via
  `/rest/api/3/issue/<TICKET>/comment` sur Cloud (API 2 sur Server).
  Distinguer les exigences actuelles des propositions annulées ou corrigées.
- Lire les tickets liés et le parent qui éclairent le périmètre ; ne pas se
  limiter au résumé intégré dans `issuelinks`. Éviter les parcours récursifs
  sans rapport avec le besoin.
- Lire les remote links via `/rest/api/3/issue/<TICKET>/remotelink` sur Cloud
  (API 2 sur Server), puis les documents pertinents avec l'accès prévu pour leur
  domaine. Lire les pièces jointes, pas seulement leur nom : captures, scénarios,
  logs et documents. Signaler précisément tout contenu inaccessible, non pris
  en charge ou hors sujet et l'impact de cette limite sur l'analyse.
- Si les informations se contredisent, exposer la contradiction ; ne pas
  inventer une règle pour pouvoir continuer.

## 2. Investiguer le comportement

- Lire la documentation métier et technique pertinente du dépôt.
- Suivre le scénario dans le code jusqu'à la règle responsable : UI, services,
  REST, Java, données ou configuration selon le cas. Ne pas limiter arbitrairement
  le nombre de fichiers ni supposer que le problème est Angular.
- Chercher les helpers et tests existants avant de proposer une nouvelle logique.
- Pour une migration GWT vers Angular, comparer le comportement historique
  pertinent ; signaler toute divergence plutôt que supposer une équivalence.
- Appuyer chaque constat sur des chemins, symboles et lignes réellement lus.
  Séparer cause démontrée et hypothèse à vérifier. Ne pas remplir un quota
  d'hypothèses ou d'approches si une seule est étayée.

## 3. Sauvegarder une proposition exploitable

Écrire `.copilot/analyses/<TICKET>-ANALYZE.md` avec :

1. Ticket et sources consultées, limites d'accès.
2. Comportement attendu, observé et critères d'acceptation.
3. Constats de code et cause ou hypothèses, avec preuves.
4. Approche recommandée, alternatives uniquement si elles sont pertinentes,
   fichiers/modules concernés et risques.
5. Scénarios de vérification et commandes du projet identifiées.
6. Questions ouvertes et décision : **proposée, non validée**.

L'analyse peut créer ce rapport, pas modifier le code, la configuration, les
leçons ou les branches. Présenter en conversation la conclusion, l'approche
recommandée et les décisions nécessaires ; ne pas recopier tout le rapport.
Demander validation via `ask_user` avant tout passage à `/task-implement`.
Enregistrer fidèlement l'approche validée et les réserves si l'utilisateur
répond ; sinon conserver le statut proposé et s'arrêter.
