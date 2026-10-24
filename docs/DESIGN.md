# Design notes

How the studio and the website look, and why.

## What we looked at

| Reference | What we took | What we left |
| --- | --- | --- |
| splicecraft.vercel.app (the quality floor for this project) | An install command in the hero, a real demo above the fold, honest limits, a proof section | A long run of decorative stat chips and an "anti AI-ish" gimmick that has nothing to do with editing |
| pen.dev (agentic design canvas) | The promise that matters: the agent works on a canvas you can also touch | A hero that depends on a canvas loading; in our capture it showed "Loading canvas… Retry" |
| Palmier Pro (agent-driven video editor) | MCP on localhost while the app is open, a timeline the agent can drive | macOS 26 and Apple Silicon only; Cutloupe runs on Windows first |
| remotion.dev | An interactive player-style widget on the page, the plain install command | Pricing and showcase sections that do not apply yet |
| linear.app | Editorial rhythm: heading, short paragraph, one product visual, repeat. Captions like "Fig 0.1" that read as technical, not salesy | A "New" pill above the headline |
| getdesign.md DESIGN.md catalog (Linear, Vercel, Runway, Raycast) | The habit of writing down tokens and the reason for each one | |

## Principles

1. **Show the product, not a picture of it.** The hero embeds the real studio running a scripted agent session. The caption preview is drawn by the same `renderFrame` the export uses. The music player synthesizes tracks with the same code the server runs. The seal checker reads devnet live.
2. **Amber means the agent, blue means you.** That is the only colour rule, and it is the same in the studio, the timeline, the logo and the page. Nothing else gets a bright colour.
3. **The page is a timeline.** Section labels are timecodes, the header carries a ruler, and the scroll position is a playhead with a running timecode. It is the one decorative idea, and it comes from the product.
4. **Say what is missing.** Exports list what they leave behind. The page has a Limits section. Numbers on the page are measured, not rounded up.
5. **No badges.** No pill with a coloured status dot anywhere; connection state in the studio is a plain sentence.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#08090a` | Page and studio background |
| `--panel` | `#101113` (site), `#0e0f11` (studio) | Cards, panels |
| `--line` | `rgba(255,255,255,.07)` | Hairlines |
| `--text` / `--muted` / `--dim` | `#ecedee` / `#9a9fa6` / `#62666d` | Three text levels, no more |
| `--agent` | `#ffb224` | Anything the agent did; timecode labels |
| `--human` | `#7aa7ff` | Anything the person did; links |
| `--ok` | `#3dd68c` | Playing, verified |

Type: Instrument Sans for display (tight tracking, 600), Instrument Serif italic for the one accented word in the hero, Inter for body, JetBrains Mono for timecodes, tool names and code. All self-hosted through Fontsource.

## Logo

A loupe whose lens holds a strip of film cut diagonally: blue on one side of the cut, amber on the other. You and the agent, on one frame, with a cut between. It reads at 16 px as a magnifier, and at 64 px the film and the two colours show.

## Motion

- Hero headline words rise in with a short blur, 70 ms apart.
- Sections fade up once when they enter the viewport.
- In "How it works" a dot travels the four steps every 2.6 s; hovering a step takes over.
- The caption canvas plays at real speed; the music bars fill as the track plays.
- `prefers-reduced-motion` turns all of it off and shows final states.

## Languages

English is the default and lives in the HTML, so the page reads without JavaScript. Indonesian, Spanish and Japanese are switched in by key. Tool names, code and format names are never translated. The choice is remembered per browser and can be forced with `?lang=`.

## Checks we run

`scripts/shoot-sections.mjs` screenshots every section at 1440 and 390 wide, fails on console errors, failed requests and horizontal overflow, and lists any element that never revealed.
