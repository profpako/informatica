"""Check Pages' C++ change detection against a local Git repository."""
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import textwrap

workflow = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'workflows/pages.yml'
source = workflow.read_text()
block = source.split('        id: cpp-changes\n', 1)[1].split('      - ', 1)[0]
script = textwrap.dedent(block.split('        run: |\n', 1)[1])
assert "steps.cpp-changes.outputs.changed == 'true' && (github.event_name == 'workflow_dispatch'" in source
for name in ['Verifica editor e file del programma', 'Identifica la toolchain verificata', 'Cerca un collaudo identico già superato']:
    step = source.split(f'      - name: {name}\n', 1)[1].split('      - ', 1)[0]
    assert "if: steps.cpp-changes.outputs.changed == 'true'" in step, name
assert "      - name: Costruisci sempre il laboratorio online\n        working-directory:" in source

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()

    git('init', '-q')
    git('config', 'user.email', 'workflow-test@example.invalid')
    git('config', 'user.name', 'Workflow test')
    git('remote', 'add', 'origin', directory)
    def commit(file, content):
        target = root / file
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        git('add', '--', file)
        git('commit', '-qm', 'fixture')
        return git('rev-parse', 'HEAD')

    baseline = commit('app/c++_visualizer/app.js', 'verified')
    commit('sito/elaborazione/index.html', 'page update')
    # The API is stubbed; Git really compares and fetches local commits.
    cli = root / 'bin/gh'
    cli.parent.mkdir()
    cli.write_text('#!/bin/bash\nif [[ "$API_FAIL" == 1 ]]; then exit 1; fi\nprintf "%s\\n" "$PREVIOUS_SHA"\n')
    cli.chmod(0o755)
    def check(expected, previous=baseline, event='push', fail=False):
        output = root / 'output'
        output.write_text('')
        env = dict(os.environ, PATH=f'{cli.parent}:{os.environ["PATH"]}',
                   PREVIOUS_SHA=previous, GITHUB_EVENT_NAME=event, GITHUB_OUTPUT=str(output),
                   GITHUB_REPOSITORY='owner/repo', GITHUB_REF_NAME='main', API_FAIL=str(int(fail)))
        result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', script], cwd=root,
                                env=env, capture_output=True, text=True)
        if fail:
            assert result.returncode != 0 and not output.read_text(), result
        else:
            assert result.returncode == 0, result.stderr
            assert output.read_text() == f'changed={str(expected).lower()}\n', output.read_text()

    check(False)
    check(True, event='workflow_dispatch')
    check(True, previous='')
    check(False, fail=True)
    commit('app/c++_visualizer/app.js', 'unverified change')
    commit('sito/elaborazione/index.html', 'another page update')
    check(True)  # Includes changes in earlier commits and previously failed runs.
    verified = git('rev-parse', 'HEAD')
    check(False, previous=verified)
    commit('.github/workflows/pages.yml', 'toolchain change')
    check(True, previous=verified)
    verified = git('rev-parse', 'HEAD')
    git('rm', '-q', 'app/c++_visualizer/app.js')
    git('commit', '-qm', 'delete fixture')
    check(True, previous=verified)

print('OK: Pages skips C++ tests for pages alone; detects C++, workflow, deletions and unverified commits.')
