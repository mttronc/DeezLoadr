rmdir /s /q BUILDS

pkg package.json --targets latest-macos-x64,latest-win-x86,latest-win-x64,latest-linux-x86,latest-linux-x64 --out-dir BUILDS