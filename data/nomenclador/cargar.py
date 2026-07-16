# -*- coding: utf-8 -*-
"""
Carga las 210 fichas extraidas del Nomenclador a Supabase.

    python data/nomenclador/cargar.py --dry     # simula, no escribe
    python data/nomenclador/cargar.py           # carga de verdad

Lee las credenciales de .env.local (nunca las imprime). Requiere que este
aplicada la migracion 0006.

Reanudable: la clave es (documento, pagina PDF) de source_references, que
identifica la ficha de origen. No se usa internal_code porque lo genera la base
en el momento de insertar, asi que nunca coincidiria con lo ya cargado.

Que hace:
  1. Canoniza competencias / riesgos / responsabilidades / conocimientos y
     puebla los catalogos, reusando las entradas que ya existen.
  2. Por cada ficha: genera internal_code, inserta positions + position_versions
     (v1, historica, vigente), las 4 puentes con su raw_text, y la referencia
     documental con pagina impresa, pagina PDF y evidencia.
"""
import difflib, json, re, sys, time, unicodedata, urllib.error, urllib.request
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DRY = "--dry" in sys.argv

# --- credenciales -------------------------------------------------------------
cfg = {}
for line in (RAIZ / ".env.local").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip().strip('"').strip("'")
URL = cfg["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = cfg["SUPABASE_SERVICE_ROLE_KEY"]


def api(metodo, path, body=None, prefer=None):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=metodo)
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    data = json.dumps(body).encode() if body is not None else None
    # Solo se reintenta GET. Un POST no es idempotente: si la escritura entro y
    # se perdio la respuesta, el reintento duplica (o choca contra la constraint
    # unica, que fue lo que paso con position_version_knowledge en la 1a corrida).
    intentos = 3 if metodo == "GET" else 1
    for intento in range(intentos):
        try:
            with urllib.request.urlopen(req, data, timeout=90) as r:
                txt = r.read().decode()
                return json.loads(txt) if txt.strip() else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{metodo} {path[:60]} -> {e.code}: {e.read().decode()[:300]}")
        except Exception:
            if intento == intentos - 1:
                raise
            time.sleep(2)


def canon(s):
    """Clave canonica: minusculas, sin tildes, sin puntuacion final, un espacio."""
    s = (s or "").strip().rstrip(".-–;,").strip()
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def slug(s, usados):
    b = re.sub(r"[^a-z0-9]+", "-", canon(s)).strip("-")[:56] or "item"
    c, n = b, 2
    while c in usados:
        c = f"{b[:52]}-{n}"
        n += 1
    usados.add(c)
    return c


# Sinonimos y rangos invertidos del nivel de riesgo -> code del catalogo.
# El literal impreso se preserva aparte en position_versions.risk_level_raw.
RIESGO = {
    "bajo": "BAJO", "moderado": "MODERADO", "medio": "MEDIO", "alto": "ALTO",
    "escaso": "ESCASO", "severo": "SEVERO",
    "moderado a alto": "MOD_ALTO",
    "bajo a moderado": "BAJO_MOD",
    "de bajo a moderado": "BAJO_MOD",   # mismo rango, otra redaccion
    "moderado a bajo": "BAJO_MOD",      # mismo rango, invertido
}

# Las 6 fichas que imprimen "Antiguedad y Experiencia", transcritas a mano desde
# el texto de dudas. Es una lista explicita a proposito: extraerlo con regex del
# texto libre daba falsos positivos (notas que dicen que el campo NO esta) y
# arrastraba el rotulo y los comentarios del transcriptor. Son 6, se listan.
ANTIGUEDAD = {
    "p1-082": "3 años como Jefe de Sección.",
    "p1-104": "3 años en la administración.",
    "p2-019": "Conviene desempeño anterior en Habilitación.",
    "p2-060": "2 años en la administración municipal.",
    "p2-061": "2 años en la administración municipal.",
    "p2-062": "2 años en la administración municipal.",
}

fichas = json.loads((RAIZ / "data/nomenclador/fichas.json").read_text(encoding="utf-8"))
print(f"fichas a cargar: {len(fichas)}" + ("  [DRY RUN]" if DRY else ""))

# --- catalogos existentes -----------------------------------------------------
def traer(tabla, campos="id,code,name"):
    return api("GET", f"{tabla}?select={campos}&limit=2000")

grp = {canon(r["name"]): r["id"] for r in traer("groupings")}
grp_code = {r["id"]: r["code"] for r in traer("groupings")}
lvl = {(r["grouping_id"], r["code"]): r["id"] for r in traer("levels", "id,code,grouping_id")}
area = {canon(r["name"]): r["id"] for r in traer("technical_areas")}
risk = {r["code"]: r["id"] for r in traer("risk_levels")}
docs = {r["code"]: r["id"] for r in traer("source_documents", "id,code,title")}

CATS = {
    "competencias": ("competencies", "position_version_competencies", "competency_id"),
    "riesgos_trabajo": ("risks", "position_version_risks", "risk_id"),
    "responsabilidad_sobre": ("responsibilities", "position_version_responsibilities", "responsibility_id"),
    "otros_conocimientos": ("knowledge_items", "position_version_knowledge", "knowledge_item_id"),
}

# --- poblar catalogos ---------------------------------------------------------
mapas = {}
for campo, (tabla, _, _) in CATS.items():
    existentes = traer(tabla)
    por_canon = {canon(r["name"]): r["id"] for r in existentes}
    usados = {r["code"] for r in existentes}

    literales = [v for f in fichas for v in (f.get(campo) or []) if v and v.strip()]
    # nombre para mostrar = el literal mas frecuente de cada canonico
    freq = {}
    for v in literales:
        freq.setdefault(canon(v), Counter())[v.strip().rstrip(".-–").strip()] += 1

    nuevos = []
    for k, c in freq.items():
        if k and k not in por_canon:
            nuevos.append({"code": slug(k, usados), "name": c.most_common(1)[0][0]})

    print(f"  {tabla:<16} {len(existentes):>3} existentes | {len(freq):>3} canonicos en las fichas | {len(nuevos):>3} a crear")
    if nuevos and not DRY:
        for i in range(0, len(nuevos), 100):
            api("POST", tabla, nuevos[i:i + 100], prefer="return=minimal")
        por_canon = {canon(r["name"]): r["id"] for r in traer(tabla)}
    mapas[campo] = por_canon

if DRY:
    # en dry-run los catalogos nuevos no existen: no se puede resolver el resto
    faltan = {c: sum(1 for f in fichas for v in (f.get(c) or []) if canon(v) not in mapas[c]) for c in CATS}
    print("\n[DRY] referencias que quedarian sin resolver si no se crean los catalogos:", faltan)

# --- carga --------------------------------------------------------------------
# Reanudacion: (documento, pagina PDF) identifica la ficha de origen.
doc_a_parte = {docs["NOM-P1"]: 1, docs["NOM-P2"]: 2}
ya = {(doc_a_parte[r["source_document_id"]], r["pdf_page_number"])
      for r in api("GET", "source_references?select=source_document_id,pdf_page_number&limit=2000")
      if r["source_document_id"] in doc_a_parte}
print(f"\nfichas ya cargadas: {len(ya)}")

ok = saltados = 0
errores = []
aproximados = []   # erratas de la fuente resueltas por similitud: se auditan
for i, f in enumerate(fichas, 1):
    if (f["parte"], f["pdf_page"]) in ya:
        saltados += 1
        continue

    # 3 fichas traen el agrupamiento mal escrito en la fuente y se cargan asi
    # (fidelidad literal): MANTENIMINETO Y PRODUCCION, MANTENIMIENTOY PRODUCCION,
    # PROESIONAL. Hay que mapearlas igual al grouping correcto.
    clave = canon(f["agrupamiento"])
    g_id = grp.get(clave)
    if not g_id:
        cerca = difflib.get_close_matches(clave, list(grp), n=1, cutoff=0.82)
        if cerca:
            g_id = grp[cerca[0]]
            aproximados.append(f"{f['id']}: '{f['agrupamiento']}' -> '{cerca[0]}'")
    if not g_id:
        errores.append(f"{f['id']}: agrupamiento sin resolver '{f['agrupamiento']}'")
        continue

    a_id = area.get(canon(f["area"])) if f.get("area") else None
    l_id = lvl.get((g_id, f["nivel"])) if f.get("nivel") else None
    if f.get("area") and not a_id:
        errores.append(f"{f['id']}: area sin resolver '{f['area']}'")
        continue
    if f.get("nivel") and not l_id:
        errores.append(f"{f['id']}: nivel sin resolver '{f['nivel']}'")
        continue

    r_id = risk.get(RIESGO.get(canon(f.get("nivel_riesgo") or ""), ""))

    # "Antiguedad y Experiencia" no tenia columna al extraer, asi que los agentes
    # la dejaron en dudas. Solo 6 fichas la traen; OJO: otras 4 mencionan la
    # palabra para decir que el campo NO esta impreso, y no deben matchear.
    exp = ANTIGUEDAD.get(f["id"])

    if DRY:
        ok += 1
        continue

    try:
        codigo = api("POST", "rpc/generate_internal_code",
                     {"p_grouping_id": g_id, "p_level_id": l_id, "p_technical_area_id": a_id})
        pos = api("POST", "positions", {"internal_code": codigo, "status": "current"},
                  prefer="return=representation")[0]

        ver = api("POST", "position_versions", {
            "position_id": pos["id"], "version_number": 1,
            "grouping_id": g_id, "level_id": l_id, "technical_area_id": a_id,
            "name": f["nombre"], "variant": f.get("variant"),
            "general_description": f.get("descripcion_general"),
            "specific_description": f.get("descripcion_especifica"),
            "minimum_education": f.get("instruccion"),
            "required_title": f.get("titulo"),
            "minimum_experience": exp,
            "physical_requirement": f.get("requisito_fisico"),
            "working_conditions": f.get("condiciones_trabajo"),
            "risk_level_id": r_id,
            "risk_level_raw": f.get("nivel_riesgo"),
            "additional_notes": f.get("dudas"),
            "validity_status": "current",
            "is_historical_source": True,
        }, prefer="return=representation")[0]

        api("PATCH", f"positions?id=eq.{pos['id']}",
            {"current_version_id": ver["id"]}, prefer="return=minimal")

        for campo, (_, puente, fk) in CATS.items():
            filas = []
            vistos = set()
            for orden, lit in enumerate(f.get(campo) or []):
                cid = mapas[campo].get(canon(lit))
                if not cid or cid in vistos:   # unique (version, item)
                    continue
                vistos.add(cid)
                filas.append({"position_version_id": ver["id"], fk: cid,
                              "raw_text": lit, "sort_order": orden})
            if filas:
                api("POST", puente, filas, prefer="return=minimal")

        api("POST", "source_references", {
            "position_version_id": ver["id"],
            "source_document_id": docs["NOM-P1" if f["parte"] == 1 else "NOM-P2"],
            "printed_page_number": f["printed_page"],
            "pdf_page_number": f["pdf_page"],
            "evidence_text": f"{f['nombre']} — {f['agrupamiento']}"
                             f"{' / ' + f['area'] if f.get('area') else ' / Nivel ' + str(f.get('nivel'))}",
            "notes": f.get("dudas"),
            "verification_status": "pending",
        }, prefer="return=minimal")

        ok += 1
        if ok % 25 == 0:
            print(f"  ... {ok}/{len(fichas)}")
    except Exception as e:
        errores.append(f"{f['id']}: {e}")

print(f"\ncargadas: {ok} | salteadas (ya estaban): {saltados} | errores: {len(errores)}")
if aproximados:
    print(f"\nagrupamientos resueltos por similitud ({len(aproximados)}) — erratas de la fuente:")
    for a in aproximados:
        print("  ~", a)
for e in errores[:15]:
    print("  X", e)
