#!/bin/sh
# Apunta git a los hooks versionados del repo.
#
# `core.hooksPath` es config local de cada clon: por eso hace falta correr esto
# una vez después de clonar. Lo hace `npm install` vía el script `prepare`.
set -e
git config core.hooksPath .githooks
echo "✓ Hooks activos desde .githooks/"
