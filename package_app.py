"""Gera o ZIP distribuível sem caches, uploads ou metadados do Git."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
FILES = ['README.md', 'PROFILES.md', '.gitignore', 'server.py', 'comtrade_reader.py',
         'profiles.py', 'comparison.js', 'report.js', 'app.js', 'index.html', 'package_app.py']


if __name__ == '__main__':
    destination = ROOT / 'downloads' / 'Oscilography.zip'
    destination.parent.mkdir(exist_ok=True)
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED) as archive:
        for name in FILES:
            archive.write(ROOT / name, 'Oscilography/' + name)
        for path in sorted((ROOT / 'tests').glob('test_*')):
            if path.is_file() and path.suffix in ('.py', '.js'):
                archive.write(path, 'Oscilography/tests/' + path.name)
    with ZipFile(destination) as archive:
        assert archive.testzip() is None
    print(destination)
