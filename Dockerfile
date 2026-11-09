# syntax=docker/dockerfile:1
# Uma imagem só: o servidor colyseus serve o build do cliente na mesma porta
# (`servePage` em packages/server/src/main.ts), então página e WebSocket ficam
# na mesma origem e o cliente acha o servidor sem configuração.

# --- build do cliente -------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app

# os manifestos primeiro, para o `npm ci` ficar em cache enquanto o código muda.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY config config
COPY packages packages

# fixadas no bundle pelo vite. Vazias = padrão do código: servidor de jogo na
# origem da página e, na feat/fair-credit, o client id público da Feira
# (VITE_GOOGLE_CLIENT_ID vazio de propósito desliga o login).
ARG VITE_GAME_SERVER_URL=
ARG VITE_GAME_SERVER_PORT=
ARG VITE_VOICE_SERVER_URL=
# sem default: só existe no ambiente do RUN quando passada, e passada vazia
# desliga o login.
ARG VITE_GOOGLE_CLIENT_ID
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY tsconfig.base.json ./
COPY config config
COPY packages/core packages/core
COPY packages/server packages/server
COPY --from=build /app/packages/client/dist packages/client/dist

# as FAIR_* (crédito da Feira), PORT, GAMEPLAY_CONFIG e LIVEKIT_* chegam em
# tempo de execução: `docker run --env-file .env` ou `env_file:` no compose.
ENV PORT=2567
EXPOSE 2567
USER node
WORKDIR /app/packages/server
# node direto, sem npm na frente: o SIGTERM do `docker stop` chega ao processo.
CMD ["node", "--experimental-strip-types", "src/main.ts"]
