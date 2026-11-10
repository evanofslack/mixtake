# syntax=docker/dockerfile:1
# mixtake: the Go server with the web static export embedded. The analyzer is a separate image
# (analyzer/Dockerfile). The build stages run on the build platform and cross-compile, so a
# multi-arch build only emulates the final COPY.

FROM --platform=$BUILDPLATFORM node:24-alpine AS web
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build


FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine AS go
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd cmd
COPY internal internal
COPY web/*.go web/
COPY --from=web /src/web/out web/out
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -tags embedweb -trimpath -ldflags "-s -w" -o /out/mixtake ./cmd/mixtake
# an empty /data owned by nonroot, so a new named volume starts out writable
RUN mkdir /out/data


FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=go /out/mixtake /usr/local/bin/mixtake
COPY --from=go --chown=65532:65532 /out/data /data
ENV DB_PATH=/data/mixtake.db
VOLUME /data
# 8080 is the app, 9090 the prometheus metrics
EXPOSE 8080 9090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/mixtake", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/mixtake"]
