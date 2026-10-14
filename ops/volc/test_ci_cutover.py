import json
from pathlib import Path
import tempfile
import unittest
import prepare_ci_cutover as candidate


class CutoverTest(unittest.TestCase):
    def test_review_contains_no_legacy_ssh_or_mutable_deploy(self):
        files = candidate.candidates()
        for name, text in files.items():
            for forbidden in ('secrets.SSH_PASSWORD', 'secrets.SSH_HOST', 'appleboy/', '47.99.111.167', 'pull_request_target'):
                self.assertNotIn(forbidden, text, name)
        for name in candidate.RETIRED:
            retired = json.loads(files[name])
            self.assertEqual(set(retired['on']), {'workflow_dispatch'})
            self.assertIn('exit 1', retired['jobs']['retired']['steps'][0]['run'])

    def test_auto_release_requires_master_success_and_explicit_enable(self):
        files = candidate.candidates()
        registry = files['volc-registry.yml']
        for guard in ("vars.VOLC_PRODUCTION_ENABLED == 'true'", "workflow_run.conclusion == 'success'",
                      "workflow_run.event == 'push'", "workflow_run.head_repository.full_name == github.repository",
                      "assert current==os.environ['VERIFIED_SHA']"):
            self.assertIn(guard, registry)
        self.assertNotIn('codex/stock-volc-migration', registry)
        self.assertIn('run-id: ${{ github.event.workflow_run.id || inputs.verified_run }}', registry)
        self.assertIn('operations:', files['volc-rehearsal.yml'])
        self.assertIn('contracts:', files['volc-rehearsal.yml'])
        self.assertIn('  articles:', files['volc-rehearsal.yml'])
        self.assertIn('BLOG_NGINX_CONFIG=ops/volc/blog.nginx.conf', files['volc-rehearsal.yml'])
        self.assertIn('blog-cd.yml', candidate.RETIRED)
        self.assertIn("ops/volc -p 'test_*.py'", files['volc-rehearsal.yml'])

    def test_news_same_dispatcher_filename_is_gated(self):
        news = candidate.candidates()['bloomberg-news.yml']
        self.assertIn('dispatch_id:', news)
        self.assertIn('deliver:', news)
        self.assertIn("vars.VOLC_PRODUCTION_ENABLED == 'true'", news)
        self.assertNotIn('  push:', news)
        self.assertEqual(news.count("(github.event_name == 'schedule' || inputs.deliver)"), 3)

    def test_renderer_never_overwrites_or_installs_workflows(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / 'review'
            result = candidate.render(dest)
            self.assertEqual(result['state'], 'review-only-not-installed')
            self.assertFalse(result['productionEnabled'])
            with self.assertRaises(ValueError): candidate.render(dest)
            with self.assertRaises(ValueError): candidate.render(Path(temp) / '.github/workflows')


if __name__ == '__main__': unittest.main()
