# THE MAGNIFICENT SEVEN

Cinematic cyber-western team portfolio for seven elite cybersecurity operators.

## Run locally

```powershell
npm.cmd run dev
```

Then open the printed local URL.

The site also runs by opening `index.html` directly in a browser.

## Check

```powershell
npm.cmd run check
npm.cmd run smoke
```

The static check validates the required page structure, profile wiring, sound controls, fallback images, and project metadata. The smoke check launches a local Chrome/Edge headless session and verifies the visible hero, sound toggle, profile takeover, next profile control, ESC close, and mobile overflow.

## Customize

Replace these tokens in `index.html`:

- `[MEMBER_1_NAME]` through `[MEMBER_7_NAME]`
- `[MEMBER_1_PHOTO]` through `[MEMBER_7_PHOTO]`
- `[TEAM_EMAIL]`
- `[TEAM_LINKEDIN]`
- `[TEAM_GITHUB]`
- `[TEAM_TAGLINE]`

If member photo tokens are not replaced, the page uses cinematic western fallback imagery.

## Notes

- No React/Vue/framework runtime.
- No build step required.
- Uses modern browser APIs when available: Web Audio, View Transitions, Intersection Observer, Canvas.
- Uses a local generated cinematic western background at `assets/endless-road-cowboy.png`, so the main atmosphere is not dependent on external image hosts.
- Includes a playable Canvas duel game with HP, stamina, ammo, weapon switching, reloading, AI opponent behavior, particles, and a local arena background at `assets/duel-arena.png`.
- Respects `prefers-reduced-motion`.
