"""Read the maintained status document; never overwrite it with stale scaffold data."""
from pathlib import Path
print((Path(__file__).resolve().parents[1] / 'docs/development-progress.md').read_text(encoding='utf-8'))
