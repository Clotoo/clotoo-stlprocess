#!/bin/sh
rm -rf pak
mkdir pak
cp bin/assimp pak/
cp bin/simplify pak/
cp index.js pak/
cd pak
zip pak.zip *
cp pak.zip ../
cd ..
rm -rf pak