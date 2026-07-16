#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Подготовка свежего Ubuntu-сервера (напр. Hetzner CX32, 8GB) под
# RAG-ассистента: обновление, swap, Docker, firewall.
# Запускать от root:  bash deploy/bootstrap.sh
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> Обновление системы"
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get upgrade -y

echo "==> Swap 4G (страховка ОЗУ при загрузке bge-m3/reranker на 8GB)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Docker Engine + compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Firewall: наружу только SSH + HTTP/HTTPS (внутренние порты закрыты)"
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo "==> Готово. Дальше:"
echo "    1) cp .env.example .env && отредактировать секреты"
echo "    2) docker compose -f docker/docker-compose.yml --profile app up -d --build"
