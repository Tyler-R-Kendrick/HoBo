# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm
USER root
# Official Actions runner runtime dependencies; no runtime sudo/install step.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      printf 'Acquire::https::CaInfo "/run/secrets/proxy_ca";\n' > /etc/apt/apt.conf.d/99-build-proxy-ca; \
    fi \
    && apt-get update && apt-get install -y --no-install-recommends \
    libicu72 liblttng-ust1 libkrb5-3 libssl3 zlib1g util-linux \
    && rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99-build-proxy-ca
USER node
RUN curl -fsSL https://mise.run | sh
ENV PATH="/home/node/.local/bin:${PATH}"