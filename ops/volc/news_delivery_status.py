#!/usr/bin/env python3
"""Report actual per-source outcomes without hiding partial delivery failures."""
import os


def report(outcomes):
    failed = False
    for source in ('BLOOMBERG', 'SINA'):
        collected = outcomes.get(source + '_COLLECTION') == 'success'
        delivered = outcomes.get(source + '_DELIVERY') == 'success'
        print(f'NEWS_SOURCE_RESULT source={source.lower()} collected={collected} delivered={delivered}')
        if not collected or not delivered:
            failed = True
            print(f'::error::{source.lower()} original collection/delivery failed; '
                  'the previous feed is retained until a successful delivery.')
    if outcomes.get('TRANSLATION_DELIVERY') == 'failure':
        print('::warning::Translation delivery failed; consult the original per-source results above.')
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(report(os.environ))
