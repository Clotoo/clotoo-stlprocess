
const fs = require('fs');


//================================================
// Main
//================================================

const cmd = {
	debug: false,
	flush_size: 10000000,
	file: null,
	outFile: null,
}

const HELP_MSG = "Usage: node --expose-gc stl2obj.js [PARAMS] file\n"
	+ "Parameters:\n"
	+ "\t-d         , --debug              : enables debug logs\n"
	+ "\t-f <bytes> , --flush-size=<bytes> : overrides writing buffer size (default " + cmd.flush_size + ")\n"
	+ "\t-o <file>  , --output-file=<file> : defines output file name (default <file>.obj)\n"


function main(args) {
	if ( !(global && global.gc) )
		console.error("WARNING: use --expose-gc to reduce memory usage");

	console.debug = function() {
		if ( cmd.debug ) {
			arguments[0] = '[D] ' + arguments[0];
			console.log.apply(console, arguments);
		};
	}

	parseCmd(args.slice(2));

	if ( !cmd.file ) {
		console.log(HELP_MSG);
		process.exit(0);
	}

	var object = loadStl(cmd.file);
	generateObj(object, cmd.outFile);

	process.exit(0);
}

function parseCmd(args) {
	for ( var i=0; i<args.length; i++ ) {
		var key = args[i].toLowerCase();

		// Debugging
		if ( key == '--debug' || key == '-d' )
			cmd.debug = true;

		// Flush size
		else if ( key.startsWith('--flush-size=') )
			cmd.flush_size = parseInt(args[i].substr(13));
		else if ( key == '-f' ) {
			i++;
			cmd.flush_size = parseInt(args[i]);
		}

		// Output file
		else if ( key.startsWith('--output-file=') )
			cmd.outFile = args[i].substr(14);
		else if ( key == '-o' ) {
			i++;
			cmd.outFile = args[i];
		}

		// Unknown switch
		else if ( key.startsWith('-') )
			console.error("WARNING: ignoring unknown switch '" + args[i] + "'");

		// Input file
		else if ( !cmd.file )
			cmd.file = args[i];

		// Extra file ?
		else
			console.error("WARNING: ignoring extra file '" + args[i] + "'");
	}

	if ( !cmd.outFile && cmd.file )
		cmd.outFile = cmd.file.slice(0,-4)+'.obj';

	console.debug("debug : " + cmd.debug);
	console.debug("flush_size = " + cmd.flush_size);
	console.debug("input file = " + cmd.file);
	console.debug("output file = " + cmd.outFile);
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

	console.debug("Triangles count = " + count);

	var vertices = [];
	var normals = [];
	var triangles = [];

	// map vertices to their index (avoid duplicates)
	var vertices_map = {};
	var normals_map = {};

	// custom float read
	buf._readFloatLE = buf.readFloatLE;
	buf.readFloatLE = function(offset) {
		return Math.round(buf._readFloatLE(offset) * 10000) / 10000;
	}

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

		// add vertices
		for ( var j=0; j<3; j++ ) {
			var v = chunk.v[j].join(',');
			if ( !vertices_map[v] ) {
				vertices_map[v] = vertices.length;
				vertices.push(chunk.v[j]);
			}
			chunk.v[j] = vertices_map[v];
		}
		// add normal
		/*
		var v = chunk.n.join(',');
		if ( !normals_map[v] ) {
			normals_map[v] = normals.length;
			normals.push(chunk.n);
		}
		chunk.n = normals_map[v];
		*/

		// add triangle
		triangles.push( {v:[chunk.v[0],chunk.v[1],chunk.v[2]], n:chunk.n} );

		if ( (i%10000) == 0 )
			console.debug("read " + i + " triangles - " + vertices.length + " vertices");
	}
	console.log("DONE! total " + i + " triangles - " + vertices.length + " vertices");

	return { name:f, vertices:vertices, normals:normals, triangles:triangles };
}


//================================================
// Generate OBJ
//================================================

function generateObj(object, file) {
	console.log("Generating : " + file);

	var text = "";
	function comment(c) {
		text += "# " + c + "\n";
	}
	function writeVertex(v) {
		text += "v  " + v.join(' ') + '\n';
	}
	function writeNormal(v) {
		text += "vn  " + v.join(' ') + '\n';
	}
	function writeTriangle(t) {
		//text += "f  " + [t.v[0]+"//"+t.nidx, t.v[1]+"//"+t.nidx, t.v[2]+"//"+t.nidx].join(' ') + '\n';
		text += "f  " + [ (t.v[0]+1), (t.v[1]+1), (t.v[2]+1) ].join(' ') + '\n';
	}
	function flush() {
		console.debug(">>flush");
		fs.appendFileSync(file, text, 'utf-8');
		text = "";
		global && global.gc && global.gc();
	}

	fs.writeFileSync(file, "", 'utf-8');
/*
mtllib SurTalon01.obj.mtl
*/
	comment(object.vertices.length + " vertex positions");
	for ( var i=0; i<object.vertices.length; i++ ) {
		writeVertex(object.vertices[i]);
		if ( text.length > cmd.flush_size ) flush();
	}
	delete object.vertices;

	/*
	comment(object.triangles.length + " vertex normals");
	for ( var i=0; i<object.normals.length; i++ ) {
		writeNormal(object.normals[i]);
		if ( text.length > cmd.flush_size ) flush();
	}
	*/
/*
g <STL_BINARY>
usemtl DefaultMaterial
*/

	comment(object.triangles.length + " triangles");
	for ( var i=0; i<object.triangles.length; i++ ) {
		writeTriangle(object.triangles[i]);
		if ( text.length > cmd.flush_size ) flush();
	}
	delete object.triangles;

	flush();
	console.log("DONE!");
}


//================================================
main(process.argv);