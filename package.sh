#!/bin/sh
rm -rf pak.zip
zip -r pak.zip bin/simplify js/index.js js/stl2stl.js js/stl2obj.js js/node_modules
