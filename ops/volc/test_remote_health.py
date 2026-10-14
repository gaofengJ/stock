import datetime as dt
import unittest
from check_remote_health import assess
from health_receiver import read
NOW=dt.datetime(2026,10,14,12,tzinfo=dt.timezone.utc)

class HealthTest(unittest.TestCase):
    def report(self):
        return dict(checkedAt=NOW.isoformat(),production=False,maintenance=True,backendHealthy=True,
                    databaseHealthy=True,backupHealthy=False,backupIssues=['backup_timer_disabled_or_unknown'],recurringOffhostVerified=False)
    def test_rehearsal_transport_is_not_a_production_pass(self):
        value=self.report()
        self.assertEqual(assess(value,NOW,False),[])
        self.assertEqual(set(assess(value,NOW,True)),{'production_not_open','local_backup_unhealthy','recurring_offhost_unverified'})
    def test_stale_or_broken_host_is_reported(self):
        value=self.report();value.update(checkedAt=(NOW-dt.timedelta(minutes=21)).isoformat(),databaseHealthy=False)
        self.assertEqual(set(assess(value,NOW,False)),{'health_snapshot_stale_or_invalid','databaseHealthy'})
    def test_production_requires_both_backup_protections(self):
        value=self.report();value.update(production=True,maintenance=False,backupHealthy=True,recurringOffhostVerified=True)
        self.assertEqual(assess(value,NOW,True),[])
        value['recurringOffhostVerified']=False
        self.assertEqual(assess(value,NOW,True),['recurring_offhost_unverified'])
    def test_no_arbitrary_file_or_command(self):
        for command in ['id','health status /etc/stock/runtime.env','health /etc/passwd']:
            with self.assertRaises(ValueError):read(command)

if __name__=='__main__':unittest.main()
