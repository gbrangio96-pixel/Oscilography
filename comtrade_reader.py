"""Leitura dos canais digitais COMTRADE (1991, 1999 e 2013)."""
import csv
import io
import math
import struct


def analyze(cfg_bytes, dat_bytes):
    try:
        cfg = cfg_bytes.decode('utf-8-sig')
    except UnicodeDecodeError:
        cfg = cfg_bytes.decode('cp1252')
    rows = list(csv.reader(io.StringIO(cfg)))
    station = rows[0]
    counts = rows[1]
    na, nd = int(counts[1].strip().rstrip('Aa')), int(counts[2].strip().rstrip('Dd'))
    digital = rows[2 + na:2 + na + nd]
    if len(digital) != nd:
        raise ValueError('CFG incompleto: definições dos canais digitais ausentes.')
    cursor = 2 + na + nd
    frequency = float(rows[cursor][0])
    nrates = int(rows[cursor + 1][0])
    rates = [(float(r[0]), int(r[1])) for r in rows[cursor + 2:cursor + 2 + nrates]]
    cursor += 2 + nrates
    start, trigger = ','.join(rows[cursor]), ','.join(rows[cursor + 1])
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
                yield int(r[0]), float(r[1]), [int(x) for x in r[2 + na:]]
        elif fmt in ('BINARY', 'BINARY32', 'FLOAT32'):
            analog_type = {'BINARY': 'h', 'BINARY32': 'i', 'FLOAT32': 'f'}[fmt]
            record = struct.Struct('<II' + analog_type * na + 'H' * words)
            if len(dat_bytes) % record.size:
                raise ValueError('DAT truncado ou incompatível com o formato declarado no CFG.')
            for values in record.iter_unpack(dat_bytes):
                packed = values[2 + na:]
                yield values[0], values[1], [(packed[i // 16] >> (i % 16)) & 1 for i in range(nd)]
        else:
            raise ValueError(f'Formato DAT não suportado: {fmt}.')
    count, previous, first_time, last_time = 0, None, None, None
    previous_sample = 0
    for sample, timestamp, states in records():
        if sample <= previous_sample:
            raise ValueError('Índices das amostras devem ser crescentes.')
        previous_sample = sample
        if timestamp == 0 and sample > 1:
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
    return dict(station=station[0], device=station[1] if len(station) > 1 else '', format=fmt, frequency=frequency, start=start, trigger=trigger, samples=count, duration=last_time-first_time, channels=channels)
