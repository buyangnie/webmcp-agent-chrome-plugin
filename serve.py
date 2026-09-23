"""Serve the WebMCP demos and proxy Ops Factory calls to GDE and Gateway.

The native WebMCP API requires an origin-isolated document, so every response
carries Origin-Agent-Cluster: ?1. Browser code calls POST /api/<operation>
with a JSON body; this server maps the operation to a whitelisted upstream
endpoint and injects credentials, which never reach the page. This avoids
CORS (GDE sends no CORS headers) and GDE's self-signed certificate.

Credentials come from demo-ops-factory/fo.local.json (git-ignored) or FO_* environment
variables. Write operations are rejected unless --allow-write is given.

Usage: python serve.py [port] [--allow-write]. Default: http://127.0.0.1:8124/.
"""
import argparse
import base64
import functools
import http.server
import json
import os
import socketserver
import ssl
import urllib.error
import urllib.parse
import urllib.request

CONFIG_FILE = "demo-ops-factory/fo.local.json"
CONFIG_ENV = {
    "gdeBase": "FO_GDE_BASE",
    "gdeUser": "FO_GDE_USER",
    "gdePassword": "FO_GDE_PASSWORD",
    "gatewayBase": "FO_GATEWAY_BASE",
    "gatewayUser": "FO_GATEWAY_USER",
    "gatewayKey": "FO_GATEWAY_KEY",
}
MAX_BODY = 1 << 20
TIMEOUT = 30
INCIDENT = "/msticket/machine/incident/"

# operation: (host, method, path, writes). GET operations send the JSON body
# as the query string; "{actionInsId}" is filled from the body.
OPERATIONS = {
    "queryIncidentDetail": ("gde", "POST", INCIDENT + "queryIncidentDetail", False),
    "queryIncidentAlarmDetail": ("gde", "GET", INCIDENT + "queryIncidentAlarmDetail", False),
    "queryCurrentOperator": ("gde", "GET", INCIDENT + "queryCurrentOperator", False),
    "getAlarmByCsn": ("gde", "GET", "/itom/machine/alarmInfo/getAlarmByCsn", False),
    "queryIncidentWorkLogs": ("gde", "POST", INCIDENT + "queryIncidentWorkLogs", False),
    "queryIncidentPriority": ("gde", "POST", INCIDENT + "queryIncidentPriority", False),
    "queryBoCondition": ("gde", "POST", INCIDENT + "queryBoCondition", False),
    "updateIncidentParam": ("gde", "POST", INCIDENT + "updateIncidentParam", True),
    "setAiAttachment": ("gde", "POST", INCIDENT + "setAiAttachment", True),
    "processIncident": ("gde", "POST", INCIDENT + "processIncident", True),
    "incidentTransfer": ("gde", "GET", INCIDENT + "incidentTransfer", True),
    "ticketComment": ("gde", "POST", INCIDENT + "ticketComment", True),
    "listScripts": ("gateway", "GET", "/api/gateway/predefined-scripts", False),
    "listHosts": ("gateway", "GET", "/api/gateway/hosts", False),
    "getExecution": ("gateway", "GET", "/api/gateway/scripts/execution/{actionInsId}", False),
    "executeScript": ("gateway", "POST", "/api/gateway/scripts/execute", True),
}


def load_config() -> dict:
    config = {}
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, encoding="utf-8") as f:
            config = json.load(f)
    for key, env in CONFIG_ENV.items():
        if os.environ.get(env):
            config[key] = os.environ[env]
    return config


def proxy_status(config: dict, allow_write: bool) -> dict:
    return {
        "gde": all(config.get(k) for k in ("gdeBase", "gdeUser", "gdePassword")),
        "gateway": all(config.get(k) for k in ("gatewayBase", "gatewayUser", "gatewayKey")),
        "allowWrite": allow_write,
    }


def upstream_request(config: dict, operation: str, payload: dict):
    host, method, path, _ = OPERATIONS[operation]
    headers = {"Accept": "application/json"}
    context = None
    if host == "gde":
        base = config["gdeBase"]
        token = f"{config['gdeUser']}:{config['gdePassword']}".encode()
        headers["Authorization"] = "Basic " + base64.b64encode(token).decode()
        # GDE uses a self-signed certificate.
        context = ssl._create_unverified_context()
    else:
        base = config["gatewayBase"]
        headers["x-user-id"] = config["gatewayUser"]
        headers["x-secret-key"] = config["gatewayKey"]
    if "{actionInsId}" in path:
        action = str(payload.pop("actionInsId", ""))
        if not action or not all(c.isalnum() or c == "-" for c in action):
            raise ValueError("actionInsId must contain only letters, digits, and hyphens.")
        path = path.replace("{actionInsId}", action)
    url = base.rstrip("/") + path
    data = None
    if method == "GET":
        if payload:
            url += "?" + urllib.parse.urlencode(payload, quote_via=urllib.parse.quote)
    else:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT, context=context) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class Handler(http.server.SimpleHTTPRequestHandler):
    config: dict = {}
    allow_write = False

    def end_headers(self):
        self.send_header("Origin-Agent-Cluster", "?1")
        super().end_headers()

    def send_json(self, status: int, body) -> None:
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/status":
            return self.send_json(200, proxy_status(self.config, self.allow_write))
        if path.startswith("/api/"):
            return self.send_json(405, {"error": "Use POST for /api operations."})
        if path.rstrip("/") == "/" + CONFIG_FILE:
            return self.send_json(404, {"error": "Not found."})
        super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api/"):
            return self.send_json(404, {"error": "Not found."})
        # A custom header forces a CORS preflight, which this server never
        # approves, so other origins cannot drive the proxy.
        if self.headers.get("X-FO-Proxy") != "1":
            return self.send_json(403, {"error": "Missing X-FO-Proxy header."})
        operation = self.path[len("/api/"):].split("?")[0]
        if operation not in OPERATIONS:
            return self.send_json(404, {"error": f"Unknown operation {operation}."})
        host, _, _, writes = OPERATIONS[operation]
        if not proxy_status(self.config, self.allow_write)[host]:
            return self.send_json(503, {"error": f"{host} credentials are not configured."})
        if writes and not self.allow_write:
            return self.send_json(
                403,
                {"error": f"{operation} writes data; restart serve.py with --allow-write."},
            )
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send_json(413, {"error": "Request body is too large."})
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(payload, dict):
                raise ValueError("Body must be a JSON object.")
            status, body = upstream_request(self.config, operation, payload)
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        except OSError as e:
            return self.send_json(502, {"error": f"Upstream unreachable: {e}"})
        self.log_message("%s -> %s (%s)", operation, status, "write" if writes else "read")
        self.send_json(status, body)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("port", nargs="?", type=int, default=8124)
    parser.add_argument("--allow-write", action="store_true")
    args = parser.parse_args()
    Handler.config = load_config()
    Handler.allow_write = args.allow_write
    handler = functools.partial(Handler, directory=".")
    state = proxy_status(Handler.config, args.allow_write)
    with Server(("127.0.0.1", args.port), handler) as httpd:
        print(
            f"serving http://127.0.0.1:{args.port}/  (Origin-Agent-Cluster: ?1, "
            f"GDE {'ready' if state['gde'] else 'not configured'}, "
            f"Gateway {'ready' if state['gateway'] else 'not configured'}, "
            f"writes {'enabled' if args.allow_write else 'disabled'})"
        )
        httpd.serve_forever()


if __name__ == "__main__":
    main()
