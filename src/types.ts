export type Side = 'w' | 'b';

export type CoachMessage = {
  speaker: 'Danielle' | 'System';
  text: string;
};

export type MoveRecord = {
  san: string;
  from: string;
  to: string;
  piece: string;
  by: 'You' | 'Danielle';
};
