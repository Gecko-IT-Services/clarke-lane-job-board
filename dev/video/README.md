# Help video

`help/walkthrough.mp4` is made from the smoke page (made-up customers only), so it can be remade whenever the screens change:

1. In the repo: `python3 dev/make-smoke.py` and `python3 -m http.server 8080`
2. In `dev/video`: `node walk.mjs` (16 screenshots + captions), then `node make-video.mjs`
3. Copy `walkthrough.mp4` to `help/walkthrough.mp4` (and a title frame to `help/walkthrough.jpg`)

Needs Google Chrome installed. Captions live in `walk.mjs`.
