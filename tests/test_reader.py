import struct
import unittest
from comtrade_reader import analyze

def cfg(fmt='ASCII', rates='1000,3'):
    return f'Estação,Relé,1999\n2,0A,2D\n1,TRIP 50,,,0\n2,DISJUNTOR ABERTO,,,0\n60\n1\n{rates}\n19/10/2026,12:00:00.000000\n19/10/2026,12:00:00.001000\n{fmt}\n1\n'.encode()

class ReaderTests(unittest.TestCase):
    def test_ascii(self):
        r=analyze(cfg(),b'1,0,0,1\n2,1000,1,1\n3,2000,0,1\n')
        self.assertEqual(r['channels'][0]['name'],'TRIP 50')
        self.assertEqual(r['channels'][0]['rises'],[.001])
        self.assertEqual(r['channels'][0]['falls'],[.002])
        self.assertEqual(r['channels'][1]['initial'],1)
        self.assertEqual(r['channels'][1]['rises'],[])

    def test_binary_formats(self):
        for fmt in ('BINARY','BINARY32','FLOAT32'):
            with self.subTest(fmt=fmt):
                data=b''.join(struct.pack('<IIH',i+1,i*1000,s) for i,s in enumerate((2,3,2)))
                self.assertEqual(analyze(cfg(fmt),data)['channels'][0]['rises'],[.001])

    def test_reconstructed_time(self):
        r=analyze(cfg(),b'1,0,0,0\n2,0,1,0\n3,0,0,0\n')
        self.assertEqual(r['channels'][0]['falls'],[.002])

    def test_bad_data(self):
        for data in (b'',b'1,0,2,0\n',b'1,0,0\n'):
            with self.assertRaises(ValueError):
                analyze(cfg(),data)
        with self.assertRaises(ValueError):
            analyze(cfg('BINARY'),b'123')

    def test_analog_and_word_boundary(self):
        text='S,R,2013\n18,1A,17D\n1,I,A,,A,1,0,0,-32768,32767,1,1,P\n'
        text+=''.join(f'{i+1},D{i+1},,,0\n' for i in range(17))
        for fmt,typ in [('BINARY','h'),('BINARY32','i'),('FLOAT32','f')]:
            definition=(text+f'60\n1\n1000,2\n01/01/2026,00:00:00\n01/01/2026,00:00:00\n{fmt}\n1\n').encode()
            data=struct.pack('<II'+typ+'HH',1,0,10,0,0)+struct.pack('<II'+typ+'HH',2,1000,20,0,1)
            self.assertEqual(analyze(definition,data)['channels'][16]['rises'],[.001])

if __name__=='__main__':
    unittest.main()
