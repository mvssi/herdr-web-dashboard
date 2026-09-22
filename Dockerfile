FROM python:3.11-slim-bookworm

# Evita prompt interattivi durante l'installazione
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Installa le dipendenze di sistema necessarie per Herdr, PTY e OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    procps \
    openssl \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Installa il binario ufficiale di Herdr in /usr/local/bin
ENV HERDR_INSTALL_DIR=/usr/local/bin
RUN curl -fsSL https://herdr.dev/install.sh | bash

# Directory dell'applicazione
WORKDIR /app

# Copia i file del repository
COPY . /app

# Assicura i permessi di esecuzione per entrypoint e server
RUN chmod +x /app/entrypoint.sh /app/server.py 2>/dev/null || true

# Espone la porta HTTPS della Web Dashboard
EXPOSE 8088

# Volumi persistenti per la configurazione di Herdr e i certificati SSL
VOLUME ["/root/.config/herdr", "/app/certs"]

ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]
