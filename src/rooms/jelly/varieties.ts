/**
 * Melon jelly varieties — the three from the reference, pushed a little more
 * vibrant so the jelly glows instead of looking dull.
 */
export interface Variety {
  id: 'crimson' | 'golden' | 'rose';
  name: string;
  flesh: string;
  fleshLight: string;
  rind: string;
  skin: string;
  skinStripe: string;
  seed: string;
  /** Tint of the soft shadow the jelly casts (light passes through it). */
  shadow: string;
  blush: string;
}

export const VARIETIES: Variety[] = [
  {
    id: 'crimson',
    name: 'Crimson',
    flesh: '#FF1F3D',
    fleshLight: '#FF6A78',
    rind: '#F6FBDF',
    skin: '#24A148',
    skinStripe: '#0B5A26',
    seed: '#2A1712',
    shadow: '#B0303E',
    blush: '#FF9AAE',
  },
  {
    id: 'golden',
    name: 'Golden',
    flesh: '#FF9A00',
    fleshLight: '#FFC53D',
    rind: '#FBF8DA',
    skin: '#24A148',
    skinStripe: '#0B5A26',
    seed: '#2A1712',
    shadow: '#B86A18',
    blush: '#FF8C7A',
  },
  {
    id: 'rose',
    name: 'Rosé',
    flesh: '#FF4F8B',
    fleshLight: '#FF8FB4',
    rind: '#F8FBE6',
    skin: '#2FA85A',
    skinStripe: '#0E6030',
    seed: '#2A1712',
    shadow: '#B03E6A',
    blush: '#FFB0C8',
  },
];

export const varietyById = (id: string) => VARIETIES.find((v) => v.id === id) ?? VARIETIES[0];
