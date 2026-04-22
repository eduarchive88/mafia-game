import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { gameEngine } from '@/lib/gameEngine';
import { ChatMessage } from '@/lib/types';

// 전역 변수에 Socket.io 서버 저장
let io: SocketIOServer | null = null;

// 방별 채팅 메시지 저장소
const roomChats: Map<string, ChatMessage[]> = new Map();

/**
 * Socket.io 서버 초기화
 */
function initSocketServer(httpServer: any): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] 플레이어 연결: ${socket.id}`);

    // 플레이어 입장
    socket.on('join-room', (data: { sessionCode: string; nickname: string }, callback) => {
      try {
        const { roomCode, playerId } = gameEngine.joinRoom(data.sessionCode, data.nickname, socket);
        socket.join(roomCode);
        socket.data = { roomCode, playerId, nickname: data.nickname };

        console.log(`[Room: ${roomCode}] 플레이어 ${data.nickname} 입장 (${playerId})`);

        // 현재 방 상태 전송
        const room = gameEngine.getRoom(roomCode);
        const roomState = gameEngine.getRoomState(roomCode, playerId);

        callback({
          success: true,
          roomCode,
          playerId,
          roomState,
        });

        // 방의 다른 플레이어들에게 상태 업데이트
        io!.to(roomCode).emit('room-updated', roomState);
      } catch (error) {
        console.error('[Socket] 입장 오류:', error);
        callback({ success: false, error: '방 입장 실패' });
      }
    });

    // 게임 시작
    socket.on('start-game', (callback) => {
      try {
        const { roomCode, playerId } = socket.data;
        const success = gameEngine.startGame(roomCode, playerId);

        if (success) {
          console.log(`[Room: ${roomCode}] 게임 시작`);
          const roomState = gameEngine.getRoomState(roomCode, playerId);
          io!.to(roomCode).emit('game-started', roomState);

          // 각 플레이어에게 자신의 역할 전송
          gameEngine.getRoom(roomCode)?.players.forEach((player) => {
            const playerSocket = io!.sockets.sockets.get(player.socket.id);
            if (playerSocket) {
              playerSocket.emit('role-assigned', {
                role: player.role,
              });
            }
          });

          callback({ success: true });
        } else {
          callback({ success: false, error: '게임 시작 실패' });
        }
      } catch (error) {
        console.error('[Socket] 게임 시작 오류:', error);
        callback({ success: false, error: '게임 시작 오류' });
      }
    });

    // 상태 전환 (낮/밤)
    socket.on('transition-state', (data: { targetState: string }, callback) => {
      try {
        const { roomCode, playerId } = socket.data;
        const previousState = gameEngine.getRoom(roomCode)?.state;
        const success = gameEngine.transitionState(roomCode, data.targetState as any, playerId);

        if (success) {
          console.log(`[Room: ${roomCode}] 상태 전환: ${data.targetState}`);
          const roomState = gameEngine.getRoomState(roomCode);

          // 상태 업데이트 전송
          io!.to(roomCode).emit('state-changed', {
            state: data.targetState,
            roomState,
          });

          // 밤 → 낮 전환 시 밤 결과 공지
          if (data.targetState === 'day' && previousState === 'night') {
            const nightResult = gameEngine.getLastNightResult(roomCode);
            io!.to(roomCode).emit('night-result', nightResult);
          }

          callback({ success: true });
        } else {
          callback({ success: false, error: '상태 전환 실패' });
        }
      } catch (error) {
        console.error('[Socket] 상태 전환 오류:', error);
        callback({ success: false, error: '상태 전환 오류' });
      }
    });

    // 밤 투표 (마피아)
    socket.on('night-vote', (data: { targetId: string }, callback) => {
      try {
        const { roomCode, playerId } = socket.data;
        const success = gameEngine.submitNightVote(roomCode, playerId, data.targetId);

        if (success) {
          console.log(`[Room: ${roomCode}] 마피아 투표: ${playerId} -> ${data.targetId}`);
          callback({ success: true });
        } else {
          callback({ success: false, error: '투표 실패' });
        }
      } catch (error) {
        console.error('[Socket] 밤 투표 오류:', error);
        callback({ success: false, error: '투표 오류' });
      }
    });

    // 의사 치료
    socket.on('doctor-save', (data: { targetId: string }, callback) => {
      try {
        const { roomCode, playerId } = socket.data;
        const success = gameEngine.submitDoctorSave(roomCode, playerId, data.targetId);

        if (success) {
          console.log(`[Room: ${roomCode}] 의사 치료: ${playerId} -> ${data.targetId}`);
          callback({ success: true });
        } else {
          callback({ success: false, error: '치료 실패' });
        }
      } catch (error) {
        console.error('[Socket] 의사 치료 오류:', error);
        callback({ success: false, error: '치료 오류' });
      }
    });

    // 경찰 수사
    socket.on('police-check', (data: { targetId: string }, callback) => {
      try {
        const { roomCode, playerId } = socket.data;
        const success = gameEngine.submitPoliceCheck(roomCode, playerId, data.targetId);

        if (success) {
          console.log(`[Room: ${roomCode}] 경찰 수사: ${playerId} -> ${data.targetId}`);
          const result = gameEngine.getRoom(roomCode);
          callback({
            success: true,
            isMafia: result?.policeCheckResult,
          });
        } else {
          callback({ success: false, error: '수사 실패' });
        }
      } catch (error) {
        console.error('[Socket] 경찰 수사 오류:', error);
        callback({ success: false, error: '수사 오류' });
      }
    });

    // 낮 투표
    socket.on('day-vote', (data: { targetId: string | null }, callback) => {
      try {
        const { roomCode, playerId } = socket.data;
        const success = gameEngine.submitDayVote(roomCode, playerId, data.targetId);

        if (success) {
          console.log(`[Room: ${roomCode}] 낮 투표: ${playerId} -> ${data.targetId || '투표 안함'}`);
          callback({ success: true });
        } else {
          callback({ success: false, error: '투표 실패' });
        }
      } catch (error) {
        console.error('[Socket] 낮 투표 오류:', error);
        callback({ success: false, error: '투표 오류' });
      }
    });

    // 처형 실행
    socket.on('execute-vote', (callback) => {
      try {
        const { roomCode, playerId } = socket.data;
        const success = gameEngine.executeDayVote(roomCode, playerId);

        if (success) {
          console.log(`[Room: ${roomCode}] 투표 처리 및 처형`);
          const roomState = gameEngine.getRoomState(roomCode);
          const victoryTeam = gameEngine.checkVictoryCondition(roomCode);

          io!.to(roomCode).emit('execution-completed', {
            roomState,
            victoryTeam,
          });

          callback({ success: true });
        } else {
          callback({ success: false, error: '처형 실패' });
        }
      } catch (error) {
        console.error('[Socket] 처형 오류:', error);
        callback({ success: false, error: '처형 오류' });
      }
    });

    // 채팅 메시지
    socket.on('send-message', (data: { message: string }, callback) => {
      try {
        const { roomCode, playerId, nickname } = socket.data;
        const room = gameEngine.getRoom(roomCode);

        if (!room || data.message.trim() === '') {
          callback({ success: false });
          return;
        }

        const chatMessage: ChatMessage = {
          id: Math.random().toString(36).substr(2, 9),
          playerId,
          nickname,
          message: data.message,
          timestamp: Date.now(),
          isSystem: false,
        };

        if (!roomChats.has(roomCode)) {
          roomChats.set(roomCode, []);
        }
        roomChats.get(roomCode)?.push(chatMessage);

        io!.to(roomCode).emit('message-received', chatMessage);
        callback({ success: true });
      } catch (error) {
        console.error('[Socket] 채팅 오류:', error);
        callback({ success: false });
      }
    });

    // 방 상태 요청
    socket.on('get-room-state', (callback) => {
      try {
        const { roomCode, playerId } = socket.data;
        const roomState = gameEngine.getRoomState(roomCode, playerId);
        callback({ roomState });
      } catch (error) {
        console.error('[Socket] 방 상태 요청 오류:', error);
        callback({ error: '방 상태 조회 실패' });
      }
    });

    // 연결 해제
    socket.on('disconnect', () => {
      try {
        const { roomCode, playerId, nickname } = socket.data;
        const exists = gameEngine.leaveRoom(roomCode, playerId);

        console.log(`[Room: ${roomCode}] 플레이어 ${nickname} 퇴장`);

        if (exists) {
          const roomState = gameEngine.getRoomState(roomCode);
          io!.to(roomCode).emit('room-updated', roomState);
        }
      } catch (error) {
        console.error('[Socket] 연결 해제 오류:', error);
      }
    });
  });

  return io;
}

export { initSocketServer };
