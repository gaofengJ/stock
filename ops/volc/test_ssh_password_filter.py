"""Exercise the real distro Fail2Ban parser where installed (also run before rollout)."""
import pathlib
import shutil
import subprocess
import tempfile
import unittest


@unittest.skipUnless(shutil.which('fail2ban-regex'), 'requires distro fail2ban-regex')
class SSHPasswordFilterTest(unittest.TestCase):
    def matching_hosts(self, messages):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            config = root / 'fail2ban'
            shutil.copytree('/etc/fail2ban', config)
            shutil.copyfile(pathlib.Path(__file__).parent / 'ssh-protection/stock-sshd-password.conf',
                            config / 'filter.d/stock-sshd-password.conf')
            log = root / 'fixture.log'
            log.write_text(''.join('Oct 16 11:10:00 server sshd[123]: ' + line + '\n' for line in messages))
            result = subprocess.run(['fail2ban-regex', '-c', str(config), '--usedns=no', '-o', 'ip',
                                     str(log), 'stock-sshd-password'], text=True, capture_output=True, check=True)
            return result.stdout.splitlines()

    def test_real_password_failures_ipv4_ipv6_and_invalid_users(self):
        self.assertEqual(self.matching_hosts([
            'Failed password for root from 192.0.2.1 port 1234 ssh2',
            'Failed password for invalid user oracle from 192.0.2.2 port 1234 ssh2',
            'Failed password for root from 2001:db8::1 port 1234 ssh2 [preauth]',
        ]), ['192.0.2.1', '192.0.2.2', '2001:db8::1'])

    def test_successful_logins_keys_and_network_errors_never_count(self):
        self.assertEqual(self.matching_hosts([
            'Accepted password for root from 192.0.2.1 port 1234 ssh2',
            'Accepted publickey for stock-deploy from 192.0.2.1 port 1234 ssh2: ED25519 SHA256:test',
            'Failed publickey for stock-deploy from 192.0.2.1 port 1234 ssh2',
            'Connection closed by authenticating user stock-deploy 192.0.2.1 port 1234 [preauth]',
            'Connection reset by 192.0.2.1 port 1234',
            'error: kex_exchange_identification: read: Connection reset by peer',
            'drop connection #10 from [192.0.2.1]:1234 on [192.0.2.2]:22 past MaxStartups',
        ]), [])

    def test_username_cannot_spoof_a_victim_address(self):
        self.assertEqual(self.matching_hosts([
            'Failed password for invalid user foo from 192.0.2.99 port 1234 ssh2 from 192.0.2.1 port 5678 ssh2',
        ]), ['192.0.2.1'])


if __name__ == '__main__': unittest.main()
