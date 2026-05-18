---
name: "test-check"
description: "Identifie et lance uniquement les specs Angular impactées par les changements. Bloque /lint-check si des specs échouent."
---

# Test Check Skill

## Required configuration

Aucune variable d'environnement requise.

Prérequis : Jest configuré dans le projet (ou ng test avec jest runner).

## Available commands

### `/test-check`

Identifie les specs impactées et les lance. Ne lance pas toute la suite de tests.

---

## Detailed behaviour

### Step 1 — Lister les fichiers TS modifiés (hors specs)

```bash
git diff main...HEAD --name-only | grep '\.ts$' | grep -v '\.spec\.ts$'
```

### Step 2 — Extraire les noms des classes/services modifiés

Pour chaque fichier listé, extraire :
- Le nom de la classe principale (ex: `UserProfileComponent`, `PrescriptionService`)
- Le nom du fichier sans extension (ex: `user-profile.component`, `prescription.service`)

### Step 3 — Trouver les specs impactées

Pour chaque classe ou fichier modifié, chercher les `*.spec.ts` qui :
- Importent le fichier modifié
- Utilisent `TestBed.inject(NomDuService)` ou le déclarent dans `providers`
- Ont un nom correspondant au fichier modifié (ex: `user-profile.component.spec.ts`)

```bash
grep -rl "<NomClasseModifiée>\|<nom-fichier-modifié>" src/ --include="*.spec.ts"
```

Répéter pour chaque classe/fichier modifié et dédupliquer les résultats.

### Step 4 — Signaler les fichiers sans spec

Pour chaque fichier modifié sans spec associée :

```
⚠️  Aucune spec trouvée pour : <path/to/modified-file.ts>

Squelette suggéré :

import { TestBed } from '@angular/core/testing';
import { <NomClasse> } from './<nom-fichier>';

describe('<NomClasse>', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      // providers, imports...
    });
  });

  it('should be created', () => {
    // TODO: implémenter
  });
});
```

### Step 5 — Lancer uniquement les specs impactées

Si des specs ont été trouvées :

```bash
npx jest --testPathPattern="<spec1>|<spec2>|..." --no-coverage
```

Ou avec ng :
```bash
ng test --include="<spec1>" --include="<spec2>"
```

Si aucune spec trouvée pour aucun fichier modifié, afficher :
```
ℹ️  Aucune spec impactée trouvée. Vérifier manuellement si des tests sont requis.
```

### Step 6 — Présenter les résultats

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 Test Check — Résultats
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📂 Fichiers modifiés analysés : <N>
🎯 Specs lancées               : <N>

✅ Tests passants :
  - <describe> > <test name>

❌ Tests en échec :
  Fichier : <spec-file.ts>
  Describe: <describe block>
  Test    : <test name>
  Erreur  : <message d'erreur>

⚠️  Fichiers sans spec :
  - <path> (squelette proposé ci-dessus)
```

### Step 7 — Décision finale

- Si des tests échouent → afficher :
  ```
  ⛔ Des tests sont en échec. Corriger avant de continuer avec /lint-check.
  ```
- Si tous les tests passent → afficher :
  ```
  ✅ Tous les tests passent. Tu peux continuer avec /lint-check.
  ```

---

## Error handling

| Situation | Comportement |
|-----------|-------------|
| Aucune spec trouvée pour un fichier modifié | Signaler + proposer squelette |
| Jest non installé | Afficher `❌ Jest introuvable. Vérifier node_modules ou la config du projet.` |
| Tests en échec | Bloquer /lint-check, afficher les détails |
