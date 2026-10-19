import io
import struct
import unittest
import zipfile

from comtrade_reader import analyze
from containers import analyze_container, join_segments
from test_reader import cfg

ASCII = b'1,0,0,1\n2,1000,1,1\n3,2000,0,1\n'


def cff(definition, data, fmt='ASCII'):
    return (b'--- file type: CFG ---\r\n' + definition +
            b'--- file type: HDR ---\r\nRegistro de teste\r\n' +
            f'--- file type: DAT {fmt}'.encode() +
            (f': {len(data)}'.encode() if fmt != 'ASCII' else b'') + b' ---\r\n' + data)


def zipped(files):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return stream.getvalue()


class CompatibilityTests(unittest.TestCase):
    def test_revision_format_matrix(self):
        for revision in ('1991','1999','2001','2013'):
            for fmt in ('ASCII','BINARY','BINARY32','FLOAT32'):
                with self.subTest(revision=revision, fmt=fmt):
                    definition = cfg(fmt).replace(b'1999', revision.encode())
                    data = ASCII if fmt == 'ASCII' else b''.join(struct.pack('<IIH',n,n*1000-1000,s) for n,s in enumerate((2,3,2),1))
                    result = analyze(definition, data)
                    self.assertEqual(result['revision'], revision)
                    self.assertEqual(result['channels'][0]['rises'], [.001])

    def test_revision_labels_and_missing_revision(self):
        for label, expected in [(b'', '1991'),(b'IEC 60255-24:2001','2001'),(b'1999.0','1999'),(b'2025','2025')]:
            r=analyze(cfg().replace(b'1999',label),ASCII)
            self.assertEqual(r['revision'],expected)
            self.assertTrue(r['validation']['warnings'])
        r=analyze(cfg().replace(b',1999',b''),ASCII)
        self.assertEqual(r['revision'],'1991')
        # Compatibilidade não ignora um DAT truncado.
        with self.assertRaises(ValueError):
            analyze(cfg().replace(b'1999',b'2025'),b'1,0,0,0\n')

    def test_encodings_and_separators(self):
        for encoding in ('utf-16','utf-16-le','utf-16-be','utf-32','cp1252'):
            with self.subTest(encoding=encoding):
                r=analyze(cfg().decode().encode(encoding),ASCII.decode().encode(encoding))
                self.assertEqual(r['station'],'Estação')
                self.assertEqual(r['channels'][0]['rises'],[.001])
        for separator in (';', '\t'):
            r=analyze(cfg().decode().replace(',',separator).encode(),ASCII.decode().replace(',',separator).encode())
            self.assertEqual(r['channels'][0]['rises'],[.001])

    def test_legacy_digital_and_missing_timestamp(self):
        definition=cfg().replace(b',1999',b'').replace(b'1,TRIP 50,,,0',b'1,TRIP 50,0').replace(b'2,DISJUNTOR ABERTO,,,0',b'2,DISJUNTOR ABERTO,0')
        r=analyze(definition,ASCII.replace(b'1000',b'4294967295'))
        self.assertEqual(r['channels'][0]['phase'],'')
        self.assertEqual(r['channels'][0]['rises'],[.001])

    def test_cff_formats_and_binary_line_breaks(self):
        for fmt in ('ASCII','BINARY','BINARY32','FLOAT32'):
            data=ASCII if fmt=='ASCII' else b''.join(struct.pack('<IIH',n,n*1000-1000,s) for n,s in enumerate((2,3,2),1))
            r=analyze_container(cff(cfg(fmt),data,fmt),'registro.CFF')
            self.assertEqual(r['channels'][0]['rises'],[.001])
            self.assertEqual(len(r['files']['container_sha256']),64)
        # Byte 0A em uma palavra digital não pode ser separado como linha de texto.
        data=b''.join(struct.pack('<IIH',n,n*1000-1000,s) for n,s in enumerate((10,11,10),1))
        r=analyze_container(cff(cfg('BINARY'),data,'BINARY'),'registro.cff')
        self.assertEqual(r['channels'][0]['rises'],[.001])

    def test_bad_cff(self):
        binary=struct.pack('<IIH',1,0,0)
        for data in [b'bad', cff(cfg('BINARY'),binary,'BINARY')[:-1],
                     cff(cfg('BINARY'),binary,'FLOAT32'),
                     cff(cfg('BINARY'),binary,'BINARY').replace(b'BINARY: 10',b'BINARY')]:
            with self.subTest(data=data),self.assertRaises(ValueError):
                analyze_container(data,'registro.cff')

    def test_zip_and_segments(self):
        files={'pasta/Evento.CFG':cfg(),'pasta/Evento.DAT':ASCII,'pasta/Evento.HDR':b'notes'}
        self.assertEqual(analyze_container(zipped(files),'evento.zip')['samples'],3)
        files={'evento.cfg':cfg(),'evento.d01':b'1,0,0,1','evento.d02':b'2,1000,1,1\n3,2000,0,1'}
        r=analyze_container(zipped(files),'segmentos.zip')
        self.assertEqual(r['channels'][0]['rises'],[.001])
        self.assertEqual(len(r['files']['dat_segments']),2)
        self.assertEqual(analyze_container(zipped({'evento.cff':cff(cfg(),ASCII)}),'evento.zip')['samples'],3)

    def test_bad_zip_and_segments(self):
        for files in [{'a.cfg':cfg(),'b.cfg':cfg()},{'a.cfg':cfg()},{'a.cfg':cfg(),'a.d01':b'1','a.d03':b'3'}]:
            with self.assertRaises(ValueError):
                analyze_container(zipped(files),'eventos.zip')
        with self.assertRaises(ValueError):
            join_segments([('a.d01',b'1'),('b.d02',b'2')])

    def test_analog_missing_does_not_hide_valid_digitals(self):
        definition=b'S,R,2013\n2,1A,1D\n1,I,A,,A,1,0,0,-32768,32767,1,1,P\n1,TRIP,,,0\n60\n1\n1000,2\n01/01/2026,00:00:00\n01/01/2026,00:00:00\nFLOAT32\n1\n'
        data=struct.pack('<IIfH',1,0,float('nan'),0)+struct.pack('<IIfH',2,1000,1.0,1)
        r=analyze(definition,data)
        self.assertEqual(r['channels'][0]['rises'],[.001])
        self.assertTrue(any('analógicas ausentes' in w for w in r['validation']['warnings']))
