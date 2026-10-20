import math
import struct
import unittest
from comtrade_reader import analyze
from test_reader import cfg


def analog_cfg(fmt='ASCII'):
    return (f'S,R,2001\n2,1A,1D\n1,IA,A,,A,2,1,100,-32768,32767,1000,5,S\n1,TRIP,,,0\n60\n1\n1000,4\n01/01/2026,00:00:00\n01/01/2026,00:00:00\n{fmt}\n1\n').encode()


class MeasurementTests(unittest.TestCase):
    def test_complete_pulse_and_initial_final_boundaries(self):
        r=analyze(cfg(rates='1000,4'),b'1,0,0,1\n2,1000,1,1\n3,2000,0,1\n4,3000,0,1\n')
        pulse,initial=r['channels']
        self.assertEqual(pulse['total_active_duration'],.001)
        self.assertTrue(pulse['active_intervals'][0]['complete'])
        self.assertEqual(initial['total_active_duration'],.003)
        self.assertTrue(initial['active_intervals'][0]['left_censored'])
        self.assertTrue(initial['active_intervals'][0]['right_censored'])

    def test_active_low_duration(self):
        profile={'id':'test','version':'1','rules':[{'id':'low','match':'TRIP 50','category':'disparo','active_state':0,'status':'suggested'}]}
        r=analyze(cfg(),b'1,0,1,0\n2,1000,0,0\n3,2000,1,0\n',profile)
        self.assertEqual(r['channels'][0]['total_active_duration'],.001)

    def test_gaps_are_uncertain_and_final_sample_is_not_extrapolated(self):
        r=analyze(cfg(),b'1,0,1,0\n3,2000,0,1\n')
        self.assertTrue(r['channels'][0]['duration_estimated'])
        self.assertTrue(r['channels'][0]['active_intervals'][0]['gap_affected'])
        self.assertEqual(r['channels'][1]['total_active_duration'],0)
        self.assertTrue(r['channels'][1]['active_intervals'][0]['right_censored'])

    def test_scaling_statistics_and_formats(self):
        for fmt,typ in [('ASCII',None),('BINARY','h'),('BINARY32','i'),('FLOAT32','f')]:
            with self.subTest(fmt=fmt):
                data=b''.join(struct.pack('<II'+typ+'H',i+1,i*1000,v,0) for i,v in enumerate([-1,0,1,2])) if typ else b'1,0,-1,0\n2,1000,0,0\n3,2000,1,0\n4,3000,2,0\n'
                c=analyze(analog_cfg(fmt),data)['analog_channels'][0]
                self.assertEqual((c['minimum'],c['maximum'],c['mean']),(-1,5,2))
                self.assertAlmostEqual(c['rms'],3)
                self.assertEqual(c['reference'],'S')
                self.assertEqual(c['primary'],1000)
                self.assertEqual(c['secondary'],5)
                self.assertEqual(c['plot'][0][0],.0001)

    def test_missing_values_and_downsample_peak(self):
        definition=analog_cfg().replace(b'1000,4',b'1000,4000')
        data=''.join(f'{i+1},{i*1000},{100 if i==2001 else 0},0\n' for i in range(4000)).encode()
        c=analyze(definition,data)['analog_channels'][0]
        self.assertTrue(c['plot_reduced'])
        self.assertLessEqual(len(c['plot']),2000)
        self.assertEqual(max(p[1] for p in c['plot']),201)
        missing=analyze(analog_cfg(),b'1,0,,0\n2,1000,nan,0\n3,2000,1,0\n4,3000,99999,0\n')['analog_channels'][0]
        self.assertEqual(missing['missing_samples'],3)
        self.assertEqual(missing['valid_samples'],1)
        self.assertEqual(missing['rms'],3)
