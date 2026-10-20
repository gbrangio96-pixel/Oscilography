import unittest
from measurements import AnalogChannel


def channel():
    return AnalogChannel(['1','IA','A','','A','1','0','0','-32768','32767'],1)


class PlotRegressionTests(unittest.TestCase):
    def test_gap_bucket_preserves_valid_peak_and_break(self):
        c=channel()
        for i in range(8):
            c.add(i,100 if i==3 else i,gap=i==2)
        result=c.finish(limit=4)
        self.assertEqual(result['valid_samples'],8)
        self.assertIn([3,100],result['plot'])
        self.assertEqual(result['plot'][0],[0,0])
        self.assertTrue(any(v is None for _,v in result['plot']))
        before_peak=result['plot'][:result['plot'].index([3,100])]
        self.assertIsNone(before_peak[-1][1])

    def test_missing_bucket_keeps_extrema_and_does_not_interpolate(self):
        c=channel()
        for i,v in enumerate([1,None,20,2,None,-10,3,4]):
            c.add(i,v)
        result=c.finish(limit=4)
        self.assertIn([2,20],result['plot'])
        self.assertIn([5,-10],result['plot'])
        self.assertEqual(result['missing_samples'],2)
        points=result['plot']
        self.assertIsNone(points[points.index([2,20])-1][1])
        self.assertIsNone(points[points.index([5,-10])-1][1])

    def test_many_gaps_remain_bounded_and_keep_global_extrema(self):
        c=channel()
        for i in range(10000):
            c.add(i,None if i%3==0 else (1000 if i==1234 else -i),gap=i%7==0)
        result=c.finish()
        self.assertLessEqual(len(result['plot']),4000)
        valid=[v for _,v in result['plot'] if v is not None]
        self.assertEqual(max(valid),result['maximum'])
        self.assertEqual(min(valid),result['minimum'])

    def test_missing_values_between_buckets_still_break_path(self):
        c=channel()
        for i,v in enumerate([1,None,None,None,None,None,None,2]):
            c.add(i,v)
        result=c.finish(limit=4)
        self.assertEqual(result['plot'],[[0,1],[7,None],[7,2]])


class RmsRegressionTests(unittest.TestCase):
    def test_large_finite_values_do_not_overflow_before_averaging(self):
        c=channel()
        for i in range(4):
            c.add(i,1e308)
        self.assertEqual(c.finish()['rms'],1e308)

    def test_large_peak_with_zeros_keeps_finite_rms(self):
        c=channel()
        for i,value in enumerate([1e308,0,0,0]):
            c.add(i,value)
        self.assertEqual(c.finish()['rms'],5e307)

    def test_zero_and_small_values_remain_valid(self):
        c=channel()
        for i in range(4):
            c.add(i,0)
        self.assertEqual(c.finish()['rms'],0)
        c=channel()
        for i in range(4):
            c.add(i,1e-308)
        self.assertEqual(c.finish()['rms'],1e-308)
