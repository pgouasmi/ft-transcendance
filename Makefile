# Variables
COMPOSE_FILE := docker-compose.yml
DOCKER_COMPOSE := docker compose -f $(COMPOSE_FILE)
DOCKER_BUILDKIT := DOCKER_BUILDKIT=1
COMPOSE_DOCKER_CLI_BUILD := COMPOSE_DOCKER_CLI_BUILD=1

SERVICES := nginx server matchmaking ai_client frontend_client auth postgres

AI_TOKEN := $(shell openssl rand -hex 32)
GAME_TOKEN := $(shell openssl rand -hex 32)
UNKNOWN_USER_TOKEN := $(shell openssl rand -hex 32)

AI_HASH_TOKEN := $(shell openssl rand -hex 32)

IP_ADDRESS := $(shell ip addr | awk '/inet / {if(++n==2)print $$2}' | cut -d/ -f1)

# Colors for messages
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Cibles par défaut
.DEFAULT_GOAL := help

all: build-fast up-fg

# Aide
help:
	@echo "Usage:"
	@echo "  make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  sans argument	- Default: Affiche cette aide (make help)"
	@echo "  help	- Affiche cette aide"
	@echo "  all	- Construit et démarre tous les conteneurs (build-fast et up-fg)"
	@echo "  build [SERVICE]	   - Construit tous les conteneurs ou un service spécifique"
	@echo "  build-fast [SERVICE]  - Construit rapidement tous les conteneurs ou un service spécifique"
	@echo "  up [SERVICE]	  - Démarre tous les conteneurs ou un service spécifique en arrière-plan"
	@echo "  up-fg [SERVICE]	   - Démarre tous les conteneurs ou un service spécifique en avant-plan (avec logs)"
	@echo "  down	  - Arrête et supprime tous les conteneurs"
	@echo "  stop	  - Arrête tous les conteneurs sans les supprimer"
	@echo "  restart [SERVICE]	 - Redémarre tous les conteneurs ou un service spécifique"
	@echo "  logs [SERVICE]	- Affiche les logs de tous les conteneurs ou d'un service spécifique"
	@echo "  ps	- Liste tous les conteneurs"
	@echo "  clean	 - Nettoie tous les conteneurs, images et volumes non utilisés"
	@echo "  nginx-reload	  - Recharge la configuration de Nginx"
	@echo "  rebuild [SERVICE]	 - Reconstruit et redémarre tous les conteneurs ou un service spécifique"
	@echo "  rebuild-fast [SERVICE]- Reconstruit rapidement et redémarre tous les conteneurs ou un service spécifique"
	@echo "  rebuild-fg [SERVICE]  - Reconstruit et redémarre tous les conteneurs ou un service spécifique en avant-plan"
	@echo "  up-fg-safe	- Démarre tous les services en avant-plan avec gestion sécurisée de l'interruption"
	@echo "  rebuild-fg-safe	   - Reconstruit et démarre tous les services en avant-plan avec gestion sécurisée de l'interruption"

# Check required environment variables
check-env:
	@echo "$(YELLOW)Checking environment variables...$(NC)"
	@if [ ! -f .env ]; then \
		echo "$(RED)Error: .env file not found$(NC)"; \
		exit 1; \
	fi
	@missing_vars=0; \
	while IFS='=' read -r key value; do \
		if [ "$${key#\#}" != "$$key" ] || [ -z "$$key" ]; then continue; fi; \
		if [ -z "$$value" ]; then \
			echo "$(RED)Error: $$key is not set in .env file$(NC)"; \
			missing_vars=1; \
		fi; \
	done < .env; \
	missing_vars=0; \
	for var in BACKEND_SECRET_KEY JWT_SECRET_KEY TEMPORARY_JWT_SECRET_KEY PYTHONUNBUFFERED \
			  VITE_CLIENT_ID VITE_CLIENT_SECRET SUPERUSER_USERNAME SUPERUSER_EMAIL \
			  SUPERUSER_PASSWORD DB_NAME DB_USER DB_PASSWORD; do \
		if ! grep -q "^$$var=" .env; then \
			echo "$(RED)Error: Required variable $$var is missing from .env file$(NC)"; \
			missing_vars=1; \
		fi; \
	done; \
	if [ $$missing_vars -eq 1 ]; then \
		echo "$(RED)Error: Some required environment variables are missing or empty$(NC)"; \
		echo "$(YELLOW)Please ensure all required variables are set in your .env file$(NC)"; \
		exit 1; \
	fi; \
	echo "$(GREEN)Environment variables check passed$(NC)"

setup-ssl:
	@echo "$(YELLOW)Starting SSL setup...$(NC)"
	@if [ ! -d "ssl" ]; then \
		echo "$(GREEN)Creating ssl directory...$(NC)"; \
		mkdir -p ssl; \
	fi
	@if [ ! -f ssl/nginx.crt ] || [ ! -f ssl/nginx.key ]; then \
		echo "$(GREEN)Generating SSL certificates...$(NC)"; \
		openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
			-keyout ssl/nginx.key \
			-out ssl/nginx.crt \
			-subj "/C=FR/ST=AURA/L=Lyon/O=42/OU=Student/CN=localhost"; \
	fi
	@echo "$(GREEN)Setting correct permissions for SSL files...$(NC)"
	@chmod 644 ssl/nginx.crt
	@chmod 600 ssl/nginx.key
	@if [ -f ssl/nginx.crt ] && [ -f ssl/nginx.key ]; then \
		echo "$(GREEN)SSL certificates are ready$(NC)"; \
	else \
		echo "$(RED)Warning: SSL certificates were not created properly$(NC)"; \
		exit 1; \
	fi

setup-env:
	@echo "$(YELLOW)Detecting public IP address...$(NC)"
	@if [ -z "$(IP_ADDRESS)" ]; then \
		echo "$(RED)Failed to detect public IP address. Please check your internet connection.$(NC)"; \
		echo "$(RED)Make sure you can access one of these services:$(NC)"; \
		echo "$(RED)- api.ipify.org$(NC)"; \
		echo "$(RED)- ifconfig.me$(NC)"; \
		echo "$(RED)- icanhazip.com$(NC)"; \
		echo "$(RED)- ipecho.net/plain$(NC)"; \
		exit 1; \
	fi
	@if ! echo "$(IP_ADDRESS)" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$$|^[0-9a-fA-F:]+$$'; then \
		echo "$(RED)Invalid IP address format detected: $(IP_ADDRESS)$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Detected public IP address: $(IP_ADDRESS)$(NC)"
	@echo "$(YELLOW)Generating service tokens...$(NC)"
	@if [ -f .env ]; then \
		echo "$(YELLOW)Removing existing service tokens and redirect URI...$(NC)"; \
		sed -i '/^AI_SERVICE_TOKEN/d' .env; \
		sed -i '/^GAME_SERVICE_TOKEN/d' .env; \
		sed -i '/^VITE_REDIRECT_URI/d' .env; \
	fi
	@echo "$(YELLOW)Adding new tokens and redirect URI...$(NC)"
	@echo "AI_SERVICE_TOKEN=Bearer $(AI_TOKEN)" >> .env
	@echo "GAME_SERVICE_TOKEN=Bearer $(GAME_TOKEN)" >> .env
	@echo "VITE_REDIRECT_URI=https://$(IP_ADDRESS):7777/auth/authfortytwo" >> .env
	@echo "$(GREEN)Service tokens and redirect URI updated in .env$(NC)"
	@echo "$(YELLOW)You can access your service at: https://$(IP_ADDRESS):5173$(NC)"
	@echo "$(YELLOW)Verifying AI QTables hash...$(NC)"
	@if ! grep -q "AI_HASH_SECRET" .env; then \
		echo "$(YELLOW)Generating AI hash secret...$(NC)"; \
		echo "AI_HASH_SECRET=$(AI_HASH_TOKEN)" >> .env; \
		sh PongAI/hashes_script.sh; \
		echo "$(GREEN)QTables hashes updated$(NC)"; \
	else \
		echo "$(GREEN)AI hash secret already exists in .env$(NC)"; \
	fi

update-hashes:
	@echo "$(YELLOW)Mise à jour des hash avec la nouvelle clé secrète...$(NC)"
	@chmod -R 775 ./PongAI/ai_data
	@python3 PongAI/update_hashes.py
	@echo "$(GREEN)Hash mis à jour avec succès$(NC)"

build-single-service:
	@echo "$(GREEN)Construction du service $(SERVICE)...$(NC)"
	$(DOCKER_COMPOSE) build $(SERVICE)

build-fast-single-service:
	@echo "$(GREEN)Construction rapide du service $(SERVICE)...$(NC)"
	$(DOCKER_BUILDKIT) $(COMPOSE_DOCKER_CLI_BUILD) $(DOCKER_COMPOSE) build $(SERVICE)

build: check-env setup-ssl
ifdef SERVICE
	@echo "$(GREEN)Construction du service $(SERVICE) si nécessaire...$(NC)"
	$(DOCKER_BUILDKIT) $(COMPOSE_DOCKER_CLI_BUILD) $(DOCKER_COMPOSE) build $(SERVICE)
else
	@$(MAKE) setup-env
	@echo "$(GREEN)Building all services if needed...$(NC)"
	$(DOCKER_BUILDKIT) $(COMPOSE_DOCKER_CLI_BUILD) $(DOCKER_COMPOSE) build
endif

build-fast: check-env setup-ssl
ifdef SERVICE
	@echo "$(GREEN)Construction rapide du service $(SERVICE) si nécessaire...$(NC)"
	$(DOCKER_BUILDKIT) $(COMPOSE_DOCKER_CLI_BUILD) $(DOCKER_COMPOSE) build $(SERVICE)
else
	@$(MAKE) setup-env
	@echo "$(GREEN)Fast building all services if needed...$(NC)"
	$(DOCKER_BUILDKIT) $(COMPOSE_DOCKER_CLI_BUILD) $(DOCKER_COMPOSE) build
endif

up: check-env
	@echo "$(GREEN)Starting services in background...$(NC)"
	$(DOCKER_COMPOSE) up -d $(SERVICES)

# Démarrer les conteneurs en avant-plan (avec logs)
up-fg:
	@echo "$(GREEN)Démarrage des services en avant-plan...$(NC)"
	$(DOCKER_COMPOSE) up $(SERVICES)

# Arrête uniquement les conteneurs
down:
	@echo "$(YELLOW)Arrêt des conteneurs...$(NC)"
	$(DOCKER_COMPOSE) down

# Arrête les conteneurs et supprime les images du projet
down-img: down
	@echo "$(YELLOW)Suppression des images du projet...$(NC)"
	@for service in $(SERVICES); do \
		echo "$(YELLOW)Suppression de l'image du service $$service...$(NC)"; \
		docker rmi rendu-$$service 2>/dev/null || true; \
	done
	@echo "$(YELLOW)Suppression de l'image du service nginx...$(NC)"; \
		docker rmi nginx 2>/dev/null || true; \

# Supprime aussi les volumes et la DB
down-db: down-img
	@echo "$(RED)Suppression des volumes et de la DB...$(NC)"
	$(DOCKER_COMPOSE) down -v

# Nettoyage complet incluant le cache de build et les fichiers de configuration
clean: down-db
	@echo "$(RED)Nettoyage complet du projet...$(NC)"
	@echo "$(RED)Nettoyage du cache de build...$(NC)"
	@docker builder prune -f
	@DOCKER_BUILDKIT=1 docker buildx prune -f --all
	@docker buildx stop
	@docker buildx rm -f 2>/dev/null || true
	@rm -rf ~/.docker/buildx
	@if [ -d "ssl" ]; then \
		rm -rf ssl; \
		echo "$(GREEN)Dossier SSL supprimé$(NC)"; \
	fi
	@if [ -f ".env" ]; then \
		sed -i '/AI_SERVICE_TOKEN/d' .env; \
		sed -i '/GAME_SERVICE_TOKEN/d' .env; \
		sed -i '/VITE_REDIRECT_URI/d' .env; \
		echo "$(GREEN)Tokens de service et redirect URI supprimés du fichier .env$(NC)"; \
	fi

# Arrêter tous les conteneurs sans les supprimer
stop:
	@echo "$(YELLOW)Arrêt de tous les conteneurs...$(NC)"
	$(DOCKER_COMPOSE) stop

# Redémarrer les conteneurs
restart:
	#	$(call run_xhost)
ifdef SERVICE
	@echo "$(GREEN)Redémarrage du service $(SERVICE)...$(NC)"
	$(DOCKER_COMPOSE) restart $(SERVICE)
else
	@echo "$(GREEN)Redémarrage de tous les services...$(NC)"
	$(DOCKER_COMPOSE) restart
endif

# Afficher les logs
logs:
ifdef SERVICE
	@echo "$(GREEN)Affichage des logs du service $(SERVICE)...$(NC)"
	$(DOCKER_COMPOSE) logs -f $(SERVICE)
else
	@echo "$(GREEN)Affichage des logs de tous les services...$(NC)"
	$(DOCKER_COMPOSE) logs -f
endif

# Lister les conteneurs
ps:
	@echo "$(GREEN)Liste des conteneurs:$(NC)"
	$(DOCKER_COMPOSE) ps

# Recharger la configuration de Nginx
nginx-reload:
	@echo "$(GREEN)Rechargement de la configuration Nginx...$(NC)"
	$(DOCKER_COMPOSE) exec nginx nginx -s reload

# Reconstruire et redémarrer les conteneurs en arrière-plan
rebuild: setup-ssl setup-env
ifdef SERVICE
	@echo "$(YELLOW)Reconstruction et redémarrage du service $(SERVICE) en arrière-plan...$(NC)"
	$(DOCKER_COMPOSE) up -d --build $(SERVICE)
else
	@echo "$(YELLOW)Reconstruction et redémarrage de tous les services en arrière-plan...$(NC)"
	$(DOCKER_COMPOSE) up -d --build
endif

# Reconstruire rapidement et redémarrer les conteneurs en arrière-plan
rebuild-fast: setup-ssl setup-env
ifdef SERVICE
	@echo "$(YELLOW)Reconstruction rapide et redémarrage du service $(SERVICE) en arrière-plan...$(NC)"
	$(DOCKER_BUILDKIT) $(COMPOSE_DOCKER_CLI_BUILD) $(DOCKER_COMPOSE) up -d --build $(SERVICE)
else
	@echo "$(YELLOW)Reconstruction rapide et redémarrage de tous les services en arrière-plan...$(NC)"
	$(DOCKER_BUILDKIT) $(COMPOSE_DOCKER_CLI_BUILD) $(DOCKER_COMPOSE) up -d --build
endif

# Reconstruire et redémarrer les conteneurs en avant-plan
rebuild-fg: setup-ssl
ifdef SERVICE
	@echo "$(YELLOW)Reconstruction et redémarrage du service $(SERVICE) en avant-plan...$(NC)"
	$(DOCKER_COMPOSE) up --build $(SERVICE)
else
	@echo "$(YELLOW)Reconstruction et redémarrage de tous les services en avant-plan...$(NC)"
	$(DOCKER_COMPOSE) up --build
endif

# Trap pour gérer l'interruption (Ctrl+C)
trap:
	@echo "$(YELLOW)Interruption détectée. Arrêt gracieux des conteneurs...$(NC)"
	$(DOCKER_COMPOSE) stop

# Règle pour exécuter avec trap
up-fg-safe: trap
	#	$(call run_xhost)
	@echo "$(GREEN)Démarrage des services en avant-plan avec gestion sécurisée de l'interruption...$(NC)"
	$(DOCKER_COMPOSE) up || $(MAKE) stop

rebuild-fg-safe: trap
	#	$(call run_xhost)
	@echo "$(YELLOW)Reconstruction et démarrage des services en avant-plan avec gestion sécurisée de l'interruption...$(NC)"
	$(DOCKER_COMPOSE) up --build || $(MAKE) stop

.PHONY: help build build-fast up up-fg down stop restart logs ps clean nginx-reload rebuild rebuild-fast rebuild-fg up-fg-safe rebuild-fg-safe
