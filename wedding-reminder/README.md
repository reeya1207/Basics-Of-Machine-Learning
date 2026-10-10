# #Reet_Ka_IshQ — Wedding Reminder Video

A creative ~34 second “1 month to go” wedding reminder for **Reet & IshQ**.

- **Venue:** Mahabaleshwar  
- **Date:** 4 December 2026  
- **Story:** Patrika open → December calendar (1→4) → Ghibli-style couple → America flight → cars into the hills → Indian wedding shopping → venue finale  
- **Style:** Full-bleed illustrations with short taglines (no side text boxes), snappy crossfades  


## Preview

```bash
cd wedding-reminder
npm install
npm start
```

- Live animation: `/public/index.html` (Desktop / Mobile toggle in the control bar)
- Watch page (auto-picks format): `/public/watch.html`

On phones the player switches to **9:16**; on desktops it uses **16:9**.

## Render MP4s

```bash
npm run render            # both desktop + mobile
npm run render:desktop    # 1920×1080 only
npm run render:mobile     # 1080×1920 only
```

Outputs:
- `output/reet-ka-ishq-desktop.mp4` — 16:9 desktop / YouTube / WhatsApp landscape  
- `output/reet-ka-ishq-mobile.mp4` — 9:16 Stories / Reels / WhatsApp status  
- copies also in `public/videos/` for the watch page

## Assets

- `public/assets/logo.jpg` — wedding monogram `#Reet_Ka_IshQ`
- Ghibli-inspired couple illustrations (from the couple photos you provided)
- Story scenes: plane, cars, shopping, Mahabaleshwar venue
