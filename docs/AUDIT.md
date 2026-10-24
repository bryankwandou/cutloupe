# Idea audit

A blunt review of Cutloupe as a product, written before launch. Scores are the reviewer's judgement on evidence available on 2026-10-24, and they are not adjusted to look good.

## The claim

Agents can already produce video (ffmpeg, Remotion, CapCut automations). They cannot check what they produced, and the person cannot watch or steer while it happens. Cutloupe's bet is that **closing that loop**, so the agent sees real frames and the person sees every edit live, is the missing piece for agent-made video.

## Where it is weak

1. **The moat is thin.** Palmier Pro already gives agents an MCP-driven timeline on macOS. Remotion has an agent workflow. Any of them could add a "render a frame and return it" tool in a week. Being Windows-first and open source is a head start, not a wall.
2. **The renderer is a browser.** Every frame goes through headless Chrome. It works and the preview matches the export exactly, but an 8-second 1080p reel takes 1.5 to 2.5 minutes. Long-form video is not realistic yet.
3. **Interchange is shallow.** FCPXML and Premiere XML carry cuts, trims and levels, not the motion design. Someone who finishes in Resolve loses the animated titles. The CapCut draft may simply be refused by current builds.
4. **The agent's eyes are only as good as the model.** `look` returns accurate frames, but whether the model notices a two-pixel collision or a caption running off-screen is up to the model. The demo shows a catch; it does not prove the catch rate.
5. **The ledger is a solution looking for a buyer.** A devnet seal that says "this file came from this cut, edited by an agent" is useful for disclosure rules and stock footage provenance, but nobody is asking for it on Solana today. It is optional for a reason.
6. **No footage generation.** People who say "make me a video" often have nothing to edit. Cutloupe needs footage, or it produces motion-graphics pieces only.

## Where it is strong

1. **It runs on Windows**, where most creators and most CapCut users are, and the main competitor does not.
2. **One compositor for everything.** Studio preview, `look` and the MP4 come from the same `renderFrame`, so "what the agent saw" and "what was exported" cannot drift apart.
3. **Shared editing is real.** The person and the agent edit through the same reducer and undo history. That is rare in agent tools, which usually lock the user out until the run ends.
4. **Honest exports.** Every export lists what it left behind instead of silently dropping it.
5. **Free and local.** No account, no upload, CC0 music, MIT code.

## SWOT

| Strengths | Weaknesses |
| --- | --- |
| Live studio + agent vision loop; Windows-first; one renderer; shared undo; honest exports | Slow browser rendering; shallow NLE interchange; no generation; no npm release yet |
| **Opportunities** | **Threats** |
| Disclosure rules for AI-edited media; short-form teams that already use agents for scripts; plugging generators (image/video models) in as media sources | Palmier Pro shipping Windows; Remotion or CapCut adding agent vision; MCP clients adding built-in screen capture that makes `look` less special |

## Business model canvas, short form

- **Customer segments:** solo creators and small teams producing short-form video with an agent already in their workflow; developer-educators making product clips.
- **Value proposition:** the agent edits, checks its own frames, and you watch and steer; finish in the editor you already use.
- **Channels:** MCP directories, GitHub, short demo clips made with Cutloupe itself.
- **Revenue (later, not now):** a hosted render farm for fast MP4 export; team project sync; paid seal anchoring on mainnet for publishers who need provenance.
- **Key resources:** the shared timeline model and compositor; export mappers.
- **Costs:** rendering compute if hosted; maintenance of export formats as NLEs change.

## Scores

| Dimension | Score /10 | Why |
| --- | --- | --- |
| Problem is real | 7 | Agents producing unchecked video is a real, daily annoyance for people who try it |
| Uniqueness today | 6 | The live loop on Windows is new; the parts are not |
| Defensibility | 3 | Easy to copy for anyone with a renderer |
| Execution of this MVP | 7 | 28 tools work end to end in tests; slow MP4; NLE round-trips unverified |
| Web3 fit | 4 | Technically sound, demand unproven |

**Overall: 54/100.** A good tool with a clear wedge (Windows, live loop) and a weak moat. Not a 99/100 idea, and saying so is more useful than pretending.

## What would raise it

1. Replace headless-Chrome export with a native compositor path (WebCodecs or a Skia renderer) to get MP4 export near real time.
2. Open each export in Resolve, Premiere and CapCut, fix what breaks, and publish the round-trip files.
3. Add generators as media sources (image and video models), so "make me a video" works from nothing.
4. Measure the catch rate: seed 50 layout mistakes, count how many the agent finds through `look`.
5. Talk to five creators who already script with agents and see whether the ledger answers a question they have.
