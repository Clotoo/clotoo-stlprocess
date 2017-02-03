#!/bin/sh
gcc -o js/simplify.o -c src/Main.cpp
gcc -o js/simplify js/simplify.o -static -lm -lstdc++
rm -f js/simplify.o
