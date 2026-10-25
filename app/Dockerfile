ARG NODE_IMAGE=node@sha256:925de64a85319052d6971ae81ef2417da956e8a3a2c4a0fac732327970f017f5
FROM ${NODE_IMAGE}

# Flags are build args (publish hygiene: override per-deployment).
ARG LOCAL_FLAG=FLAG{brotligate_local_8c7e4b24a3d91f60}
ARG PROOF_FLAG=FLAG{brotligate_proof_5e2a9d8c71b34f07}

LABEL org.opencontainers.image.title="PacketLedger Manifest Gateway (node2shell-lab)"
LABEL org.opencontainers.image.version="1.4.2"

WORKDIR /app
COPY src/package*.json ./
RUN npm ci --omit=dev
COPY src/server.js ./

RUN mkdir -p /var/lib/ledger/receipts /run/ledger \
 && chown -R node:node /var/lib/ledger /run/ledger /app

# local flag: node-readable file in the receipts store neighborhood
# (root writes it; mode 640 owner root group node)
RUN printf '%s\n' "$LOCAL_FLAG" > /var/lib/ledger/.integrity \
 && chown root:node /var/lib/ledger/.integrity \
 && chmod 640 /var/lib/ledger/.integrity

# proof flag: root-only file, fed to the gateway on fd 3 by entrypoint
RUN printf '%s\n' "$PROOF_FLAG" > /root/.sealed \
 && chown root:root /root/.sealed \
 && chmod 600 /root/.sealed

COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
