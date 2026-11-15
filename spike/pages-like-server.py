"""Static server that copies the live GitHub Pages headers seen on the real site: ACAO star and max-age 600."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', sys.argv[3] if len(sys.argv) > 3 else 'max-age=600')
        super().end_headers()

port, directory = int(sys.argv[1]), sys.argv[2]
ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=directory)).serve_forever()
