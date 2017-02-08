
const fs = require('fs');


//================================================
// Main
//================================================

function main(args) {
	var file = args[2];
	loadStl(file);
	process.exit(0);
}


//================================================
// Load STL
//================================================

function loadStl(f) {
	console.log("Loading : " + f);

	var buf = fs.readFileSync(f);
	var offset = 80;
	var count = buf.readUInt32LE(offset);
	offset += 4;

	console.log("Triangles count = " + count);

	console.log("Expected size = " + (84+count*50));
	console.log("Actual size   = " + buf.length);

	try {
		for ( var i=0; i<count; i++ ) {
			var chunk = {
				n: [ buf.readFloatLE(offset), buf.readFloatLE(offset+4), buf.readFloatLE(offset+8) ],
				v: [
					[ buf.readFloatLE(offset+12), buf.readFloatLE(offset+16), buf.readFloatLE(offset+20) ],
					[ buf.readFloatLE(offset+24), buf.readFloatLE(offset+28), buf.readFloatLE(offset+32) ],
					[ buf.readFloatLE(offset+36), buf.readFloatLE(offset+40), buf.readFloatLE(offset+44) ]
				],
				attr: buf.readUInt16LE(offset+48),
			}
			offset += 50;

			if ( (i%10000) == 0 )
				console.log("read " + i + " triangles");
		}
		console.log("DONE! total " + i + " triangles");
	}
	catch(e) {
		console.error("ERROR at offset 0x" + offset.toString(16));
		console.error(e.stack);
	}
}


//================================================
main(process.argv);