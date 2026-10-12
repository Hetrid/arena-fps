# Verification record · tactical version 2

## Executed

- **37 Node tests** cover authoritative simulation and room protocols. They run with no installed npm dependencies.
- Simulation checks all three maps' dimensions, clear spawns, traversable routes to both objective sites, movement/collision/jump, map bounds, arbitrary team splits, map voting, buy-phase restrictions and wallet validation, all 18 weapons, ADS bursts, ammo/reload, armor, friendly-fire behavior, round economy, carried/lost equipment, planting/defusing/detonation, elimination and deathmatch outcomes, late joins, rematch, grenade limits/fuses/occlusion, all ten signatures, dynamic cover/sentries, fire/slow fields, mobile assistance, stale inputs and snapshot copying.
- Protocol tests use an explicitly labeled **in-memory PeerJS transport double**. They check private acceptance, fast input/state messages, combat events, ping, intentional leave, ten-player capacity, unavailable/closed host, public discovery and preferences, cancellation, bounded occupied-slot retries, authenticated reconnect preserving the original seat/inventory/score, forged token rejection and guest restrictions on host configuration and other wallets.
- **Real Chromium 153 with WebGL** loaded the game under a repository subdirectory. Desktop checks exercised practice, movement, the armory, weapon switching, pause/settings/layout editor, leaving and screenshots. No page errors were reported.
- **Emulated mobile Chromium at 844 × 390** used real browser touch dispatch for simultaneous movement, looking and firing. Cancellation reset held actions. Browser zoom remained 1.0. Dragged button placement, resizing and opacity were saved and survived a reload. Screenshots were inspected; no page errors were reported.
- **Actual WebRTC between two Chromium tabs** used a test-only local PeerServer and local STUN responder. The test exercised joining, selecting agents, voting for Tideport, starting elimination, buying, native lossy data-channel negotiation, synchronized firing/kill/round score/economy, and reconnection after closing the reliable channel. The original guest seat and kill count survived with two total players. The native channel reported `ordered:false`, `maxRetransmits:0`, and `readyState:open`. No page errors were reported.
- JavaScript syntax, module references, HTML IDs, local assets and ZIP contents were checked. Production runtime dependencies are vendored with licenses.

The local signaling/STUN services are QA infrastructure only and are not part of the game or required for deployment. The managed build network did not produce usable ICE candidates with default external services, so the local services were used to validate the real WebRTC transport. This establishes local browser interoperability, not internet connectivity through every NAT.

## Remaining deployment/device checks

| Scenario               | Check on your deployed HTTPS site                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical mobile        | Android Chrome and iOS Safari: landscape/portrait, safe areas, simultaneous touches, long press and pinch, edited controls, sound and performance |
| Desktop pointer lock   | Resume, mouse aim, Escape release, resume again across desktop browsers                                                                           |
| Internet private rooms | Two physical devices, including separate networks; compare movement, health, credits, objective state and round scores                            |
| Public pool            | Multiple devices selecting Quick Play; waiting/running/full rooms and concurrent joins                                                            |
| Ten-player load        | Full lobby, uneven teams, map voting, live effects and stable frame rate on the host                                                              |
| Connection recovery    | Brief network loss, restrictive carrier/VPN, your optional TURN settings, expiry after the 15-second reservation, host leaving                    |
| Full tactical match    | Several natural rounds, side switch, final result, all-player readiness, reconfigure and restart                                                  |
| Visual/audio tuning    | Smoke boundaries, flashes, viewmodel/reload, grenade and agent effects, sound levels on real hardware                                             |
| Pages update           | Verify the new 18-weapon menu, all assets load, and every player has the same version                                                             |

Physical phone performance, iOS behavior and unrestricted internet connectivity have not been claimed as validated by the build environment.
