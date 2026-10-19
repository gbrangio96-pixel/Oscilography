import copy
import unittest
from comtrade_reader import analyze
from profiles import validate_profile, generic_profile
from test_reader import cfg

DATA = b'1,0,1,1\n2,1000,0,1\n3,2000,1,1\n'


def rule(**changes):
    r = dict(id='saida-1', match='TRIP 50', match_type='exact', category='disparo',
             function='50', active_state=0, canonical='trip_fase_50',
             status='confirmed', reviewer='Eng. teste', reason='Lógica de teste revisada', priority=10)
    r.update(changes)
    return r


def profile(*rules, **changes):
    p = dict(id='rele-teste', version='2.0', manufacturer='Declarado', model='Modelo de teste', rules=list(rules))
    p.update(changes)
    return p


class ProfileTests(unittest.TestCase):
    def test_active_low_and_audit(self):
        r = analyze(cfg(), DATA, profile(rule()))
        c = r['channels'][0]
        self.assertEqual(c['activations'], [.001])
        self.assertEqual(c['returns'], [.002])
        self.assertFalse(c['initial_active'])
        self.assertEqual(c['asserted_samples'], 1)
        self.assertEqual(c['name'], 'TRIP 50')
        self.assertEqual(c['classification']['reviewer'], 'Eng. teste')
        self.assertEqual(c['classification']['rule_id'], 'saida-1')
        self.assertEqual(len(r['profile']['sha256']), 64)

    def test_generic_unknown_and_fallback(self):
        r = analyze(cfg(), DATA, profile(rule(match='OUTRO')))
        self.assertEqual(r['channels'][0]['classification']['status'], 'unclassified')
        r = analyze(cfg().replace(b'TRIP 50', b'GENERAL_TRIP'), DATA, profile())
        cl = r['channels'][0]['classification']
        self.assertEqual(cl['profile_id'], 'generico')
        self.assertEqual(cl['status'], 'suggested')
        self.assertEqual(cl['canonical'], '')
        validate_profile(generic_profile())

    def test_scope_and_priority(self):
        with self.assertRaisesRegex(ValueError, 'incompatível'):
            analyze(cfg(), DATA, profile(rule(), device='Outro relé'))
        p = profile(rule(), rule(id='alta', priority=20, active_state=1))
        self.assertEqual(analyze(cfg(), DATA, p)['channels'][0]['classification']['rule_id'], 'alta')

    def test_conflicts_do_not_select_arbitrary_rule(self):
        r = analyze(cfg(), DATA, profile(rule(), rule(id='conflito', active_state=1)))
        cl = r['channels'][0]['classification']
        self.assertEqual(cl['status'], 'conflict')
        self.assertEqual(cl['canonical'], '')
        self.assertEqual(cl['active_state'], 1)
        self.assertTrue(r['validation']['warnings'])

    def test_glob_and_phase(self):
        r = analyze(cfg(), DATA, profile(rule(match='trip *', match_type='glob', phase='')))
        self.assertEqual(r['channels'][0]['classification']['category'], 'disparo')
        r = analyze(cfg(), DATA, profile(rule(phase='A')))
        self.assertEqual(r['channels'][0]['classification']['status'], 'unclassified')

    def test_invalid_profiles(self):
        for changes in [dict(active_state=2), dict(active_state=True), dict(priority='1'),
                        dict(category='qualquer'), dict(status='suggested'), dict(reviewer=''),
                        dict(match_type='regex'), dict(match='')]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_profile(profile(rule(**changes)))
        with self.assertRaises(ValueError):
            validate_profile(profile(rule(), copy.deepcopy(rule())))


class ValidationTests(unittest.TestCase):
    def test_truncated_count_and_extra_sample(self):
        with self.assertRaisesRegex(ValueError, 'incompleto'):
            analyze(cfg(), b'1,0,0,0\n2,1000,1,0\n')
        with self.assertRaisesRegex(ValueError, 'além'):
            analyze(cfg(), DATA + b'4,3000,0,0\n')

    def test_gaps_warn_and_hashes(self):
        r = analyze(cfg(), b'1,0,0,0\n3,2000,1,0\n')
        self.assertTrue(any('ausentes' in w for w in r['validation']['warnings']))
        self.assertEqual(len(r['files']['cfg_sha256']), 64)
        self.assertEqual(r['files']['dat_sha256'], analyze(cfg(), b'1,0,0,0\n3,2000,1,0\n')['files']['dat_sha256'])

    def test_invalid_cfg(self):
        invalid = [cfg().replace(b'2,0A,2D', b'3,0A,2D'), cfg().replace(b'2,DISJUNTOR', b'1,DISJUNTOR'),
                   cfg().replace(b'1000,3', b'-1,3'), cfg().replace(b'19/10/2026', b'31/02/2026'),
                   cfg().replace(b',,,0', b',,,2'), cfg().replace(b'1999', b'2025')]
        for definition in invalid:
            with self.subTest(cfg=definition), self.assertRaises(ValueError):
                analyze(definition, DATA)

    def test_invalid_timestamps(self):
        for data in [b'1,nan,0,0\n', b'1,-1,0,0\n', b'1,1000,0,0\n2,1,0,0\n', b'1,0,0,0\n1,1000,0,0\n']:
            with self.assertRaises(ValueError):
                analyze(cfg(), data)

    def test_duplicate_names_warning(self):
        r = analyze(cfg().replace(b'DISJUNTOR ABERTO', b'TRIP 50'), DATA)
        self.assertTrue(any('duplicados' in w for w in r['validation']['warnings']))

    def test_variable_rate_requires_timestamp(self):
        definition = cfg().replace(b'60\n1\n1000,3', b'60\n0\n0,3')
        r = analyze(definition, DATA)
        self.assertTrue(any('nrates=0' in w for w in r['validation']['warnings']))
        with self.assertRaisesRegex(ValueError, 'taxa'):
            analyze(definition, b'1,0,0,0\n2,0,0,0\n3,0,1,0\n')


if __name__ == '__main__':
    unittest.main()
