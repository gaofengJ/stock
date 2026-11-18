#!/usr/bin/python3
"""Receive signed collector snapshots through the stock site's HTTPS proxy."""
import base64
from http.server import BaseHTTPRequestHandler, HTTPServer
import io
import json
from pathlib import Path
import subprocess
import tempfile

from feed_receiver import COMMAND, MAX_BYTES, receive

PATH = '/ops/news-delivery'
NAMESPACE = 'stock-news-delivery-v1'
SIGNERS = Path('/etc/stock-news-http-signers')


def verified(command, signature, signers=SIGNERS):
    with tempfile.NamedTemporaryFile() as signed:
        signed.write(signature)
        signed.flush()
        result = subprocess.run(
            ['ssh-keygen', '-Y', 'verify', '-I', 'stock-news-ci', '-n', NAMESPACE,
             '-f', str(signers), '-s', signed.name],
            input=command.encode('ascii'), capture_output=True, timeout=3,
        )
    return result.returncode == 0


class NewsHandler(BaseHTTPRequestHandler):
    timeout = 5

    def log_message(self, *_):
        # Nginx logs status and timing. Never echo request contents or headers.
        pass

    def reply(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != PATH:
            self.reply(404, {'error': 'unknown path'})
            return
        commands = self.headers.get_all('X-Stock-News-Command') or []
        signatures = self.headers.get_all('X-Stock-News-Signature') or []
        if len(commands) != 1 or len(signatures) != 1:
            self.reply(403, {'error': 'signature rejected'})
            return
        command, = commands
        signature, = signatures
        lengths = self.headers.get_all('Content-Length') or []
        if (len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdecimal()
                or len(lengths[0]) > 7 or not 0 < int(lengths[0]) <= MAX_BYTES
                or self.headers.get('Transfer-Encoding')):
            self.reply(400, {'error': 'invalid body length'})
            return
        try:
            authenticated = (COMMAND.fullmatch(command) and 0 < len(signature) <= 1024
                             and verified(command, base64.b64decode(signature, validate=True)))
        except ValueError:
            authenticated = False
        except (OSError, subprocess.TimeoutExpired):
            self.reply(503, {'error': 'signature verification unavailable'})
            return
        if not authenticated:
            self.reply(403, {'error': 'signature rejected'})
            return
        try:
            raw = self.rfile.read(int(lengths[0]))
            if len(raw) != int(lengths[0]):
                self.reply(400, {'error': 'incomplete body'})
                return
            receipt = receive(command, io.BytesIO(raw))
        except (ValueError, TypeError, KeyError) as error:
            self.reply(422, {'error': 'feed rejected'})
            print(f'NEWS_HTTPS_REJECT reason={type(error).__name__}', flush=True)
            return
        except OSError:
            self.reply(503, {'error': 'feed receiver unavailable'})
            return
        print(f'NEWS_HTTPS_RECEIPT {json.dumps(receipt)}', flush=True)
        self.reply(200, receipt)


if __name__ == '__main__':
    with HTTPServer(('127.0.0.1', 18788), NewsHandler) as server:
        server.serve_forever()
