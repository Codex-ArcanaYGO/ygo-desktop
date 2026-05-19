SHELL := /bin/bash
NPM := npm
CARGO := cargo
TAURI := npx tauri

.DEFAULT_GOAL := help

.PHONY: help setup install-cli dev build test typecheck fmt lint check clean icons

help: ## Affiche cette aide
	@awk 'BEGIN {FS = ":.*##"; printf "\nCibles disponibles:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

node_modules: package.json package-lock.json
	$(NPM) install
	@touch node_modules

setup: node_modules ## Installe les dépendances et prépare l'env
	@test -f .env || cp .env.example .env
	@command -v $(CARGO) >/dev/null || (echo "[ERREUR] Installe Rust: https://rustup.rs" && exit 1)
	@echo "[OK] desktop prêt — édite .env si besoin"

install-cli: ## (optionnel) Installe le CLI Tauri global
	$(CARGO) install tauri-cli --version "^2.0" --locked

dev: node_modules ## Lance l'app desktop en dev (Vite + Tauri, hot reload)
	$(TAURI) dev

build: node_modules ## Build natif (.dmg/.app sur macOS, .msi sur Windows)
	$(TAURI) build

icons: ## Régénère les icônes depuis app-icon.png
	@test -f app-icon.png || (echo "[ERREUR] Place un PNG 1024x1024 nommé app-icon.png" && exit 1)
	$(TAURI) icon app-icon.png

test: node_modules ## Tests Vitest (frontend)
	$(NPM) test

typecheck: node_modules ## Type-check TypeScript
	$(NPM) run typecheck

fmt: ## Formate le code Rust
	cd src-tauri && $(CARGO) fmt

lint: typecheck ## Type-check TS + clippy Rust
	cd src-tauri && $(CARGO) clippy --all-targets -- -D warnings

ci: lint test ## Exécute la CI localement (lint + test)

check: ## cargo check
	cd src-tauri && $(CARGO) check

clean: ## Nettoie dist/, target/, node_modules/
	rm -rf dist node_modules
	cd src-tauri && $(CARGO) clean
