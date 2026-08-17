#!/bin/sh
set -eu

mkdir -p /app/data /app/public/uploads/client-admin

if [ ! -s /app/data/client-admin.json ]; then
  cp /opt/pilot-seed/client-admin.json /app/data/client-admin.json
fi

if [ ! -s /app/data/client-analytics.json ]; then
  cp /opt/pilot-seed/client-analytics.json /app/data/client-analytics.json
fi

if [ -z "$(find /app/public/uploads/client-admin -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  cp -a /opt/pilot-seed/uploads/. /app/public/uploads/client-admin/
fi

exec "$@"
