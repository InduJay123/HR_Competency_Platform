"""Create local secrets once. Never prints credentials or overwrites configuration."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
target = root / '.env'
if target.exists():
    raise SystemExit('.env already exists; preserved.')
password = secrets.token_hex(24)
text = (root / '.env.example').read_text()
text = text.replace('replace-with-random-secret-at-least-50-characters', secrets.token_hex(40))
text = text.replace('replace-with-random-local-password', password)
target.write_text(text)
print('Created local .env. Values are not displayed.')
