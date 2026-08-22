# Angular Product Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Livrer la console Angular responsive pour gérer produits, galerie et utilisateurs selon les rôles.

**Architecture:** Les routes de feature sont lazy-loaded. Les services HTTP retournent des Observables ; des stores Signals exposent loading/error/empty/success. L'URL est la source de vérité des recherches, filtres, tris et pages. Desktop et mobile partagent les stores mais utilisent des compositions dédiées.

**Tech Stack:** Angular 22 standalone, TypeScript 6 strict, Angular Material 22, RxJS, Signals, Reactive Forms typés, Vitest, angular-eslint, Playwright.

**Spec:** [Console produits sécurisée](../specs/2026-08-18-secure-product-console-design.md)

## Global Constraints

- Commencer seulement après les Acceptance Gates auth et images.
- Tous les composants sont standalone, OnPush et lazy-loaded par feature.
- Aucune subscription manuelle longue durée ; async pipe/toSignal/takeUntilDestroyed selon le besoin.
- Les mutations utilisent firstValueFrom puis rechargent l'état concerné.
- L'URL reste la source de vérité des paramètres de catalogue.
- Cibles tactiles ≥44px, contraste AA, clavier complet, focus restauré après dialog.
- Le frontend masque les actions interdites mais dépend toujours du 403 backend.
- Respecter les règles de commits d'AGENTS.md.

---

## Task 1: Créer le thème et les primitives d'état

**Files:**
- Modify: frontend/src/styles.scss
- Create: frontend/src/styles/_theme.scss
- Create: frontend/src/app/shared/ui/{page-header,data-state,error-panel,empty-state,confirm-dialog}/**
- Create: frontend/src/app/core/http/{problem-detail,api-error.mapper}.ts
- Create: frontend/src/app/core/http/api-error.mapper.spec.ts

- [ ] Tester le mapping Problem Details : status, title, detail, fieldErrors et requestId.
- [ ] Tester les quatre états exclusifs loading/error/empty/success et le retry.
- [ ] Implémenter tokens bleu nuit/bleu franc/slate, focus visible, densité desktop et taille tactile mobile.
- [ ] Implémenter primitives accessibles avec aria-live et sans information portée uniquement par la couleur.
- [ ] Faire passer lint/test/build et axe smoke test Playwright.
- [ ] Commit : git commit -m "feat: add console design system".

---

## Task 2: Modéliser l'API et l'état URL du catalogue

**Files:**
- Create: frontend/src/app/features/products/models/{product,product-query,page-response,product-image}.ts
- Create: frontend/src/app/features/products/services/products-api.service.ts
- Create: frontend/src/app/features/products/services/products.store.ts
- Create: frontend/src/app/features/products/services/products.store.spec.ts
- Create: frontend/src/app/features/products/products.routes.ts
- Modify: frontend/src/app/app.routes.ts

- [ ] Tester sérialisation/désérialisation de search, category, available, page, size, sort et direction.
- [ ] Tester loading→success/empty/error, réponse obsolète ignorée et reload après mutation.
- [ ] Lancer les tests et constater l'échec.
- [ ] Définir ProductSummary, ProductDetail, ProductQuery et PageResponse sans any.
- [ ] ProductsApiService expose list/get/create/update/delete en Observables.
- [ ] ProductsStore lit queryParamMap, utilise switchMap et publie des readonly signals.
- [ ] Faire passer lint/test/build.
- [ ] Commit : git commit -m "feat: add product catalog state".

---

## Task 3: Livrer liste desktop et cartes mobile

**Files:**
- Create: frontend/src/app/features/products/pages/product-list-page/**
- Create: frontend/src/app/features/products/components/{product-filters,product-table,product-cards,active-filter-chips}/**
- Create: frontend/src/app/features/products/pages/product-list-page/product-list-page.spec.ts
- Create: frontend/e2e/products-list.spec.ts

- [x] Tester que chaque interaction remplace les query params compatibles ; un nouveau filtre remet page à 0.
- [x] Tester table à 1440px, cartes à 390px, skeleton, panne, catalogue vide et résultat filtré vide.
- [x] Implémenter recherche debounced, filtres Material, tri accessible et paginator.
- [x] Utiliser picture/alt approprié pour l'image principale et un placeholder cohérent.
- [x] Tester clavier, libellés, annonce de résultat et persistance de l'URL après reload.
- [x] Faire passer lint/test/build et Playwright ciblé.
- [ ] Commit : git commit -m "feat: deliver responsive product catalog".

---

## Task 4: Livrer détail et formulaire produit

**Files:**
- Create: frontend/src/app/features/products/pages/{product-detail-page,product-form-page}/**
- Create: frontend/src/app/features/products/components/product-form/**
- Create: frontend/src/app/features/products/components/product-form/product-form.spec.ts
- Modify: frontend/src/app/features/products/products.routes.ts
- Create: frontend/e2e/product-crud.spec.ts

- [x] Tester formulaire typé : nom requis, description bornée, prix/stock ≥0, catégorie et erreurs serveur par champ.
- [x] Tester permissions : VIEWER détail seul, EDITOR créer/modifier, ADMIN supprimer.
- [x] Implémenter /products/new, /products/:id et /products/:id/edit.
- [x] Ajouter confirmation de suppression, focus restauré et snackbar de succès.
- [x] Playwright couvre création, modification, validation 400 et suppression ADMIN.
- [x] Faire passer validations frontend et E2E ciblé.
- [ ] Commit : git commit -m "feat: add product editing flows".

---

## Task 5: Construire le gestionnaire de galerie

**Files:**
- Create: frontend/src/app/features/products/services/product-images-api.service.ts
- Create: frontend/src/app/features/products/components/image-gallery-manager/**
- Create: frontend/src/app/features/products/components/image-gallery-manager/image-gallery-manager.spec.ts
- Modify: frontend/src/app/features/products/pages/product-detail-page/**
- Modify: frontend/e2e/product-crud.spec.ts

- [ ] Tester sélection multiple, drop clavier/souris, type, taille, maximum cinq, preview révoquée et progression.
- [ ] Tester ordre, principale unique, suppression confirmée et rollback visuel après erreur.
- [ ] Implémenter GET/POST/order/primary/delete ; désactiver mutations pour VIEWER.
- [ ] Afficher chaque rejet dans aria-live ; la validation serveur reste autoritaire.
- [ ] Playwright ajoute upload, promotion principale, ordre et suppression.
- [ ] Faire passer lint/test/build/e2e.
- [ ] Commit : git commit -m "feat: add product image manager".

---

## Task 6: Livrer l'administration des utilisateurs

**Files:**
- Create: frontend/src/app/features/users/{models,services,pages,components}/**
- Create: frontend/src/app/features/users/users.routes.ts
- Create: frontend/src/app/features/users/services/users.store.spec.ts
- Modify: frontend/src/app/app.routes.ts
- Create: frontend/e2e/users.spec.ts

- [ ] Tester guard ADMIN, pagination, création, changement rôle/nom, activation, désactivation et reset password.
- [ ] Tester compte courant et dernier ADMIN avec action désactivée et explication.
- [ ] Implémenter formulaires typés ; ne jamais réafficher ni conserver un mot de passe.
- [ ] Playwright vérifie ADMIN autorisé et EDITOR/VIEWER redirigés vers 403.
- [ ] Faire passer lint/test/build/e2e.
- [ ] Commit : git commit -m "feat: add user administration".

---

## Task 7: Valider le parcours complet et documenter

**Files:**
- Modify: frontend/e2e/{auth,products-list,product-crud,users}.spec.ts
- Modify: README.md
- Modify: docs/README.md
- Modify: docs/IMPLEMENTATION_PLAN.md
- Modify: AGENTS.md
- Modify: .env.example

- [ ] Stabiliser fixtures ADMIN, EDITOR, VIEWER et données propres à chaque test.
- [ ] Couvrir : ADMIN login→création→image→édition→suppression ; VIEWER lecture/refus ; reload→refresh→session restaurée.
- [ ] Exécuter :

~~~powershell
.\backend\mvnw.cmd clean verify
Set-Location frontend
npm ci
npm run lint
npm run test:ci
npm run build
npx playwright test
Set-Location ..
docker compose config
git diff --check
git status -sb
~~~

- [ ] Vérifier 390×844, 768×1024, 1440×900, zoom 200 %, clavier et absence d'overflow.
- [ ] Mettre à jour les docs avec commandes exécutées et prérequis de licence S3.
- [ ] Exclure secret, screenshot, trace, vidéo, coverage, dist et node_modules.
- [ ] Commit : git commit -m "feat: complete secure product console".

## Acceptance Gate

- [ ] CRUD, filtres, tri et pagination sont reflétés dans l'URL.
- [ ] Desktop et mobile ont des compositions dédiées et accessibles.
- [ ] Les trois rôles voient uniquement leurs actions, avec contrôle backend confirmé.
- [ ] Galerie et utilisateurs passent en tests unitaires et E2E.
- [ ] Maven, ESLint, Vitest, build, Playwright et Compose config passent.
