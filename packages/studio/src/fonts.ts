// Canvas text does not make the browser fetch a webfont, so a frame drawn
// before the faces are loaded silently falls back to system fonts. Load every
// face the compositor can ask for before the first frame.

const FACES = [
  ...[400, 500, 600, 700, 800].map((w) => `${w} 32px "Inter"`),
  ...[500, 600, 700].map((w) => `${w} 32px "Instrument Sans"`),
  '400 32px "Instrument Serif"',
  ...[400, 500].map((w) => `${w} 32px "JetBrains Mono"`),
];

let loading: Promise<void> | null = null;

export function loadFonts(): Promise<void> {
  return (loading ??= Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => [])))
    .then(() => document.fonts.ready)
    .then(() => undefined));
}
