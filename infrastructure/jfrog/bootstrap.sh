#!/bin/sh
set -eu

: "${JFROG_INTERNAL_URL:?JFROG_INTERNAL_URL is required}"
: "${JFROG_ADMIN_TOKEN:?JFROG_ADMIN_TOKEN is required}"
REPOSITORY_DIR=${REPOSITORY_DIR:-/opt/jfrog/repositories}

verify_repository() {
    file=$1
    key=$2
    body=/tmp/jfrog-response

    [ -r "$file" ] || {
        echo "Missing desired repository definition: ${file}" >&2
        exit 1
    }

    code=$(curl --silent --show-error --output "$body" --write-out '%{http_code}' \
        --header "Authorization: Bearer ${JFROG_ADMIN_TOKEN}" \
        "${JFROG_INTERNAL_URL}/api/storage/${key}")
    case "$code" in
        200)
            echo "Repository key ${key} is present"
            ;;
        401|403)
            echo "Cannot verify repository ${key}: token rejected (HTTP ${code})" >&2
            exit 1
            ;;
        404)
            echo "Repository ${key} is missing." >&2
            echo "Create it once in the Artifactory OSS UI using ${file} as the desired configuration." >&2
            exit 1
            ;;
        *)
            echo "Cannot verify repository ${key}: HTTP ${code}" >&2
            exit 1
            ;;
    esac
}

for key in \
    devops-store-snapshots-local \
    devops-store-candidates-local \
    devops-store-releases-local \
    maven-central-remote \
    devops-store-maven-virtual
do
    verify_repository "${REPOSITORY_DIR}/${key}.json" "$key"
done

echo "All five Maven repository keys are present (configuration is validated by the functional flow)"
