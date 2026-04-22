// 게임 타입 정의
export type Role = 'mafia' | 'police' | 'doctor' | 'citizen';
export type GameState = 'waiting' | 'day' | 'night' | 'vote' | 'execution' | 'ended';

// 낮 1차 투표 (지목) 결과
export interface DayVoteEntry {
  voterId: string;
  voterNickname: string;
  targetId: string;
  targetNickname: string;
}

// 2차 처형 찬반 투표
export interface FinalVoteEntry {
  voterId: string;
  voterNickname: string;
  choice: 'execute' | 'spare'; // 처형 or 살리기
}
export type VictoryTeam = 'mafia' | 'citizen' | null;

export interface Player {
  id: string;
  nickname: string;
  role: Role;
  alive: boolean;
  socket: any;
}

export interface Room {
  sessionCode: string;
  hostId: string;
  players: Map<string, Player>;
  state: GameState;
  round: number;
  victoryTeam: VictoryTeam;
  nightVotes: Map<string, string>; // mafia's target votes
  dayVotes: Map<string, string | null>; // day voting
  voteInProgress: boolean;
  votingStartTime: number;
  selectedTarget: string | null; // selected target in night or voting
  executedPlayer: string | null;
  lastKilledByMafia: string | null;
  savedByDoctor: string | null;
  policeCheckResult: boolean | null;
  policeCheckTarget: string | null;
  // 낮 처형 결과 (다음 밤 전환 전까지 보관)
  lastDayVoteCounts: { playerId: string; nickname: string; votes: number }[];
  lastDayVoteEntries: DayVoteEntry[];   // 1차 공개 투표 내역
  lastFinalVoteEntries: FinalVoteEntry[]; // 2차 찬반 투표 내역
  finalVoteTarget: string | null;       // 2차 투표 대상자 ID
  finalVotes: Map<string, 'execute' | 'spare'>; // 2차 투표 (playerId -> choice)
  lastExecutedRole: Role | null;
  lastExecutedNickname: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface GameMessage {
  type: string;
  data: any;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  message: string;
  timestamp: number;
  isSystem: boolean;
}
