import unittest
from comtrade_reader import analyze
from containers import analyze_container
from hdr_reader import attach_hdr
from test_reader import cfg
from test_compatibility import ASCII, zipped, cff


class HdrTests(unittest.TestCase):
    def base(self):
        return analyze(cfg(), ASCII)

    def test_optional_absent_and_no_guess_from_cfg(self):
        r = attach_hdr(self.base())
        self.assertFalse(r['hdr']['available'])
        self.assertEqual(r['object']['name'], '')

    def test_explicit_names_and_types(self):
        for name, expected in [('LT 230 kV SE A - SE B', 'LT'), ('Transformador TR-01', 'Transformador'),
                               ('Banco de capacitores BC-02', 'Banco de capacitores'), ('Banco de reatores BR-1', 'Banco de reatores')]:
            with self.subTest(name=name):
                r = attach_hdr(self.base(), ('Objeto protegido: '+name).encode(), 'registro.hdr')
                self.assertEqual(r['object']['name'], name)
                self.assertEqual(r['object']['type'], expected)
                self.assertEqual(r['object']['status'], 'extracted')
                self.assertIn('Objeto protegido:', r['object']['evidence'])
                self.assertEqual(len(r['files']['hdr_sha256']), 64)

    def test_explicit_has_priority_over_mentions(self):
        r = attach_hdr(self.base(), b'Protected object: LT 01\nTransformador auxiliar\n', 'a.hdr')
        self.assertEqual(r['object']['name'], 'LT 01')

    def test_objectid_is_protected_object_name(self):
        for line in ('ObjectID: LT 230 kV A-B', 'ObjectID = LT 230 kV A-B', 'ObjectID\tLT 230 kV A-B', 'ObjectID    LT 230 kV A-B'):
            r=attach_hdr(self.base(),line.encode(),'ied.hdr')
            self.assertEqual(r['object']['name'],'LT 230 kV A-B')
            self.assertEqual(r['object']['status'],'extracted')

    def test_free_text_is_suggestion_and_ambiguity_is_preserved(self):
        r = attach_hdr(self.base(), b'LT 01 - A-B\n', 'a.hdr')
        self.assertEqual(r['object']['status'], 'suggested')
        r = attach_hdr(self.base(), b'Objeto: LT 01\nObjeto: Transformador TR-02\n', 'a.hdr')
        self.assertEqual(r['object']['status'], 'ambiguous')
        self.assertEqual(r['object']['name'], '')
        self.assertEqual(len(r['object']['candidates']), 2)

    def test_unrecognized_hdr_and_encodings(self):
        r = attach_hdr(self.base(), b'Disturbance record\nRelay model: XYZ', 'a.hdr')
        self.assertEqual(r['object']['status'], 'not_identified')
        self.assertEqual(r['samples'], 3)
        for encoding in ('utf-16', 'cp1252'):
            r = attach_hdr(self.base(), 'Objeto: LT São José'.encode(encoding), 'a.hdr')
            self.assertEqual(r['object']['name'], 'LT São José')

    def test_cff_and_zip_automatic_hdr(self):
        combined = cff(cfg(), ASCII).replace(b'Registro de teste', b'Objeto: LT CFF')
        self.assertEqual(analyze_container(combined, 'a.cff')['object']['name'], 'LT CFF')
        archive = zipped({'p/A.CFG':cfg(), 'p/A.DAT':ASCII, 'p/A.HDR':b'Object: Transformer T1', 'p/OTHER.HDR':b'Objeto: LT errada'})
        r = analyze_container(archive, 'a.zip')
        self.assertEqual(r['object']['name'], 'Transformer T1')
        self.assertEqual(r['object']['type'], 'Transformador')
        self.assertEqual(r['files']['hdr_name'], 'p/A.HDR')
