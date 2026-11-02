import type { RoomInfo } from './scene';
import { roomTint } from '../design/tokens';
import { MelonRoom } from '../rooms/melon/MelonRoom';
import { melonScene } from '../rooms/melon/MelonScene';
import { melonPreview } from '../rooms/melon/preview';
import { JellyRoom } from '../rooms/jelly/JellyRoom';
import { labTable } from '../rooms/jelly/Lab';
import { jellyPreview } from '../rooms/jelly/preview';
import { WrapRoom } from '../rooms/wrap/WrapRoom';
import { wrapPreview } from '../rooms/wrap/preview';
import { PourRoom } from '../rooms/pour/PourRoom';
import { pourPreview } from '../rooms/pour/preview';
import { SliceRoom } from '../rooms/slice/SliceRoom';
import { sliceScene } from '../rooms/slice/SliceScene';
import { slicePreview } from '../rooms/slice/preview';
import { PeelRoom } from '../rooms/peel/PeelRoom';
import { peelScene } from '../rooms/peel/PeelScene';
import { peelPreview } from '../rooms/peel/preview';
import { SoapRoom } from '../rooms/soap/SoapRoom';
import { soapScene } from '../rooms/soap/SoapScene';
import { soapPreview } from '../rooms/soap/preview';
import { StackRoom } from '../rooms/stack/StackRoom';
import { stackScene } from '../rooms/stack/StackScene';
import { stackPreview } from '../rooms/stack/preview';

/**
 * The room registry. Adding a toy = adding one entry here with a Scene
 * factory and a tiny live preview for its home card. Everything else
 * (navigation, transitions, chrome, sound, haptics) is inherited.
 */
export const ROOMS: RoomInfo[] = [
  { id: 'melon', name: 'pop', blurb: 'tap till the fruit bursts', tint: roomTint.melon, awake: true, create: (nav) => new MelonRoom(nav), warm: melonScene, preview: melonPreview },
  { id: 'jelly', name: 'jelly', blurb: 'slice and squish the jelly', tint: roomTint.jelly, awake: true, create: (nav) => new JellyRoom(nav), warm: labTable, preview: jellyPreview },
  { id: 'wrap', name: 'bubbles', blurb: 'pop the bubble wrap', tint: roomTint.wrap, awake: true, create: (nav) => new WrapRoom(nav), preview: wrapPreview },
  { id: 'pour', name: 'pour', blurb: 'fill it to the line', tint: roomTint.pour, awake: true, create: (nav) => new PourRoom(nav), preview: pourPreview },
  { id: 'slice', name: 'slice', blurb: 'cut the exact pieces', tint: roomTint.slice, awake: true, create: (nav) => new SliceRoom(nav), warm: sliceScene, preview: slicePreview },
  { id: 'peel', name: 'peel', blurb: 'peel it in one strip', tint: roomTint.peel, awake: true, create: (nav) => new PeelRoom(nav), warm: peelScene, preview: peelPreview },
  { id: 'soap', name: 'soap', blurb: 'blow it to the ring', tint: roomTint.soap, awake: true, create: (nav) => new SoapRoom(nav), warm: soapScene, preview: soapPreview },
  { id: 'stack', name: 'stack', blurb: 'build the tallest tower', tint: roomTint.stack, awake: true, create: (nav) => new StackRoom(nav), warm: stackScene, preview: stackPreview },
];
