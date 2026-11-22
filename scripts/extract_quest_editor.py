"""
Build Quest Forge tile and marker packs from your own copy of the Sword & Sorcery Quest Editor.

    python -m venv .venv && .venv/bin/pip install UnityPy Pillow
    .venv/bin/python scripts/extract_quest_editor.py [path/to/SwordSorceryMapEditor_Data]

Writes (personal use only; never commit or share these):
    local-assets/sns-quest-editor-tiles.json    110 tile sides: artwork, size, joints, release
    local-assets/sns-quest-editor-markers.json  marker artwork (doors, chests, spawns, events, enemy portraits)
    local-assets/sns-quest-editor-art.json      enemy cards, interface art (parchment, seals, icons...)

Tile releases come from scripts/tile-releases.json. Edit it and re-run, then re-import the pack in the app.
"""
import base64
import io
import json
import os
import re
import sys

import UnityPy
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'SwordSorceryMapEditor_Data')
OUT = os.path.join(ROOT, 'local-assets')
PX = 111  # source pixels per map square (a 222px tile section = 2 squares)
NOTICE = 'Extracted locally from your copy of the Sword & Sorcery Quest Editor. Do not redistribute.'


def parse_numbers(spec):
    nums = set()
    for part in re.split(r'[,\s]+', spec or ''):
        if not part:
            continue
        a, _, b = part.partition('-')
        nums.update(range(int(a), int(b or a) + 1))
    return nums


def load_releases():
    cfg = json.load(open(os.path.join(ROOT, 'scripts', 'tile-releases.json')))
    by_num = {}
    for rel, spec in cfg.items():
        if rel.startswith('_'):
            continue
        for n in parse_numbers(spec):
            if n in by_num and by_num[n] != rel:
                sys.exit(f'tile {n} is listed under both {by_num[n]} and {rel}')
            by_num[n] = rel
    return by_num


def webp(img, q=90):
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=q, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


def script_name(obj):
    try:
        return obj.read(check_read=False).m_Script.read().m_ClassName
    except Exception:
        return None


def extract_tiles(releases):
    env = UnityPy.load(SRC)
    tiles = []
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour' or script_name(obj) != 'PuzzleRoom':
            continue
        go = obj.read(check_read=False).m_GameObject.read()
        tr = sr = None
        for c in go.m_Component:
            o = c.component.deref()
            if o.type.name == 'Transform':
                tr = o.read()
            elif o.type.name == 'SpriteRenderer':
                sr = o.read()
        sprite = sr.m_Sprite.read()
        ppu = sprite.m_PixelsToUnits
        img = sprite.image
        # joint positions: Unity units, y up, relative to the sprite centre -> map squares, y down
        joints = []
        for ch in tr.m_Children:
            p = ch.read().m_LocalPosition
            joints.append([round(p.x * ppu / PX, 3), round(-p.y * ppu / PX, 3)])
        name = go.m_Name.replace('room_', '')
        num = int(re.match(r'\d+', name).group())
        tile = dict(id='qe-' + name, name=name, cols=round(img.width / PX, 3), rows=round(img.height / PX, 3),
                    group=f'qe-{num}', joints=joints, image=webp(img))
        if num in releases:
            tile['release'] = releases[num]
        tiles.append(tile)
    tiles.sort(key=lambda t: (int(re.match(r'\d+', t['name']).group()), t['name']))
    return tiles


MARKER_KINDS = [('begin', 'hero'), ('chest', 'chest'), ('door', 'door'), ('magic_lock', 'door'), ('magic_key', 'key'),
                ('spawn', 'enemy'), ('story_event', 'event'), ('waypoint', 'objective'), ('altar', 'altar'),
                ('loc-', 'label'), ('barrels', 'pillar'), ('rock', 'pillar'), ('marble', 'pillar'), ('wood', 'pillar')]


def extract_markers():
    src = os.path.join(SRC, 'StreamingAssets', 'PlaceablesGfx')
    out = []
    for f in sorted(os.listdir(src)):
        if not f.endswith('.png'):
            continue
        stem = f[:-4]
        img = Image.open(os.path.join(src, f))
        img.load()
        img = img.convert('RGBA')
        kind = next((k for p, k in MARKER_KINDS if p in stem.lower()), 'marker')
        name = re.sub(r'\boff\b', '(inactive)', stem.replace('_', ' ').replace('-', ' '))
        out.append(dict(id='qe-m-' + stem, name=name[:1].upper() + name[1:], kind=kind,
                        w=round(img.width / PX, 3), h=round(img.height / PX, 3), image=webp(img, 92)))
    return out


UI_ART = ['bkg', 'bkg_Pergamena', 'bkg_Suede', 'bkg_Wood', 'bkg_Tabs', 'Soul_Law', 'Soul_Chaos', 'Soul_Neutral',
          'Wax_R', 'Wax_G', 'Wax_B', 'Wax_P', 'ico_BasicInfos', 'ico_Deck', 'ico_QuestEndings', 'ico_SpecialRules',
          'ico_StoryEndings', 'ico_StoryEvents', 'ico_MapEditor', 'champion', 'enemies', 'quest']

# round enemy portraits -> enemy card base name
PORTRAITS = {'orc': 'OrcWarrior', 'skeleton': 'skeleton', 'troll': 'Troll', 'aracnos': 'aracnos', 'efreet': 'efreet',
             'nightwalker': 'nightwalker', 'succubus': 'succubus', 'diggers': 'diggers', 'flyingcritter': 'flyingcritter',
             'spinecritter': 'spinecritter', 'crimsonnightmare': 'crimsonnightmare', 'drakonian': 'Drakonian',
             'xenobeast': 'XenoBeast', 'wormoon': 'Wormoon', 'hellspawn': 'Hellspawn', 'undeadlord': 'UndeadLord',
             'countdalv': 'CountDalv', 'orc_king': 'OrcKing', 'gremlin_pack': 'GremlinsPack', 'gremlin_r': 'Gremlin',
             'raider_r': 'Raider', 'deathknightred': 'DeathKnight', 'shaman_r': 'Orc_Shaman', 'werewolfred': 'Werewolf',
             'queen': 'AlienQueen', 'demonologist_R': 'DemonicCultist', 'hydra': None}


def enemy_name(base):
    base = base.replace('_', ' ')
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', base).title().replace('Orc Shaman', 'Orc Shaman')


def extract_art():
    """UI art, enemy cards and portraits"""
    env = UnityPy.load(SRC)
    textures = {}
    for obj in env.objects:
        if obj.type.name == 'Texture2D':
            t = obj.read()
            if t.m_Width > 0 and t.m_Name not in textures:
                textures[t.m_Name] = t
    ui = {n: webp(textures[n].image, 88) for n in UI_ART if n in textures}
    # enemy cards: StreamingAssets/Cards/<Base>_<G|B|R|P>.png
    cards_dir = os.path.join(SRC, 'StreamingAssets', 'Cards')
    enemies = {}
    for f in sorted(os.listdir(cards_dir)):
        m = re.match(r'(.+)_([GBRP])\.png$', f)
        if not m:
            continue
        base, rank = m.groups()
        img = Image.open(os.path.join(cards_dir, f))
        img.load()
        e = enemies.setdefault(base.lower(), dict(id=base.lower(), name=enemy_name(base), ranks={}, portrait=None))
        e['ranks'][rank] = webp(img.convert('RGBA'), 85)
    portraits = []
    for pname, base in PORTRAITS.items():
        if pname not in textures:
            continue
        data = webp(textures[pname].image, 88)
        if base and base.lower() in enemies:
            enemies[base.lower()]['portrait'] = data
        portraits.append(dict(id='qe-p-' + pname, name=(enemies[base.lower()]['name'] if base and base.lower() in enemies else pname.replace('_', ' ').title()),
                              kind='enemy', w=1.0, h=1.0, image=data))
    return ui, sorted(enemies.values(), key=lambda e: e['name']), portraits


def main():
    os.makedirs(OUT, exist_ok=True)
    releases = load_releases()
    tiles = extract_tiles(releases)
    json.dump({'questForgeTiles': tiles, 'source': NOTICE}, open(os.path.join(OUT, 'sns-quest-editor-tiles.json'), 'w'))
    markers = extract_markers()
    ui, enemies, portraits = extract_art()
    json.dump({'questForgeTokens': markers + portraits, 'source': NOTICE}, open(os.path.join(OUT, 'sns-quest-editor-markers.json'), 'w'))
    json.dump({'questForgeArt': {'ui': ui, 'enemies': enemies}, 'source': NOTICE}, open(os.path.join(OUT, 'sns-quest-editor-art.json'), 'w'))
    print(f'{len(ui)} UI images, {len(enemies)} enemies, {len(portraits)} portraits')
    counts = {}
    for t in tiles:
        counts[t.get('release', '(none)')] = counts.get(t.get('release', '(none)'), 0) + 1
    print(f'{len(tiles)} tile sides, {len(markers)} markers -> {OUT}')
    print('tile sides per release:', counts)


if __name__ == '__main__':
    main()
