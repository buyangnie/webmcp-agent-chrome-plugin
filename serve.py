"""Serve the static demo with Origin-Agent-Cluster: ?1.

The native WebMCP API requires an origin-isolated document. This header opts
into an origin-keyed agent cluster, including on managed Chrome installations.
Usage: python serve.py [port]. Default: http://127.0.0.1:8124/.
"""
import functools
import http.server
import socketserver
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Origin-Agent-Cluster", "?1")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    handler = functools.partial(Handler, directory=".")
    with Server(("127.0.0.1", port), handler) as httpd:
        print(f"serving http://127.0.0.1:{port}/  (Origin-Agent-Cluster: ?1)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
