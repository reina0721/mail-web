FROM node:24-bookworm-slim AS frontend
WORKDIR /source/frontend
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate
COPY frontend/ ./
RUN pnpm install --frozen-lockfile && pnpm build

FROM rust:1-bookworm AS backend
WORKDIR /source
COPY Cargo.toml Cargo.lock ./
COPY backend/ ./backend/
RUN cargo build --locked --release -p mail-web

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 mail-web && useradd -u 10001 -g 10001 -M mail-web
WORKDIR /app
COPY --from=backend /source/target/release/mail-web /app/mail-web
COPY --from=frontend /source/frontend/apps/web/out /app/static
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/app/mail-web"]
