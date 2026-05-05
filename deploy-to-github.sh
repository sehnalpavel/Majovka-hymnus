#!/usr/bin/env bash
# deploy-to-github.sh — Vytvoří GitHub repo a pushne tento projekt.
# Spusť: bash deploy-to-github.sh

set -e

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

cyan "═══════════════════════════════════════"
cyan "  Májová Regata — Deploy na GitHub"
cyan "═══════════════════════════════════════"
echo ""

# Prerequisites
command -v git  >/dev/null || { red "❌ git není nainstalovaný. V Termuxu: pkg install git"; exit 1; }
command -v curl >/dev/null || { red "❌ curl není nainstalovaný. V Termuxu: pkg install curl"; exit 1; }

# Sanity check: are we in the project folder?
[ -f "package.json" ] || { red "❌ Nejsi v adresáři projektu. Spusť ze složky majova-regata-anthem/."; exit 1; }
[ -f "server.js" ]    || { red "❌ Nejsi v adresáři projektu. Spusť ze složky majova-regata-anthem/."; exit 1; }

# Check for existing .git and existing remote
HAS_GIT=false
[ -d ".git" ] && HAS_GIT=true

if $HAS_GIT && git remote get-url origin >/dev/null 2>&1; then
  EXISTING=$(git remote get-url origin)
  yellow "⚠️  Remote 'origin' už existuje: $EXISTING"
  read -p "Přepsat? [y/N]: " OVR
  [ "$OVR" = "y" ] || { echo "Ukončuji."; exit 0; }
  git remote remove origin
fi

# Inputs
echo "📝 Zadej následující údaje:"
echo ""
read -p "  GitHub username: " GH_USER
[ -z "$GH_USER" ] && { red "Username je povinný."; exit 1; }

read -p "  Název repozitáře [majova-regata-anthem]: " REPO_NAME
REPO_NAME=${REPO_NAME:-majova-regata-anthem}

read -p "  Tvoje jméno do commits [$GH_USER]: " GIT_NAME
GIT_NAME=${GIT_NAME:-$GH_USER}

read -p "  Tvůj email do commits: " GIT_EMAIL
[ -z "$GIT_EMAIL" ] && { red "Email je povinný."; exit 1; }

read -p "  Soukromé repo? [y/N]: " PRIVATE_ANS
PRIVATE=$([ "$PRIVATE_ANS" = "y" ] && echo "true" || echo "false")

echo ""
yellow "Personal Access Token (vytvoř na github.com → Settings → Developer settings → Personal access tokens → Tokens classic, scope: repo)"
read -rsp "  Token (ghp_...): " GH_TOKEN
echo ""
[ -z "$GH_TOKEN" ] && { red "Token je povinný."; exit 1; }
echo ""

# Initialize git repo if needed
if ! $HAS_GIT; then
  green "🔧 Inicializuji git repo…"
  git init -q
fi

# Always ensure we're on main branch
git checkout -q -B main 2>/dev/null || git branch -M main

# Set git identity (now safe — repo exists)
git config user.name  "$GIT_NAME"
git config user.email "$GIT_EMAIL"

# Stage and commit
git add -A

if [ -z "$(git log --oneline 2>/dev/null)" ]; then
  green "📝 Vytvářím první commit…"
  git commit -q -m "Initial commit"
elif ! git diff --cached --quiet 2>/dev/null; then
  green "📝 Commituji změny…"
  git commit -q -m "Update"
else
  green "📝 Žádné nové změny ke commitu, jdu rovnou na push."
fi

# Create repo via GitHub API
echo ""
green "📦 Vytvářím repo $GH_USER/$REPO_NAME na GitHubu…"
HTTP=$(curl -s -o /tmp/gh-create.json -w "%{http_code}" \
  -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO_NAME\",\"private\":$PRIVATE,\"description\":\"Generator rockovych hymnu pro Majovou regatu 2026\"}")

if [ "$HTTP" = "201" ]; then
  green "  ✓ Repo vytvořeno"
elif [ "$HTTP" = "422" ] && grep -q "already exists" /tmp/gh-create.json 2>/dev/null; then
  yellow "  ℹ️  Repo už existuje, použiju ho."
elif [ "$HTTP" = "401" ]; then
  red "❌ HTTP 401 — token je neplatný nebo nemá scope 'repo'."
  exit 1
else
  red "❌ Chyba HTTP $HTTP při vytváření repa:"
  cat /tmp/gh-create.json 2>/dev/null
  exit 1
fi

# Configure git credential helper so future pushes don't re-prompt
green "🔑 Ukládám přihlašovací údaje (git credential helper store)…"
git config --global credential.helper store
CRED_FILE="$HOME/.git-credentials"
[ -f "$CRED_FILE" ] && grep -v "github.com" "$CRED_FILE" > "$CRED_FILE.tmp" 2>/dev/null && mv "$CRED_FILE.tmp" "$CRED_FILE" || true
echo "https://${GH_USER}:${GH_TOKEN}@github.com" >> "$CRED_FILE"
chmod 600 "$CRED_FILE"

# Set remote and push
green "🚀 Push na GitHub…"
git remote add origin "https://github.com/$GH_USER/$REPO_NAME.git"

if git push -u origin main; then
  echo ""
  green "═══════════════════════════════════════"
  green "  ✅ HOTOVO!"
  green "═══════════════════════════════════════"
  echo ""
  echo "  Repo: https://github.com/$GH_USER/$REPO_NAME"
  echo ""
  echo "  Další kroky:"
  echo "    1) railway.app → New Project → Deploy from GitHub → vyber $REPO_NAME"
  echo "    2) v Railway nastav environment variables (.env.example ti řekne které)"
  echo "    3) Settings → Volumes → Mount path /data → Add"
  echo ""
  echo "  Příští změna:"
  echo "    git add ."
  echo "    git commit -m 'co jsi změnil'"
  echo "    git push"
  echo "  (token už nebude potřeba znovu zadávat, je uložený)"
  echo ""
else
  red "❌ Push selhal. Token zkontroluj na github.com → Settings → Developer settings."
  exit 1
fi

rm -f /tmp/gh-create.json
