# Help video

`help/walkthrough.mp4` is made from the smoke page (made-up customers only) with a spoken voice-over, so it can be
remade whenever the screens change:

1. In the repo: `python3 dev/make-smoke.py` and `python3 -m http.server 8080`
2. In `dev/video`:
   - `node walk.mjs`: 22 screenshots and their on-screen captions (frames.json)
   - `python3 say.py`: speaks `narration.json` (the first line is the title card) with the Mac's "Daniel" voice
   - `node make-video.mjs`: the captioned video, each step held as long as its voice-over (walkthrough.mp4, timeline.json)
   - `swift add-voice.swift`: lays the voice over the video (walkthrough-voice.mp4)
3. Copy `walkthrough-voice.mp4` to `help/walkthrough.mp4` (and a title frame to `help/walkthrough.jpg`)

Needs a Mac with Google Chrome. Captions live in `walk.mjs`, the spoken words in `narration.json`.
