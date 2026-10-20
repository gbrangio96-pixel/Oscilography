"""Associações ANSI e sequência observada: não atribui causalidade de trip."""
from collections import Counter
from functools import lru_cache
import json
from pathlib import Path
import re
import unicodedata


def _fold(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value) if unicodedata.category(c) != 'Mn').casefold()


@lru_cache(maxsize=1)
def get_ansi_catalog():
    return json.loads(Path(__file__).with_name('ansi_catalog.json').read_text(encoding='utf-8'))


def parse_function_codes(value):
    """Interpreta apenas a função explicitamente declarada no perfil/classificação.

    Números e nomes de canais não são pesquisados aqui. Códigos fora do catálogo
    são preservados como declarações personalizadas, não certificados como ANSI.
    """
    value = value.strip()
    if not value:
        return []
    catalog = get_ansi_catalog()
    names = {_fold(e['name']): e['code'] for e in catalog['entries']}
    if _fold(value) in names:
        return [names[_fold(value)]]
    tokens = re.findall(r'(?<![A-Z0-9])\d{1,2}(?:[A-Z][A-Z0-9]*)?(?![A-Z0-9])', value.upper())
    # Espaço entre número e sufixo é aceito somente quando a expressão inteira
    # equivale a um código conhecido, como "50 BF".
    compact = re.sub(r'\s+', '', value.upper())
    if compact in {e['code'] for e in catalog['entries']}:
        tokens = [compact]
    return list(dict.fromkeys(tokens or [value]))


def _sort_code(code):
    match = re.fullmatch(r'(\d+)(.*)', code)
    return (int(match[1]), match[2]) if match else (1000, code.casefold())


def add_ansi_analysis(result):
    catalog = get_ansi_catalog()
    entries = {e['code']: e for e in catalog['entries']}
    summaries = {}
    timeline = []
    initial = []
    unmapped = []
    for channel in result['channels']:
        classification = channel.get('classification', {})
        status = classification.get('status', 'unclassified')
        raw = classification.get('function', '')
        codes = parse_function_codes(raw) if status != 'conflict' else []
        channel['ansi_functions'] = [dict(code=code,
            name=entries[code]['name'] if code in entries else 'Função personalizada (fora do catálogo)',
            catalogued=code in entries) for code in codes]
        if not codes:
            unmapped.append(dict(number=channel['number'],name=channel['name'],
                reason='Regras em conflito; associação não selecionada.' if status == 'conflict' else 'Sem código ou nome de função associado no perfil.',
                activated=bool(channel.get('activations')),status=status))
        channel_info = dict(number=channel['number'],name=channel['name'],phase=channel.get('phase',''),
                            category=classification.get('category','desconhecido'),status=status)
        for item in channel['ansi_functions']:
            code = item['code']
            summary = summaries.setdefault(code,dict(code=code,name=item['name'],catalogued=item['catalogued'],
                activated=False,activation_count=0,channels=[],first_activation=None))
            summary['channels'].append(channel_info.copy())
            times = channel.get('activations', [])
            summary['activation_count'] += len(times)
            if times:
                summary['activated'] = True
                earliest = min(times)
                summary['first_activation'] = earliest if summary['first_activation'] is None else min(summary['first_activation'],earliest)
            if channel.get('initial_active',False):
                initial.append(dict(code=code,name=item['name'],channel_number=channel['number'],channel_name=channel['name'],status=status))
        for time in channel.get('activations', []):
            timeline.append(dict(order=0,time=time,codes=codes.copy(),
                names=[i['name'] for i in channel['ansi_functions']],
                channel_number=channel['number'],channel_name=channel['name'],phase=channel.get('phase',''),
                category=classification.get('category','desconhecido'),status=status,simultaneous=False))
    timeline.sort(key=lambda e:(e['time'], e['channel_number']))
    frequencies = Counter(e['time'] for e in timeline)
    order = 0
    previous = None
    for event in timeline:
        if event['time'] != previous:
            order += 1
            previous = event['time']
        event['order'] = order
        event['simultaneous'] = frequencies[event['time']] > 1
    result['ansi'] = dict(catalog_version=catalog['version'],
        functions=[summaries[code] for code in sorted(summaries,key=_sort_code)],
        timeline=timeline,initial_active=initial,unmapped_channels=unmapped,
        note='Funções associadas a sinais digitais pelo perfil; não identifica a função responsável pelo trip. Sinais já ativos no início ficam separados. A ordem usa o tempo do DAT dentro de cada registro; eventos com o mesmo timestamp compartilham ordem, sem precedência inferida. Múltiplos códigos no mesmo sinal são associações, não comprovação de atuação independente de cada função. Códigos fora do catálogo são declarações personalizadas.')
    return result
