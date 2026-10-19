"""Regras declarativas: nenhuma expressão de usuário é executada como código."""
import copy
import fnmatch
import hashlib
import json

CATEGORIES = {'partida', 'disparo', 'bloqueio', 'alarme', 'posição', 'desconhecido'}


def generic_profile():
    rules = []
    for name, category, function in [
        ('TRIP', 'disparo', ''), ('GENERAL_TRIP', 'disparo', ''),
        ('TRIP GERAL', 'disparo', ''), ('ALARM', 'alarme', ''),
        ('ALARME', 'alarme', ''), ('BLOCK', 'bloqueio', ''),
        ('BLOQUEIO', 'bloqueio', ''), ('52A', 'posição', '52'),
        ('52B', 'posição', '52'), ('50P_START', 'partida', '50'),
        ('51P_START', 'partida', '51'),
    ]:
        rules.append(dict(id='generic-' + name, match=name, match_type='exact',
                          category=category, function=function, active_state=1,
                          canonical='', status='suggested', priority=0,
                          reason='Identificação textual conhecida; conferir a lógica e a polaridade do relé.'))
    return dict(id='generico', version='1.0', manufacturer='', model='',
                station='', device='', rules=rules)


def validate_profile(profile):
    if not isinstance(profile, dict):
        raise ValueError('Perfil deve ser um objeto JSON.')
    for key in ('id', 'version'):
        if not isinstance(profile.get(key), str) or not profile[key].strip():
            raise ValueError(f'Perfil: {key} obrigatório.')
    for key in ('manufacturer', 'model', 'station', 'device'):
        if not isinstance(profile.get(key, ''), str):
            raise ValueError(f'Perfil: {key} deve ser texto.')
    rules = profile.get('rules')
    if not isinstance(rules, list) or len(rules) > 500:
        raise ValueError('Perfil deve conter uma lista com até 500 regras.')
    ids = set()
    for r in rules:
        if not isinstance(r, dict):
            raise ValueError('Regra deve ser objeto JSON.')
        for key in ('id', 'match', 'category', 'function', 'canonical', 'reason', 'reviewer', 'phase'):
            value = r.get(key, '')
            if not isinstance(value, str) or len(value) > 500:
                raise ValueError(f'Regra: {key} deve ser texto de até 500 caracteres.')
        if not r.get('id', '').strip() or r['id'] in ids:
            raise ValueError('IDs das regras devem ser preenchidos e únicos.')
        ids.add(r['id'])
        if not r.get('match', '').strip():
            raise ValueError(f'Regra {r["id"]}: identificação para correspondência obrigatória.')
        if r.get('match_type', 'exact') not in ('exact', 'glob'):
            raise ValueError('Use correspondência exact ou glob (curingas * e ?).')
        if r.get('category') not in CATEGORIES:
            raise ValueError('Categoria inválida na regra ' + r['id'])
        if type(r.get('active_state', 1)) is not int or r.get('active_state', 1) not in (0, 1):
            raise ValueError('Polaridade deve ser 0 ou 1.')
        if type(r.get('priority', 0)) is not int or not -10000 <= r.get('priority', 0) <= 10000:
            raise ValueError('Prioridade deve ser inteira entre -10000 e 10000.')
        if type(r.get('case_sensitive', False)) is not bool:
            raise ValueError('case_sensitive deve ser booleano.')
        if r.get('status', 'suggested') not in ('suggested', 'confirmed', 'manual'):
            raise ValueError('Origem deve ser suggested, confirmed ou manual.')
        if r.get('status') in ('confirmed', 'manual') and (not r.get('reviewer', '').strip() or not r.get('reason', '').strip()):
            raise ValueError('Regra confirmada/manual requer responsável e justificativa.')
        if r.get('canonical') and (r.get('status') not in ('confirmed', 'manual') or not r.get('function') and r['category'] == 'desconhecido'):
            raise ValueError('Equivalência requer classificação e regra confirmada/manual.')
    return copy.deepcopy(profile)


def apply_profile(result, profile=None):
    custom = validate_profile(profile) if profile is not None else None
    generic = generic_profile()
    for key in ('station', 'device'):
        if custom and custom.get(key) and custom[key] != result[key]:
            raise ValueError(f'Perfil incompatível com {key} do CFG; selecione o perfil correto ou ajuste seu escopo.')
    effective = custom or generic
    serialized = json.dumps(effective, ensure_ascii=False, sort_keys=True).encode()
    result['profile'] = {k: effective.get(k, '') for k in ('id', 'version', 'manufacturer', 'model', 'station', 'device')}
    result['profile']['sha256'] = hashlib.sha256(serialized).hexdigest()
    result['profile']['rules'] = effective['rules']
    result['profile']['generic_fallback_version'] = generic['version']
    for ch in result['channels']:
        matches = []
        used = generic
        for source in ([custom, generic] if custom else [generic]):
            matches = []
            for rule in source['rules']:
                if 'phase' in rule and rule['phase'] != ch['phase']:
                    continue
                text, pattern = ch['name'], rule['match']
                if not rule.get('case_sensitive', False):
                    text, pattern = text.casefold(), pattern.casefold()
                if (text == pattern if rule.get('match_type', 'exact') == 'exact' else fnmatch.fnmatchcase(text, pattern)):
                    matches.append(rule)
            if matches:
                used = source
                break
        classification = dict(category='desconhecido', function='', canonical='', active_state=1,
                              status='unclassified', rule_id='', profile_id=used['id'],
                              profile_version=used['version'], reason='Nenhuma regra aplicável; estado ativo 1 é uma hipótese padrão.',
                              reviewer='', candidates=[])
        if matches:
            highest = max(r.get('priority', 0) for r in matches)
            best = [r for r in matches if r.get('priority', 0) == highest]
            classification['candidates'] = [r['id'] for r in best]
            if len(best) > 1:
                classification.update(status='conflict', reason='Regras de mesma prioridade em conflito. Classificação e polaridade não confirmadas.')
                result['validation']['warnings'].append(f'Canal {ch["number"]}: conflito de regras; usada hipótese de estado ativo 1.')
            else:
                r = best[0]
                classification.update({k: r.get(k, classification[k]) for k in ('category', 'function', 'canonical', 'active_state', 'status', 'reason', 'reviewer')})
                classification['rule_id'] = r['id']
        ch['classification'] = classification
        active = classification['active_state']
        ch['activations'] = ch['rises'] if active else ch['falls']
        ch['returns'] = ch['falls'] if active else ch['rises']
        ch['initial_active'] = ch['initial'] == active
        ch['final_active'] = ch['final'] == active
        ch['asserted_samples'] = ch['active_samples'] if active else result['samples'] - ch['active_samples']
    return result
