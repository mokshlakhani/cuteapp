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
  tick: 10,
  tap: 22,
  soft: 30,
  snap: 38,
  thud: 50,
  burst: [60, 40, 45, 40, 30],
};

const nativeStyle: Record<HapticWord, ImpactStyle | 'selection'> = {
  tick: ImpactStyle.Light,
  tap: ImpactStyle.Medium,
  soft: ImpactStyle.Medium,
  snap: ImpactStyle.Heavy,
  thud: ImpactStyle.Heavy,
  burst: ImpactStyle.Heavy,
};

/**
 * Safari on iPhone has no vibration API. Its one web haptic is the tick a
 * switch control gives when toggled, so a hidden switch is toggled instead,
 * several times in quick succession for the stronger words.
 */
const iosTicks: Record<HapticWord, number[]> = {
  tick: [0],
  tap: [0],
  soft: [0, 45],
  snap: [0, 40],
  thud: [0, 40, 80],
  burst: [0, 40, 80, 140, 220],
};

let iosSwitch: HTMLLabelElement | null = null;
function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.append(input);
    document.body.append(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
        if (word === 'burst') {
          setTimeout(() => void Haptics.impact({ style: ImpactStyle.Heavy }), 90);
          setTimeout(() => void Haptics.impact({ style: ImpactStyle.Medium }), 200);
        }
      } else if ('vibrate' in navigator) {
        navigator.vibrate(webMs[word]);
      } else if (isIOS) {
        for (const at of iosTicks[word]) {
          if (at) setTimeout(iosTick, at);
          else iosTick();
        }
      }
    } catch {
      /* haptics are a garnish; never fail */
    }
  },
};
