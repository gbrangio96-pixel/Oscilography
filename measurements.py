"""Medições sobre a janela observada; não infere atuação ou causa elétrica."""
import math


class AnalogChannel:
    def __init__(self, row, number):
        if len(row) < 10:
            raise ValueError(f'Definição analógica incompleta: canal {number}.')
        def scalar(i, default):
            return float(row[i].replace(',', '.')) if len(row) > i and row[i].strip() else default
        self.a, self.b, self.skew = scalar(5, 1), scalar(6, 0), scalar(7, 0)
        if not all(math.isfinite(x) for x in (self.a, self.b, self.skew)):
            raise ValueError('Escala/offset/skew analógico inválido.')
        self.meta = dict(number=number, name=row[1], phase=row[2], unit=row[4], a=self.a, b=self.b,
                         skew_us=self.skew, primary=scalar(10, None), secondary=scalar(11, None),
                         reference=row[12].strip().upper() if len(row) > 12 else 'Não informada')
        for key in ('primary','secondary'):
            if self.meta[key] is not None and not math.isfinite(self.meta[key]):
                self.meta[key] = None
        self.count = self.missing = 0
        self.mean = 0.0
        self.rms_scale = self.rms_ssq = 0.0
        self.minimum = self.maximum = None
        self.points = []

    def add(self, time, raw, gap=False):
        value = self.a * raw + self.b if raw is not None else None
        if value is not None and not math.isfinite(value):
            value = None
        if value is None:
            self.missing += 1
        else:
            self.count += 1
            self.mean = self.mean * ((self.count - 1) / self.count) + value / self.count
            # Mantém soma de quadrados normalizada, sem formar uma norma total
            # que possa transbordar antes da divisão pelo número de amostras.
            magnitude = abs(value)
            if magnitude:
                if magnitude > self.rms_scale:
                    self.rms_ssq = 1 + self.rms_ssq * (self.rms_scale / magnitude) ** 2
                    self.rms_scale = magnitude
                else:
                    self.rms_ssq += (magnitude / self.rms_scale) ** 2
            self.minimum = value if self.minimum is None else min(self.minimum, value)
            self.maximum = value if self.maximum is None else max(self.maximum, value)
        self.points.append([time + self.skew / 1_000_000, value, gap])

    def finish(self, limit=2000):
        # Envelope min/max por bloco: mantém picos e pontos de ruptura, não interpola lacunas.
        width = max(1, math.ceil(len(self.points) / max(1, limit // 4)))
        plot = []
        breaks = 0
        previous_break_count = None
        for start in range(0, len(self.points), width):
            block = self.points[start:start + width]
            prefix = []
            local_breaks = 0
            valid = []
            for i, point in enumerate(block):
                if point[1] is None or point[2]:
                    local_breaks += 1
                prefix.append(local_breaks)
                if point[1] is not None:
                    valid.append(i)
            if valid:
                # Preserva os extremos de valores válidos mesmo em blocos com lacunas.
                chosen = sorted({valid[0], valid[-1], min(valid,key=lambda i:block[i][1]), max(valid,key=lambda i:block[i][1])})
                for i in chosen:
                    current_break_count = breaks + prefix[i]
                    if previous_break_count is not None and current_break_count > previous_break_count:
                        plot.append([block[i][0], None])
                    plot.append([block[i][0], block[i][1]])
                    previous_break_count = current_break_count
            breaks += local_breaks
        # Até ~limit pontos de envelope, mais até um separador por ponto válido.
        # Muitas lacunas podem elevar a saída a 2*limit; nunca se conectam trechos
        # separados apenas para cumprir um limite visual.
        rms = self.rms_scale * math.sqrt(min(1.0, self.rms_ssq / self.count)) if self.count else None
        return dict(**self.meta, valid_samples=self.count, missing_samples=self.missing,
                    minimum=self.minimum, maximum=self.maximum, peak=max(abs(self.minimum),abs(self.maximum)) if self.count else None,
                    mean=self.mean if self.count else None, rms=rms if rms is not None and math.isfinite(rms) else None,
                    plot=plot, plot_reduced=width>1,
                    method='RMS global amostral da janela, incluindo componente CC; não é RMS de ciclo nem ponderado pelo tempo. Escala a*x+b na referência P/S do CFG, sem conversão automática de TC/TP. Gráfico com skew do CFG aplicado.')


def add_durations(result):
    start, end = result['first_time'], result['last_time']
    gaps = result.get('sample_gaps', [])
    for channel in result['channels']:
        active = channel['classification']['active_state']
        states = channel.get('transitions')
        if states is None:
            states = sorted([(t, 1) for t in channel['rises']] + [(t, 0) for t in channel['falls']],key=lambda item:item[0])
        opened = start if channel['initial'] == active else None
        left = opened is not None
        intervals = []
        for time, state in states:
            if state == active:
                opened, left = time, False
            elif opened is not None:
                intervals.append(dict(start=opened, end=time, observed_duration=max(0,time-opened), left_censored=left, right_censored=False))
                opened = None
        if opened is not None:
            intervals.append(dict(start=opened, end=end, observed_duration=max(0,end-opened), left_censored=left, right_censored=True))
        for interval in intervals:
            interval['gap_affected'] = any(a <= interval['end'] and b >= interval['start'] for a,b in gaps)
            interval['complete'] = not (interval['left_censored'] or interval['right_censored'] or interval['gap_affected'])
        channel['active_intervals'] = intervals
        channel['total_active_duration'] = math.fsum(i['observed_duration'] for i in intervals)
        channel['duration_estimated'] = bool(gaps)
    return result
