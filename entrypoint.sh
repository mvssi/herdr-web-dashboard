#!/bin/bash
set -e

echo "================================================="
echo "   Starting Herdr & Herdr Web Dashboard Server   "
echo "================================================="

# Assicura che la directory di configurazione di Herdr esista
mkdir -p /root/.config/herdr

# Rimuove eventuali socket residui da arresti anomali precedenti
if [ -e /root/.config/herdr/herdr.sock ]; then
    echo "[Init] Rimozione vecchio socket residuo..."
    rm -f /root/.config/herdr/herdr.sock
fi

# Avvia il server headless di Herdr in background
echo "[Init] Avvio demone Herdr server in background..."
herdr server &
HERDR_PID=$!

# Attende che il socket Unix sia pronto
echo "[Init] In attesa del socket Unix (/root/.config/herdr/herdr.sock)..."
SOCKET_READY=0
for i in {1..30}; do
    if [ -S /root/.config/herdr/herdr.sock ] || [ -e /root/.config/herdr/herdr.sock ]; then
        echo "[Init] Socket Herdr rilevato e pronto!"
        SOCKET_READY=1
        break
    fi
    sleep 0.5
done

if [ $SOCKET_READY -eq 0 ]; then
    echo "⚠️  [Attenzione] Socket non rilevato entro il timeout previsto. Avvio comunque la Web Dashboard..."
fi

# Gestione pulita dei segnali di stop (SIGTERM / SIGINT)
cleanup() {
    echo "[Shutdown] Arresto del server in corso..."
    herdr server stop 2>/dev/null || kill -TERM "$HERDR_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Avvia il server Python della Web Dashboard
echo "[Init] Avvio Web Dashboard su https://0.0.0.0:8088..."
exec python3 /app/server.py
