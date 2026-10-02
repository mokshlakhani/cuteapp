import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { settings } from './settings';

/**
 * The haptic vocabulary. Rooms speak in these words, never in raw durations,
 * so a "tap" feels the same in every toy.
 *
 *  tick   – the lightest grain; used in repeating streams (stretching)
 *  tap    – something small landed / was placed
 *  soft   – a squishy contact
 *  snap   – an elastic snap or slice
 *  thud   – a heavier landing
 *  burst  – the big release (still short and kind)
 */
export type HapticWord = 'tick' | 'tap' | 'soft' | 'snap' | 'thud' | 'burst';

const native = Capacitor.isNativePlatform();

const webMs: Record<HapticWord, number | number[]> = {
  tick: 4,
  tap: 8,
  soft: 12,
  snap: 14,
  thud: 20,
  burst: [26, 40, 14],
};

const nativeStyle: Record<HapticWord, ImpactStyle | 'selection'> = {
  tick: 'selection',
  tap: ImpactStyle.Light,
  soft: ImpactStyle.Light,
  snap: ImpactStyle.Medium,
  thud: ImpactStyle.Medium,
  burst: ImpactStyle.Heavy,
};

let last = 0;
let selectionPrimed = false;
const MIN_GAP = 28; // ms — never buzz continuously

export const haptics = {
  play(word: HapticWord) {
    if (!settings.value.haptics) return;
    const now = performance.now();
    if (word !== 'burst' && now - last < MIN_GAP) return;
    last = now;
    try {
      if (native) {
        const style = nativeStyle[word];
        if (style === 'selection') {
          // iOS needs the selection generator prepared once before use.
          if (!selectionPrimed) {
            selectionPrimed = true;
            void Haptics.selectionStart();
          }
          void Haptics.selectionChanged();
        } else void Haptics.impact({ style });
        if (word === 'burst') setTimeout(() => void Haptics.impact({ style: ImpactStyle.Light }), 90);
      } else if ('vibrate' in navigator) {
        navigator.vibrate(webMs[word]);
      }
    } catch {
      /* haptics are a garnish; never fail */
    }
  },
};
