"""Fail publishing if the installable APK and update manifest disagree."""
import hashlib,json,os,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'version.json').read_text())
apk=root/'release/TRACK-Route-EastGodavari.apk'
sdk=Path(os.environ['ANDROID_HOME'])
build_tools=sorted((sdk/'build-tools').iterdir())[-1]
badging=subprocess.check_output([str(build_tools/'aapt'),'dump','badging',str(apk)],text=True)
match=re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",badging)
assert match and match[1]=='org.trace.route', 'Wrong Android package'
assert int(match[2])==manifest['versionCode'], 'APK versionCode differs from update manifest'
assert match[3]==manifest['versionName'], 'APK versionName differs from update manifest'
assert hashlib.sha256(apk.read_bytes()).hexdigest()==manifest['sha256'], 'APK hash differs from update manifest'
cert=subprocess.check_output([str(build_tools/'apksigner'),'verify','--print-certs',str(apk)],text=True)
assert manifest['signingCertificateSha256'] in cert, 'APK signing certificate changed; installed apps cannot upgrade'
print(f"Verified signed APK {manifest['versionName']} (code {manifest['versionCode']}) and update manifest")
