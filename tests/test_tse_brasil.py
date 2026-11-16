"""Pruebas del resumen del Histórico de Totalização del TSE (scripts/cargar_tse_brasil.py)."""
import os
import sys
import unittest

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(R, 'scripts'))
import cargar_tse_brasil as tse  # noqa: E402


class ResumenTSE(unittest.TestCase):
    def test_ultima_actualizacion_de_cada_zona_sumada_por_estado(self):
        fecha, turno, est, nombres = tse.resumir(os.path.join(R, 'tests', 'datos', 'tse'))
        self.assertEqual((fecha, turno), ('25/10/2026', 2))
        ac = est['AC']
        # Zona 1: sólo cuenta la actualización 20; zona 3: la 15.
        self.assertEqual(dict(ac['votos']), {'13': 350, '22': 400})
        self.assertEqual((ac['blancos'], ac['nulos']), (10, 20))
        self.assertEqual((ac['aptos'], ac['secciones'], ac['secciones_tot']), (1400, 8, 8))
        self.assertEqual(nombres['13'], 'CANDIDATO A')

    def test_nombre_corto(self):
        self.assertEqual(tse.corto('LUIZ INÁCIO LULA DA SILVA'), 'Lula')
        self.assertEqual(tse.corto('SAMARA MARTINS DA SILVA FEITOSA'), 'Samara Feitosa')
        self.assertEqual(tse.titulo('LUIZ INÁCIO LULA DA SILVA'), 'Luiz Inácio Lula da Silva')


if __name__ == '__main__':
    unittest.main()
