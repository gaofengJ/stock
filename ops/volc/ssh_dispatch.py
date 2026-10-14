#!/usr/bin/python3
"""Route the restricted CI key to fixed upload receivers; never run input as a shell."""
import os

command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
receiver = ('/usr/local/lib/stock-release/health_receiver.py' if command.startswith('health ')
            else '/usr/local/lib/stock-release/release_receiver.py' if command.startswith('release ')
            else '/usr/local/lib/stock-news/feed_receiver.py' if command.startswith('news ')
            else '/usr/local/libexec/stock-receive-image.py')
os.execv('/usr/bin/python3', ['/usr/bin/python3', receiver])
