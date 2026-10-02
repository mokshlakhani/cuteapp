/**
 * The icon set: 24×24, rounded 2.2px strokes, round caps and joins.
 * Future rooms add their tools here so every glyph shares one hand.
 */
const wrap = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  back: wrap('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  plus: wrap('<path d="M12 6v12M6 12h12"/>'),
  close: wrap('<path d="M7 7l10 10M17 7 7 17"/>'),
  music: wrap('<path d="M9 17.5V6.2l9.5-2v11.3"/><circle cx="6.6" cy="17.6" r="2.4"/><circle cx="16.1" cy="15.6" r="2.4"/>'),
  sound: wrap('<path d="M4.5 9.6h2.8l4.4-3.6v12l-4.4-3.6H4.5z"/><path d="M15.4 9.2a4 4 0 0 1 0 5.6M17.9 6.7a7.6 7.6 0 0 1 0 10.6"/>'),
  soundOff: wrap('<path d="M4.5 9.6h2.8l4.4-3.6v12l-4.4-3.6H4.5z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>'),
  vibrate: wrap('<rect x="8" y="4.5" width="8" height="15" rx="2.6"/><path d="M4.6 9.5v5M19.4 9.5v5"/>'),
  hand: wrap(
    '<path d="M8.2 12.2V6.6a1.45 1.45 0 0 1 2.9 0v4.6"/><path d="M11.1 10.6V5.1a1.45 1.45 0 0 1 2.9 0v5.5"/><path d="M14 10.6V6.6a1.45 1.45 0 0 1 2.9 0v6.6c0 4-2.4 6.8-6 6.8-2.4 0-3.9-1.1-5.2-3.1l-2-3.2a1.4 1.4 0 0 1 2.3-1.6l2.2 2.4"/>',
  ),
  knife: wrap('<path d="M9.4 13.6 19.6 3.7c1.7 2 .9 7.4-5.5 12.6z"/><path d="M10.9 15.6 5.2 21.2" stroke-width="3.6"/>'),
  sparkle: wrap(
    '<path d="M11 4c.6 3.5 2.3 5.2 5.8 5.8-3.5.6-5.2 2.3-5.8 5.8-.6-3.5-2.3-5.2-5.8-5.8C8.7 9.2 10.4 7.5 11 4z"/><path d="M18 14.6c.25 1.3.85 1.9 2.1 2.1-1.25.25-1.85.85-2.1 2.1-.25-1.25-.85-1.85-2.1-2.1 1.25-.2 1.85-.8 2.1-2.1z"/>',
  ),
  moon: wrap('<path d="M18.5 14.5A7 7 0 0 1 9.5 5.5a7 7 0 1 0 9 9z"/>'),
};

export type IconName = keyof typeof icons;
