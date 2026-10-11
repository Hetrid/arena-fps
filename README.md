# ARENA FPS

A static, procedural 3D free-for-all shooter for PC and mobile. Includes the full source, pinned Three.js and PeerJS runtimes, and their MIT licenses. No bundler, database, paid service, API key, or Node.js game server is required. Actual online opponents connect over WebRTC; Solo Practice has no simulated opponents.

## Deploy to GitHub Pages

1. Extract the ZIP. Upload the **contents of `arena-fps/`** to your repository. `index.html`, `css/`, `js/`, and `vendor/` must sit together at the publishing root.
2. In the repository, open **Settings → Pages**. Choose **Deploy from a branch**, select your branch and `/ (root)`, and save.
3. Open `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/` once deployment finishes. All assets use relative paths and work under that repository subdirectory.

Use HTTPS in production. Do not open `index.html` through `file://`; browser module restrictions prevent loading. For local practice you can serve the directory with any static web server, for example `python3 -m http.server 8080` from `arena-fps/`. This is a development file server, not a game server. No build or package installation is needed to play.

## Play with two devices

1. Open the same deployed game on two devices. Enter distinct callsigns.
2. On the first device select **Create Room** and copy the 10-character code.
3. On the second select **Join Room**, paste the code, and connect.
4. The host presses **Start Match**. Each guest presses **Resume** to enter the arena; on PC that click grants mouse pointer lock and audio access.
5. Move, fire, reload, and verify health, scores, death and the three-second respawn agree. The host can start alone for practice while waiting; guests can join a running match.

For public matches, both players choose **Quick Play**. The first becomes host if no reachable room has space. The next discovers and joins that host. Public rooms still use the host's **Start Match** button. No bots or fake online players are used.

Keep the host's tab visible and device awake during a match. A backgrounded browser can throttle simulation. If connecting fails, try both devices on ordinary home Wi-Fi, then another network. Some school/corporate networks, VPNs and mobile carriers restrict WebRTC. The game uses PeerJS's default public signalling and ICE configuration; it cannot guarantee connectivity across every NAT/firewall.

## Controls

| Action               | Desktop           | Mobile                 |
| -------------------- | ----------------- | ---------------------- |
| Move                 | WASD              | Left stick             |
| Aim                  | Mouse             | Drag on the right side |
| Fire                 | Hold left mouse   | Hold ◎                 |
| Jump                 | Space             | ↑                      |
| Sprint               | Hold Shift        | Sprint toggle          |
| Reload               | R                 | R                      |
| Scores               | Hold Tab or SCORE | SCORE                  |
| Pause / unlock mouse | Escape or Ⅱ       | Ⅱ                      |

Landscape is recommended for touch. Movement, aim dragging and fire use separate pointer captures and support simultaneous touches. Rotate guidance does not request orientation lock. Settings include touch sensitivity, aim-assist enable/strength, audio volume, and Low/Medium/High/Automatic graphics. Aim assistance runs **only during touch aim gestures**: visible targets inside 25 m and a 4° cone, gradual slowdown up to 40%, and a combined angular correction capped at 0.65°/second before the strength multiplier. It never fires or changes damage. Release the aim gesture to stop magnetism.

## Rules

- Six participants maximum. Free-for-all. Five minutes, or first to 15 kills.
- Rifle: 30 rounds, 25 body damage, 1.5× head damage, 600 RPM, two-second reload.
- Three-second respawn. One second of spawn protection, removed when shooting.
- Spawn selection favors distance and blocked enemy sightlines among eight clear spawn points.
- Ties: highest kills, then fewest deaths, then earliest room join order. This gives a deterministic single winner, including a round with no kills.
- After results, **all connected participants** must ready up to rematch. A participant can withdraw readiness or leave.

## Networking and practical limits

`game.js` is the authoritative 30 Hz simulation. Every participant, including the host, uses the same fixed movement step, ammunition, fire-rate and damage rules. Clients send sequenced controls, never damage or scores. Snapshots arrive at 15 Hz. Local movement is predicted and replayed after the host acknowledges inputs; visible correction is smoothed. Remote characters use about 100 ms of snapshot interpolation. Old snapshot sequence numbers are ignored. Input batches repeat the latest ten inputs so dropped application updates can recover; stale controls stop after 300 ms.

Control messages, acceptance, start/finish, hits and kills use an ordered reliable PeerJS connection. A separate `reliable:false` PeerJS connection carries movement and snapshots with unordered delivery, sequence rejection and buffer backpressure. **PeerJS 1.5.5 maps that option to unordered channels; it does not set `maxRetransmits:0`.** These are not guaranteed lossy UDP channels, and underlying retransmission may still increase latency. If the fast connection is unavailable, updates fall back to the control connection. The host estimates RTT with its own ping nonces; basic shot rewind uses half that estimate, capped at 150 ms, for target hitboxes. Shooter origins and cover remain current. This is bounded compensation, not a complete competitive rewind system.

Host authority prevents guests from directly awarding health damage, ammunition or kills. A malicious host can still change its own JavaScript. There is no independent anticheat authority. The host also has lower latency; prediction and compensation reduce but do not erase that advantage.

### Static public discovery

`matchmaking.js` is separate from game logic and can later be replaced by a service. Version 1 probes twelve predefined IDs (`arena-fps-v1-world-0` through `-11`) using at most three concurrent attempts and a 1.8-second timeout per probe. It prefers waiting lobbies over running matches, then prefers fuller rooms with space. If none qualify it tries to claim a slot; PeerJS's ID ownership detects collisions. Two bounded search/claim rounds handle races, with a 45-second overall deadline and cancellation. Full rooms reject a handshake atomically. Private room IDs use a separate namespace and a cryptographically generated 50-bit room code.

This is a small shared discovery pool, not a scalable global matchmaking backend. All copies using the same prefix share twelve public rooms, with no region or skill filtering. Public IDs are predictable: someone can occupy slots or probe them. Stale IDs, slow networks and simultaneous searchers can produce temporary separate rooms or miss a reachable host. A full pool asks the player to retry or use private rooms. A friend group may change `publicPrefix` in `js/config.js` for its own pool; every participant must use the same value.

The free PeerJS signalling service must be reachable and may have availability/rate limits. Existing peer connections can survive a temporary signalling outage; the code attempts signalling reconnection. Broken guest connections are removed, and unresponsive guests expire after twelve seconds. If the host leaves or stops responding, clients return to the menu with an error. Rejoin using the same private code when the host is still available; rejoining creates a new participant and score. There is no automatic host migration or automatic score-preserving reconnect.

## Files

- `js/main.js`: lifecycle, fixed timing, prediction and reconciliation.
- `js/game.js`, `player.js`, `world.js`: host rules, movement, common geometry and raycasts.
- `js/network.js`, `matchmaking.js`: private/public room protocols and connection cleanup.
- `js/renderer.js`, `map.js`, `weapon.js`: Three.js scene, character animation, rifle, pooled tracers and synthesized audio.
- `js/controls.js`, `mobileControls.js`, `aimAssist.js`: input and touch assistance.
- `js/ui.js`, `config.js`, `css/style.css`: menus, HUD and centralized tuning.
- `tests/`: dependency-free Node tests of simulation and protocols. Node is optional for tests only.

## Verification

See `TESTING.md` for executed checks and the remaining browser/device checklist. To rerun automated tests with Node 20+ from this folder:

```sh
node --test tests/*.test.js
```

The protocol tests use an explicitly labeled in-memory PeerJS transport double. They exercise the actual networking/game/matchmaking modules but do not establish real WebRTC or prove internet connectivity.
