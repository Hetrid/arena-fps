# ARENA FPS · Deathmatch (v3)

A simple first-person deathmatch game with **Play Bots**, **Create Room** and **Join Room**. Includes 18 unlocked guns, first-person arms, three maps and customizable mobile controls. Everyone is an opponent. No agents, abilities, buy rounds, economy, objectives or grenades.

## Update your GitHub Pages game

1. Extract `ARENA_FPS.zip` and open the `arena-fps/` folder.
2. Upload that folder's **contents** into your existing repository, replacing `index.html`, `css/`, `js/` and `vendor/`. The new `js/dm/` folder must be included. Keep these folders together at the repository's publishing root.
3. Commit the changes and wait for the Pages deployment to finish.
4. Refresh the game on **both devices**. The home screen should say **DEATHMATCH · v3** and have **Play Bots** as its main button. Old ten-character room codes do not connect to this version.

For a new Pages setup: Settings → Pages → Deploy from a branch → choose your branch and `/ (root)` → Save. All assets use relative paths and work under a repository subdirectory. The new module folder and versioned stylesheet avoid loading the previous tactical interface from an asset cache.

No build or package installation is needed to play. Open through HTTPS, or run `python3 -m http.server 8080` inside `arena-fps/` and open `http://localhost:8080/`. Double-clicking `index.html` through `file://` cannot reliably load browser modules. The local web server serves files; it is not a multiplayer game server.

## Play bots

Press **Play Bots** to start immediately against five bots. Open **Bot game options** before starting to choose 1–9 bots, Easy/Normal/Hard difficulty and a map.

Bots navigate around cover, hunt opponents, react and aim gradually, shoot only when there is a clear line of sight, reload and respawn. They use the same host-authoritative movement, ammunition and damage rules as humans. Solo gameplay requires no signaling service or external assets once the game is served. Pausing solo, choosing a gun or editing settings freezes the local simulation.

## Multiplayer rooms

1. One player selects **Create Room**.
2. Press **Copy Invite** and send the link to friends, or share the **six-character code**.
3. Friends select **Join Room** and paste the code or invite link, then press **Join**. Opening an invite link pre-fills the join form.
4. The host chooses a map and optionally adds bots, then presses **Start Deathmatch**.
5. Guests press **Play / Resume** to enter. On desktop, this click enables mouse pointer lock and audio.

Rooms support ten participants total. Bots can be included in multiplayer and are clearly labeled BOT. Human joins replace bot slots when the room is full; bots fill back in after humans leave, up to the host's requested count. A room with ten human seats rejects additional joins. Late joins spawn immediately.

The host can change bot count and difficulty in Settings during a match. Map changes happen in the lobby. Keep the host tab open, visible and awake. Online gameplay continues when an individual opens menus. The host controls **Play Again** after results.

## Rules and guns

First to **25 kills**, or the highest score after **five minutes**. Ties use fewer deaths, then earlier join order. Death has a three-second respawn with fresh ammunition and a brief shield that ends when firing. Your selected guns remain equipped after respawning.

Press **GUNS** or **B** to select from all 18 unlocked weapons. Equip one primary and one sidearm at any time. There are no purchases. Semi-automatic guns require releasing Fire between shots. Arbiter uses three-shot bursts while aiming down sights and automatic fire from the hip. Movement increases spread; aiming and crouching reduce it.

| Action                   | Desktop        | Mobile                       |
| ------------------------ | -------------- | ---------------------------- |
| Move / aim               | WASD / mouse   | Left stick / drag right side |
| Fire                     | Left mouse     | Hold ◎                       |
| Aim down sights          | Right mouse    | ADS toggle                   |
| Jump                     | Space          | ↑                            |
| Sprint / crouch          | Shift / Ctrl   | RUN / LOW toggles            |
| Reload                   | R              | R                            |
| Switch primary / sidearm | 1 / 2 or wheel | 1↔2                          |
| Select gun               | B or GUNS      | GUNS                         |
| Scores                   | Tab or KILLS   | KILLS                        |
| Pause / unlock           | Escape or Ⅱ    | Ⅱ                            |

Mobile supports simultaneous movement, looking and firing. Game surfaces block selection, copy callouts, context menus and touch zoom; text inputs remain editable. Landscape is recommended. Settings include graphics, volume, touch sensitivity, aim assistance and **Move / Resize Touch Buttons**. Drag controls, choose size/opacity, then Save / Done. Layouts persist on that browser. Mobile aim assistance only runs during a look gesture, respects walls and never fires automatically.

## Connection changes and troubleshooting

This version uses six-character codes and invite links, bounded handshake retries, duplicate-safe join nonces, cancellation guards, multiple STUN endpoints, signaling reconnection and a fresh peer transport when restoring a broken connection. Reconnect tokens retain the original seat, gun and score for up to 15 seconds. A deliberate leave removes the seat; reloading creates a new player. There is no host migration.

The host simulates gameplay at 30 Hz and publishes snapshots at 15 Hz. Clients predict movement and reconcile acknowledged input. A native unordered, non-retransmitting data channel carries movement/snapshots over the accepted transport; the reliable connection is used when that channel is unavailable. This avoids requiring a second PeerJS connection just to play. Inputs stop after 250 ms without fresh controls; snapshots use sequence rejection and backpressure. Shot rewind uses host-measured RTT, capped at 180 ms.

If joining fails:

- Confirm both home screens say v3, verify the code, and keep the host tab open.
- Open **Settings → Connection help → Test Room Service**. This checks reachability of the saved signaling service; it does not prove a path between devices.
- If the room service is unreachable, check the network or optional signaling server settings. A custom server accepts a hostname or full HTTP/HTTPS URL; all players must use the same service.
- If signaling works but the peer handshake times out, try another network or configure your own TURN URL, username and password in Connection help. Settings apply on the next connection and are stored locally.

A static client cannot bypass every carrier, VPN or firewall restriction. Some network combinations need a functioning TURN relay, which is not provisioned by this ZIP. See the [official PeerJS connection FAQ](https://peerjs.com/client/faq) for the distinction between signaling and relaying. The host's browser is authoritative, not an independent anticheat server.

## Source and tests

`js/dm/` contains the complete deathmatch source. `bots.js` handles the navigation grid, A* routes, perception and aiming. `game.js` owns combat and respawns; `network.js` owns rooms/recovery. Three.js and PeerJS are pinned under `vendor/` with their MIT licenses. No external script CDN is required.

With optional Node 20+, run `node --test tests/*.test.js` or `npm test`. The tests need no package installation. See `TESTING.md` for actual checks and remaining physical-device testing.
