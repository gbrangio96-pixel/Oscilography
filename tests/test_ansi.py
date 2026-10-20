import unittest
from ansi_analysis import add_ansi_analysis, get_ansi_catalog, parse_function_codes
from comtrade_reader import analyze
from profiles import generic_profile, validate_profile
from test_reader import cfg


def ch(number, name, code='', times=(), initial=False, status='confirmed', category='partida'):
    return dict(number=number,name=name,phase='A',activations=list(times),initial_active=initial,
                classification=dict(function=code,status=status,category=category))


class AnsiTests(unittest.TestCase):
    def test_reference_catalog_has_unique_codes_and_description(self):
        catalog=get_ansi_catalog()
        codes=[e['code'] for e in catalog['entries']]
        self.assertEqual(len(codes),len(set(codes)))
        self.assertTrue({'21','27','50','51','50BF','67N','79','87T','94'} <= set(codes))
        self.assertTrue(all(e['name'] and e['description'] for e in catalog['entries']))
        self.assertIn('não reprodução completa',catalog['notice'])
        validate_profile(generic_profile())

    def test_timeline_orders_events_and_preserves_equal_timestamps(self):
        result=add_ansi_analysis(dict(channels=[ch(2,'51_START','51',[.002,.004]),ch(1,'50_START','50',[.001,.002])]))
        events=result['ansi']['timeline']
        self.assertEqual([e['order'] for e in events],[1,2,2,3])
        self.assertEqual([e['channel_number'] for e in events],[1,1,2,2])
        self.assertEqual([e['simultaneous'] for e in events],[False,True,True,False])
        functions={f['code']:f for f in result['ansi']['functions']}
        self.assertEqual(functions['50']['first_activation'],.001)
        self.assertEqual(functions['51']['activation_count'],2)
        self.assertEqual(functions['50']['channels'][0]['category'],'partida')

    def test_initial_state_is_not_invented_as_activation(self):
        result=add_ansi_analysis(dict(channels=[ch(1,'50_START','50',[],initial=True)]))['ansi']
        self.assertEqual(result['timeline'],[])
        self.assertEqual(result['initial_active'][0]['code'],'50')
        self.assertFalse(result['functions'][0]['activated'])
        self.assertIsNone(result['functions'][0]['first_activation'])

    def test_multiple_functions_are_associations_to_single_event(self):
        result=add_ansi_analysis(dict(channels=[ch(1,'50_51_SINAL','50/51',[.01])]))['ansi']
        self.assertEqual(len(result['timeline']),1)
        self.assertEqual(result['timeline'][0]['codes'],['50','51'])
        self.assertEqual(len(result['functions']),2)
        self.assertIn('não comprovação de atuação independente',result['note'])
        self.assertNotIn('responsible_for_trip',result)

    def test_unknown_channels_stay_visible_and_no_number_is_guessed(self):
        result=analyze(cfg().replace(b'TRIP 50',b'BIN_50P_TRIP'),b'1,0,0,0\n2,1000,1,0\n3,2000,0,0\n')
        self.assertEqual(result['ansi']['functions'],[])
        self.assertEqual(result['ansi']['timeline'][0]['codes'],[])
        self.assertEqual(result['ansi']['unmapped_channels'][0]['name'],'BIN_50P_TRIP')

    def test_explicit_generic_pattern_is_only_suggestion(self):
        result=analyze(cfg().replace(b'TRIP 50',b'50P_TRIP'),b'1,0,0,0\n2,1000,1,0\n3,2000,0,0\n')
        self.assertEqual(result['ansi']['timeline'][0]['codes'],['50'])
        self.assertEqual(result['ansi']['timeline'][0]['status'],'suggested')
        self.assertEqual(result['channels'][0]['classification']['canonical'],'')

    def test_profile_active_low_function_and_custom_code(self):
        profile={'id':'IED','version':'1','rules':[dict(id='low',match='TRIP 50',category='partida',function='87T',active_state=0,status='suggested')]}
        result=analyze(cfg(),b'1,0,1,0\n2,1000,0,0\n3,2000,1,0\n',profile)
        event=result['ansi']['timeline'][0]
        self.assertEqual((event['time'],event['codes']),(.001,['87T']))
        self.assertFalse(result['ansi']['initial_active'])
        custom=add_ansi_analysis(dict(channels=[ch(1,'USER','50X',[.1])]))['ansi']['functions'][0]
        self.assertEqual(custom['code'],'50X')
        self.assertFalse(custom['catalogued'])
        self.assertIn('fora do catálogo',custom['name'])

    def test_declared_function_names_and_code_expressions(self):
        self.assertEqual(parse_function_codes('Sobrecorrente instantânea'),['50'])
        self.assertEqual(parse_function_codes('50 BF'),['50BF'])
        self.assertEqual(parse_function_codes('27 / 59 / 27'),['27','59'])
        self.assertEqual(parse_function_codes(''),[])

    def test_conflict_does_not_publish_a_function_association(self):
        result=add_ansi_analysis(dict(channels=[ch(1,'USER','50',[.1],status='conflict')]))['ansi']
        self.assertEqual(result['functions'],[])
        self.assertEqual(result['timeline'][0]['codes'],[])
        self.assertIn('conflito',result['unmapped_channels'][0]['reason'])


if __name__=='__main__':
    unittest.main()
