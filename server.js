/**
 * Socket.io 서버 (독립 실행)
 * 
 * 이 파일은 Node.js로 직접 실행되며 Next.js와 별도의 포트에서 작동합니다.
 * 프로덕션 환경에서도 호스팅되어야 합니다.
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const app = express();
const server = http.createServer(app);
const io = new socketIO.Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(express.json());

// ============= 게임 엔진 =============

class GameEngine {
  constructor() {
    this.rooms = new Map();
  }

  joinRoom(sessionCode, nickname, socket) {
    const roomCode = sessionCode.toUpperCase();
    let room = this.rooms.get(roomCode);
    const playerId = uuidv4();

    if (!room) {
      room = {
        sessionCode: roomCode,
        hostId: playerId,
        players: new Map(),
        state: 'waiting',
        round: 0,
        victoryTeam: null,
        nightVotes: new Map(),
        dayVotes: new Map(),
        voteInProgress: false,
        votingStartTime: 0,
        selectedTarget: null,
        executedPlayer: null,
        lastKilledByMafia: null,
        savedByDoctor: null,
        policeCheckResult: null,
        policeCheckTarget: null,
        lastDayVoteCounts: [],
        lastDayVoteEntries: [],
        lastFinalVoteEntries: [],
        finalVoteTarget: null,
        finalVotes: new Map(),
        lastExecutedRole: null,
        lastExecutedNickname: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.rooms.set(roomCode, room);
    }

    // -------- 재접속 시도: 같은 닉네임의 disconnected 플레이어 여부 확인 --------
    if (room.state !== 'waiting') {
      let reconnectPlayer = null;
      room.players.forEach((p) => {
        if (p.nickname === nickname && p.disconnected) {
          reconnectPlayer = p;
        }
      });

      if (reconnectPlayer) {
        // 소켓 업데이트 후 재접속 성공
        reconnectPlayer.socket = socket;
        reconnectPlayer.disconnected = false;
        reconnectPlayer.disconnectedAt = null;
        room.updatedAt = Date.now();
        return { roomCode, playerId: reconnectPlayer.id, reconnected: true, player: reconnectPlayer, room };
      }

      // 파이 접속이 아닌 신규 입장 차단
      return { error: '이미 게임이 시작된 방입니다' };
    }

    // 최대 인원 제한
    if (room.players.size >= 16) {
      return { error: '방이 가득 찼습니다 (최대 16명)' };
    }

    const player = {
      id: playerId,
      nickname,
      role: 'citizen',
      alive: true,
      socket,
    };

    room.players.set(playerId, player);
    room.updatedAt = Date.now();

    return { roomCode, playerId };
  }

  leaveRoom(roomCode, playerId, gameInProgress) {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    if (gameInProgress && room.state !== 'waiting' && room.state !== 'ended') {
      // 게임 중 단좌리 제거 대신 disconnected 마킹
      const player = room.players.get(playerId);
      if (player) {
        player.disconnected = true;
        player.disconnectedAt = Date.now();
        room.updatedAt = Date.now();
      }
    } else {
      room.players.delete(playerId);
      room.updatedAt = Date.now();
    }

    if (room.players.size === 0) {
      this.rooms.delete(roomCode);
      return false;
    }

    // 호스트가 나갔으면 연결된 플레이어에게 호스트 이양
    if (room.hostId === playerId) {
      const next = Array.from(room.players.values()).find(p => !p.disconnected);
      if (next) room.hostId = next.id;
    }

    return true;
  }

  startGame(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return false;

    const playerCount = room.players.size;
    if (playerCount < 4) return false;

    const roles = this.assignRoles(playerCount);
    const playersArray = Array.from(room.players.values());

    for (let i = playersArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playersArray[i], playersArray[j]] = [playersArray[j], playersArray[i]];
    }

    playersArray.forEach((player, index) => {
      player.role = roles[index];
      player.alive = true;
    });

    room.state = 'day';
    room.round = 1;
    room.voteInProgress = false;
    room.victoryTeam = null;
    room.updatedAt = Date.now();

    return true;
  }

  assignRoles(playerCount) {
    // 인원별 균형 잡힌 역할 배정
    // 마피아:시민 비율 약 1:3 유지, 특수직 보조 역할 인원에 따라 추가
    let mafiaCount, policeCount, doctorCount;

    if (playerCount <= 5) {
      // 4~5명: 마피아1 경찰1 의사1
      mafiaCount = 1; policeCount = 1; doctorCount = 1;
    } else if (playerCount <= 8) {
      // 6~8명: 마피아2 경찰1 의사1
      mafiaCount = 2; policeCount = 1; doctorCount = 1;
    } else if (playerCount <= 11) {
      // 9~11명: 마피아3 경찰1 의사1
      mafiaCount = 3; policeCount = 1; doctorCount = 1;
    } else if (playerCount <= 14) {
      // 12~14명: 마피아4 경찰2 의사1
      mafiaCount = 4; policeCount = 2; doctorCount = 1;
    } else {
      // 15~16명: 마피아5 경찰2 의사2
      mafiaCount = 5; policeCount = 2; doctorCount = 2;
    }

    const roles = [];
    for (let i = 0; i < mafiaCount; i++) roles.push('mafia');
    for (let i = 0; i < policeCount; i++) roles.push('police');
    for (let i = 0; i < doctorCount; i++) roles.push('doctor');
    while (roles.length < playerCount) roles.push('citizen');

    return roles;
  }

  transitionState(roomCode, targetState, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return false;

    const previousState = room.state;

    if (targetState === 'day' && previousState === 'night') {
      this.processNightVotes(roomCode);
      room.lastDayVoteCounts = [];
      room.lastDayVoteEntries = [];
      room.lastFinalVoteEntries = [];
      room.finalVoteTarget = null;
      room.lastExecutedRole = null;
      room.lastExecutedNickname = null;
    }

    if (targetState === 'night') {
      room.savedByDoctor = null;
      room.lastKilledByMafia = null;
      room.policeCheckResult = null;
      room.policeCheckTarget = null;
    }

    if (targetState === 'execution') {
      room.finalVotes.clear();
      room.lastFinalVoteEntries = [];
    }

    room.state = targetState;
    room.voteInProgress = false;
    room.nightVotes.clear();
    room.dayVotes.clear();
    room.selectedTarget = null;
    room.votingStartTime = Date.now();
    room.updatedAt = Date.now();

    return true;
  }

  submitNightVote(roomCode, playerId, targetId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'night') return false;

    const player = room.players.get(playerId);
    if (!player || player.role !== 'mafia' || !player.alive) return false;

    room.nightVotes.set(playerId, targetId);
    room.updatedAt = Date.now();
    return true;
  }

  submitDoctorSave(roomCode, playerId, targetId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'night') return false;

    const player = room.players.get(playerId);
    if (!player || player.role !== 'doctor' || !player.alive) return false;

    room.savedByDoctor = targetId;
    room.updatedAt = Date.now();
    return true;
  }

  submitPoliceCheck(roomCode, playerId, targetId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'night') return false;

    const player = room.players.get(playerId);
    if (!player || player.role !== 'police' || !player.alive) return false;

    const targetPlayer = room.players.get(targetId);
    room.policeCheckTarget = targetId;
    room.policeCheckResult = targetPlayer?.role === 'mafia' || false;
    room.updatedAt = Date.now();
    return true;
  }

  processNightVotes(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const voteResults = new Map();
    room.nightVotes.forEach((targetId, voterId) => {
      const voter = room.players.get(voterId);
      if (voter && voter.alive) {
        voteResults.set(targetId, (voteResults.get(targetId) || 0) + 1);
      }
    });

    let maxVotes = 0;
    let targetOfMafia = '';
    voteResults.forEach((votes, targetId) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        targetOfMafia = targetId;
      }
    });

    room.lastKilledByMafia = targetOfMafia;

    if (targetOfMafia !== room.savedByDoctor) {
      const victim = room.players.get(targetOfMafia);
      if (victim) {
        victim.alive = false;
      }
    }

    room.nightVotes.clear();
  }

  getLastNightResult(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { type: 'nobody', victimName: null, doctorSucceeded: false };
    }

    if (!room.lastKilledByMafia) {
      return { type: 'nobody', victimName: null, doctorSucceeded: false };
    }

    const victim = room.players.get(room.lastKilledByMafia);
    const victimName = victim?.nickname || '알 수 없음';

    if (room.savedByDoctor && room.savedByDoctor === room.lastKilledByMafia) {
      return { type: 'saved', victimName: null, doctorSucceeded: true };
    }

    return { type: 'killed', victimName, doctorSucceeded: false };
  }

  submitDayVote(roomCode, playerId, targetId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'vote') return false;

    const player = room.players.get(playerId);
    if (!player || !player.alive) return false;

    room.dayVotes.set(playerId, targetId);
    room.updatedAt = Date.now();
    return true;
  }

  closeDayVote(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId || room.state !== 'vote') {
      return { success: false, voteCounts: [], voteEntries: [], finalVoteTarget: null, finalVoteTargetNickname: null };
    }

    const voteEntries = [];
    room.dayVotes.forEach((targetId, voterId) => {
      if (targetId !== null) {
        const voter = room.players.get(voterId);
        const target = room.players.get(targetId);
        if (voter && target) {
          voteEntries.push({
            voterId,
            voterNickname: voter.nickname,
            targetId,
            targetNickname: target.nickname,
          });
        }
      }
    });
    room.lastDayVoteEntries = voteEntries;

    const voteResults = new Map();
    room.dayVotes.forEach((targetId) => {
      if (targetId !== null) {
        voteResults.set(targetId, (voteResults.get(targetId) || 0) + 1);
      }
    });

    const voteCounts = Array.from(voteResults.entries())
      .map(([pid, votes]) => ({
        playerId: pid,
        nickname: room.players.get(pid)?.nickname || '알 수 없음',
        votes,
      }))
      .sort((a, b) => b.votes - a.votes);
    room.lastDayVoteCounts = voteCounts;

    let finalVoteTarget = null;
    if (voteCounts.length > 0) {
      const topVotes = voteCounts[0].votes;
      const topCandidates = voteCounts.filter((entry) => entry.votes === topVotes);
      if (topCandidates.length === 1) {
        finalVoteTarget = topCandidates[0].playerId;
      }
    }
    room.finalVoteTarget = finalVoteTarget;

    room.dayVotes.clear();
    room.updatedAt = Date.now();

    return {
      success: true,
      voteCounts,
      voteEntries,
      finalVoteTarget,
      finalVoteTargetNickname: finalVoteTarget ? room.players.get(finalVoteTarget)?.nickname || null : null,
    };
  }

  submitFinalVote(roomCode, playerId, choice) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'execution') return false;

    const player = room.players.get(playerId);
    if (!player || !player.alive) return false;

    room.finalVotes.set(playerId, choice);
    room.updatedAt = Date.now();
    return true;
  }

  closeFinalVote(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId) {
      return { success: false, executed: false, finalVoteEntries: [], executedNickname: null, executedRole: null };
    }

    const targetId = room.finalVoteTarget;
    const finalVoteEntries = [];
    room.finalVotes.forEach((choice, voterId) => {
      const voter = room.players.get(voterId);
      if (voter) {
        finalVoteEntries.push({ voterId, voterNickname: voter.nickname, choice });
      }
    });
    room.lastFinalVoteEntries = finalVoteEntries;

    let executed = false;
    if (targetId) {
      const executeCount = finalVoteEntries.filter((entry) => entry.choice === 'execute').length;
      const spareCount = finalVoteEntries.filter((entry) => entry.choice === 'spare').length;
      if (executeCount > spareCount) {
        const target = room.players.get(targetId);
        if (target) {
          target.alive = false;
          room.executedPlayer = targetId;
          room.lastExecutedRole = target.role;
          room.lastExecutedNickname = target.nickname;
          executed = true;
        }
      }
    }

    if (!executed) {
      room.lastExecutedRole = null;
      room.lastExecutedNickname = null;
    }

    room.finalVotes.clear();
    room.updatedAt = Date.now();

    return {
      success: true,
      executed,
      finalVoteEntries,
      executedNickname: room.lastExecutedNickname,
      executedRole: room.lastExecutedRole,
    };
  }

  executeDayVote(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return false;

    const voteResults = new Map();
    room.dayVotes.forEach((targetId, voterId) => {
      if (targetId !== null) {
        voteResults.set(targetId, (voteResults.get(targetId) || 0) + 1);
      }
    });

    let maxVotes = 0;
    let executedPlayerId = '';
    voteResults.forEach((votes, targetId) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        executedPlayerId = targetId;
      }
    });

    if (executedPlayerId) {
      const executed = room.players.get(executedPlayerId);
      if (executed) {
        executed.alive = false;
        room.executedPlayer = executedPlayerId;
      }
    }

    room.dayVotes.clear();
    room.updatedAt = Date.now();

    return true;
  }

  checkVictoryCondition(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    let mafiaCount = 0;
    let citizenCount = 0;

    room.players.forEach((player) => {
      if (!player.alive) return;
      if (player.role === 'mafia') {
        mafiaCount++;
      } else {
        citizenCount++;
      }
    });

    if (mafiaCount >= citizenCount) {
      room.victoryTeam = 'mafia';
      room.state = 'ended';
      return 'mafia';
    }

    if (mafiaCount === 0) {
      room.victoryTeam = 'citizen';
      room.state = 'ended';
      return 'citizen';
    }

    return null;
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  getPlayer(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    return room?.players.get(playerId);
  }

  getRoomState(roomCode, viewerId) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const viewers = {};
    const currentDayVotes = [];
    room.players.forEach((player, playerId) => {
      viewers[playerId] = {
        id: playerId,
        nickname: player.nickname,
        alive: player.alive,
        role: viewerId === playerId ? player.role : '?',
        disconnected: player.disconnected || false,
      };
    });

    room.dayVotes.forEach((targetId, voterId) => {
      if (targetId === null) return;
      const voter = room.players.get(voterId);
      const target = room.players.get(targetId);
      if (voter && target) {
        currentDayVotes.push({
          voterId,
          voterNickname: voter.nickname,
          targetId,
          targetNickname: target.nickname,
        });
      }
    });

    return {
      sessionCode: room.sessionCode,
      hostId: room.hostId,
      state: room.state,
      round: room.round,
      victoryTeam: room.victoryTeam,
      players: viewers,
      voteInProgress: room.voteInProgress,
      currentDayVotes,
      executedPlayer: room.executedPlayer,
      lastKilledByMafia: room.lastKilledByMafia,
      policeCheckResult: viewerId && room.players.get(viewerId)?.role === 'police' ? room.policeCheckResult : null,
      policeCheckTarget: viewerId && room.players.get(viewerId)?.role === 'police' ? room.policeCheckTarget : null,
    };
  }

  getLastDayExecutionResult(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    return {
      voteCounts: room.lastDayVoteCounts,
      voteEntries: room.lastDayVoteEntries,
      finalVoteEntries: room.lastFinalVoteEntries,
      finalVoteTarget: room.finalVoteTarget,
      finalVoteTargetNickname: room.finalVoteTarget ? room.players.get(room.finalVoteTarget)?.nickname || null : null,
      executedNickname: room.lastExecutedNickname,
      executedRole: room.lastExecutedRole,
    };
  }
}

const gameEngine = new GameEngine();

// ============= Socket.io 이벤트 핸들러 =============

io.on('connection', (socket) => {
  console.log(`[Socket] 플레이어 연결: ${socket.id}`);

  // 플레이어 입장
  socket.on('join-room', (data, callback) => {
    try {
      const result = gameEngine.joinRoom(data.sessionCode, data.nickname, socket);

      if (result.error) {
        return callback({ success: false, error: result.error });
      }

      const { roomCode, playerId, reconnected, player, room } = result;
      socket.join(roomCode);
      socket.data = { roomCode, playerId, nickname: data.nickname };

      if (reconnected) {
        console.log(`[Room: ${roomCode}] 🔄 플레이어 ${data.nickname} 재접속 (${playerId})`);

        // 팀원 목록 재계산
        const teammates = [];
        room.players.forEach((other) => {
          if (other.id !== playerId && other.role === player.role) {
            teammates.push({ id: other.id, nickname: other.nickname });
          }
        });

        const roomState = gameEngine.getRoomState(roomCode, playerId);
        callback({ success: true, roomCode, playerId, roomState, reconnected: true });

        // 본인에게 역할 재전송
        socket.emit('role-assigned', { role: player.role, teammates });

        // 방 전체에 재접속 알림
        io.to(roomCode).emit('player-reconnected', {
          nickname: data.nickname,
          roomState: gameEngine.getRoomState(roomCode),
        });
      } else {
        console.log(`[Room: ${roomCode}] 플레이어 ${data.nickname} 입장 (${playerId})`);
        const roomState = gameEngine.getRoomState(roomCode, playerId);
        callback({ success: true, roomCode, playerId, roomState });
        io.to(roomCode).emit('room-updated', roomState);
      }
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
        io.to(roomCode).emit('game-started', roomState);

        const room = gameEngine.getRoom(roomCode);
        room?.players.forEach((player) => {
          const playerSocket = io.sockets.sockets.get(player.socket.id);
          if (playerSocket) {
            // 같은 역할의 팀원 목록 (자신 제외)
            const teammates = [];
            room.players.forEach((other) => {
              if (other.id !== player.id && other.role === player.role) {
                teammates.push({ id: other.id, nickname: other.nickname });
              }
            });
            playerSocket.emit('role-assigned', {
              role: player.role,
              teammates,
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
  socket.on('transition-state', (data, callback) => {
    try {
      const { roomCode, playerId } = socket.data;
      const previousState = gameEngine.getRoom(roomCode)?.state;
      const success = gameEngine.transitionState(roomCode, data.targetState, playerId);

      if (success) {
        console.log(`[Room: ${roomCode}] 상태 전환: ${data.targetState}`);
        const roomState = gameEngine.getRoomState(roomCode);

        io.to(roomCode).emit('state-changed', {
          state: data.targetState,
          roomState,
        });

        if (data.targetState === 'day' && previousState === 'night') {
          io.to(roomCode).emit('night-result', gameEngine.getLastNightResult(roomCode));
        }

        if (data.targetState === 'night') {
          const executionResult = gameEngine.getLastDayExecutionResult(roomCode);
          if (executionResult?.voteEntries?.length || executionResult?.finalVoteEntries?.length || executionResult?.executedNickname) {
            io.to(roomCode).emit('execution-result-night', executionResult);
          }
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
  socket.on('night-vote', (data, callback) => {
    try {
      const { roomCode, playerId } = socket.data;
      const success = gameEngine.submitNightVote(roomCode, playerId, data.targetId);

      if (success) {
        console.log(`[Room: ${roomCode}] 마피아 투표: ${playerId} -> ${data.targetId}`);

        // 살아있는 마피아 전원이 투표했는지 확인
        const room = gameEngine.getRoom(roomCode);
        const aliveMafias = Array.from(room.players.values()).filter(p => p.alive && p.role === 'mafia');
        const allMafiasVoted = aliveMafias.length > 0 && aliveMafias.every(m => room.nightVotes.has(m.id));

        if (allMafiasVoted) {
          // 현재 최다 득표 대상 집계
          const voteCount = new Map();
          room.nightVotes.forEach((targetId) => {
            voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
          });
          let maxVotes = 0, leadTargetId = null;
          voteCount.forEach((count, targetId) => {
            if (count > maxVotes) { maxVotes = count; leadTargetId = targetId; }
          });
          const targetNickname = leadTargetId ? (room.players.get(leadTargetId)?.nickname || '?') : '?';

          console.log(`[Room: ${roomCode}] 마피아 전원 투표 완료 → 타겟: ${targetNickname}`);
          io.to(roomCode).emit('role-completed', { role: 'mafia', targetNickname });
        }

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
  socket.on('doctor-save', (data, callback) => {
    try {
      const { roomCode, playerId } = socket.data;
      const success = gameEngine.submitDoctorSave(roomCode, playerId, data.targetId);

      if (success) {
        console.log(`[Room: ${roomCode}] 의사 치료: ${playerId} -> ${data.targetId}`);
        io.to(roomCode).emit('role-completed', { role: 'doctor' });
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
  socket.on('police-check', (data, callback) => {
    try {
      const { roomCode, playerId } = socket.data;
      const success = gameEngine.submitPoliceCheck(roomCode, playerId, data.targetId);

      if (success) {
        console.log(`[Room: ${roomCode}] 경찰 수사: ${playerId} -> ${data.targetId}`);
        const room = gameEngine.getRoom(roomCode);
        io.to(roomCode).emit('role-completed', { role: 'police' });
        callback({
          success: true,
          isMafia: room?.policeCheckResult,
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
  socket.on('day-vote', (data, callback) => {
    try {
      const { roomCode, playerId } = socket.data;
      const success = gameEngine.submitDayVote(roomCode, playerId, data.targetId);

      if (success) {
        const room = gameEngine.getRoom(roomCode);
        const voter = room?.players.get(playerId);
        const target = data.targetId ? room?.players.get(data.targetId) : null;
        console.log(`[Room: ${roomCode}] 낮 투표: ${voter?.nickname} -> ${target?.nickname || '없음'}`);
        io.to(roomCode).emit('room-updated', gameEngine.getRoomState(roomCode));
        callback({ success: true });
      } else {
        callback({ success: false, error: '투표 실패' });
      }
    } catch (error) {
      console.error('[Socket] 낮 투표 오류:', error);
      callback({ success: false, error: '투표 오류' });
    }
  });

  // 1차 투표 마감 (방장)
  socket.on('close-day-vote', (_data, callback) => {
    try {
      if (typeof callback !== 'function') {
        console.error('[Socket] close-day-vote: callback이 함수가 아님');
        return;
      }
      const { roomCode, playerId } = socket.data;
      const result = gameEngine.closeDayVote(roomCode, playerId);

      if (result.success) {
        console.log(`[Room: ${roomCode}] 1차 투표 마감. 최다득표: ${result.finalVoteTargetNickname || '동률(없음)'}`);
        if (result.finalVoteTarget) {
          gameEngine.transitionState(roomCode, 'execution', playerId);
          const roomState = gameEngine.getRoomState(roomCode);
          io.to(roomCode).emit('state-changed', {
            state: 'execution',
            roomState,
          });
          io.to(roomCode).emit('vote-closed', {
            voteCounts: result.voteCounts,
            voteEntries: result.voteEntries,
            finalVoteTarget: result.finalVoteTarget,
            finalVoteTargetNickname: result.finalVoteTargetNickname,
            state: 'execution',
            roomState,
          });
        } else {
          io.to(roomCode).emit('vote-closed', {
            voteCounts: result.voteCounts,
            voteEntries: result.voteEntries,
            finalVoteTarget: null,
            finalVoteTargetNickname: null,
            state: 'vote',
            roomState: gameEngine.getRoomState(roomCode),
          });
        }
        callback({ success: true });
      } else {
        callback({ success: false, error: '투표 마감 실패' });
      }
    } catch (error) {
      console.error('[Socket] 1차 투표 마감 오류:', error);
      callback({ success: false, error: '투표 마감 오류' });
    }
  });

  // 2차 찬반 투표 제출
  socket.on('final-vote', (data, callback) => {
    try {
      const { roomCode, playerId } = socket.data;
      const success = gameEngine.submitFinalVote(roomCode, playerId, data.choice);

      if (success) {
        const room = gameEngine.getRoom(roomCode);
        const voter = room?.players.get(playerId);
        console.log(`[Room: ${roomCode}] 찬반 투표: ${voter?.nickname} -> ${data.choice}`);
        io.to(roomCode).emit('final-vote-updated', {
          voterId: playerId,
          voterNickname: voter?.nickname,
          choice: data.choice,
        });
        callback({ success: true });
      } else {
        callback({ success: false, error: '투표 실패' });
      }
    } catch (error) {
      console.error('[Socket] 찬반 투표 오류:', error);
      callback({ success: false, error: '투표 오류' });
    }
  });

  // 2차 찬반 투표 마감 (방장)
  socket.on('close-final-vote', (_data, callback) => {
    try {
      if (typeof callback !== 'function') {
        console.error('[Socket] close-final-vote: callback이 함수가 아님');
        return;
      }
      const { roomCode, playerId } = socket.data;
      const result = gameEngine.closeFinalVote(roomCode, playerId);

      if (result.success) {
        console.log(`[Room: ${roomCode}] 찬반 투표 마감. 처형: ${result.executed}`);
        gameEngine.transitionState(roomCode, 'day', playerId);
        const victoryTeam = gameEngine.checkVictoryCondition(roomCode);
        const roomState = gameEngine.getRoomState(roomCode);
        const executionResult = gameEngine.getLastDayExecutionResult(roomCode);

        io.to(roomCode).emit('execution-completed', {
          roomState,
          victoryTeam,
          executionResult,
        });
        callback({ success: true });
      } else {
        callback({ success: false, error: '마감 실패' });
      }
    } catch (error) {
      console.error('[Socket] 찬반 마감 오류:', error);
      callback({ success: false, error: '마감 오류' });
    }
  });

  // 채팅 메시지
  socket.on('send-message', (data, callback) => {
    try {
      const { roomCode, playerId, nickname } = socket.data;
      const room = gameEngine.getRoom(roomCode);

      if (!room || !data.message || data.message.trim() === '') {
        callback({ success: false });
        return;
      }

      const chatMessage = {
        id: Math.random().toString(36).substr(2, 9),
        playerId,
        nickname,
        message: data.message,
        timestamp: Date.now(),
        isSystem: false,
      };

      io.to(roomCode).emit('message-received', chatMessage);
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
      if (!roomCode || !playerId) return;

      const room = gameEngine.getRoom(roomCode);
      const gameInProgress = room && room.state !== 'waiting' && room.state !== 'ended';
      const exists = gameEngine.leaveRoom(roomCode, playerId, gameInProgress);

      if (gameInProgress) {
        console.log(`[Room: ${roomCode}] ⚡ 플레이어 ${nickname} 연결 끊김 (게임 중 — 재접속 대기)`);
        // 게임 중 단절은 disconnected 마킹만 하고 방 전체에 알림
        if (exists) {
          const roomState = gameEngine.getRoomState(roomCode);
          io.to(roomCode).emit('player-disconnected', {
            nickname,
            roomState,
          });
        }
      } else {
        console.log(`[Room: ${roomCode}] 플레이어 ${nickname} 퇴장`);
        if (exists) {
          const roomState = gameEngine.getRoomState(roomCode);
          io.to(roomCode).emit('room-updated', roomState);
        }
      }
    } catch (error) {
      console.error('[Socket] 연결 해제 오류:', error);
    }
  });
});

// ============= REST API (헬스 체크) =============

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: gameEngine.rooms.size });
});

// Next.js 요청 처리 (Socket.io path 제외 모든 요청)
app.use((req, res) => handle(req, res));

// ============= 서버 시작 =============

const PORT = process.env.PORT || 3000;
nextApp.prepare().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🎮 마피아 게임 서버 시작 (Next.js + Socket.io)`);
    console.log(`📍 포트: ${PORT}`);
    console.log(`✅ 준비됨\n`);
  });
});

module.exports = { gameEngine };
