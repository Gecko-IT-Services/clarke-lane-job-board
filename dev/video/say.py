# Help video, narration: speaks narration.json with the Mac's British "Daniel" voice into audio/nNN.aiff
# and writes audio/durations.json (make-video.mjs holds each step for its voice-over). Free and offline.
import json, re, subprocess, os
os.makedirs('audio', exist_ok=True)
lines = json.load(open('narration.json'))
durs = []
for i, t in enumerate(lines):
    f = f'audio/n{i:02d}.aiff'
    subprocess.run(['say', '-v', 'Daniel', '-r', '172', '-o', f, t], check=True)
    out = subprocess.run(['afinfo', f], capture_output=True, text=True).stdout
    durs.append(round(float(re.search(r'estimated duration: ([\d.]+)', out).group(1)), 2))
json.dump(durs, open('audio/durations.json', 'w'))
print(durs, round(sum(durs)), 'seconds of narration')
