"""Identificação conservadora de objetos em HDR livre, preservando a evidência."""
import hashlib
import re
import unicodedata
from comtrade_reader import decode_text


def folded(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value) if unicodedata.category(c) != 'Mn').casefold()


def object_type(value):
    text = folded(value)
    for kind, pattern in [('Banco de capacitores', r'\b(?:banco\s+(?:de\s+)?capacitores|capacitor\s+bank)\b'),
                          ('Banco de reatores', r'\b(?:banco\s+(?:de\s+)?reatores|reactor\s+bank)\b'),
                          ('Transformador', r'\b(?:transformador|transformer|trafo|tr\s*[-#]?\s*\d+)\b'),
                          ('LT', r'\b(?:lt|linha\s+de\s+transmissao|transmission\s+line)\b'),
                          ('Banco', r'\b(?:banco|bank)\b')]:
        if re.search(pattern, text):
            return kind
    return 'Não determinado'


def attach_hdr(result, data=None, filename=''):
    result['object'] = dict(name='', type='Não determinado', status='not_identified', source='', evidence='', candidates=[])
    result['hdr'] = dict(available=data is not None, name=filename, text='', encoding='', warnings=[])
    if data is None:
        return result
    result['files'].update(hdr_name=filename, hdr_sha256=hashlib.sha256(data).hexdigest())
    try:
        text, encoding = decode_text(data)
    except (ValueError, UnicodeError):
        result['hdr']['warnings'].append('HDR não pôde ser decodificado; análise digital preservada.')
        return result
    result['hdr'].update(text=text, encoding=encoding)
    # Um HDR é texto livre; uma etiqueta explícita tem precedência sobre menções soltas.
    explicit, mentions = [], []
    labels = {'objectid', 'object id', 'object_id', 'objeto', 'nome do objeto', 'nome da linha', 'line name', 'protected element', 'elemento protegido', 'objeto relacionado', 'objeto protegido', 'equipamento protegido',
              'object', 'protected object', 'protected object name', 'object name', 'protected equipment', 'asset', 'asset name', 'circuito', 'circuit', 'feeder', 'alimentador', 'bay'}
    for line in text.splitlines():
        raw = line.strip()
        match = re.match(r'^([^:=\t]{1,80})\s*[:=\t]\s*(.+)$', raw) or re.match(r'^(ObjectID|Object_ID|Object ID)\s+(.+)$', raw, re.I)
        if match and folded(match[1].strip()) in labels:
            value = match[2].strip()
            if folded(value) not in ('n/a', 'na', 'none', 'nao informado', 'nao identificado', '-', ''):
                explicit.append(dict(name=value, type=object_type(value), evidence=raw))
        elif re.match(r'^(?:LT\b|linha de transmiss[aã]o\b|transformador\b|transformer\b|trafo\b|TR\s*[-#]?\s*\d+\b|banco\b|capacitor bank\b|reactor bank\b)', raw, re.I):
            mentions.append(dict(name=raw, type=object_type(raw), evidence=raw))
    candidates = []
    for candidate in explicit or mentions:
        if candidate['name'].casefold() not in {c['name'].casefold() for c in candidates}:
            candidates.append(candidate)
    result['object']['candidates'] = candidates
    if len(candidates) == 1:
        result['object'].update(candidates[0], status='extracted' if explicit else 'suggested', source=filename)
    elif candidates:
        result['object'].update(status='ambiguous', source=filename)
        result['hdr']['warnings'].append('HDR menciona mais de um objeto; identificação automática não selecionada.')
    else:
        result['hdr']['warnings'].append('HDR disponível, mas sem identificação inequívoca do objeto.')
    return result
