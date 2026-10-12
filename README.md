# ARENA FPS · Tactical

A static 3D tactical shooter for desktop and mobile, built with Three.js and PeerJS. Ten real players can join one room. All gun names, agent names, procedural models and maps are original. There are no bots. No build, database, API key or Node.js game server is required to play.

## Update your GitHub Pages game

1. Extract the ZIP and open `arena-fps/`.
2. Replace the files in your existing repository with the **contents of that folder**. Keep `index.html`, `css/`, `js/` and `vendor/` together at the publishing root. Upload every changed folder, rather than just `index.html`.
3. Commit the changes. Your existing GitHub Pages setup publishes the update. Refresh the game after the deployment finishes; use a hard refresh if an old menu remains.
4. Everyone in a room should load this version. Version 2 rooms use a separate discovery namespace from the earlier game.

For a new repository: **Settings → Pages → Deploy from a branch**, select your branch and `/ (root)`, then save. Relative asset paths work at `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

Open the game through HTTPS or a local static server. Double-clicking `index.html` through `file://` cannot load browser ES modules reliably. For local practice, run `python3 -m http.server 8080` inside `arena-fps/`, then open `http://localhost:8080/`. Node is optional, for tests only.

## Start a match

1. Enter a callsign and select **Create Room**. Share the code.
2. Friends select **Join Room**, enter the code and connect. **Quick Play** searches the small public room pool instead.
3. Everyone chooses an agent and votes for one of three maps. The map with most votes wins; ties favor the current map, then the map list order.
4. The host chooses Sabotage, Elimination, Team Deathmatch or Free For All. Choose an automatic balanced split, any populated split such as 1v3 or 2v3, or assign individuals with the team dropdowns. Ten slots total; team modes require at least one connected player on each side. Team assignments and match settings are changed in the lobby.
5. The host selects **Start Match**. Tactical modes open the buy shop. Buy equipment, then press **Deploy / Close** to enable controls. If a pause screen appears, press **Resume**.

**Solo Practice** starts an offline free-for-all sandbox with free equipment and no opponents. Open the armory to try all weapons and utility. An online room may receive late joins: tactical newcomers spectate until the next buy phase; deathmatch newcomers spawn immediately.

## Maps and modes

| Map              | Dimensions  | Layout                                                |
| ---------------- | ----------- | ----------------------------------------------------- |
| Relay Works      | 128 × 128 m | Industrial courtyards, split middle routes, two sites |
| Sundial District | 136 × 120 m | Sandstone lanes, central plaza, two sites             |
| Tideport         | 144 × 120 m | Container lanes, crossing routes, two sites           |

Each map has roughly 10 times the original 40 × 40 m arena's floor area, separate team spawn areas and cover along multiple routes. The layouts are tactical blockouts with original procedural scenery.

- **Sabotage:** 25-second buy phase, then 100 seconds to plant. Any attacker may hold Use at site A or B for three seconds while stationary. The relay detonates after 40 seconds; defenders hold Use within three metres for five seconds to defuse. Once planted, the round continues even if the attackers die. Timeout before a plant awards defenders the round. Elimination of the defenders wins for the attackers.
- **Elimination:** buy rounds and no respawns until the next round. Eliminate the opposing team; at timeout, remaining health plus armor breaks the tie. Equal totals draw.
- **Tactical match:** first to five round wins by default; the host may choose 3, 5, 7 or 9. Five seconds separate rounds. Sabotage sides switch at round five.
- **Team Deathmatch:** three-second respawns, free equipment, first team to 40 kills or the most team kills after five minutes.
- **Free For All:** three-second respawns, free equipment, first to 25 kills or the highest score after five minutes. Ties use fewer deaths, then earlier join order.
- After results, all connected players must ready up to return to the lobby. Choose a new map, teams or agents before starting again.

## Economy and equipment

Tactical players start with 800 credits, a Sidekick pistol and one flash and smoke. Credits cap at 9,000. A kill awards 200; a round win awards 3,000; losses award 1,800, then 2,300 and 2,800 with consecutive losses. Planting awards the planter 300. Team kills grant no kill or credit reward.

Buy weapons, 25-point light armor, 50-point heavy armor, and up to two of each utility item during buy phases. Surviving equipment carries over; ammunition refills between rounds. Dead players return with the starter pistol and lose purchased armor, weapons and utility. Agent charges restore each round. There are no weapon drops, refunds or ultimate systems.

| Category     | Weapons                                                    |
| ------------ | ---------------------------------------------------------- |
| Sidearms     | Sidekick, Tempest, Drift, Ironclad, Scatter pocket shotgun |
| SMGs         | Spark, Wisp                                                |
| Shotguns     | Breach, Cyclone                                            |
| Rifles       | Arbiter, Longbow, Specter, Sovereign                       |
| Snipers      | Kestrel, Twinstrike, Horizon                               |
| Machine guns | Sentinel, Thunder                                          |

Arbiter fires automatically from the hip and completes three-shot bursts while aiming down sights. Other semi-automatic weapons require releasing Fire between shots. Movement increases spread; crouching and aiming reduce it. Snipers have a stronger zoom. Ammunition, fire rates, armor and damage are validated by the host.

**Flash:** a bouncing grenade with a fuse; cover, distance and the victim's facing direction affect blindness. **Smoke:** a 12-second visual cloud that blocks vision and aim assistance while bullets pass through. **Frag:** an explosive grenade. Fire and slowing fields affect both teams; ordinary gunfire and frag damage have friendly fire disabled.

## Agents

Each of the ten agents has one signature ability, original colors and a distinct tactical role. These are simplified kits, with no four-ability loadouts or ultimates.

| Agent   | Signature                                              |
| ------- | ------------------------------------------------------ |
| Vapor   | Two throwable smoke orbs                               |
| Glint   | Two throwable flashes                                  |
| Surge   | Forward dash, stopped by solid cover                   |
| Bloom   | Heal yourself and visible nearby teammates by 50       |
| Cinder  | Throwable damaging fire field                          |
| Frost   | Throwable slowing field                                |
| Echo    | Reveal nearby enemies to your team for three seconds   |
| Bulwark | Temporary solid cover wall                             |
| Wraith  | Teleport up to nine metres along a clear forward route |
| Bastion | Destructible automated sentry                          |

## Controls and mobile layout

| Action                 | Desktop              | Mobile                               |
| ---------------------- | -------------------- | ------------------------------------ |
| Move / look            | WASD / mouse         | Left stick / drag right-side surface |
| Fire                   | Left mouse           | Hold ◎                               |
| Aim down sights        | Right mouse          | ADS toggle                           |
| Jump / sprint / crouch | Space / Shift / Ctrl | ↑ / RUN / LOW                        |
| Reload                 | R                    | R                                    |
| Primary / secondary    | 1 / 2 or wheel       | 1↔2                                  |
| Agent ability          | E                    | Agent button                         |
| Frag / flash / smoke   | G / X / C            | Corresponding utility button         |
| Plant / defuse         | Hold F               | Hold USE                             |
| Armory                 | B or BUY             | BUY                                  |
| Scoreboard             | Tab or SCORE         | SCORE                                |
| Pause                  | Escape or Ⅱ          | Ⅱ                                    |

Use landscape on phones. Movement, look and firing use separate pointers for simultaneous touches. Game surfaces disable selection, copy callouts, context menus and touch zoom. Callsign, room and settings fields remain editable.

Open **Settings → Customize touch layout**. Drag any movement or action button, select its size (65–180%) and adjust overall opacity (25–100%). Press **Save / Done**. Positions, sizes and opacity persist on that browser, adapt to the viewport and respect safe-area insets. Reset restores defaults. Keep the right-side look surface available when placing buttons.

Mobile aim assistance runs only while touching the look surface. It considers living, visible enemies within 35 metres and a five-degree cone, slows aiming up to 40%, and gently corrects aim within a smaller cone at no more than 0.9 degrees per second before the strength multiplier. Cover, smoke, teammates and blindness disable inappropriate targets. It never fires automatically. Settings include enable/strength, touch sensitivity, audio volume and graphics quality.

## Networking

The host simulates gameplay at 30 Hz and publishes snapshots at 15 Hz. Clients predict local movement, reconcile acknowledged input and interpolate remote players. Recent input is repeated, stale controls stop after 250 ms, and buffered movement/state updates are dropped instead of growing a queue. Host-measured RTT supports target hitbox rewind capped at 180 ms; cover and shooter origins stay current.

Acceptance, buys, lobby changes, objective events and other control messages use an ordered reliable connection. Movement and snapshots use a native WebRTC data channel with `ordered:false` and `maxRetransmits:0` over the accepted transport. If unavailable, an unordered PeerJS connection is attempted, then the reliable channel is used as a fallback. The PeerJS fallback does not guarantee zero retransmissions.

If a guest's connection breaks, two bounded retries attempt to restore the same authenticated seat, equipment, wallet and score. The host reserves the seat for 15 seconds. Expired seats are removed. Leaving intentionally removes the seat; reloading or manually rejoining creates a new participant. There is no host migration. Keep the host tab visible and the device awake, since browsers throttle background tabs.

The default free PeerJS signaling and ICE services must be reachable. Some NATs, carrier networks, VPNs and firewalls require a working TURN relay. **Settings → Advanced connection settings** accepts your TURN URL, username and password, and optional HTTPS PeerJS signaling settings. These are stored locally and apply to the next room. Reset returns to defaults. Supplying a TURN service is optional; its availability and credentials are outside the game. Connectivity across every network cannot be guaranteed.

Quick Play probes 16 version-2 public IDs with bounded parallel requests and a 55-second overall deadline. Waiting lobbies are preferred, then fuller rooms with space. Private rooms use separate random codes. This small static discovery pool has no region selection, ranked matchmaking or scalable backend. The host is authoritative but is not an independent anticheat service.

## Source and tests

- `catalog.js`, `maps.js`, `config.js`: guns, agents, map layouts and tuning.
- `game.js`, `player.js`, `world.js`: authoritative rounds, combat, movement and common geometry.
- `network.js`, `matchmaking.js`: room protocols, lossy snapshots and reconnects.
- `renderer.js`, `map.js`, `weapon.js`: world, arms/viewmodel, effects and synthesized audio.
- `main.js`, `ui.js`, `controls.js`, `mobileControls.js`, `aimAssist.js`, `touchLayout.js`: lifecycle and interface.
- `vendor/`: pinned Three.js and PeerJS plus their MIT licenses.

With Node 20+, run `node --test tests/*.test.js`. No dependency installation is needed for these tests. See `TESTING.md` for what was executed and the remaining physical-device checks.
