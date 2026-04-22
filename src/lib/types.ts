// 게임 타입 정의
export type Role = 'mafia' | 'police' | 'doctor' | 'citizen';
export type GameState = 'waiting' | 'day' | 'night' | 'vote' | 'execution' | 'ended';
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
