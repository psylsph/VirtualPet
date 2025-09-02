export type PetState = 'AWAKE' | 'DROWSY' | 'SLEEPING';
export type PetType = 'DOG' | 'CAT' | 'RABBIT' | 'HAMSTER';
export type NeedKey = 'hunger' | 'cleanliness' | 'playfulness' | 'affection';

export interface Needs {
  hunger: number;       // 0..100
  cleanliness: number;
  playfulness: number;
  affection: number;
}
