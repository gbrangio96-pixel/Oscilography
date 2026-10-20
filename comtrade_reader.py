"""Leitura dos canais digitais COMTRADE (1991, 1999 e 2013)."""
import csv
import io
import math
import struct
import hashlib
import re
from datetime import datetime
from profiles import apply_profile
from measurements import AnalogChannel, add_durations


def analyze(cfg_bytes, dat_bytes, profile=None):
    try:
        return _analyze(cfg_bytes, dat_bytes, profile)
    except (IndexError, UnicodeError, OverflowError) as exc:
        raise ValueError('Estrutura CFG/DAT incompleta ou codificação inválida.') from exc


def decode_text(data):
    if data.startswith((b'\xff\xfe\x00\x00', b'\x00\x00\xfe\xff')):
        return data.decode('utf-32'), 'UTF-32'
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        return data.decode('utf-16'), 'UTF-16'
    if len(data) > 4 and b'\x00' in data[:100]:
        if data[1:100:2].count(0) > len(data[1:100:2]) / 2:
            return data.decode('utf-16-le'), 'UTF-16 LE'
        if data[:100:2].count(0) > len(data[:100:2]) / 2:
            return data.decode('utf-16-be'), 'UTF-16 BE'
    for encoding in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            pass
    raise ValueError('Codificação de texto não reconhecida.')


def text_rows(text, delimiter=None):
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        raise ValueError('Arquivo de texto vazio.')
    if delimiter is None:
        candidates = (',', ';', '\t')
        # A linha de contagens/amostras contém campos numéricos e evita nomes com vírgulas.
        probe = lines[1] if len(lines) > 1 else lines[0]
        delimiter = max(candidates, key=lambda d: len(next(csv.reader([probe], delimiter=d))))
    return list(csv.reader(io.StringIO('\n'.join(lines)), delimiter=delimiter)), delimiter


def _analyze(cfg_bytes, dat_bytes, profile):
    warnings = []
    cfg, encoding = decode_text(cfg_bytes)
    rows, delimiter = text_rows(cfg)
    if encoding not in ('utf-8-sig', 'cp1252'):
        warnings.append('Codificação CFG detectada: ' + encoding)
    if delimiter != ',':
        warnings.append('CFG usa separador não padrão: ' + repr(delimiter))
    def number(value):
        return float(value.strip().replace(',', '.') if delimiter != ',' else value)
    station = rows[0]
    revision_declared = station[2].strip() if len(station) > 2 else ''
    found = re.search(r'(?<!\d)(1991|1999|2001|2013)(?!\d)', revision_declared)
    revision = found.group(1) if found else revision_declared or '1991'
    revision_mode = 'standard' if revision in ('1991','1999','2001','2013') else 'compatibility'
    if revision_mode == 'compatibility':
        warnings.append(f'Revisão declarada {revision_declared!r} não padronizada/reconhecida: leitura por estrutura em modo de compatibilidade. Conferir o exportador; não é certificação dessa revisão.')
    elif revision_declared and revision_declared != revision:
        warnings.append(f'Revisão normalizada de {revision_declared!r} para {revision}.')
    elif len(station) > 2 and not revision_declared:
        warnings.append('Campo de revisão vazio; layout legado tratado como 1991.')
    counts = rows[1]
    na, nd = int(counts[1].strip().rstrip('Aa')), int(counts[2].strip().rstrip('Dd'))
    if na < 0 or nd < 0 or na + nd != int(counts[0]) or na + nd > 10000:
        raise ValueError('Contagem total de canais incompatível com canais analógicos/digitais.')
    for definitions in (rows[2:2 + na], rows[2 + na:2 + na + nd]):
        ids = [int(r[0]) for r in definitions]
        if len(ids) != len(set(ids)) or any(i < 1 for i in ids):
            raise ValueError('Números de canais devem ser positivos e únicos por tipo.')
    analog_channels = [AnalogChannel(r, int(r[0])) for r in rows[2:2 + na]]
    digital = rows[2 + na:2 + na + nd]
    if len(digital) != nd:
        raise ValueError('CFG incompleto: definições dos canais digitais ausentes.')
    # Exportadores legados podem usar Dn,nome,estado_normal (sem fase/circuito).
    digital = [r[:2] + ['', '', r[2]] if len(r) == 3 and r[2].strip() in ('0','1') else r for r in digital]
    for r in digital:
        if len(r) < 4 or len(r) > 4 and r[4].strip() not in ('0', '1'):
            raise ValueError('Definição digital inválida ou estado normal diferente de 0/1.')
    identities = [(r[1], r[2]) for r in digital]
    if len(identities) != len(set(identities)):
        warnings.append('Há nomes/fases digitais duplicados; correspondência pode ser ambígua.')
    if any(not r[1].strip() for r in digital):
        warnings.append('Há canais digitais sem identificação no CFG.')
    cursor = 2 + na + nd
    frequency = number(rows[cursor][0])
    nrates = int(rows[cursor + 1][0])
    if not math.isfinite(frequency) or frequency <= 0 or not 0 <= nrates <= 1000:
        raise ValueError('Frequência nominal ou quantidade de taxas inválida.')
    rate_lines = max(1, nrates)
    rates = [(number(r[0]), int(r[1])) for r in rows[cursor + 2:cursor + 2 + rate_lines]]
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
    multiplier = number(rows[cursor + 3][0]) if len(rows) > cursor + 3 and rows[cursor + 3][0].strip() else 1.0
    if not math.isfinite(multiplier) or multiplier <= 0:
        raise ValueError('Multiplicador de tempo inválido.')
    channels = []
    for r in digital:
        channels.append(dict(number=int(r[0]), name=r[1], phase=r[2] if len(r) > 2 else '', normal=r[4].strip() if len(r) > 4 else None, initial=None, final=None, rises=[], falls=[], transitions=[], active_samples=0))
    words = (nd + 15) // 16
    analog_missing = False
    def records():
        nonlocal analog_missing
        if fmt == 'ASCII':
            dat_text, dat_encoding = decode_text(dat_bytes)
            dat_rows, dat_separator = text_rows(dat_text)
            if dat_separator != ',':
                warnings.append('DAT ASCII usa separador não padrão: ' + repr(dat_separator))
            def dat_number(value):
                return float(value.replace(',', '.') if dat_separator != ',' else value)
            for r in dat_rows:
                if not r:
                    continue
                if len(r) != 2 + na + nd:
                    raise ValueError('Quantidade de colunas do DAT incompatível com o CFG.')
                if any(not x.strip() or not math.isfinite(dat_number(x)) for x in r[2:2 + na]):
                    analog_missing = True
                yield int(r[0]), dat_number(r[1]), [int(x) for x in r[2 + na:]], [dat_number(x) if x.strip() and math.isfinite(dat_number(x)) and dat_number(x) != 99999 else None for x in r[2:2 + na]]
        elif fmt in ('BINARY', 'BINARY32', 'FLOAT32'):
            analog_type = {'BINARY': 'h', 'BINARY32': 'i', 'FLOAT32': 'f'}[fmt]
            record = struct.Struct('<II' + analog_type * na + 'H' * words)
            if len(dat_bytes) % record.size:
                raise ValueError('DAT truncado ou incompatível com o formato declarado no CFG.')
            for values in record.iter_unpack(dat_bytes):
                if fmt == 'FLOAT32' and any(not math.isfinite(x) for x in values[2:2 + na]):
                    analog_missing = True
                packed = values[2 + na:]
                yield values[0], values[1], [(packed[i // 16] >> (i % 16)) & 1 for i in range(nd)], [v if math.isfinite(v) and not (fmt=='BINARY' and v==-32768) and not (fmt=='BINARY32' and v==-2147483648) else None for v in values[2:2+na]]
        else:
            raise ValueError(f'Formato DAT não suportado: {fmt}.')
    count, previous, first_time, last_time = 0, None, None, None
    previous_sample = 0
    gaps, reconstructed, repeated_times = 0, False, False
    sample_gaps = []
    for sample, timestamp, states, analog_values in records():
        has_gap = sample > previous_sample + 1
        if sample <= previous_sample:
            raise ValueError('Índices das amostras devem ser crescentes.')
        gaps += sample - previous_sample - 1
        if rates and sample > rates[-1][1]:
            raise ValueError('DAT contém amostras além do limite declarado no CFG.')
        previous_sample = sample
        if not math.isfinite(timestamp) or timestamp < 0:
            raise ValueError('Timestamp inválido no DAT.')
        if timestamp == 0xFFFFFFFF or timestamp == 0 and sample > 1:
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
        if has_gap and last_time is not None:
            sample_gaps.append([last_time,t])
        for channel, value in zip(analog_channels, analog_values):
            channel.add(t,value,has_gap)
        for i, state in enumerate(states):
            if state not in (0, 1):
                raise ValueError('Canal digital contém valor diferente de 0 ou 1.')
            ch = channels[i]
            if previous is None:
                ch['initial'] = state
            elif previous[i] != state:
                ch['rises' if state else 'falls'].append(t)
                ch['transitions'].append([t,state])
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
    if analog_missing or any(c.missing for c in analog_channels):
        warnings.append('Há amostras analógicas ausentes/não finitas. Estatísticas analógicas usam apenas valores válidos; lacunas não são interpoladas.')
    if gaps:
        warnings.append(f'{gaps} índices de amostras ausentes; transições podem ter ocorrido nas lacunas.')
    if reconstructed:
        warnings.append('Tempos reconstruídos pelas taxas de amostragem para timestamps zero.')
    if repeated_times:
        warnings.append('Há timestamps repetidos no DAT.')
    result = dict(station=station[0], device=station[1] if len(station) > 1 else '', format=fmt, frequency=frequency, start=start, trigger=trigger, samples=count, duration=last_time-first_time, channels=channels, first_time=first_time, last_time=last_time, sample_gaps=sample_gaps,
                  analog_channels=[c.finish() for c in analog_channels],
                  revision=revision, revision_declared=revision_declared, revision_mode=revision_mode,
                  files=dict(cfg_sha256=hashlib.sha256(cfg_bytes).hexdigest(), dat_sha256=hashlib.sha256(dat_bytes).hexdigest()),
                  validation=dict(warnings=warnings, checks=['Estrutura e contagens do CFG', 'Revisão e datas', 'Taxas e limites de amostras', 'Formato e integridade do DAT', 'Estados digitais binários', 'Sequência e tempos das amostras']))
    return add_durations(apply_profile(result, profile))
