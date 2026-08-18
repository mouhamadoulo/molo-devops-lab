# Authentication and RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Livrer le backend JWT/refresh rotatif et un shell Angular sécurisé avec login, restauration de session et rôles.

**Architecture:** Spring Boot authentifie les utilisateurs PostgreSQL, signe des JWT courts et stocke uniquement les hashes des refresh tokens. Angular garde l'access token en mémoire, restaure la session par cookie HttpOnly et protège des routes lazy-loaded.

**Tech Stack:** Java 25, Spring Boot 4.1/Spring Security 7, PostgreSQL 18, Flyway, Angular CLI 22.1.4, Material 22.1.2, TypeScript 6, Vitest, angular-eslint 22.1.0, Playwright 1.62.1.

**Spec:** [Console produits sécurisée](../specs/2026-08-18-secure-product-console-design.md)

## Global Constraints

- Le backend applique seul la matrice VIEWER/EDITOR/ADMIN.
- L'access token n'est jamais persisté ; le refresh reste opaque, HttpOnly, SameSite=Strict et rotatif.
- Flyway reste seul responsable du schéma et aucun secret réel n'entre dans Git.
- Écrire le test en échec avant chaque comportement, puis l'implémentation minimale.
- Avant chaque commit : tests ciblés, régression applicable et git diff --check.
- Aucun trailer Co-Authored-By, aucune mention de Codex/OpenAI/ChatGPT/IA, auteur Git configuré uniquement.

---

## Task 1: Scaffolder Angular et les contrôles qualité

**Files:**
- Create: frontend/**
- Modify: .gitignore
- Modify: AGENTS.md

- [ ] Générer sans dépôt imbriqué :

~~~powershell
npx @angular/cli@22.1.4 new frontend --routing --style=scss --strict --standalone --skip-git --package-manager=npm --defaults
Set-Location frontend
npm install --save-exact @angular/material@22.1.2 @angular/cdk@22.1.2
npm install --save-dev --save-exact angular-eslint@22.1.0 @playwright/test@1.62.1
npx ng add angular-eslint@22.1.0 --skip-confirmation
npx playwright install chromium
~~~

- [ ] Ajouter les scripts lint=ng lint, test:ci=ng test --watch=false et e2e=playwright test.
- [ ] Écrire frontend/e2e/app.spec.ts : une visite de /products doit rediriger vers /login et afficher le titre Connexion.
- [ ] Exécuter le test et constater l'échec faute de route.
- [ ] Ajouter frontend/playwright.config.ts (Chromium, baseURL 127.0.0.1:4200, webServer npm start), frontend/src/environments/environment.ts (apiUrl localhost:8080/api/v1) et une page login temporaire.
- [ ] Valider :

~~~powershell
npm run lint
npm run test:ci
npm run build
npx playwright test e2e/app.spec.ts
Set-Location ..
git diff --check
~~~

- [ ] Commit : git add -- frontend .gitignore AGENTS.md puis git commit -m "build: scaffold Angular frontend".

---

## Task 2: Persister les utilisateurs et bootstrapper ADMIN

**Files:**
- Modify: backend/pom.xml
- Create: backend/src/main/resources/db/migration/V3__create_identity_tables.sql
- Modify: backend/src/main/resources/application.yml
- Create: backend/src/main/java/com/molo/devopsstore/identity/domain/{UserRole,AppUser,RefreshToken}.java
- Create: backend/src/main/java/com/molo/devopsstore/identity/infrastructure/{AppUserRepository,RefreshTokenRepository}.java
- Create: backend/src/main/java/com/molo/devopsstore/identity/application/{IdentityProperties,BootstrapAdmin}.java
- Create: backend/src/test/java/com/molo/devopsstore/identity/application/BootstrapAdminTest.java
- Create: backend/src/test/java/com/molo/devopsstore/identity/infrastructure/AppUserRepositoryTest.java

- [ ] Écrire les tests : création sur base vide, idempotence, erreur si variables manquantes, démarrage sans variables si un ADMIN actif existe, unicité insensible à la casse.
- [ ] Lancer et constater l'échec :

~~~powershell
Set-Location backend
.\mvnw.cmd -Dtest=BootstrapAdminTest,AppUserRepositoryTest test
~~~

- [ ] Ajouter spring-boot-starter-security, spring-boot-starter-oauth2-resource-server et spring-security-oauth2-jose.
- [ ] V3 crée app_users (email normalisé unique, display_name, password_hash, role, enabled, timestamps) et refresh_tokens (token_hash unique, family_id, expiry, consumed/revoked/replaced timestamps).
- [ ] Implémenter UserRole avec ADMIN, EDITOR, VIEWER et une entité encapsulée sans setters génériques.
- [ ] Binder BOOTSTRAP_ADMIN_EMAIL/PASSWORD/NAME ; hasher avec BCrypt ; ne jamais logger les valeurs.
- [ ] Faire passer tests ciblés puis .\mvnw.cmd test et git diff --check.
- [ ] Commit : git commit -m "feat: add identity persistence".

---

## Task 3: Émettre et valider les JWT

**Files:**
- Create: backend/src/main/java/com/molo/devopsstore/identity/application/{JwtProperties,AccessTokenService}.java
- Create: backend/src/main/java/com/molo/devopsstore/identity/infrastructure/{SecurityConfig,AppUserDetailsService}.java
- Create: backend/src/test/java/com/molo/devopsstore/identity/application/AccessTokenServiceTest.java
- Create: backend/src/test/java/com/molo/devopsstore/identity/infrastructure/SecurityConfigTest.java

- [ ] Tester avec Clock fixe : issuer, subject, claim role, iat, expiration 15 minutes et rejet d'un secret inférieur à 32 octets.
- [ ] Tester : health public, login public, products à 401 sans bearer.
- [ ] Lancer les tests et constater l'échec.
- [ ] Implémenter HS256 avec NimbusJwtEncoder/NimbusJwtDecoder et claims minimaux sub/role/iss/iat/exp.
- [ ] Configurer session stateless, sans form login/HTTP Basic, mapping ROLE_, Problem Details 401/403 avec requestId.
- [ ] Ne pas désactiver CSRF globalement ; isoler les routes bearer et conserver la protection des routes cookie.
- [ ] Faire passer les tests ciblés puis la suite backend.
- [ ] Commit : git commit -m "feat: secure API with JWT".

---

## Task 4: Livrer login, refresh, logout et me

**Files:**
- Create: backend/src/main/java/com/molo/devopsstore/identity/application/{RefreshTokenService,AuthService}.java
- Create: backend/src/main/java/com/molo/devopsstore/identity/api/{AuthController,AuthCookieService}.java
- Create: backend/src/main/java/com/molo/devopsstore/identity/api/dto/{LoginRequest,SessionResponse,CurrentUserResponse}.java
- Modify: backend/src/main/java/com/molo/devopsstore/common/web/WebConfig.java
- Modify: backend/src/main/java/com/molo/devopsstore/product/api/ApiExceptionHandler.java
- Create: backend/src/test/java/com/molo/devopsstore/identity/application/RefreshTokenServiceTest.java
- Create: backend/src/test/java/com/molo/devopsstore/identity/api/AuthApiIntegrationTest.java

- [ ] Tester SHA-256 en base, token aléatoire 256 bits, expiration 7 jours, rotation single-use, révocation familiale sur réutilisation, expiration et compte désactivé.
- [ ] Tester les quatre endpoints, cookies DEVOPS_REFRESH/XSRF-TOKEN, en-tête X-XSRF-TOKEN, Origin autorisée et erreurs génériques.
- [ ] Lancer et constater l'échec.
- [ ] Verrouiller la ligne de refresh en PESSIMISTIC_WRITE pendant la rotation ; stocker uniquement le hash.
- [ ] Poser le refresh avec HttpOnly/SameSite=Strict/Path=/api/v1/auth et Secure piloté par AUTH_COOKIE_SECURE. Poser XSRF-TOKEN sans HttpOnly, SameSite=Strict et Path=/ afin que la SPA puisse le lire.
- [ ] Le premier login vérifie Origin mais n'exige pas un token XSRF encore inexistant ; refresh et logout exigent la concordance cookie/en-tête.
- [ ] Autoriser credentials CORS pour la seule origine configurée et les seuls endpoints auth concernés.
- [ ] Faire passer tests ciblés puis .\mvnw.cmd clean verify.
- [ ] Inspecter avec rg toute occurrence password/token/secret pour exclure littéraux et logs.
- [ ] Commit : git commit -m "feat: add rotating authentication sessions".

---

## Task 5: Appliquer le RBAC et administrer les utilisateurs

**Files:**
- Modify: backend/src/main/java/com/molo/devopsstore/identity/infrastructure/SecurityConfig.java
- Create: backend/src/main/java/com/molo/devopsstore/identity/application/UserAdminService.java
- Create: backend/src/main/java/com/molo/devopsstore/identity/api/UserController.java
- Create: backend/src/main/java/com/molo/devopsstore/identity/api/dto/{CreateUserRequest,UpdateUserRequest,ResetPasswordRequest,UserResponse}.java
- Create: backend/src/test/java/com/molo/devopsstore/identity/api/AuthorizationMatrixIntegrationTest.java
- Create: backend/src/test/java/com/molo/devopsstore/identity/application/UserAdminServiceTest.java

- [ ] Écrire un test paramétré : lecture produits tous rôles ; création/modification EDITOR+ADMIN ; suppression ADMIN ; /users ADMIN.
- [ ] Tester unicité email, BCrypt, absence de hash dans les réponses, refus de désactiver son compte et refus de supprimer le dernier ADMIN actif.
- [ ] Implémenter GET/POST /api/v1/users, PUT /{id}, PUT /{id}/enabled et PUT /{id}/password avec PageResponse.
- [ ] Faire passer tests ciblés puis clean verify.
- [ ] Commit : git commit -m "feat: enforce role permissions".

---

## Task 6: Implémenter la session Angular

**Files:**
- Create: frontend/src/app/core/auth/{auth.models,auth-api.service,auth.store,auth.interceptor,auth.guard,role.guard,xsrf}.ts
- Create: frontend/src/app/core/auth/*.spec.ts
- Modify: frontend/src/app/app.config.ts
- Modify: frontend/src/app/app.routes.ts

- [ ] Tester : token privé en mémoire, restoreSession, un seul refresh pour des 401 concurrents, rejeu unique, purge après échec, guards retournant UrlTree et XSRF ajouté à refresh/logout lorsqu'un cookie existe.
- [ ] Lancer npm test -- --watch=false et constater l'échec.
- [ ] Définir UserRole comme union ADMIN|EDITOR|VIEWER et CurrentUser/SessionResponse comme interfaces strictes.
- [ ] AuthApiService utilise withCredentials uniquement pour login/refresh/logout.
- [ ] AuthStore expose user, role, restoring, authenticated, error en readonly signals ; le token reste privé.
- [ ] L'intercepteur partage le refresh en vol et marque les requêtes rejouées avec HttpContextToken.
- [ ] Faire passer lint, test:ci et build.
- [ ] Commit : git commit -m "feat: add Angular session management".

---

## Task 7: Livrer login et shell responsive

**Files:**
- Modify: frontend/src/app/features/auth/pages/login-page/**
- Create: frontend/src/app/core/layout/app-shell/**
- Create: frontend/src/app/features/errors/forbidden-page/**
- Create: frontend/src/app/shared/ui/loading-screen/**
- Modify: frontend/src/app/app.routes.ts
- Modify: frontend/src/styles.scss
- Create: frontend/e2e/auth.spec.ts

- [ ] Tester formulaire typé, validation, erreur générique, pending et focus sur résumé d'erreur.
- [ ] Tester Playwright : login, navigation Users réservée ADMIN, sidebar à 1440×900, bottom nav à 390×844, page 403.
- [ ] Implémenter labels/autocomplete, skip-link, identity menu et permission map centralisée.
- [ ] Valider frontend lint/test/build/e2e, backend clean verify et git diff --check.
- [ ] Mettre à jour README.md, docs/README.md, docs/IMPLEMENTATION_PLAN.md, AGENTS.md et .env.example uniquement avec les éléments réellement disponibles.
- [ ] Commit : git commit -m "feat: deliver secured application shell".

## Acceptance Gate

- [ ] Login, refresh, logout et restauration passent en intégration et E2E.
- [ ] La réutilisation d'un refresh révoque sa famille.
- [ ] Toute la matrice RBAC passe côté backend.
- [ ] Aucun token n'est persisté dans le navigateur.
- [ ] Maven verify, lint, Vitest, build Angular et Playwright passent.
