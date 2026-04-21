# 🎮 마피아 게임 - 빠른 시작 가이드

## ⚡ 5분 안에 실행하기

### Windows
```bash
# 1. 프로젝트 디렉토리 진입
cd mafia

# 2. 개발 서버 시작 (권장)
npm run dev:all

# 또는 배치 파일 실행
dev.bat
```

### Mac/Linux
```bash
# 1. 프로젝트 디렉토리 진입
cd mafia

# 2. 개발 서버 시작 (권장)
npm run dev:all

# 또는 쉘 스크립트 실행
chmod +x dev.sh
./dev.sh
```

### 브라우저에서 접속
```
http://localhost:3000
```

## 📱 게임 플레이

1. **닉네임 입력**: 최대 20자
2. **세션 코드 입력**: 예) `GAME123`
   - 같은 코드를 입력하면 같은 방에 들어감
   - 새로운 코드면 자동으로 새 방 생성
3. **4명 이상 입장**: 방장이 게임 시작 가능
4. **역할 확인**: 자신의 역할을 화면에서 확인
5. **게임 진행**: 낮 → 투표 → 밤 → 반복

## 🎯 각 역할의 역할

### 마피아 (적팀)
- 밤에 시민 한 명을 지목 (투표로 결정)
- 목표: 마피아 수 ≥ 시민 수

### 의사 (아군)
- 밤에 플레이어 한 명을 치료 (마피아 타겟이면 생존)
- 목표: 모든 마피아 제거

### 경찰 (아군)
- 밤에 플레이어 한 명을 조회 (마피아 여부 확인)
- 목표: 모든 마피아 제거

### 시민 (아군)
- 낮에 누군가를 투표로 처형
- 목표: 모든 마피아 제거

## 🔧 개발 명령어

```bash
# 다양한 실행 방법
npm run dev        # Next.js만 실행 (localhost:3000)
npm run dev:server # Socket.io만 실행 (localhost:3001)
npm run dev:all    # 둘 다 실행 (권장) ⭐

# 빌드 및 배포
npm run build      # 프로덕션 빌드 생성
npm run start      # 빌드된 Next.js 실행
npm start:server   # 프로덕션 Socket.io 실행

# 검사
npm run lint       # ESLint 코드 검사
```

## 🌐 배포 (3가지 방법)

### 1️⃣ Docker (로컬)

```bash
# 빌드
docker build -t mafia-game .

# 실행
docker run -p 3000:3000 -p 3001:3001 mafia-game

# 또는 Docker Compose
docker-compose up -d
```

### 2️⃣ Coolify (클라우드)

**Coolify 대시보드에서:**

1. New Project → Git Repository
2. 이 저장소 선택
3. Build Command: `npm run build`
4. Start Command: `node server.js & npm start`
5. Ports: 3000, 3001
6. Environment Variables:
   ```
   NODE_ENV=production
   NEXT_PUBLIC_SOCKET_URL=https://[your-domain]:3001
   ```
7. Deploy 클릭

### 3️⃣ 수동 배포 (VPS)

```bash
# 1. 서버에 ssh 접속
ssh user@server-ip

# 2. 저장소 클론
git clone https://github.com/[your-repo]/mafia.git
cd mafia

# 3. 설치 및 빌드
npm install
npm run build

# 4. 백그라운드 실행 (PM2 권장)
npm install -g pm2
pm2 start "node server.js" --name "mafia-socket"
pm2 start "npm start" --name "mafia-app"

# 5. Nginx 리버스 프록시 설정
# /etc/nginx/sites-available/default 편집
```

## 🐛 문제 해결

### Q: Socket 연결 안 됨
**A:** 
- 서버가 3001 포트에서 실행 중인가?
- `.env.local` 파일에서 `NEXT_PUBLIC_SOCKET_URL` 확인
- 브라우저 콘솔의 오류 메시지 확인

### Q: "게임 시작" 버튼이 비활성화됨
**A:**
- 방에 4명 이상 들어왔는가?
- 방장으로 입장했는가?
- 모든 플레이어가 입장 완료되었는가?

### Q: 역할이 다 같음
**A:**
- 브라우저 새로고침 시도
- 게임 재시작

### Q: Deploy 중 오류
**A:**
- 빌드 로그 확인
- package.json의 dependencies 버전 확인
- 포트 충돌 확인 (3000, 3001)

## 📊 포트 정보

| 포트 | 서비스 | URL |
|------|--------|-----|
| 3000 | Next.js 앱 | http://localhost:3000 |
| 3001 | Socket.io 서버 | http://localhost:3001 |

## 📂 주요 파일

| 파일 | 설명 |
|------|------|
| `server.js` | Socket.io 게임 서버 (게임 로직) |
| `src/app/page.tsx` | 메인 화면 |
| `src/components/RoomEntry.tsx` | 입장 화면 |
| `src/components/GamePlay.tsx` | 게임 화면 |
| `Dockerfile` | Docker 이미지 |
| `.env.local` | 환경 변수 |

## 💡 Tip

1. **다중 브라우저 테스트**: 같은 세션 코드로 여러 브라우저/탭에서 접속하여 테스트
2. **개발 모드**: `npm run dev:all` 사용 - 파일 변경 시 자동 리로드
3. **로그 확인**: 터미널에 실시간 로그 출력 ([Socket], [Room] 태그)
4. **헬스 체크**: `curl http://localhost:3001/health` - 서버 상태 확인

## 🎓 다음 단계

1. 게임 로직 수정 (시간 제한, 역할 추가 등)
2. 데이터베이스 연동 (게임 통계 저장)
3. 플레이어 인증 시스템 추가
4. 모바일 반응형 디자인 개선
5. 실제 배포 및 운영

## 📞 지원

문제가 있으면:
- GitHub Issues 열기
- 로그 검토
- 의존성 재설치 (`npm install`)

---

**행운을 빕니다! 마피아 게임을 즐기세요! 🎮**
