# SonarQube

## Architecture et limites

La stack locale isole SonarQube Community Build 26.7 et sa base PostgreSQL dans le profil Compose
`quality`. La base n'est pas publiée sur l'hôte et l'interface SonarQube écoute uniquement sur
`127.0.0.1`. Les données, extensions, journaux et fichiers temporaires utilisent des volumes
nommés.

Deux projets conservent des cycles de build indépendants :

- `devops-store-backend`, analysé avec SonarScanner for Maven 5.5.0.6356 ;
- `devops-store-frontend`, analysé avec SonarScanner for NPM 5.0.0.

Community Build analyse ici uniquement la branche principale. Le workflow qualité ne lance donc
pas d'analyse de Pull Request. Il attend une instance SonarQube accessible depuis GitHub Actions ;
l'instance liée à `localhost` sert seulement aux validations locales.

## Prérequis

- Docker et Docker Compose disponibles ;
- au moins 4 Gio de mémoire disponibles pour la stack qualité ;
- Java 25, Docker et une licence AIStor Free locale pour la vérification backend ;
- Node.js 24, npm 11 et Java 25 référencé par `JAVA_HOME` pour le frontend ;
- un mot de passe PostgreSQL SonarQube conservé hors de Git.

Le port SonarQube par défaut, `9000`, est aussi celui de l'API AIStor de la stack applicative. Ne
pas démarrer les deux stacks sur ce port en même temps, ou définir par exemple
`$env:SONAR_PORT = '9002'` et utiliser `http://localhost:9002` comme URL SonarQube.

## Premier démarrage

Dans un terminal PowerShell ouvert à la racine du dépôt :

```powershell
$env:SONAR_DB_PASSWORD = '<local-password>'
docker compose -f docker-compose.devops.yml --profile quality config --quiet
docker compose -f docker-compose.devops.yml --profile quality up -d --wait
docker compose -f docker-compose.devops.yml --profile quality ps
curl.exe http://localhost:9000/api/system/status
```

Avec GNU Make, les commandes équivalentes sont `make quality-config`, `make quality-up` et
`make quality-status`. Si `SONAR_PORT` a été modifié, adapter l'URL du contrôle HTTP.

## Mot de passe administrateur et token local

Au premier accès à <http://localhost:9000>, se connecter avec les identifiants initiaux documentés
par SonarQube (`admin` / `admin`) et remplacer immédiatement le mot de passe demandé. Créer ensuite
les projets avec les clés `devops-store-backend` et `devops-store-frontend`, puis générer un token
d'analyse autorisé pour ces projets.

Conserver le token uniquement dans l'environnement du terminal qui exécute les scans :

```powershell
$env:SONAR_HOST_URL = 'http://localhost:9000'
$env:SONAR_TOKEN = '<local-analysis-token>'
```

Ne jamais placer `SONAR_TOKEN`, le mot de passe administrateur ou un mot de passe de base réel
dans `.env`, `.env.example`, une commande versionnée ou un journal partagé. Supprimer la variable
après usage avec `Remove-Item Env:SONAR_TOKEN`.

## Analyse backend

Le scan exécute les 110 tests backend, importe les rapports Surefire et
`target/site/jacoco/jacoco.xml`, puis attend le résultat du quality gate pendant au plus 300
secondes. `MINIO_LICENSE_FILE` doit pointer vers une licence locale lisible.

```powershell
Set-Location backend
.\mvnw.cmd clean verify org.sonarsource.scanner.maven:sonar-maven-plugin:5.5.0.6356:sonar
```

Depuis un shell compatible GNU Make à la racine, `make sonar-backend` exécute la même validation.
Le scanner n'est pas lié au cycle Maven normal : `clean verify` seul ne publie aucune analyse.

## Analyse frontend

Vitest produit le rapport de couverture `coverage/frontend/lcov.info` et le rapport générique de
tests `sonar-report.xml`. Ce dernier est généré et ignoré par Git.

```powershell
Set-Location ..\frontend
npm ci
npm run lint
npm run test:ci
npm run build
$env:SONAR_SCANNER_JAVA_EXE_PATH = Join-Path $env:JAVA_HOME 'bin\java.exe'
npm run sonar
```

`make sonar-frontend` exécute cette séquence depuis la racine. Le scanner analyse les sources et
les tests TypeScript ; les fichiers `*.spec.ts` sont classés comme tests, pas retirés de l'analyse.
Le projet désactive le téléchargement automatique du JRE du scanner et utilise Java 25 depuis
`JAVA_HOME`, car SonarQube ne publie pas de JRE provisionné pour Windows ARM64. Le chemin est passé
explicitement au scanner pour éviter l'ambiguïté si plusieurs installations Java figurent dans
`PATH`.

## Quality gates

Les deux configurations activent `sonar.qualitygate.wait=true`. Une analyse locale ou CI attend
donc un état final du gate et échoue si le gate est en erreur ou si SonarQube ne répond pas avant
300 secondes. Lors de la première analyse, vérifier dans l'interface que chaque projet expose au
minimum les mesures de couverture et de tests avant de considérer la phase validée.

Le quality gate associé est géré dans SonarQube. Aucun seuil artificiel n'est dupliqué dans Maven,
Vitest ou le workflow GitHub Actions.

## GitHub Actions

Le workflow `.github/workflows/quality.yml` s'exécute sur `main` ou manuellement. Il reste en
succès sans lancer de build quand l'une des deux valeurs SonarQube manque :

- `SONAR_HOST_URL` : variable GitHub contenant l'URL de l'instance externe ;
- `SONAR_TOKEN` : secret GitHub contenant le token d'analyse ;
- `MINIO_LICENSE_B64` : secret GitHub contenant la licence AIStor encodée en Base64, requis par
  les tests backend et supprimé du runner après usage.

Le token et la licence ne doivent jamais être passés comme paramètres de ligne de commande ou
écrits dans les artefacts. Le workflow n'analyse pas les Pull Requests avec Community Build.

## Arrêt et nettoyage

L'arrêt normal préserve tous les volumes :

```powershell
docker compose -f docker-compose.devops.yml --profile quality down
```

ou `make quality-down`. Pour suivre les journaux, utiliser `make quality-logs`. La commande suivante
supprime définitivement la base et toutes les données locales SonarQube ; ne l'utiliser que pour
un rétablissement volontaire à zéro :

```powershell
docker compose -f docker-compose.devops.yml --profile quality down --volumes
```

Son équivalent est `make quality-reset`.

## Dépannage

- `SONAR_DB_PASSWORD` manquant : définir la variable dans le terminal courant, sans l'afficher ni
  la stocker dans Git, puis relancer `quality-config`.
- port `9000` déjà utilisé : arrêter la stack applicative ou définir `SONAR_PORT`, puis aligner
  `SONAR_HOST_URL` sur ce port.
- conteneur SonarQube non sain : exécuter `make quality-status` puis `make quality-logs` et vérifier
  la mémoire Docker disponible. Sous Linux, vérifier également la valeur `vm.max_map_count`
  recommandée par SonarQube avant de la modifier au niveau système.
- quality gate en erreur : ouvrir le projet concerné, traiter les conditions en échec, regénérer
  les rapports de tests et relancer l'analyse ; ne pas masquer les tests TypeScript par une
  exclusion.
- rapport frontend absent : relancer `npm run test:ci` et vérifier la présence de
  `coverage/frontend/lcov.info` et `sonar-report.xml` avant `npm run sonar`.
- erreur `No JREs available`, `Java not found in PATH` ou chemin `java.exe` concaténé : vérifier
  `java --version` et `JAVA_HOME`, puis définir `SONAR_SCANNER_JAVA_EXE_PATH` vers le binaire du
  JDK 25 ; le scanner NPM utilise volontairement ce runtime sur Windows ARM64.
