# Workflow Git et GitHub

Le dépôt utilise GitHub Flow : `main` reste la seule branche durable et chaque changement passe
par une branche courte, une Pull Request et une revue. Une branche `develop` permanente n'est pas
utilisée, car elle ajouterait une synchronisation sans bénéfice pour ce laboratoire.

## Branches

Créer chaque branche depuis un `main` à jour et limiter son périmètre à une évolution cohérente.

| Préfixe | Usage | Exemple |
|---|---|---|
| `codex/` | Travail réalisé depuis Codex | `codex/phase-6-github-actions` |
| `feature/` | Nouvelle capacité applicative ou DevOps | `feature/product-export` |
| `fix/` | Correction fonctionnelle ou technique | `fix/refresh-token-race` |
| `docs/` | Documentation uniquement | `docs/local-setup` |
| `chore/` | Maintenance sans évolution fonctionnelle | `chore/update-wrapper` |

Ne pas pousser directement sur `main`. Supprimer la branche après fusion afin que la liste des
branches reflète uniquement les travaux actifs.

## Commits

Les messages suivent Conventional Commits et restent courts, impératifs et centrés sur le
changement :

```text
feat: add product availability filter
fix: reject expired refresh tokens
docs: document local object storage
test: cover product image deletion
chore: update Maven wrapper
```

Utiliser notamment `feat`, `fix`, `docs`, `test`, `build`, `ci`, `refactor` et `chore`. Un commit ne
doit contenir ni secret, ni artefact généré, ni modification sans rapport avec son message.

## Pull Requests et revue

Avant d'ouvrir une Pull Request :

1. rebaser ou fusionner le dernier `main` dans la branche selon les règles du dépôt ;
2. exécuter les validations proportionnées aux fichiers modifiés ;
3. remplir le modèle de Pull Request avec les preuves, les risques et le retour arrière ;
4. vérifier le diff complet et l'absence de secret ;
5. demander au moins une revue avant fusion.

Le titre de la Pull Request suit Conventional Commits. La fusion par squash est recommandée pour
conserver un changement logique par Pull Request sur `main`. Les contrôles CI requis doivent être
verts et les conversations de revue résolues avant la fusion.

## Versions et releases

Les versions publiées utilisent des tags annotés `vMAJOR.MINOR.PATCH` conformes à Semantic
Versioning. Créer le tag sur un commit validé de `main`, puis publier une release GitHub contenant
au minimum les changements, les éventuelles migrations, les instructions de déploiement et les
limitations connues.

Une correction urgente suit le même parcours : branche `fix/*` depuis le tag ou `main`, Pull
Request revue, fusion dans `main`, puis nouvelle version patch.

## Retour arrière

Pour annuler un changement, préférer un `git revert` du commit de squash ou de merge afin de
préserver l'historique partagé. Ne jamais réécrire `main` avec un push forcé.

Les migrations Flyway déjà appliquées ne sont pas supprimées : ajouter une migration corrective
vers l'avant. Pour une release déployée, documenter séparément le retour à l'image précédente et
la compatibilité de son schéma avec la base courante.

## Remote et secrets

Le remote `origin` pointe vers le dépôt GitHub officiel. Les tokens GitHub, credentials JFrog,
licences AIStor et valeurs `.env` restent hors Git et sont fournis par le poste local ou les
secrets GitHub. Vérifier les exclusions avec :

```powershell
git check-ignore .env frontend/node_modules backend/target infrastructure/terraform/terraform.tfstate
```

Configurer un autre remote uniquement avec une URL explicitement fournie par le propriétaire du
dépôt.
