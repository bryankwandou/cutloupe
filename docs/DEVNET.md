# Devnet proof

Everything below ran against Solana devnet on 2026-10-24, from this repository, with no manual steps. Each link opens the transaction in Solana Explorer.

## Program

| | |
| --- | --- |
| Program ID | [`G6kWfHR1X2tHFgwHvrc5soiXwUF4bYXprv7YMTJnx5eY`](https://explorer.solana.com/address/G6kWfHR1X2tHFgwHvrc5soiXwUF4bYXprv7YMTJnx5eY?cluster=devnet) |
| Source | [`programs/cutloupe-ledger/programs/cutloupe_ledger/src/lib.rs`](../programs/cutloupe-ledger/programs/cutloupe_ledger/src/lib.rs) (Anchor) |
| Upgrade authority | `AUo5JFnRhLtD6PJaWDj98M2ZmHWbLPcrKiR2QPY95AG7` |
| Last deployed in slot | 511955209 |

Instructions:

- `open_reel(reel_id, title_hash)` creates the Reel PDA `["reel", authority, reel_id]`.
- `commit_cut(prev, next, ops, actor)` moves the head. Fails with `StaleHead` if `prev` is not the current head, and with `NoChange` if `next == prev`.
- `seal_export(file_sha256, timeline_hash, flags, duration_ms)` creates the Seal PDA `["seal", file_sha256]`. Fails with `NotHead` unless `timeline_hash` is the reel's current head. A file can be sealed once.

Flags: `1` AI-edited, `2` AI-generated media, `4` synthetic voice, `8` licensed music. Actor: `0` person, `1` agent, `2` both.

## Run 1: the MCP server, end to end

`npm run smoke` with `CUTLOUPE_KEYPAIR` set. The script starts the real MCP server over stdio, builds an 8-second reel with every editing tool, calls `look`, exports all nine formats, then uses the `ledger` tool.

| Step | Result |
| --- | --- |
| `ledger status` | No reel yet. Local timeline hash `9b9e820b28149f840ed6af875f32c0beab0d42b382cfb261262cc7e33867ce65` |
| `ledger seal` → `open_reel` | [4UvdAb7g…zovv](https://explorer.solana.com/tx/4UvdAb7gRZrvp88dBz8BjKqW96T1suDrwD8S8c18xJQupJYWjEQdF3D1juPrRJo2m7CsjhexFDqry6AqQJeizovv?cluster=devnet) |
| `commit_cut` to the timeline hash | [23pVbBD8…95rk](https://explorer.solana.com/tx/23pVbBD8amkfwGHFsrftoU2RK3QJSg5gtk4mG4DPEJhk7g16Bi4ftA5VMkva3VLJBed4DNCVh1R2uuukuiKQ95rk?cluster=devnet) |
| `seal_export` of `smoke-reel.mp4` | [4s4enrKs…uoRBJ](https://explorer.solana.com/tx/4s4enrKs3wxXTjsuwTH1EXSAtK9NXMZabq69rxT1pzYNWr9HNgWdVkxEk12LpVjjgxqwMVDdzjr1RjXGE3LuoRBJ?cluster=devnet) |
| `ledger verify` | Seal [`5UJMUomg…pKx8`](https://explorer.solana.com/address/5UJMUomgsSUATvxXfR8kuXrkNyVWvP18nDcC1ALZpKx8?cluster=devnet), reel [`EXvZTkMg…6Ru1`](https://explorer.solana.com/address/EXvZTkMg3ZR8Sz6fjneGfQVKJrfQmqUMPv7QzHXw6Ru1?cluster=devnet), version 1, flags 1, 8000 ms |

The sealed file is published on the website as `/media/sealed-demo.mp4` (SHA-256 `e343c60eeee737a918e87c67a7f9af3a4533de5195ef316828f710a88ffd7325`). The "check the sealed demo export" button on the site hashes it in the browser and reads this seal back from devnet. The render is deterministic: two separate runs produced the same file, byte for byte.

## Run 2: success and failure paths

`npm run ledger:check`, project `ledger_check_5d0f6624`.

| Check | Expected | Result |
| --- | --- | --- |
| `open_reel` + `commit_cut` to hash A | succeeds | [5AtA6q1z…qCPTn](https://explorer.solana.com/tx/5AtA6q1zuHhA1d7X7GR9ExGvkAbr9gwYALRJN42Uncupej28EQvWDBScj8GRAnbppqyEZGTLMevM4QYyYc4qCPTn?cluster=devnet), [bcQKscf7…5kwy](https://explorer.solana.com/tx/bcQKscf7QWDEJ5RnoFxy2piBrzh7tam22ytkcoKqDEscohhehqet6hMA2MdvdKFhw59r4RpoKupXHFDMgyb5kwy?cluster=devnet) |
| `commit_cut` with a stale `prev` | rejected | `StaleHead` |
| `commit_cut` to the same head | rejected | `NoChange` |
| `seal_export` against a hash that is not the head | rejected | `NotHead` |
| `seal_export` against the head (flags AI-edited + AI media) | succeeds | [3NX97oBQ…P4](https://explorer.solana.com/tx/3NX97oBQpWUoWi6iwKgNWJMCdWMXHqq59GS6ttSrNAtF7EM6yMdWvmKTLE37MSUdkn8wGPAKQ8Qh2d24DcwWk8P4?cluster=devnet) |
| seal the same file twice | rejected | account already in use |
| `commit_cut` A → B as a person (actor 0) | succeeds | [FYPB1GZ1…4Ay](https://explorer.solana.com/tx/FYPB1GZ11iRcXZ7zzjB8vfcugK1vyRqy5K3xjDmLeWzutCHNiYY5eTpmh2n1R3UkX2HyyCckskgDc8WhLkju4Ay?cluster=devnet) |

Final state: reel [`ydLtbbdC…1gN`](https://explorer.solana.com/address/ydLtbbdC4dXZUR5hGJ6D54RALGkf6fvPAWhwvAbn1gN?cluster=devnet) at version 2 with 1 sealed export. The seal still records version 1 and the old head, which is the point: a later edit does not rewrite what an earlier export was cut from.

## Reproduce

```bash
npm install && npm run build
export CUTLOUPE_KEYPAIR=/path/to/devnet-keypair.json   # needs a little devnet SOL
npm run smoke
npm run ledger:check
```

The keypair file is read locally and never printed or sent anywhere; only signed transactions reach the RPC.
