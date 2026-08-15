FROM alpine:3.22

ARG ENGRAM_VERSION=1.20.0
ARG TARGETARCH

RUN apk add --no-cache ca-certificates curl tar \
    && case "${TARGETARCH}" in amd64|arm64) ;; *) echo "Unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; esac \
    && curl -fsSL \
      "https://github.com/Gentleman-Programming/engram/releases/download/v${ENGRAM_VERSION}/engram_${ENGRAM_VERSION}_linux_${TARGETARCH}.tar.gz" \
      -o /tmp/engram.tar.gz \
    && tar -xzf /tmp/engram.tar.gz -C /usr/local/bin engram \
    && chmod +x /usr/local/bin/engram \
    && rm -f /tmp/engram.tar.gz \
    && engram version

ENV ENGRAM_DATA_DIR=/data \
    ENGRAM_PORT=7437

VOLUME ["/data"]

ENTRYPOINT ["engram"]
CMD ["serve"]
