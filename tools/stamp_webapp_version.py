#!/usr/bin/env python3
"""Stamp integer major/minor WebApp releases independently of build numbers."""
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess


def stamp_metadata(metadata, previous, source_sha, build_number, published_at):
    if not re.fullmatch(r'[0-9a-f]{40}', source_sha):
        raise ValueError('A full source commit SHA is required')
    result = deepcopy(metadata)
    current = re.fullmatch(r'(\d+)\.(\d+)', str(result.get('version', '')))
    if not current:
        raise ValueError('WebApp version must be integer major.minor, such as 1.9')
    if result.get('buildCommit') == source_sha[:12]:
        return result
    # Preserve an explicitly requested release, including the initial migration
    # from 1.8.1+build to 1.9. Otherwise advance the minor integer, never a float.
    if previous.get('version') == result['version']:
        result['version'] = f'{int(current[1])}.{int(current[2]) + 1}'
    result.update(buildCommit=source_sha[:12], buildNumber=int(build_number),
                  channel='release', publishedAt=published_at)
    return result


def main():
    source = os.environ['SOURCE_SHA']
    previous = json.loads(subprocess.check_output(
        ['git', 'show', source + '^:app-version.json'], text=True))
    path = Path('app-version.json')
    metadata = stamp_metadata(json.loads(path.read_text()), previous, source,
                              os.environ['BUILD_NUMBER'],
                              datetime.now(timezone.utc).isoformat())
    path.write_text(json.dumps(metadata, indent=2) + '\n')
    print('WebApp version:', metadata['version'], 'source:', metadata['buildCommit'])


if __name__ == '__main__':
    main()
