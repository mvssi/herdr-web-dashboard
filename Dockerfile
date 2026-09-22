FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Installa dipendenze di sistema, incluso OpenSSH Server per l'accesso remoto
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    procps \
    openssl \
    openssh-server \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Configurazione di base per SSH
RUN mkdir -p /var/run/sshd /root/.ssh && \
    chmod 700 /root/.ssh && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Installa il binario ufficiale di Herdr in /usr/local/bin
ENV HERDR_INSTALL_DIR=/usr/local/bin
RUN curl -fsSL https://herdr.dev/install.sh | bash

# Directory dell'applicazione
WORKDIR /app

# Copia i file del repository
COPY . /app

# Assicura i permessi di esecuzione per entrypoint e server
RUN chmod +x /app/entrypoint.sh /app/server.py 2>/dev/null || true

# Espone la porta HTTPS (8088) e la porta SSH (22)
EXPOSE 8088 22

# Volumi persistenti per la configurazione di Herdr e i certificati SSL
VOLUME ["/root/.config/herdr", "/app/certs", "/root/.ssh"]

ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]
