import http.server
import socketserver
import os
import sys

DEFAULT_PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class TasksHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def translate_path(self, path):
        clean_path = path.split('?')[0].split('#')[0]
        if clean_path in ('/tasks', '/tasks/'):
            path = '/'
        elif clean_path.startswith('/tasks/'):
            path = '/' + clean_path[len('/tasks/'):]
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run(host="127.0.0.1", port=DEFAULT_PORT):
    socketserver.TCPServer.allow_reuse_address = True
    server_address = (host, port)
    with socketserver.TCPServer(server_address, TasksHTTPRequestHandler) as httpd:
        print(f"[CNTXT Tasks Server] Activo y listo en http://localhost:{port}/", flush=True)
        print(f"  -> Acceso directo: http://127.0.0.1:{port}/", flush=True)
        print(f"  -> Acceso /tasks/: http://127.0.0.1:{port}/tasks/", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.", flush=True)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    run("127.0.0.1", port)
