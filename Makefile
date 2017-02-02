all: bin/simplify bin/assimp

bin/simplify: bin/simplify.o
	gcc -o $@ bin/simplify.o -static -lm -lstdc++

bin/simplify.o: src/Main.cpp src/*.h
	gcc -o $@ -c src/Main.cpp

bin/assimp:
	cd assimp && make && cd ..

clean:
	rm -f bin/*.o

