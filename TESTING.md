# Verification · deathmatch v3

## Executed

**28 dependency-free Node tests passed.**

- All three maps: navigable bot routes, valid navigation nodes, movement/jump/collision and boundaries.
- Deathmatch startup, bot population/difficulty, movement, reaction delay, line-of-sight perception, authoritative bot shooting and human deaths.
- Human joins replacing bot slots, bot refills on human departure and ten-player capacity.
- All 18 weapon slots, semi-automatic gating, burst completion, ammo/reload, cover blocking bullets, shared kills, respawn/loadout retention, match goal/timer/restart and late joins.
- Removed utility actions are ignored; invalid, duplicate and old-round input is rejected; stale controls stop; nested snapshots are copied; aim assistance respects visibility.
- Room-code/invite parsing, handshake/state/combat over reliable fallback, full-human-room rejection, fresh-transport reconnect retaining the original seat/gun/score, token forgery rejection, host-only configuration/restarts, intentional leave/shutdown, cancellation without a stale lobby, and idempotent repeated joins.

The protocol unit tests use an explicitly labeled in-memory transport double. They do not prove internet connectivity.

**Real Chromium 153 with WebGL passed:**

- New home/menu, direct bot startup, three visible bots, actual player shots killing bots, gun selection, pause/settings, touch layout editor, leaving and rendering screenshots.
- Two browser tabs creating/joining a room by invite link, two bots synchronized in the lobby, starting deathmatch, replicated combat/kills, closing the guest control channel, reconnecting through a fresh transport without duplicating its player identity, and the host leaving with a visible guest error.
- Native movement/state channels reported `ordered:false` and `maxRetransmits:0`.
- Emulated mobile at 844 × 390: actual browser touch dispatch for simultaneous move/look/fire, touch cancellation clearing held input, zoom remaining 1.0 and readable gameplay controls.
- No page errors were reported in the completed browser run. Menu, lobby, gameplay and mobile screenshots were inspected internally.

The actual WebRTC test used test-only local PeerServer and STUN services because the managed build network restricts external ICE traffic. These QA services are not included in the game and are not required to deploy it. The test demonstrates real browser WebRTC locally, not the default external service across every NAT.

## Remaining device/deployment checks

- Two physical devices on the deployed Pages site, including different networks and any TURN relay you supply.
- Physical Android/iOS: audio, pointer/touch behavior, notches, rotation, saved custom layouts, long presses and pinch gestures.
- Ten participants with real internet latency and mobile-host performance.
- Brief Wi-Fi/carrier changes, signaling service outages, 15-second seat expiry and restrictive VPNs/firewalls.
- A full natural five-minute game, repeated matches and extended performance on target devices.

The old tactical game tests were replaced with tests of this deathmatch-only implementation. No agent, economy, objective or grenade behavior is retained.
