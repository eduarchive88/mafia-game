# 🎮 마피아 게임 - 웹 기반 실시간 멀티플레이

실시간 웹 기반 마피아 게임입니다. Node.js 서버 메모리와 Socket.io를 활용하여 실시간 세션 공유 방식으로 작동합니다.

## 📚 기술 스택

- **Frontend**: Next.js 14+ (App Router) + React 19 + Tailwind CSS
- **Backend**: Node.js + Express + Socket.io
- **Styling**: Tailwind CSS (어두운 테마)
- **Deployment**: Docker + Coolify
- **Database**: 없음 (서버 메모리 기반 세션 관리)

## ✨ 주요 기능

### 1. 입장 및 방 관리
- 닉네임과 세션 코드로 입장
- 가장 먼저 입장한 사용자가 방장
- 방장 퇴장 시 자동 이전

### 2. 역할 배정 (자동)
- **4~5인**: 마피아(1), 경찰(1), 의사(1), 시민
- **6~8인**: 마피아(2), 경찰(1), 의사(1), 시민
- **9인 이상**: 마피아(3), 경찰(1), 의사(1), 시민

### 3. 밤 단계 (익명 투표)
- **마피아**: 시민 지목 (투표로 가장 많은 표 받은 자 처치)
- **의사**: 플레이어 치료
- **경찰**: 플레이어 마피아 여부 확인

### 4. 낮 단계 (전원 투표)
- 모든 플레이어가 누군가를 투표로 처형

### 5. 방장 권한
- 게임 시작
- 낮/밤 전환
- 투표 진행 제어

### 6. 승리 조건
- **마피아 승리**: 마피아 수 ≥ 시민 수
- **시민 승리**: 마피아 전멸

## 🚀 빠른 시작

### 개발 환경

```bash
# 의존성 설치
npm install

# 동시에 두 서버 실행 (권장)
npm run dev:all

# 또는 별도 터미널에서
# 터미널 1:
npm run dev

# 터미널 2:
npm run dev:server
```

- Next.js 앱: `http://localhost:3000`
- Socket.io 서버: `http://localhost:3001`

### 환경 설정

`.env.local` 파일:
```
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

## 🐳 Docker 배포

### 빌드 및 실행

```bash
# 이미지 빌드
docker build -t mafia-game .

# 컨테이너 실행
docker run -p 3000:3000 -p 3001:3001 mafia-game

# 또는 Compose 사용
docker-compose up -d
```

## 🚀 Coolify 배포

### 1. 서버 준비
- Coolify 설치 및 실행
- GitHub 저장소 연결

### 2. 배포 설정

| 항목 | 값 |
|------|-----|
| Build Command | `npm run build` |
| Start Command | `node server.js & npm start` |
| Ports | 3000 (Next.js), 3001 (Socket.io) |
| Docker | ✓ |

### 3. 환경 변수

```
NODE_ENV=production
NEXT_PUBLIC_SOCKET_URL=https://[your-domain]:3001
```

### 4. 배포

Coolify 대시보드에서 Deploy 클릭 후 자동 배포 진행

## 📁 프로젝트 구조

```
src/
├── app/
│   ├── page.tsx              # 메인 페이지
│   ├── layout.tsx            # 레이아웃
│   └── globals.css
├── components/
│   ├── RoomEntry.tsx         # 방 입장
│   ├── GamePlay.tsx          # 게임 화면
│   └── ChatBox.tsx           # 채팅
├── hooks/
│   └── useSocket.ts
└── lib/
    ├── types.ts              # 타입 정의
    └── gameEngine.ts         # 게임 로직

server.js                      # Socket.io 서버
Dockerfile                     # Docker 이미지
docker-compose.yml
```

## 🎮 게임 플레이

1. 닉네임 입력
2. 세션 코드 입력 (같은 코드 = 같은 방)
3. 4명 이상 입장 후 방장이 게임 시작
4. 역할 자동 배정
5. 낮 → 투표 → 밤 → 반복

## 🔧 npm 스크립트

```bash
npm run dev           # Next.js 개발 서버
npm run dev:server    # Socket.io 서버
npm run dev:all       # 동시 실행 (권장)
npm run build         # 프로덕션 빌드
npm run start         # Next.js 프로덕션 실행
npm run start:server  # Socket.io 프로덕션 실행
npm run lint          # ESLint 체크
```

## 🔍 헬스 체크

```bash
curl http://localhost:3001/health
# {"status":"ok","rooms":0}
```

## 🐛 트러블슈팅

| 문제 | 해결방법 |
|------|---------|
| Socket 연결 안 됨 | 서버 3001 포트 확인, `.env.local` 확인 |
| 게임 시작 안 됨 | 4명 이상 입장 확인 |
| 역할 보이지 않음 | 브라우저 새로고침, 게임 재시작 |

## 📝 라이선스

MIT License

## 🎯 향후 계획

- [ ] 고급 채팅 기능
- [ ] 게임 통계 저장
- [ ] 플레이어 랭킹
- [ ] 모바일 앱
- [ ] AI 플레이어

---

**버전**: 1.0.0 | **마지막 업데이트**: 2026년 4월
