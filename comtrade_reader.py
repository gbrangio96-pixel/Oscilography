"""Leitura dos canais digitais COMTRADE (1991, 1999 e 2013)."""
import csv
import io
import math
import struct
import hashlib
import re
from datetime import datetime
from profiles import apply_profile


def analyze(cfg_bytes, dat_bytes, profile=None):
    try:
        return _analyze(cfg_bytes, dat_bytes, profile)
    except (IndexError, UnicodeError, OverflowError) as exc:
        raise ValueError('Estrutura CFG/DAT incompleta ou codificação inválida.') from exc


def _analyze(cfg_bytes, dat_bytes, profile):
    warnings = []
    try:
        cfg = cfg_bytes.decode('utf-8-sig')
    except UnicodeDecodeError:
        cfg = cfg_bytes.decode('cp1252')
    rows = list(csv.reader(io.StringIO(cfg)))
    station = rows[0]
    revision = station[2].strip() if len(station) > 2 else '1991'
    if revision not in ('1991', '1999', '2013'):
        raise ValueError('Revisão COMTRADE não suportada: ' + revision)
    counts = rows[1]
    na, nd = int(counts[1].strip().rstrip('Aa')), int(counts[2].strip().rstrip('Dd'))
    if na < 0 or nd < 0 or na + nd != int(counts[0]) or na + nd > 10000:
        raise ValueError('Contagem total de canais incompatível com canais analógicos/digitais.')
    for definitions in (rows[2:2 + na], rows[2 + na:2 + na + nd]):
        ids = [int(r[0]) for r in definitions]
        if len(ids) != len(set(ids)) or any(i < 1 for i in ids):
            raise ValueError('Números de canais devem ser positivos e únicos por tipo.')
    digital = rows[2 + na:2 + na + nd]
    if len(digital) != nd:
        raise ValueError('CFG incompleto: definições dos canais digitais ausentes.')
    for r in digital:
        if len(r) < 4 or len(r) > 4 and r[4].strip() not in ('0', '1'):
            raise ValueError('Definição digital inválida ou estado normal diferente de 0/1.')
    identities = [(r[1], r[2]) for r in digital]
    if len(identities) != len(set(identities)):
        warnings.append('Há nomes/fases digitais duplicados; correspondência pode ser ambígua.')
    if any(not r[1].strip() for r in digital):
        warnings.append('Há canais digitais sem identificação no CFG.')
    cursor = 2 + na + nd
    frequency = float(rows[cursor][0])
    nrates = int(rows[cursor + 1][0])
    if not math.isfinite(frequency) or frequency <= 0 or not 0 <= nrates <= 1000:
        raise ValueError('Frequência nominal ou quantidade de taxas inválida.')
    rate_lines = max(1, nrates)
    rates = [(float(r[0]), int(r[1])) for r in rows[cursor + 2:cursor + 2 + rate_lines]]
    if nrates == 0:
        warnings.append('Taxa variável: nrates=0; tempos dependem dos timestamps do DAT.')
    previous_end = 0
    for rate, end in rates:
        if not math.isfinite(rate) or rate < 0 or end <= previous_end:
            raise ValueError('Taxas de amostragem inválidas ou limites fora de ordem.')
        previous_end = end
    cursor += 2 + rate_lines
    start, trigger = ','.join(rows[cursor]), ','.join(rows[cursor + 1])
    for label, value in [('início', start), ('trigger', trigger)]:
        match = re.fullmatch(r'(\d{1,2}/\d{1,2}/(?:\d{4}|\d{2})),(\d{1,2}:\d{2}:\d{2})(?:\.(\d{1,9}))?', value.strip())
        if not match:
            raise ValueError(f'Data/hora de {label} inválida no CFG.')
        date, clock, _ = match.groups()
        datetime.strptime(date + ',' + clock, '%d/%m/' + ('%Y' if len(date.split('/')[-1]) == 4 else '%y') + ',%H:%M:%S')
    fmt = rows[cursor + 2][0].strip().upper()
    multiplier = float(rows[cursor + 3][0]) if len(rows) > cursor + 3 and rows[cursor + 3][0].strip() else 1.0
    if not math.isfinite(multiplier) or multiplier <= 0:
        raise ValueError('Multiplicador de tempo inválido.')
    channels = []
    for r in digital:
        channels.append(dict(number=int(r[0]), name=r[1], phase=r[2] if len(r) > 2 else '', normal=r[4].strip() if len(r) > 4 else None, initial=None, final=None, rises=[], falls=[], active_samples=0))
    words = (nd + 15) // 16
    def records():
        if fmt == 'ASCII':
            for r in csv.reader(io.StringIO(dat_bytes.decode('utf-8-sig'))):
                if not r:
                    continue
                if len(r) != 2 + na + nd:
                    raise ValueError('Quantidade de colunas do DAT incompatível com o CFG.')
                if any(not math.isfinite(float(x)) for x in r[2:2 + na]):
                    raise ValueError('Amostra analógica não finita no DAT.')
                yield int(r[0]), float(r[1]), [int(x) for x in r[2 + na:]]
        elif fmt in ('BINARY', 'BINARY32', 'FLOAT32'):
            analog_type = {'BINARY': 'h', 'BINARY32': 'i', 'FLOAT32': 'f'}[fmt]
            record = struct.Struct('<II' + analog_type * na + 'H' * words)
            if len(dat_bytes) % record.size:
                raise ValueError('DAT truncado ou incompatível com o formato declarado no CFG.')
            for values in record.iter_unpack(dat_bytes):
                if fmt == 'FLOAT32' and any(not math.isfinite(x) for x in values[2:2 + na]):
                    raise ValueError('Amostra analógica não finita no DAT.')
                packed = values[2 + na:]
                yield values[0], values[1], [(packed[i // 16] >> (i % 16)) & 1 for i in range(nd)]
        else:
            raise ValueError(f'Formato DAT não suportado: {fmt}.')
    count, previous, first_time, last_time = 0, None, None, None
    previous_sample = 0
    gaps, reconstructed, repeated_times = 0, False, False
    for sample, timestamp, states in records():
        if sample <= previous_sample:
            raise ValueError('Índices das amostras devem ser crescentes.')
        gaps += sample - previous_sample - 1
        if rates and sample > rates[-1][1]:
            raise ValueError('DAT contém amostras além do limite declarado no CFG.')
        previous_sample = sample
        if not math.isfinite(timestamp) or timestamp < 0:
            raise ValueError('Timestamp inválido no DAT.')
        if timestamp == 0 and sample > 1:
            reconstructed = True
            elapsed, begin = 0.0, 1
            for rate, end in rates:
                if rate <= 0:
                    raise ValueError('Timestamp ausente e taxa de amostragem inválida.')
                elapsed += max(0, min(sample - 1, end) - begin + 1) / rate
                if sample <= end:
                    break
                begin = end + 1
            else:
                raise ValueError('Timestamp ausente e taxas insuficientes para reconstruir o tempo.')
            t = elapsed
        else:
            t = timestamp * multiplier / 1_000_000
        if not math.isfinite(t) or t < 0 or (last_time is not None and t < last_time):
            raise ValueError('Tempos inválidos ou fora de ordem no DAT.')
        if last_time is not None and t == last_time:
            repeated_times = True
        for i, state in enumerate(states):
            if state not in (0, 1):
                raise ValueError('Canal digital contém valor diferente de 0 ou 1.')
            ch = channels[i]
            if previous is None:
                ch['initial'] = state
            elif previous[i] != state:
                ch['rises' if state else 'falls'].append(t)
            ch['final'] = state
            ch['active_samples'] += state
        if first_time is None:
            first_time = t
        last_time, previous = t, states
        count += 1
    if not count:
        raise ValueError('O DAT não contém amostras.')
    if rates and previous_sample < rates[-1][1]:
        raise ValueError(f'DAT incompleto: última amostra {previous_sample}; CFG declara {rates[-1][1]}.')
    if gaps:
        warnings.append(f'{gaps} índices de amostras ausentes; transições podem ter ocorrido nas lacunas.')
    if reconstructed:
        warnings.append('Tempos reconstruídos pelas taxas de amostragem para timestamps zero.')
    if repeated_times:
        warnings.append('Há timestamps repetidos no DAT.')
    result = dict(station=station[0], device=station[1] if len(station) > 1 else '', format=fmt, frequency=frequency, start=start, trigger=trigger, samples=count, duration=last_time-first_time, channels=channels,
                  revision=revision,
                  files=dict(cfg_sha256=hashlib.sha256(cfg_bytes).hexdigest(), dat_sha256=hashlib.sha256(dat_bytes).hexdigest()),
                  validation=dict(warnings=warnings, checks=['Estrutura e contagens do CFG', 'Revisão e datas', 'Taxas e limites de amostras', 'Formato e integridade do DAT', 'Estados digitais binários', 'Sequência e tempos das amostras']))
    return apply_profile(result, profile)
