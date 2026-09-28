.PHONY: help install install-dev dev prod prod-down prod-logs test test-backend test-backend-pg test-frontend security security-backend security-frontend clean

help:
	@echo "Radio Calico"
	@echo ""
	@echo "  make install          Install Python runtime dependencies (SQLite dev mode)"
	@echo "  make install-dev      Install Python + Node dev dependencies (pytest, vitest, jsdom)"
	@echo ""
	@echo "  make dev              Run the Flask dev server against SQLite (http://localhost:5000)"
	@echo ""
	@echo "  make prod             Build and run the production stack: nginx + gunicorn + postgres"
	@echo "                        (http://localhost:8080)"
	@echo "  make prod-logs        Tail logs from the running production stack"
	@echo "  make prod-down        Stop the production stack"
	@echo ""
	@echo "  make test             Run backend (SQLite) and frontend test suites"
	@echo "  make test-backend     Run pytest against SQLite only"
	@echo "  make test-backend-pg  Start postgres via docker compose, run tests/test_app_postgres.py against it"
	@echo "  make test-frontend    Run the Vitest suite"
	@echo ""
	@echo "  make security          Run all dependency vulnerability scans (Python + npm)"
	@echo "  make security-backend  Audit Python dependencies for known vulnerabilities (pip-audit)"
	@echo "  make security-frontend Audit npm dependencies for known vulnerabilities (npm audit)"
	@echo ""
	@echo "  make clean            Remove Python/pytest caches"

install:
	pip install -r requirements.txt

install-dev:
	pip install -r requirements-dev.txt
	npm install

dev:
	python app.py

prod:
	docker compose up --build

prod-logs:
	docker compose logs -f

prod-down:
	docker compose down

test: test-backend test-frontend

test-backend:
	python -m pytest tests/test_app.py -v

test-backend-pg:
	docker compose up -d postgres
	TEST_DATABASE_URL=postgresql://$${POSTGRES_USER:-radiocalico}:$${POSTGRES_PASSWORD:-radiocalico}@localhost:5432/$${POSTGRES_DB:-radiocalico} python -m pytest tests/test_app_postgres.py -v

test-frontend:
	npm test

security: security-backend security-frontend

security-backend:
	pip-audit -r requirements.txt

security-frontend:
	npm audit

clean:
	rm -rf __pycache__ tests/__pycache__ .pytest_cache
