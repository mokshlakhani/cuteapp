/**
 * Fruit colours shared by every room, so a watermelon in one toy is the same
 * watermelon in another. Fruits may be a little stronger than the UI pastels,
 * but they're all tuned to sit on the same warm, soft backdrop.
 */
export const fruitPalette = {
  watermelon: {
    flesh: '#FF4057',
    fleshLight: '#FF7F8C',
    rind: '#F4F9DE',
    skin: '#55B95E',
    skinLight: '#86D37F',
    stripe: '#23803A',
    seed: '#2E1B16',
  },
  goldenMelon: { flesh: '#FFA21F', fleshLight: '#FFC857' },
  roseMelon: { flesh: '#FF5C93', fleshLight: '#FF94B8' },
  orange: { peel: '#F7871F', pith: '#FFF3DC', flesh: '#FFA42B', membrane: '#FFE1AE' },
  lemon: { peel: '#F4CA1C', pith: '#FFFBE6', flesh: '#FFE55C', membrane: '#FFF7C9' },
  kiwi: { skin: '#8E6B3D', flesh: '#7DC443', core: '#F3F6D4', seed: '#1E1A14' },
  strawberry: { skin: '#E8273C', flesh: '#FF4D61', core: '#FFE2E6', seed: '#FFD447' },
  apple: { skin: '#E8333F', flesh: '#FFF2CC', core: '#F3DF9E', seed: '#6B3F24' },
  peach: { skin: '#F2694C', flesh: '#FFB04A', blush: '#FF7A55', pit: '#9C5130' },
  dragonfruit: { skin: '#E3237E', rim: '#F7A6CB', flesh: '#FCF7F2', seed: '#1C1416' },
} as const;
