import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from comtrade_reader import analyze

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        files = {'/': ('index.html', 'text/html; charset=utf-8'),
                 '/comparison.js': ('comparison.js', 'text/javascript; charset=utf-8'),
                 '/report.js': ('report.js', 'text/javascript; charset=utf-8')}
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
            result = analyze(base64.b64decode(payload['cfg'], validate=True), base64.b64decode(payload['dat'], validate=True))
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
