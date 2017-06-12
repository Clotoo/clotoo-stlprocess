
const fs = require('fs');


//================================================
// Main
//================================================

const cmd = {
	debug: false,
	gc_interval: 10000,
	file: null,
	outFile: "nodegen.stl",
}

const HELP_MSG = "Usage: node --expose-gc stl2stl.js [PARAMS] file\n"
	+ "Parameters:\n"
	+ "\t-d         , --debug              : enables debug logs\n"
	+ "\t-gc <freq> , --gc-interval=<freq> : overrides GC interval (default " + cmd.gc_interval + ")\n"
	+ "\t-o <file>  , --output-file=<file> : defines output file name (default " + cmd.outFile + ")\n"


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

	var tmpFiles = [
		cmd.outFile + '.header.tmp',
		cmd.outFile + '.part.tmp',
	];
	readStlWritePart(cmd.file, tmpFiles[1], function(err, triCount) {

		console.log("Writing header : " + tmpFiles[0]);
		var buf = new Buffer(84);
		buf.fill();
		buf.writeUInt32LE(triCount, 80);
		fs.writeFileSync(tmpFiles[0], buf);
		console.log("DONE!");

		console.log("Concatenating parts into final file " + cmd.outFile);
		require('child_process').execSync('cat ' + tmpFiles.join(' ') + ' > ' + cmd.outFile + ' && rm ' + tmpFiles.join(' '));
		console.log("DONE!");

		process.exit(0);
	});
}

function parseCmd(args) {
	for ( var i=0; i<args.length; i++ ) {
		var key = args[i].toLowerCase();

		// Debugging
		if ( key == '--debug' || key == '-d' )
			cmd.debug = true;

		// GC Frequency
		else if ( key.startsWith('--gc-interval=') )
			cmd.gc_interval = parseInt(args[i].substr(13));
		else if ( key == '-gc' ) {
			i++;
			cmd.gc_interval = parseInt(args[i]);
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
	console.debug("gc_interval = " + cmd.gc_interval);
	console.debug("input file = " + cmd.file);
	console.debug("output file = " + cmd.outFile);
}


//================================================
// Convert STL Ascii to Binary
//================================================

function readStlWritePart(input, output, cb) {
	console.log("Loading : " + input);
	console.log("Piping to : " + output);

	var outputStream = fs.createWriteStream(output).on('error', function(err) {
		console.error(err);
		process.exit(1);
	});

	var facetBuffer = new Buffer(50);
	facetBuffer.fill();
	var offset = 0;
	var lc = 0;
	var triCount = 0;

	var text = "";

	var rs = fs.createReadStream(input).on('error', function(err) {
		console.error(err);
		process.exit(1);
	}).setEncoding('utf-8').on('data', function(chunk) {
		text += chunk;
		while ( (i = text.indexOf('\n')) != -1 ) {
			rs.emit('line', text.substr(0,i));
			text = text.substr(i+1);
		}
	}).on('line', function(line) {
		lc++;

		if ( lc%cmd.gc_interval == 0 )
				global.gc && global.gc();

		if ( m = line.match(/^[ \t\r\n]*vertex[ \t]+([-+0-9.E]+)[ \t]+([-+0-9.E]+)[ \t]+([-+0-9.E]+)[ \t\r\n]*$/i) ) {
			//console.debug(lc, "vertex", m[1], m[2], m[3]);
			if ( offset != 12 && offset != 24 && offset != 36 )
				throw new Error("Invalid STL - line " + lc + " : unexpected vertex (b" + offset +")");
			facetBuffer.writeFloatLE(parseFloat(m[1]), offset);
			facetBuffer.writeFloatLE(parseFloat(m[2]), offset+4);
			facetBuffer.writeFloatLE(parseFloat(m[3]), offset+8);
			offset += 12;
		}
		else if ( m = line.match(/^[ \t\r\n]*facet[ \t]+normal[ \t]+([-+0-9.E]+)[ \t]+([-+0-9.E]+)[ \t]+([-+0-9.E]+)[ \t\r\n]*$/i) ) {
			//console.debug(lc, "facet", m[1], m[2], m[3]);
			facetBuffer.writeFloatLE(parseFloat(m[1]), 0);
			facetBuffer.writeFloatLE(parseFloat(m[2]), 4);
			facetBuffer.writeFloatLE(parseFloat(m[3]), 8);
			offset = 12;
		}
		else if ( m = line.match(/^[ \t\r\n]*endfacet[ \t\r\n]*$/i) ) {
			//console.debug(lc, "end facet");
			triCount++;
			if ( triCount % 10000 == 0 )
				console.debug("read " + triCount + " facets");

			facetBuffer.writeUInt16LE(0, 48);
			outputStream.write(facetBuffer);

			facetBuffer = new Buffer(50);
			facetBuffer.fill();
		}
	}).on('end', function() {
		// last line
		rs.emit('line', text);
		// flush before finish, otherwise process exits before writing last chunk
		outputStream.end(function() {
			console.log("DONE! total " + triCount + " triangles");
			cb(undefined, triCount);
		});
	})
}


//================================================
main(process.argv);