"""Start a replacement frontend with the existing server's runtime settings."""
import json
import subprocess
import sys


def command(old, old_defaults, image, sha):
    host, config = old['HostConfig'], old['Config']
    args = ['docker', 'run', '-d', '--name', 'stock-front', '--label', 'stock.release.sha='+sha]
    restart = host.get('RestartPolicy', {}).get('Name') or 'unless-stopped'
    if restart == 'on-failure' and host['RestartPolicy'].get('MaximumRetryCount'):
        restart += ':'+str(host['RestartPolicy']['MaximumRetryCount'])
    args += ['--restart', restart]
    network = host.get('NetworkMode') or 'bridge'
    if network.startswith('container:'):
        raise ValueError('Container-shared frontend network is unsupported')
    args += ['--network', network]
    for port, bindings in (host.get('PortBindings') or {}).items():
        for binding in bindings or []:
            ip = binding.get('HostIp') or ''
            if ':' in ip:
                ip = '['+ip+']'
            mapping = (ip+':' if ip else '')+binding['HostPort']+':'+port
            args += ['--publish', mapping]
    for mount in old.get('Mounts', []):
        kind = mount['Type']
        if kind not in ('bind', 'volume'):
            raise ValueError('Unsupported frontend mount: '+kind)
        source = mount['Source'] if kind == 'bind' else mount['Name']
        if ',' in source or ',' in mount['Destination']:
            raise ValueError('Unsupported mount path')
        value = 'type='+kind+',src='+source+',dst='+mount['Destination']
        if not mount['RW']:
            value += ',readonly'
        args += ['--mount', value]
    for value in host.get('ExtraHosts') or []:
        args += ['--add-host', value]
    defaults = set(old_defaults.get('Env') or [])
    for value in config.get('Env') or []:
        if value not in defaults:
            args += ['--env', value]
    if config.get('Entrypoint') != old_defaults.get('Entrypoint'):
        raise ValueError('Custom frontend entrypoint requires explicit deployment support')
    args += [image]
    if config.get('Cmd') != old_defaults.get('Cmd'):
        args += config.get('Cmd') or []
    return args


if __name__ == '__main__':
    with open(sys.argv[1]) as stream:
        old = json.load(stream)[0]
    defaults = json.loads(subprocess.check_output(['docker', 'image', 'inspect', old['Image']], universal_newlines=True))[0]['Config']
    args = command(old, defaults, sys.argv[2], sys.argv[3])
    if '--validate' in sys.argv:
        # Validate runtime configuration before stopping the existing frontend.
        sys.exit(0)
    subprocess.check_call(args)
    primary = old['HostConfig'].get('NetworkMode') or 'bridge'
    for network in old['NetworkSettings']['Networks']:
        if network != primary and network not in ('bridge', 'host', 'none'):
            subprocess.check_call(['docker', 'network', 'connect', network, 'stock-front'])
