"""
cargar_senado_historico.py
Carga las elecciones al Senado que falten cruzando dos consultas del Ministerio del Interior:
«Elecciones Senado» (votos y escaños por provincia y partido) y «Elecciones Senado cargos
electos» (los senadores elegidos, por isla donde toca). Los escaños reales salen de los electos
y los votos de cada partido son la suma de sus candidatos entre los votos por elector.

Uso:
    python3 scripts/cargar_senado_historico.py ELECCIONES_SENADO.xlsx CARGOS_ELECTOS.xlsx
"""
import os, sys, re, openpyxl
from collections import defaultdict
from datetime import datetime
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0]=[R+'/editor', R+'/scripts']
import modelo
from base_datos import texto, entero
from esquema_datos import COLS_ELECCIONES, COLS_CIRCUNSCRIPCIONES, COLS_RESULTADOS, COLS_PARTIDOS
F1, F2 = sys.argv[1], sys.argv[2]
f1=list(openpyxl.load_workbook(F1,read_only=True,data_only=True).worksheets[0].iter_rows(values_only=True))
el=list(openpyxl.load_workbook(F2,read_only=True,data_only=True).worksheets[0].iter_rows(values_only=True))[4:]
cab=f1[3]; provs=[(i+1, cab[4+i].split(' - ',1)[1]) for i in range(52)]
m=modelo.Modelo.abrir(R+'/datos/Datos_electorales.xlsx')
cong={entero(c['Código']):c for c in m.circunscripciones('ES-Congreso-2023-07-23')}
base=m.eleccion('ES-Senado-2019-04-28')
ya={texto(e['ID']) for e in m.elecciones}
partidos={texto(p['Siglas']):p for p in m.partidos}
ISLAS={7:4,35:4,38:5}
def k_de(cod, esc):
    if cod in ISLAS: return ISLAS[cod]
    return esc-1 if esc>=3 else esc
por_fecha=defaultdict(list)
for r in f1[4:]:
    if r[0]: por_fecha[r[0].date()].append(r)
electos=defaultdict(list)
for r in el: electos[r[0].date()].append(r)
nuevas=[]
for fecha in sorted(por_fecha):
    eid=f'ES-Senado-{fecha.isoformat()}'
    if eid in ya: continue
    sel=por_fecha[fecha]
    tot={r[3]:r for r in sel if not r[3].startswith(('Votos (','Escaños (','Votos CERA ('))}
    votos=defaultdict(lambda: defaultdict(int)); nombres={}
    for r in sel:
        if r[3].startswith('Votos ('):
            lab=re.sub(r' - CO_CAND \d+\)$',')',r[3])[7:-1]
            nom,_,sg=lab.rpartition(' - ')
            sg=sg.strip() or nom; nombres.setdefault(sg, nom or sg)
            for cod,_n in provs:
                v=r[3+cod]
                if v: votos[cod][sg]+=v
    reales=defaultdict(lambda: defaultdict(int)); vel=defaultdict(lambda: defaultdict(list))
    for r in electos[fecha]:
        cod=entero(r[3]); sg=texto(r[9]).strip()
        reales[cod][sg]+=1; vel[cod][sg].append(r[10] or 0)
        nombres.setdefault(sg, texto(r[8]).strip() or sg)
    e={c:None for c in COLS_ELECCIONES}
    for c in ('Pestaña','País','Clase','Tipo','Magnitud','Circunscripción base','Prorrateo','Forma de voto','Fórmula','Barrera 1 ámbito','Barrera 2 ámbito'):
        e[c]=base.get(c)
    e.update({'ID':eid,'Fecha':datetime(fecha.year,fecha.month,fecha.day),
              'Fuente':'Ministerio del Interior (consulta de resultados: Senado y Senado cargos electos)'})
    sin_votos=[]
    n_res=0
    for cod,nombre in provs:
        esc=sum(reales[cod].values())
        cg=cong.get(cod,{})
        def g(k): return entero(tot[k][3+cod]) if k in tot and tot[k][3+cod] is not None else None
        vt, vcera = g('Votantes'), g('Votantes CERA')
        c={x:None for x in COLS_CIRCUNSCRIPCIONES}
        c.update({'Elección':eid,'Código':cod,'Circunscripción':nombre if cod not in cong else texto(cg.get('Circunscripción')),
                  'Código región':cg.get('Código región'),'Región':cg.get('Región'),'Escaños':esc,
                  'Censo total':g('Electores') or None,'Censo sin CERA':g('Electores CER') or None,'Censo CERA':g('Electores CERA') or None,
                  'Votantes total':vt or None,'Votantes CERA':vcera or None,
                  'Votantes CER':(vt-(vcera or 0)) if vt else None,
                  'Votos válidos':g('Votos válidos') or None,'Votos a candidaturas':g('Votos a candidaturas') or None,
                  'Votos en blanco':g('Votos en blanco') or None,'Votos nulos':g('Votos nulos') or None})
        m.t['circunscripciones'].append(c)
        k=k_de(cod,esc)
        if votos[cod]:
            pv={sg:round(v/k) for sg,v in votos[cod].items()}
        else:
            sin_votos.append(c['Circunscripción'])
            pv={sg:round(sum(L)/len(L)) for sg,L in vel[cod].items()}
        for sg in reales[cod]:
            pv.setdefault(sg, round(sum(vel[cod][sg])/len(vel[cod][sg])))
        for sg,v in sorted(pv.items(), key=lambda x:-x[1]):
            if not v and not reales[cod].get(sg): continue
            m.t['resultados']['España.Senado'].append({'Elección':eid,'Código circunscripción':cod,'Circunscripción':c['Circunscripción'],
                'Vuelta':1,'Siglas':sg,'Partido':nombres.get(sg,sg),'Votos':v,'Escaños reales':reales[cod].get(sg) or None})
            n_res+=1
            if sg not in partidos:
                p={x:None for x in COLS_PARTIDOS}; p.update({'Siglas':sg,'Nombre':nombres.get(sg,sg),'País':'España'})
                m.t['partidos'].append(p); partidos[sg]=p
    notas=['Escaños reales: lista oficial de cargos electos.',
           'Votos de cada partido: suma de sus candidatos dividida entre los votos por elector (3 en las provincias, 2 en Ceuta y Melilla); exacto si el partido presentó la lista completa.',
           'Baleares, Las Palmas y Santa Cruz de Tenerife van como una circunscripción por provincia (el archivo no trae los votos por isla).']
    if sin_votos:
        notas.append(f'Sin votos por partido en {len(sin_votos)} provincias: sólo los de los electos.')
    e['Notas']=' '.join(notas)
    m.t['elecciones'].append(e)
    nuevas.append((eid, sum(sum(v.values()) for v in reales.values()), len(sin_votos), n_res))
m.t['elecciones'].sort(key=lambda e:(texto(e.get('Pestaña')), str(e.get('Fecha'))))
m.guardar()
for x in nuevas: print(x)
