"""Leitura de CFF e pacotes ZIP em memória, sem extrair caminhos no disco."""
import hashlib
import io
from pathlib import PurePosixPath
import re
import zipfile

from comtrade_reader import analyze, decode_text, text_rows

LIMIT = 32 * 1024 * 1024
HEADER = re.compile(rb'---\s*file\s+type:\s*(CFG|HDR|INF|DAT)(?:\s+(ASCII|BINARY32|BINARY|FLOAT32)(?:\s*:\s*(\d+))?)?\s*---', re.I)


def split_cff(data):
    stream = io.BytesIO(data.removeprefix(b'\xef\xbb\xbf'))
    sections = {}
    current = None
    dat_format = None
    while True:
        line = stream.readline()
        if not line:
            break
        marker = HEADER.fullmatch(line.strip())
        if marker:
            kind, fmt, size = marker.groups()
            current = kind.decode().upper()
            if current in sections:
                raise ValueError('CFF contém seção repetida: ' + current)
            sections[current] = bytearray()
            if current == 'DAT':
                dat_format = fmt.decode().upper() if fmt else None
                if dat_format and dat_format != 'ASCII' and size is None:
                    raise ValueError('CFF binário deve informar a quantidade de bytes no marcador DAT.')
                if size is not None:
                    count = int(size)
                    if count > LIMIT:
                        raise ValueError('Seção DAT do CFF excede 32 MB.')
                    content = stream.read(count)
                    if len(content) != count:
                        raise ValueError('CFF truncado: seção DAT menor que o tamanho declarado.')
                    sections[current].extend(content)
                    current = None
        elif current:
            sections[current].extend(line)
        elif line.strip():
            raise ValueError('CFF contém conteúdo fora das seções declaradas.')
    if not sections.get('CFG') or not sections.get('DAT'):
        raise ValueError('CFF deve conter seções CFG e DAT não vazias.')
    return bytes(sections['CFG']), bytes(sections['DAT']), dat_format


def join_segments(parts, cfg_data=None):
    """Ordena segmentos pela extensão numérica; o leitor valida sequência/amostras."""
    if len(parts) == 1:
        return parts[0][1]
    def key(part):
        match = re.fullmatch(r'\.(?:d)?(\d+)', PurePosixPath(part[0].lower()).suffix)
        if not match:
            raise ValueError('Selecione um DAT ou segmentos numerados (.d00, .d01, .001…).')
        return int(match.group(1))
    ordered = sorted(parts, key=key)
    numbers = [key(p) for p in ordered]
    stems = {PurePosixPath(p[0]).stem.casefold() for p in ordered}
    if len(set(numbers)) != len(numbers) or len(stems) != 1:
        raise ValueError('Segmentos repetidos ou com nomes de registros diferentes.')
    if numbers != list(range(numbers[0], numbers[-1] + 1)):
        raise ValueError('Falta um segmento intermediário do DAT.')
    if cfg_data is not None:
        rows, _ = text_rows(decode_text(cfg_data)[0])
        if any(len(r) == 1 and r[0].strip().upper() == 'ASCII' for r in rows):
            return ('\n'.join(decode_text(p[1])[0].strip('\r\n') for p in ordered) + '\n').encode('utf-8')
    return b''.join(p[1] for p in ordered)


def analyze_container(data, name, profile=None):
    if len(data) > LIMIT:
        raise ValueError('Arquivo de entrada excede 32 MB.')
    suffix = PurePosixPath(name.lower()).suffix
    if suffix == '.cff':
        cfg, dat, dat_format = split_cff(data)
        result = analyze(cfg, dat, profile)
        if dat_format and dat_format != result['format']:
            raise ValueError('Formato do DAT no marcador CFF difere do declarado no CFG.')
        result['files'].update(cfg_name=name + ' / CFG', dat_name=name + ' / DAT')
    elif suffix == '.zip':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = [e for e in archive.infolist() if not e.is_dir() and not e.filename.startswith('__MACOSX/')]
            if len(entries) > 1000 or sum(e.file_size for e in entries) > LIMIT:
                raise ValueError('ZIP deve ter até 32 MB descompactados e 1000 arquivos.')
            configs = [e for e in entries if e.filename.lower().endswith('.cfg')]
            combined = [e for e in entries if e.filename.lower().endswith('.cff')]
            if len(configs) + len(combined) != 1:
                raise ValueError('ZIP deve conter exatamente um registro CFG/DAT ou um CFF. Separe os registros A e B.')
            if combined:
                result = analyze_container(archive.read(combined[0]), combined[0].filename, profile)
            else:
                definition = configs[0]
                base = PurePosixPath(definition.filename).with_suffix('')
                parts = [e for e in entries if PurePosixPath(e.filename).with_suffix('').as_posix().casefold() == base.as_posix().casefold()
                         and (e.filename.lower().endswith('.dat') or re.fullmatch(r'\.(?:d)?\d+', PurePosixPath(e.filename.lower()).suffix))]
                if not parts:
                    raise ValueError('ZIP sem DAT/segmentos com o mesmo nome e pasta do CFG.')
                raw_parts = [(e.filename, archive.read(e)) for e in parts]
                cfg_data = archive.read(definition)
                result = analyze(cfg_data, join_segments(raw_parts, cfg_data), profile)
                result['files']['dat_segments'] = [dict(name=n,sha256=hashlib.sha256(d).hexdigest()) for n,d in raw_parts]
                result['files'].update(cfg_name=definition.filename, dat_name=', '.join(sorted(e.filename for e in parts)))
    else:
        raise ValueError('Arquivo único deve ser .cff ou .zip; para .cfg selecione também o DAT.')
    result['files']['container_name'] = name
    result['files']['container_sha256'] = hashlib.sha256(data).hexdigest()
    return result
