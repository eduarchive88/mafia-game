import { Room, Player, Role, GameState, VictoryTeam, DayVoteEntry, FinalVoteEntry } from './types';
import { v4 as uuidv4 } from 'uuid';

class GameEngine {
  private rooms: Map<string, Room> = new Map();

  /**
   * 새로운 방 또는 기존 방에 플레이어 추가
   */
  joinRoom(sessionCode: string, nickname: string, socket: any): { roomCode: string; playerId: string } {
    const roomCode = sessionCode.toUpperCase();
    let room = this.rooms.get(roomCode);
    const playerId = uuidv4();

    if (!room) {
      // 새 방 생성
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

    const player: Player = {
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

  /**
   * 플레이어가 방을 나갈 때
   */
  leaveRoom(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    room.players.delete(playerId);
    room.updatedAt = Date.now();

    // 방이 비어있으면 삭제
    if (room.players.size === 0) {
      this.rooms.delete(roomCode);
      return false;
    }

    // 방장이 나가면 새 방장 설정
    if (room.hostId === playerId && room.players.size > 0) {
      const firstPlayer = Array.from(room.players.values())[0];
      if (firstPlayer) {
        room.hostId = firstPlayer.id;
      }
    }

    return true;
  }

  /**
   * 게임 시작 - 역할 배정
   */
  startGame(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return false;

    const playerCount = room.players.size;
    if (playerCount < 4) return false;

    // 역할 배정
    const roles = this.assignRoles(playerCount);
    const playersArray = Array.from(room.players.values());

    // 셔플
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

  /**
   * 인원에 따른 역할 배정
   */
  private assignRoles(playerCount: number): Role[] {
    const roles: Role[] = [];
    let mafiaCount: number;
    let policeCount = 1;
    let doctorCount = 1;

    if (playerCount <= 5) {
      mafiaCount = 1;
    } else if (playerCount <= 8) {
      mafiaCount = 2;
    } else {
      mafiaCount = 3;
    }

    // 마피아 추가
    for (let i = 0; i < mafiaCount; i++) {
      roles.push('mafia');
    }

    // 경찰 추가
    roles.push('police');

    // 의사 추가
    roles.push('doctor');

    // 나머지는 시민
    while (roles.length < playerCount) {
      roles.push('citizen');
    }

    return roles;
  }

  /**
   * 상태 전환 (낮 <-> 밤)
   */
  transitionState(roomCode: string, targetState: GameState, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return false;

    const previousState = room.state;

    // 밤에서 낮으로 전환할 때 투표 결과 처리 (votes 클리어 전에 처리해야 함)
    if (targetState === 'day' && previousState === 'night') {
      this.processNightVotes(roomCode);
      // 새 낮 시작 → 이전 처형 결과 초기화
      room.lastDayVoteCounts = [];
      room.lastDayVoteEntries = [];
      room.lastFinalVoteEntries = [];
      room.finalVoteTarget = null;
      room.lastExecutedRole = null;
      room.lastExecutedNickname = null;
    }

    // 밤으로 전환할 때 이전 밤 활동 결과 초기화 (처형 결과는 밤 시작 시 표시하므로 유지)
    if (targetState === 'night') {
      room.savedByDoctor = null;
      room.lastKilledByMafia = null;
      room.policeCheckResult = null;
      room.policeCheckTarget = null;
    }

    // vote → execution 전환 시 2차 투표 초기화
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

  /**
   * 직전 밤 결과 반환 (클라이언트에 공지용)
   */
  getLastNightResult(roomCode: string): { type: 'killed'; victimName: string } | { type: 'saved' } | { type: 'nobody' } {
    const room = this.rooms.get(roomCode);
    if (!room) return { type: 'nobody' };

    const killedId = room.lastKilledByMafia;
    const savedId = room.savedByDoctor;

    if (!killedId) return { type: 'nobody' };

    if (killedId === savedId) {
      return { type: 'saved' };
    }

    const victim = room.players.get(killedId);
    return { type: 'killed', victimName: victim?.nickname || '알 수 없음' };
  }

  /**
   * 밤 투표 제출 (마피아)
   */
  submitNightVote(roomCode: string, playerId: string, targetId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'night') return false;

    const player = room.players.get(playerId);
    if (!player || player.role !== 'mafia' || !player.alive) return false;

    room.nightVotes.set(playerId, targetId);
    room.updatedAt = Date.now();
    return true;
  }

  /**
   * 의사 치료 선택
   */
  submitDoctorSave(roomCode: string, playerId: string, targetId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'night') return false;

    const player = room.players.get(playerId);
    if (!player || player.role !== 'doctor' || !player.alive) return false;

    room.savedByDoctor = targetId;
    room.updatedAt = Date.now();
    return true;
  }

  /**
   * 경찰 수사 제출
   */
  submitPoliceCheck(roomCode: string, playerId: string, targetId: string): boolean {
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

  /**
   * 밤 투표 처리
   */
  private processNightVotes(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    // 마피아 투표 결과 집계
    const voteResults: Map<string, number> = new Map();
    room.nightVotes.forEach((targetId, voterId) => {
      const voter = room.players.get(voterId);
      if (voter && voter.alive) {
        voteResults.set(targetId, (voteResults.get(targetId) || 0) + 1);
      }
    });

    // 가장 많은 투표를 받은 플레이어 선택
    let maxVotes = 0;
    let targetOfMafia = '';
    voteResults.forEach((votes, targetId) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        targetOfMafia = targetId;
      }
    });

    room.lastKilledByMafia = targetOfMafia;

    // 의사가 구했는지 확인
    if (targetOfMafia !== room.savedByDoctor) {
      const victim = room.players.get(targetOfMafia);
      if (victim) {
        victim.alive = false;
      }
    }

    // 투표 초기화
    room.nightVotes.clear();
  }

  /**
   * 낮 1차 투표 제출 (지목) - 공개 투표
   */
  submitDayVote(roomCode: string, playerId: string, targetId: string | null): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'vote') return false;

    const player = room.players.get(playerId);
    if (!player || !player.alive) return false;

    room.dayVotes.set(playerId, targetId);
    room.updatedAt = Date.now();
    return true;
  }

  /**
   * 낮 1차 투표 마감 → 집계만 하고 최다득표자 결정 (처형 X)
   * 동률이면 finalVoteTarget = null
   * 반환: { voteCounts, finalVoteTarget, voteEntries }
   */
  closeDayVote(roomCode: string, playerId: string): {
    success: boolean;
    voteCounts: { playerId: string; nickname: string; votes: number }[];
    voteEntries: DayVoteEntry[];
    finalVoteTarget: string | null;
    finalVoteTargetNickname: string | null;
  } {
    const room = this.rooms.get(roomCode);
    if (!room) return { success: false, voteCounts: [], voteEntries: [], finalVoteTarget: null, finalVoteTargetNickname: null };
    if (room.hostId !== playerId) return { success: false, voteCounts: [], voteEntries: [], finalVoteTarget: null, finalVoteTargetNickname: null };
    if (room.state !== 'vote') return { success: false, voteCounts: [], voteEntries: [], finalVoteTarget: null, finalVoteTargetNickname: null };

    // 공개 투표 내역 생성
    const voteEntries: DayVoteEntry[] = [];
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

    // 집계
    const voteResults: Map<string, number> = new Map();
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

    // 최다득표자 결정 (동률이면 null)
    let finalVoteTarget: string | null = null;
    if (voteCounts.length > 0) {
      const topVotes = voteCounts[0].votes;
      const topCandidates = voteCounts.filter(v => v.votes === topVotes);
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

  /**
   * 2차 처형 찬반 투표 제출
   */
  submitFinalVote(roomCode: string, playerId: string, choice: 'execute' | 'spare'): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'execution') return false;

    const player = room.players.get(playerId);
    if (!player || !player.alive) return false;

    room.finalVotes.set(playerId, choice);
    room.updatedAt = Date.now();
    return true;
  }

  /**
   * 2차 찬반 투표 마감 → 처형 여부 결정
   * 처형 찬성 > 반대일 때만 처형 (동률이면 살림)
   */
  closeFinalVote(roomCode: string, playerId: string): {
    success: boolean;
    executed: boolean;
    finalVoteEntries: FinalVoteEntry[];
    executedNickname: string | null;
    executedRole: string | null;
  } {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return { success: false, executed: false, finalVoteEntries: [], executedNickname: null, executedRole: null };

    const targetId = room.finalVoteTarget;

    // 공개 투표 내역
    const finalVoteEntries: FinalVoteEntry[] = [];
    room.finalVotes.forEach((choice, voterId) => {
      const voter = room.players.get(voterId);
      if (voter) {
        finalVoteEntries.push({ voterId, voterNickname: voter.nickname, choice });
      }
    });
    room.lastFinalVoteEntries = finalVoteEntries;

    let executed = false;
    if (targetId) {
      const executeCount = finalVoteEntries.filter(e => e.choice === 'execute').length;
      const spareCount = finalVoteEntries.filter(e => e.choice === 'spare').length;
      // 처형 찬성 > 반대일 때만 처형 (동률 → 살림)
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

  /**
   * 직전 낮 처형 결과 반환 (클라이언트 공지용)
   */
  getLastDayExecutionResult(roomCode: string) {
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

  /**
   * 게임 승리 조건 확인
   */
  checkVictoryCondition(roomCode: string): VictoryTeam {
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

    // 마피아 수 >= 시민 수 -> 마피아 승리
    if (mafiaCount >= citizenCount) {
      room.victoryTeam = 'mafia';
      room.state = 'ended';
      return 'mafia';
    }

    // 마피아 0명 -> 시민 승리
    if (mafiaCount === 0) {
      room.victoryTeam = 'citizen';
      room.state = 'ended';
      return 'citizen';
    }

    return null;
  }

  /**
   * 방 정보 조회
   */
  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  /**
   * 플레이어 정보 조회
   */
  getPlayer(roomCode: string, playerId: string): Player | undefined {
    const room = this.rooms.get(roomCode);
    return room?.players.get(playerId);
  }

  /**
   * 게임 상태 데이터 (클라이언트에 전송)
   */
  getRoomState(roomCode: string, viewerId?: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const viewers: Record<string, any> = {};
    room.players.forEach((player, playerId) => {
      viewers[playerId] = {
        id: playerId,
        nickname: player.nickname,
        alive: player.alive,
        role: viewerId === playerId ? player.role : '?',
      };
    });

    return {
      sessionCode: room.sessionCode,
      hostId: room.hostId,
      state: room.state,
      round: room.round,
      victoryTeam: room.victoryTeam,
      players: viewers,
      voteInProgress: room.voteInProgress,
      executedPlayer: room.executedPlayer,
      lastKilledByMafia: room.lastKilledByMafia,
      policeCheckResult: viewerId && room.players.get(viewerId)?.role === 'police' ? room.policeCheckResult : null,
      policeCheckTarget: viewerId && room.players.get(viewerId)?.role === 'police' ? room.policeCheckTarget : null,
    };
  }

  /**
   * 모든 방 수 조회
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * 방 정보 반환 (디버깅용)
   */
  getAllRooms() {
    return this.rooms;
  }
}

export const gameEngine = new GameEngine();
