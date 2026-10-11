# Verification record

## Executed in the build environment

- 18 automated Node tests pass: 11 simulation tests and 7 room-protocol tests.
- Simulation: acceleration/deceleration, diagonal normalization, cover/outer-wall collisions, bullet occlusion, jump/landing/no double-jump, clear spawns, hard map bounds above walls, input validation and per-tick movement limits, stale controls, body damage, magazine consumption, firing limits, kills/deaths/respawn, two-second reload, timer, 15-kill victory, deterministic ties, late joins, synchronized rematch, and aim-assist limits/occlusion/range.
- Protocols with an **in-memory transport double**: private room codes/handshake, fast-lane inputs, shared combat events/snapshots, ping round trips, removal on disconnect, full-room rejection, unavailable host rejection, host-disconnect notification, Quick Play create/discover/join, waiting-room preference, private/public namespace separation, cancellation, and occupied-slot retries.
- Additional DOM-harness checks passed for main-module initialization, Solo Practice, fixed-tick lifecycle, HUD, pause/resume, settings, scoreboard and leaving. A second check exercised independent movement/aim/fire pointer IDs, simultaneous jump/reload/sprint samples and pointer cancellation. The real Three.js scene/model construction ran with a WebGL renderer stub; pointer lock and viewport geometry were also stubbed. These do not validate GPU rendering or physical gestures.
- JavaScript syntax, local module imports, HTML element references, and GitHub Pages subdirectory asset paths checked.
- Pinned library files and their MIT licenses included; deployment needs no third-party script CDN requests.

## Browser/device checks still required

A Chromium download was attempted but the environment returned a small HTML response instead of the browser archive. A real browser could not be launched here. The following are **not claimed as executed**:

| Scenario                    | How to verify                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Game loads and draws        | Open the deployed HTTPS URL; inspect browser console for errors.                                                               |
| Solo movement               | Choose Solo Practice; verify WASD/touch movement, jump, sprint and cover collision.                                            |
| Desktop pointer lock        | Click Resume; move mouse, press Escape, then resume.                                                                           |
| Mobile multitouch           | Hold left stick, drag right-side aim and hold Fire simultaneously. Test touch cancellation, safe areas and portrait/landscape. |
| Live private rooms          | Use two devices as described in README. Test invalid codes, six participants, and a seventh join.                              |
| Visible movement and combat | Watch remote movement and firing; compare ammo, health, hitmarkers, kills and respawn on both devices.                         |
| Live public discovery       | First device Quick Play creates; second joins it. Repeat with waiting, running and full public rooms.                          |
| Late join                   | Join after the host starts; confirm timer, scores and existing players synchronize.                                            |
| Disconnects                 | Close guest tab, then host tab. Confirm cleanup and menu error. Try a network change and rejoin.                               |
| End and rematch             | Finish by 15 kills or timer; compare winner/ranking, then ready every participant.                                             |
| Touch aim assist            | Aim near a visible enemy at short range; repeat behind cover, beyond 25 m, with assist disabled, and with desktop mouse.       |
| Performance                 | Try Low/Medium/High on physical devices; check readable controls and stable frame rate.                                        |
| Deployment subdirectory     | Open `/<repository>/` and confirm all modules/vendor files return 200.                                                         |

No claim is made that real two-device PeerJS connections, physical mobile gestures, pointer locking, visual appearance or frame rate have been validated in this environment.
