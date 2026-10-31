// Vue qu'un joueur reçoit pour chaque jeu, calculée par le serveur dans SA langue. Ce qui doit rester
// secret (bonne réponse, votes avant révélation, mot à faire deviner) n'y figure jamais avant l'heure.
// Les échéances (`deadline`) sont en ms, horloge du serveur : le client corrige avec l'écart mesuré.

export interface Scoreline {
  pseudo: string;
  score: number;
  you: boolean;
}

export interface QuizView {
  kind: 'quiz-comptoir';
  phase: 'question' | 'reveal';
  index: number;
  total: number;
  prompt: string;
  choices: string[];
  deadline: number;
  durationMs: number;
  yourChoice: number | null;
  answered: number;
  playerCount: number;
  correct: number | null; // révélé seulement en phase 'reveal'
  yourPoints: number | null;
  scoreboard: Scoreline[];
}

export interface WouldYouRatherView {
  kind: 'tu-preferes';
  phase: 'vote' | 'reveal';
  index: number;
  total: number;
  a: string;
  b: string;
  deadline: number;
  durationMs: number;
  yourVote: 'a' | 'b' | null;
  voted: number; // nombre de votes reçus, jamais leur répartition avant la fin
  playerCount: number;
  results: { a: number; b: number; aCount: number; bCount: number } | null; // pourcentages
}

export interface IntrusView {
  kind: 'l-intrus';
  phase: 'race' | 'reveal';
  index: number;
  total: number;
  items: string[];
  deadline: number;
  durationMs: number;
  lockedOut: boolean; // mauvaise réponse : plus de clic possible sur cette grille
  wrongPick: number | null;
  winner: string | null;
  intruder: number | null; // révélé seulement en phase 'reveal'
  explanation: string | null;
  scoreboard: Scoreline[];
}

export interface ActionVeriteView {
  kind: 'action-verite';
  phase: 'choose' | 'perform' | 'reveal';
  round: number;
  total: number;
  designated: string;
  isYou: boolean;
  choice: 'action' | 'verite' | null;
  card: string | null;
  validations: number;
  needed: number;
  youValidated: boolean;
  validated: boolean | null;
  deadline: number;
  durationMs: number;
  scoreboard: Scoreline[];
}

export interface MotInterditView {
  kind: 'mot-interdit';
  phase: 'ready' | 'play' | 'reveal';
  round: number;
  total: number;
  speaker: string;
  isSpeaker: boolean;
  card: { word: string; forbidden: string[] } | null; // seulement sur l'écran de celui qui fait deviner
  guessed: number;
  lastEvent: { type: 'guessed' | 'pass' | 'buzz'; by: string; at: number } | null;
  deadline: number;
  durationMs: number;
  scoreboard: Scoreline[];
}

export interface RoomVoucherView {
  code: string;
  reward: string;
  expiresAt: number;
}

export interface BoissonMystereView {
  kind: 'boisson-mystere';
  phase: 'play' | 'won' | 'lost';
  hints: string[]; // indices déjà dévoilés, du plus vague au plus précis
  totalHints: number;
  options: { id: string; name: string; wrong: boolean }[];
  attemptsLeft: number;
  lastGuess: { by: string; name: string; correct: boolean } | null;
  answer: string | null;
  voucher: RoomVoucherView | null;
  nextHintAt: number | null;
}

export const JACKPOT_SYMBOLS = ['cerise', 'citron', 'etoile', 'cloche', 'sept', 'diamant'] as const;
export type JackpotSymbol = (typeof JACKPOT_SYMBOLS)[number];

export interface JackpotView {
  kind: 'jackpot-happy-hour';
  yourSpin: { reels: [JackpotSymbol, JackpotSymbol, JackpotSymbol]; win: boolean; prize: string | null; voucher: RoomVoucherView | null } | null;
  spun: number;
  playerCount: number;
  winners: string[];
  deadline: number;
  durationMs: number;
}

export type AnyGameView = QuizView | WouldYouRatherView | IntrusView | ActionVeriteView | MotInterditView | BoissonMystereView | JackpotView;
