simplify: simplify.o
	gcc -o $@ simplify.o -static -lm -lstdc++

simplify.o: Main.cpp *.h
	gcc -o $@ -c Main.cpp

clean:
	rm -f *.o
