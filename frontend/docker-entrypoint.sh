#!/bin/sh
set -eu

cat > /usr/share/nginx/html/config.js <<EOF
window.APP_CONFIG = {
  API_BASE_URL: "${VITE_API_BASE_URL:-http://127.0.0.1:8000}"
};
EOF
