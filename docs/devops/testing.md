# Tests et couverture

La stratégie de test privilégie les comportements utiles : tests unitaires rapides, tests
d'intégration contre les dépendances réelles, puis parcours navigateur ciblés. Aucun seuil global
de couverture n'est imposé ; les rapports servent à repérer les zones non exercées et sont
importés par les projets SonarQube backend et frontend.

## Validation automatisée

Prérequis backend : Java 25, Docker accessible et `MINIO_LICENSE_FILE` pointant vers une licence
AIStor Free locale non versionnée.

```powershell
.\backend\mvnw.cmd clean verify
Set-Location frontend
npm ci
npm run lint
npm test -- --watch=false --coverage
npm run build
npm run e2e
```

Les tests d'intégration backend utilisent PostgreSQL 18 et AIStor via Testcontainers. Ils doivent
échouer explicitement si Docker est indisponible ; ils ne basculent pas vers H2 ou vers un mock de
base de données.

Les rapports générés sont :

- `backend/target/site/jacoco/jacoco.xml` pour JaCoCo ;
- `backend/target/site/jacoco/index.html` pour la lecture locale ;
- `frontend/coverage/frontend/lcov.info` pour Angular/Vitest ;
- `frontend/coverage/frontend/index.html` pour la lecture locale ;
- `frontend/sonar-report.xml` pour le format Generic Test Execution de SonarQube.

Ces chemins sont consommés par les configurations SonarQube. Les rapports restent générés et ne
sont pas versionnés.

## Scénarios critiques encore manuels

| Scénario | Vérification | Justification |
|---|---|---|
| Parcours complet Angular → API → PostgreSQL/AIStor | Se connecter avec chaque rôle, lister puis modifier un produit selon les droits, téléverser une image et vérifier sa lecture après rechargement. | Les parcours Playwright actuels substituent les réponses backend nécessaires à leurs assertions et n'établissent pas une stack complète. L'exécution navigateur de bout en bout deviendra automatisable après les images et le Compose de la phase 4. |
| Accessibilité avec technologie d'assistance | Avec NVDA, parcourir au clavier le login, le catalogue, un formulaire invalide et une boîte de confirmation ; contrôler l'ordre du focus et les annonces d'erreur. | Vitest et Playwright vérifient rôles, labels, focus et navigation clavier, mais ne reproduisent pas fidèlement la restitution d'un lecteur d'écran Windows. |
| Compatibilité hors Chromium | Rejouer connexion, filtres, formulaire et galerie dans Firefox et WebKit/Safari aux largeurs desktop et mobile. | La configuration Playwright versionnée n'exécute actuellement que le projet Chromium ; les écarts de moteur restent donc à contrôler avant une livraison publique. |

Chaque anomalie constatée manuellement doit donner lieu, quand elle est reproductible de façon
stable, à un test automatisé au niveau le plus bas capable de prévenir sa régression.
