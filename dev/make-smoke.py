# Rebuilds dev/smoke.html from index.html: the real app, with fake sign-in and made-up data.
# Run after any change to index.html:  python3 dev/make-smoke.py
from pathlib import Path
root = Path(__file__).resolve().parent.parent
s = (root / 'index.html').read_text()
s = s.replace('<script type="module" src="src/app.js"></script>',
  '<script type="importmap">{"imports":{"/src/auth.js":"/dev/fake-auth.js","/src/data.js":"/dev/fake-data.js"}}</script>\n'
  '<script type="module" src="/src/app.js"></script>')
s = s.replace('<head>', '<head>\n<!-- Smoke test only: fake sign-in and made-up data. Built by dev/make-smoke.py. -->', 1)
(root / 'dev' / 'smoke.html').write_text(s)
