"""
Build Quest Forge card art from your own copy of the official Sword & Sorcery Companion App.

    python -m venv .venv && .venv/bin/pip install UnityPy Pillow
    .venv/bin/python scripts/extract_companion_cards.py [path/to/Sword+&+Sorcery+Companion+App_X.X_APKPure.xapk]

Writes (personal use only; never commit or share this):
    local-assets/sns-companion-cards.json   front/back art for every src/play/catalog.ts item id with a match

Card ids come straight from catalog.ts (lower-cased), so a renamed/added CAT entry just needs a rerun once
you own a copy of the art. The companion app's own assets suffix a card's back art with "_B".
"""
import base64
import io
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile

import UnityPy
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'local-assets', 'sns-companion-cards.json')
NOTICE = 'Extracted locally from your copy of the Sword & Sorcery Companion App. Do not redistribute.'


def find_xapk():
    for f in os.listdir(ROOT):
        if 'Companion' in f and f.endswith('.xapk'):
            return os.path.join(ROOT, f)
    return None


def webp(img, q=90):
    buf = io.BytesIO()
    img.convert('RGBA').save(buf, 'WEBP', quality=q, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


def load_catalog_ids():
    src = open(os.path.join(ROOT, 'src', 'play', 'catalog.ts')).read()
    m = re.search(r'export const CAT: Record<string, CatItem\[\]> = (\{.*?\})\n', src, re.S)
    cat = json.loads(m.group(1))
    return {it['id'].lower() for items in cat.values() for it in items}


def main():
    xapk = sys.argv[1] if len(sys.argv) > 1 else find_xapk()
    if not xapk or not os.path.exists(xapk):
        sys.exit('Could not find the Companion App .xapk; pass its path as an argument.')
    ids = load_catalog_ids()

    tmp = tempfile.mkdtemp(prefix='sns-companion-')
    found = {}
    try:
        with zipfile.ZipFile(xapk) as z:
            obb_name = next(n for n in z.namelist() if n.endswith('.obb'))
            obb_path = z.extract(obb_name, tmp)

        bundle_path = os.path.join(tmp, 'bundle')
        with zipfile.ZipFile(obb_path) as z:
            names = [n for n in z.namelist() if n.startswith('assets/bin/Data/') and not n.endswith('/')]
            for n in names:
                open(bundle_path, 'wb').write(z.read(n))
                try:
                    env = UnityPy.load(bundle_path)
                except Exception:
                    continue
                for o in env.objects:
                    if o.type.name != 'Texture2D':
                        continue
                    try:
                        t = o.read()
                    except Exception:
                        continue
                    if t.m_Width <= 0:
                        continue
                    back = t.m_Name.endswith('_B')
                    base = (t.m_Name[:-2] if back else t.m_Name).lower()
                    if base not in ids:
                        continue
                    key = f'card:{base}' + (':back' if back else '')
                    if key not in found:
                        found[key] = webp(t.image)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'questForgeArt': {'ui': found}, 'source': NOTICE}, open(OUT, 'w'))
    matched = {k.split(':')[1] for k in found}
    print(f'{len(found)} images ({len(matched)}/{len(ids)} catalog ids matched) -> {OUT}')


if __name__ == '__main__':
    main()
