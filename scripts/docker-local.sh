#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
ENV_TEMPLATE="$ROOT_DIR/.env.local.example"
COMPOSE_FILE="$ROOT_DIR/compose.local.yaml"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

fail() {
  printf 'خطا: %s\n' "$*" >&2
  exit 1
}

require_docker() {
  command -v docker >/dev/null 2>&1 || fail 'Docker نصب نیست یا در PATH قرار ندارد.'
  docker info >/dev/null 2>&1 || fail 'Docker daemon در دسترس نیست. Docker Desktop یا Docker Engine را اجرا کنید.'
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 در دسترس نیست.'
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import secrets; print(secrets.token_hex(32))'
  elif command -v python >/dev/null 2>&1; then
    python -c 'import secrets; print(secrets.token_hex(32))'
  else
    docker run --rm --entrypoint node node:24-bookworm-slim -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
  fi
}

read_env_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

set_env_value() {
  local key="$1" value="$2" temporary
  temporary="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 { print key "=" value; updated = 1; next }
    { print }
    END { if (!updated) print key "=" value }
  ' "$ENV_FILE" > "$temporary"
  mv "$temporary" "$ENV_FILE"
}

ensure_env() {
  [[ -f "$ENV_TEMPLATE" ]] || fail '.env.local.example پیدا نشد.'
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_TEMPLATE" "$ENV_FILE"
    chmod 600 "$ENV_FILE" 2>/dev/null || true
    printf 'فایل .env.local ساخته شد.\n'
  fi

  local password secret port
  password="$(read_env_value ANALYTICS_ADMIN_PASSWORD)"
  secret="$(read_env_value ANALYTICS_HASH_SECRET)"
  port="$(read_env_value LOCAL_PORT)"

  if [[ -z "$password" ]]; then
    set_env_value ANALYTICS_ADMIN_PASSWORD "$(generate_secret)"
  fi
  if [[ -z "$secret" ]]; then
    set_env_value ANALYTICS_HASH_SECRET "$(generate_secret)"
  fi
  if [[ -z "$port" ]]; then
    set_env_value LOCAL_PORT 4321
    port=4321
  fi
  [[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1 && port <= 65535 )) || fail 'LOCAL_PORT باید عددی بین 1 و 65535 باشد.'
}

local_port() {
  read_env_value LOCAL_PORT
}

show_access() {
  local port user password
  port="$(local_port)"
  user="$(read_env_value ANALYTICS_ADMIN_USER)"
  password="$(read_env_value ANALYTICS_ADMIN_PASSWORD)"
  cat <<EOF

Mermaid Studio روی لوکال آماده است:
  صفحه اصلی:  http://localhost:${port}/
  ادیتور:     http://localhost:${port}/editor
  پنل ادمین:  http://localhost:${port}/admin/analytics
  سلامت:      http://localhost:${port}/api/health

ورود پنل ادمین:
  نام کاربری: ${user:-admin}
  رمز عبور:   ${password}

این سرویس فقط روی 127.0.0.1 منتشر شده و از شبکه محلی قابل دسترسی نیست.
EOF
}

wait_for_health() {
  local timeout_seconds="${1:-150}" start container status
  start="$(date +%s)"
  while true; do
    container="$(compose ps -q app 2>/dev/null || true)"
    if [[ -n "$container" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
      case "$status" in
        healthy)
          return 0
          ;;
        unhealthy|exited|dead)
          compose logs --tail 200 app >&2 || true
          fail "کانتینر با وضعیت ${status} متوقف شد."
          ;;
      esac
    fi
    if (( $(date +%s) - start >= timeout_seconds )); then
      compose logs --tail 200 app >&2 || true
      fail 'سرویس در زمان مورد انتظار healthy نشد.'
    fi
    sleep 2
  done
}

usage() {
  cat <<'EOF'
استفاده:
  ./scripts/docker-local.sh setup       ساخت .env.local و تولید Secretها
  ./scripts/docker-local.sh doctor      بررسی Docker و اعتبار Compose
  ./scripts/docker-local.sh up          Build و اجرای سرویس لوکال
  ./scripts/docker-local.sh test        Smoke test سریع
  ./scripts/docker-local.sh test-full   تست کامل شامل PDF و ممیزی SEO
  ./scripts/docker-local.sh status      وضعیت کانتینر و Health
  ./scripts/docker-local.sh logs        نمایش زنده لاگ‌ها
  ./scripts/docker-local.sh restart     راه‌اندازی مجدد سرویس
  ./scripts/docker-local.sh down        توقف کانتینر؛ داده‌ها حفظ می‌شوند
  ./scripts/docker-local.sh reset       حذف کانتینر و دادهٔ آنالیتیکس لوکال
  ./scripts/docker-local.sh clean       حذف کانتینر، volume و image لوکال
  ./scripts/docker-local.sh credentials نمایش آدرس‌ها و اطلاعات ورود
EOF
}

command_name="${1:-help}"
case "$command_name" in
  setup)
    require_docker
    ensure_env
    printf 'تنظیمات لوکال آماده شد: %s\n' "$ENV_FILE"
    show_access
    ;;
  doctor)
    require_docker
    ensure_env
    compose config --quiet
    printf 'Docker، Compose و تنظیمات لوکال معتبرند.\n'
    docker version --format 'Docker Engine: {{.Server.Version}}' 2>/dev/null || true
    docker compose version
    ;;
  up)
    require_docker
    ensure_env
    compose config --quiet
    compose up -d --build --remove-orphans
    wait_for_health
    show_access
    ;;
  test|test-full)
    require_docker
    ensure_env
    wait_for_health 30
    if [[ "$command_name" == 'test-full' ]]; then
      compose exec -T app node scripts/docker-local-smoke.mjs --full
    else
      compose exec -T app node scripts/docker-local-smoke.mjs
    fi
    ;;
  status)
    require_docker
    ensure_env
    compose ps
    container="$(compose ps -q app 2>/dev/null || true)"
    if [[ -n "$container" ]]; then
      docker inspect --format 'Health: {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container"
    fi
    ;;
  logs)
    require_docker
    ensure_env
    compose logs -f --tail 200 app
    ;;
  restart)
    require_docker
    ensure_env
    compose restart app
    wait_for_health
    show_access
    ;;
  down)
    require_docker
    ensure_env
    compose down --remove-orphans
    printf 'سرویس متوقف شد؛ دادهٔ لوکال حفظ شده است.\n'
    ;;
  reset)
    require_docker
    ensure_env
    if [[ "${2:-}" != '--yes' ]]; then
      read -r -p 'تمام دادهٔ آنالیتیکس لوکال حذف شود؟ [y/N] ' answer
      [[ "$answer" =~ ^[Yy]$ ]] || { printf 'لغو شد.\n'; exit 0; }
    fi
    compose down --volumes --remove-orphans
    printf 'کانتینرها و دادهٔ لوکال حذف شدند؛ .env.local حفظ شد.\n'
    ;;
  clean)
    require_docker
    ensure_env
    if [[ "${2:-}" != '--yes' ]]; then
      read -r -p 'کانتینر، volume و image لوکال حذف شوند؟ [y/N] ' answer
      [[ "$answer" =~ ^[Yy]$ ]] || { printf 'لغو شد.\n'; exit 0; }
    fi
    compose down --volumes --rmi local --remove-orphans
    printf 'منابع Docker لوکال پاک شدند؛ .env.local حفظ شد.\n'
    ;;
  credentials)
    require_docker
    ensure_env
    show_access
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    fail "فرمان ناشناخته: ${command_name}"
    ;;
esac
