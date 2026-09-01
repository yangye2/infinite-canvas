#!/bin/sh
set -e
PORT=8080 /app/server &
exec nginx -g "daemon off;"
