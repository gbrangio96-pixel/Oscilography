import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from comtrade_reader import analyze
from profiles import generic_profile
from hdr_reader import attach_hdr
from containers import analyze_container, join_segments

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/generic-profile.json':
            body = json.dumps(generic_profile(), ensure_ascii=False, indent=2).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(body)
            return
        files = {'/': ('index.html', 'text/html; charset=utf-8'),
                 '/ansi-catalog.json': ('ansi_catalog.json', 'application/json; charset=utf-8'),
                 '/ansi_ui.js': ('ansi_ui.js', 'text/javascript; charset=utf-8'),
                 '/comparison.js': ('comparison.js', 'text/javascript; charset=utf-8'),
                 '/report.js': ('report.js', 'text/javascript; charset=utf-8'),
                 '/pdf_layout.js': ('pdf_layout.js', 'text/javascript; charset=utf-8'),
                 '/analog_plot.js': ('analog_plot.js', 'text/javascript; charset=utf-8'),
                 '/app.js': ('app.js', 'text/javascript; charset=utf-8')}
        if self.path not in files:
            self.send_error(404)
            return
        filename, content_type = files[self.path]
        body = Path(__file__).with_name(filename).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != '/analyze':
            self.send_error(404)
            return
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 64 * 1024 * 1024:
                raise ValueError('Envie arquivos com tamanho total de até 32 MB.')
            import base64
            payload = json.loads(self.rfile.read(size))
            if 'source' in payload:
                source = base64.b64decode(payload['source'], validate=True)
                result = analyze_container(source, str(payload.get('source_name', 'registro.cff')), payload.get('profile'))
            else:
                cfg_data = base64.b64decode(payload['cfg'], validate=True)
                parts = [(str(p['name']), base64.b64decode(p['data'], validate=True)) for p in payload.get('dat_files', [])]
                if parts:
                    dat_data = join_segments(parts, cfg_data)
                    dat_name = ', '.join(sorted(p[0] for p in parts))
                else:
                    dat_data = base64.b64decode(payload['dat'], validate=True)
                    dat_name = str(payload.get('dat_name', 'registro.dat'))
                if len(cfg_data) + len(dat_data) > 32 * 1024 * 1024:
                    raise ValueError('O par CFG/DAT deve ter até 32 MB.')
                result = analyze(cfg_data, dat_data, payload.get('profile'))
                if parts:
                    import hashlib
                    result['files']['dat_segments'] = [dict(name=n,sha256=hashlib.sha256(d).hexdigest()) for n,d in parts]
                result['files'].update(cfg_name=str(payload.get('cfg_name', 'registro.cfg'))[:250], dat_name=dat_name[:1000])
            if 'hdr' in payload:
                hdr_data = base64.b64decode(payload['hdr'], validate=True)
                if len(hdr_data) > 2 * 1024 * 1024:
                    raise ValueError('HDR opcional deve ter até 2 MB.')
                if result.get('hdr', {}).get('available'):
                    raise ValueError('Já existe HDR no contêiner; remova o HDR separado para evitar fontes conflitantes.')
                attach_hdr(result, hdr_data, str(payload.get('hdr_name', 'registro.hdr'))[:250])
            elif 'hdr' not in result:
                attach_hdr(result)
            body, code = json.dumps(result, ensure_ascii=False).encode(), 200
        except Exception as exc:
            body, code = json.dumps({'error': f'Não foi possível ler o COMTRADE: {exc}'}, ensure_ascii=False).encode(), 400
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    ThreadingHTTPServer(('0.0.0.0', args.port), Handler).serve_forever()
