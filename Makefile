bin/simplify: bin/simplify.o
	gcc -o $@ bin/simplify.o -static -lm -lstdc++

bin/simplify.o: src/Main.cpp src/*.h
	gcc -o $@ -c src/Main.cpp

clean:
	rm -f bin/*.o

