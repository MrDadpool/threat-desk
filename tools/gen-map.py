#!/usr/bin/env python3
"""Regenerate the world outline and country centroids inlined in threat-desk.html.

    curl -Lo ne110.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
    python3 tools/gen-map.py       # writes geo.js next to the cwd

Paste geo.js over the `const MAPW=… / LAND / CENT / CNAME` block in
threat-desk.html. Natural Earth 110m is public domain. EPS and MIN_AREA trade
detail for bytes; the block is ~24 KB as configured, and the page inlines it so
there is no CDN and no network request for geometry.
"""
import json, math

W, H = 720, 360
def proj(lon, lat):
    return ((lon + 180.0) * 2.0, (90.0 - lat) * 2.0)

def rdp(pts, eps):
    if len(pts) < 3: return pts
    dmax, idx = 0.0, 0
    (x1,y1),(x2,y2) = pts[0], pts[-1]
    dx, dy = x2-x1, y2-y1
    den = math.hypot(dx, dy)
    for i in range(1, len(pts)-1):
        x, y = pts[i]
        d = abs(dy*x - dx*y + x2*y1 - y2*x1)/den if den else math.hypot(x-x1, y-y1)
        if d > dmax: dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx+1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]

def ring_area(ring):
    a = 0.0
    for i in range(len(ring)-1):
        x1,y1 = ring[i]; x2,y2 = ring[i+1]
        a += x1*y2 - x2*y1
    return a/2.0

def ring_centroid(ring):
    a = ring_area(ring)
    if abs(a) < 1e-12:
        return (sum(p[0] for p in ring)/len(ring), sum(p[1] for p in ring)/len(ring))
    cx = cy = 0.0
    for i in range(len(ring)-1):
        x1,y1 = ring[i]; x2,y2 = ring[i+1]
        f = x1*y2 - x2*y1
        cx += (x1+x2)*f; cy += (y1+y2)*f
    return (cx/(6*a), cy/(6*a))

EPS = 1.5          # simplification tolerance, in projected units (px)
MIN_AREA = 4.0      # drop islands smaller than this, in px^2

feats = json.load(open('ne110.geojson'))['features']
paths, cents, names = [], {}, {}

for f in feats:
    p = f['properties']
    cc = p.get('ISO_A2')
    if not cc or cc == '-99':
        cc = p.get('ISO_A2_EH')
    if not cc or cc == '-99':
        cc = None
    g = f['geometry']
    if not g: continue
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    best = None
    for poly in polys:
        outer = [proj(*c[:2]) for c in poly[0]]
        if outer[0] != outer[-1]: outer.append(outer[0])
        area = abs(ring_area(outer))
        if best is None or area > best[0]:
            best = (area, ring_centroid(outer))
        if area < MIN_AREA: continue
        s = rdp(outer, EPS)
        if len(s) < 4: continue
        paths.append('M' + 'L'.join(f'{x:.0f} {y:.0f}' for x, y in s[:-1]) + 'Z')
    if cc and best:
        cx, cy = best[1]
        cents[cc] = [round(cx, 1), round(cy, 1)]
        names[cc] = p.get('NAME') or cc

# Natural Earth 110m has no polygons for these; DShield reports them (SG and HK are
# top-15 sources). Capital/centre lon,lat with the display name.
EXTRA = {
 "AD":(1.52,42.51,"Andorra"),"AG":(-61.80,17.06,"Antigua and Barbuda"),
 "AI":(-63.06,18.22,"Anguilla"),"AS":(-170.70,-14.30,"American Samoa"),
 "AW":(-69.97,12.52,"Aruba"),"AX":(19.95,60.18,"Aland Islands"),
 "BB":(-59.55,13.19,"Barbados"),"BH":(50.55,26.07,"Bahrain"),
 "BL":(-62.83,17.90,"Saint Barthelemy"),"BM":(-64.75,32.32,"Bermuda"),
 "BQ":(-68.26,12.18,"Caribbean Netherlands"),"CK":(-159.78,-21.24,"Cook Islands"),
 "CV":(-23.51,14.93,"Cabo Verde"),"CW":(-68.99,12.17,"Curacao"),
 "DM":(-61.37,15.41,"Dominica"),"FM":(158.16,6.92,"Micronesia"),
 "FO":(-6.91,62.01,"Faroe Islands"),"GD":(-61.68,12.06,"Grenada"),
 "GF":(-53.13,3.93,"French Guiana"),"GG":(-2.54,49.45,"Guernsey"),
 "GI":(-5.35,36.14,"Gibraltar"),"GP":(-61.55,16.25,"Guadeloupe"),
 "GU":(144.79,13.44,"Guam"),"HK":(114.17,22.32,"Hong Kong"),
 "IM":(-4.55,54.24,"Isle of Man"),"JE":(-2.11,49.21,"Jersey"),
 "KI":(172.98,1.87,"Kiribati"),"KM":(43.33,-11.65,"Comoros"),
 "KN":(-62.73,17.34,"Saint Kitts and Nevis"),"KY":(-81.38,19.31,"Cayman Islands"),
 "LC":(-60.98,13.91,"Saint Lucia"),"LI":(9.55,47.17,"Liechtenstein"),
 "MC":(7.42,43.74,"Monaco"),"MF":(-63.08,18.08,"Saint Martin"),
 "MH":(171.18,7.11,"Marshall Islands"),"MO":(113.55,22.20,"Macao"),
 "MP":(145.75,15.18,"Northern Mariana Islands"),"MQ":(-61.02,14.64,"Martinique"),
 "MT":(14.51,35.90,"Malta"),"MU":(57.55,-20.35,"Mauritius"),
 "MV":(73.51,4.18,"Maldives"),"NR":(166.93,-0.52,"Nauru"),
 "PF":(-149.57,-17.68,"French Polynesia"),"PM":(-56.33,46.94,"Saint Pierre and Miquelon"),
 "RE":(55.54,-21.12,"Reunion"),"SC":(55.49,-4.68,"Seychelles"),
 "SG":(103.82,1.35,"Singapore"),"SH":(-5.72,-15.96,"Saint Helena"),
 "SM":(12.46,43.94,"San Marino"),"ST":(6.61,0.19,"Sao Tome and Principe"),
 "SX":(-63.05,18.03,"Sint Maarten"),"TC":(-71.80,21.69,"Turks and Caicos Islands"),
 "TO":(-175.20,-21.18,"Tonga"),"TW":(120.96,23.70,"Taiwan"),
 "VC":(-61.23,13.25,"Saint Vincent and the Grenadines"),
 "VG":(-64.62,18.42,"British Virgin Islands"),"VI":(-64.90,18.34,"U.S. Virgin Islands"),
 "WS":(-172.10,-13.76,"Samoa"),"YT":(45.17,-12.83,"Mayotte"),
 "XK":(20.90,42.60,"Kosovo"),
}

# Antarctica's area centroid sits at ~80S, below the frame. DShield does report AQ
# (rank ~212, one source), and the networks there are the peninsula research
# stations, so plot it at Rothera rather than let it fall off the map.
OVERRIDE = {"AQ": (-64.0, -65.0)}
for cc,(lon,lat) in OVERRIDE.items():
    if cc in cents:
        cents[cc] = [round(v,1) for v in proj(lon,lat)]

for cc,(lon,lat,nm) in EXTRA.items():
    if cc in cents: continue
    x,y = proj(lon,lat)
    cents[cc] = [round(x,1), round(y,1)]
    names[cc] = nm

land = ''.join(paths)
out = ('const MAPW=%d,MAPH=%d;\nconst LAND="%s";\nconst CENT=%s;\nconst CNAME=%s;\n'
       % (W, H, land, json.dumps(cents, separators=(',', ':')),
          json.dumps(names, separators=(',', ':'), ensure_ascii=True)))
open('geo.js', 'w').write(out)
print('rings', len(paths), 'path bytes', len(land), 'centroids', len(cents), 'total KB', round(len(out)/1024, 1))
