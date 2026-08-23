# Task 6 — Administration Angular des utilisateurs

## Objectif

Livrer une interface d’administration réservée au rôle `ADMIN` qui couvre tout le contrat
`/api/v1/users` déjà exposé par le backend : consultation paginée, création, modification du nom
et du rôle, activation ou désactivation et réinitialisation du mot de passe.

La fonctionnalité doit prolonger le shell et le vocabulaire visuel existants. Elle reste dense et
opérationnelle sur desktop, tout en proposant une composition mobile réellement utilisable.

## Hors périmètre

- aucune inscription publique ;
- aucune suppression physique d’un compte ;
- aucune modification d’adresse e-mail après création ;
- aucune recherche ou filtre non pris en charge par l’API actuelle ;
- aucune modification du contrat ou de la sécurité backend ;
- aucune nouvelle dépendance frontend sans nécessité démontrée.

## Accès et sécurité

La route `/users` reste protégée par `authGuard`, puis `roleGuard` avec le rôle `ADMIN`. Le lien
de navigation n’est visible que pour un administrateur. Ces contrôles améliorent l’expérience mais
ne remplacent jamais l’autorisation appliquée par Spring Security.

L’identité de la session courante est utilisée pour identifier le compte administrateur connecté.
L’auto-désactivation est indisponible dans l’interface et accompagnée d’une explication. Les règles
du dernier administrateur actif restent appliquées par le backend ; un refus est présenté comme une
erreur métier actionnable.

## Architecture Angular

La feature `users` suit l’organisation par fonctionnalité déjà utilisée pour les produits :

- `models/` décrit `User`, `UserRole`, les requêtes de mutation, la page et la requête de liste ;
- `services/users-api.service.ts` encapsule exclusivement le contrat HTTP ;
- `services/users.store.ts` transforme les paramètres d’URL et les réponses HTTP en états Signals ;
- `components/` contient les formulaires et les présentations desktop/mobile ;
- `pages/users-page/` orchestre l’URL, le store, le panneau d’édition et les retours accessibles ;
- `users.routes.ts` porte la route lazy-loadée et sa protection de rôle.

Le store expose les états `loading`, `error`, `empty` et `success`, la page courante, le nombre total
d’utilisateurs et les opérations de mutation. Une mutation réussie recharge la page active. Une
mutation échouée conserve la liste et remonte une erreur contextualisée à l’action concernée.

## Contrat HTTP frontend

Le client utilise la base relative configurée dans `environment.apiUrl` :

| Action | Requête | Résultat |
|---|---|---|
| Lister | `GET /users?page=&size=&sort=` | `PageResponse<User>` |
| Créer | `POST /users` | `User` |
| Modifier | `PUT /users/{id}` | `User` |
| Activer ou désactiver | `PUT /users/{id}/enabled?enabled=` | `User` |
| Réinitialiser le mot de passe | `PUT /users/{id}/password` | réponse vide |

Les propriétés de tri exposées par l’interface se limitent à celles acceptées par le backend :
`email`, `displayName`, `role`, `enabled` et `createdAt`. Les valeurs inconnues de l’URL retombent
sur `email,asc`. Les tailles proposées sont `10`, `20`, `40` et `80`, avec `20` par défaut.

## Composition de la page

L’en-tête affiche « Utilisateurs », une description concise et l’action primaire « Créer un
utilisateur ». La zone de résultats indique le nombre total de comptes avec une annonce polie lors
des mises à jour.

À partir du breakpoint desktop, les comptes sont présentés dans un tableau accessible nommé
« Utilisateurs administrés ». Les colonnes sont : utilisateur, rôle, statut, date de création et
actions. Le tri est disponible sur les colonnes supportées. Les actions restent explicites et
n’utilisent pas une icône seule lorsque leur sens pourrait être ambigu.

Sur mobile, le tableau est remplacé par une liste de cartes compactes. Chaque carte conserve le nom,
l’e-mail, le rôle, le statut et les actions prioritaires. Les cibles interactives mesurent au moins
44 px et l’ordre de tabulation suit l’ordre visuel.

Le chargement utilise les squelettes du composant `DataState`. Les états vide et erreur expliquent
la prochaine action utile. L’état vide met en avant la création du premier compte.

## Panneau maître-détail

La création, la modification et la réinitialisation du mot de passe s’effectuent dans un panneau
latéral intégré à la page. Sur desktop, il apparaît à côté de la liste sans masquer son contexte.
Sur mobile, il devient une vue pleine largeur au sein du contenu. L’ouverture place le focus sur le
titre du panneau ; la fermeture rend le focus au contrôle déclencheur.

Le panneau possède trois modes :

1. `create` : e-mail, nom, rôle, mot de passe et confirmation ;
2. `edit` : e-mail en lecture seule, nom et rôle ;
3. `password` : nouveau mot de passe et confirmation, sans jamais réafficher une valeur existante.

Un seul mode est actif à la fois. Fermer un formulaire modifié demande confirmation afin d’éviter
une perte accidentelle. Les formulaires utilisent les Reactive Forms typés et les contrôles Angular
Material déjà installés.

## Activation et désactivation

L’activation peut être exécutée directement depuis la ligne ou la carte. La désactivation exige une
confirmation qui nomme le compte affecté et précise que ses sessions existantes peuvent ne plus lui
permettre d’accéder à l’application selon le comportement backend.

Le contrôle du compte courant est désactivé avec le libellé explicatif « Vous ne pouvez pas
désactiver votre propre compte ». L’interface n’essaie pas de prédire si un autre compte est le
dernier administrateur actif, car cette décision doit rester atomique côté backend.

## Validation et erreurs

Les règles clientes reflètent le contrat existant :

- e-mail requis et syntaxiquement valide lors de la création ;
- nom requis, espaces seuls refusés, maximum 120 caractères ;
- rôle parmi `ADMIN`, `EDITOR` et `VIEWER` ;
- mot de passe requis, entre 12 et 128 caractères ;
- confirmation identique au mot de passe, uniquement côté interface.

Les erreurs de champ reçues dans `ProblemDetail.errors` sont associées aux contrôles concernés. Une
erreur globale apparaît dans le panneau avec `role="alert"`. Les échecs de chargement utilisent
`DataState` et proposent « Réessayer ». Le `requestId` est affiché lorsqu’il est fourni afin de
faciliter le diagnostic sans exposer de détail sensible.

Pendant une requête, seule l’action concernée est rendue indisponible. Les doubles soumissions sont
empêchées. Une réussite produit une annonce accessible et un snackbar bref : compte créé, compte
modifié, mot de passe réinitialisé, compte activé ou compte désactivé.

## Accessibilité et responsive

- navigation complète au clavier avec focus visible ;
- titres et régions structurés, tableau nommé et actions correctement étiquetées ;
- `aria-busy` pendant le chargement initial et les mutations ;
- annonces `aria-live` pour le compteur et les résultats de mutation ;
- statut exprimé par texte en plus de la couleur ;
- cibles tactiles d’au moins 44 px ;
- aucun mouvement décoratif et respect de `prefers-reduced-motion` ;
- composition desktop et mobile vérifiée séparément.

## Tests

Le développement suit des cycles RED, GREEN, REFACTOR. Les tests Vitest couvrent :

- normalisation et sérialisation de la requête de liste ;
- chaque méthode et chaque URL du client HTTP ;
- transitions du store pour chargement, succès, vide, erreur, rechargement et mutations ;
- validation des trois modes du formulaire ;
- tri, actions, libellés et distinction tableau/cartes ;
- orchestration du panneau, confirmations, protection du compte courant et annonces.

Un scénario Playwright authentifié comme `ADMIN` intercepte l’API et couvre :

1. chargement et pagination de la liste ;
2. création d’un compte ;
3. modification de son nom et de son rôle ;
4. réinitialisation de son mot de passe ;
5. désactivation confirmée puis activation ;
6. vue mobile, navigation au clavier et cibles tactiles essentielles.

Les validations de fin de tâche sont exécutées depuis `frontend/` :

```powershell
npm run lint
npm run test:ci
npm run build
npx playwright test e2e/users-admin.spec.ts
```

`git diff --check` complète ces contrôles depuis la racine.

## Documentation et critères d’acceptation

La Task 6 est considérée terminée lorsque :

- tout le contrat `/api/v1/users` est utilisable depuis l’interface par un administrateur ;
- un utilisateur non administrateur reste refusé par le guard et par le backend ;
- les états loading, error, empty et success sont couverts ;
- les règles d’auto-désactivation et de dernier administrateur sont comprises par l’utilisateur ;
- les parcours desktop, mobile et clavier sont testés ;
- lint, tests unitaires, build, E2E ciblé et `git diff --check` réussissent ;
- `README.md` et `docs/IMPLEMENTATION_PLAN.md` distinguent fidèlement ce qui est livré de ce qui
  reste planifié.
