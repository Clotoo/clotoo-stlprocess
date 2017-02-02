#!/bin/sh
gcc -o win32/simplify.o -c src/Main.cpp
gcc -o win32/simplify win32/simplify.o -static -lm -lstdc++
rm -f win32/simplify.o
