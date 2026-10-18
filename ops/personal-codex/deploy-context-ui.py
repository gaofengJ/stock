#!/usr/bin/python3
"""Use the verified frontend release flow for menu ordering and visible business entries."""
import importlib.util,json,pathlib,shutil
source=pathlib.Path(__file__).with_name('deploy-native-ui.py')
spec=importlib.util.spec_from_file_location('native_release',source)
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
release.ROOT=pathlib.Path('/opt/stock-personal-console/context-ui-release')
release.BASE='stock-front:personal-ai-menu-order-20261018'
release.IMAGE='stock-front:personal-ai-context-v2-20261018'
release.STAGE='stock-personal-console-context-stage'
if __name__=='__main__':
    try:
        release.ROOT.mkdir(mode=0o700,exist_ok=True)
        shutil.copyfile('/opt/stock-personal-console/front-context.tar.gz',release.ROOT/'front-native.tar.gz')
        release.main()
    except Exception as error:
        print(json.dumps({'deployed':False,'reason':str(error) if isinstance(error,RuntimeError) else type(error).__name__}));raise SystemExit(1)
