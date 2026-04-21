# 빌드 스테이지
FROM node:20-slim AS builder

WORKDIR /app

# 패키지 설치 (devDependencies 포함 - 빌드에 필요)
COPY package*.json ./
RUN NODE_ENV=development npm ci

# Next.js 빌드
COPY . .
RUN npm run build

# 런타임 스테이지
FROM node:20-slim

WORKDIR /app

# 필수 패키지만 설치
COPY package*.json ./
RUN npm ci --only=production

# 빌드된 파일 복사
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/next.config.ts ./next.config.ts

# 프로덕션 모드 강제 설정
ENV NODE_ENV=production

# 포트 노출
EXPOSE 3000

# 시작 커맨드 (Next.js + Socket.io 통합 서버)
CMD ["node", "server.js"]
