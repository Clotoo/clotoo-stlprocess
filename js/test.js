
const handler = require('./index.js');

var response = {};

local({
	inputStlPath: "./tmp/SurTalon01.stl",
	reducedStlPath: "./tmp/test_output.stl",
}, function(err, resp) {
	console.log("err", err);
	console.log("resp", resp);
});

function local(event, callback) {
	inputStlPath = event.inputStlPath;
	objPath = event.inputStlPath + ".obj";
	reducedStlPath = event.reducedStlPath;
	reduceFactor = 1.0;

	Promise.resolve(true)	//downloadSTL
	.then(function() {
		return handler.checkSTLMode(inputStlPath)
	})
	.then(function(mode) {
		if ( mode == 'ascii' ) {
			var overrideFilePath = inputStlPath + ".stl";
			return handler.execCmd(`node --expose-gc ${ __dirname }/stl2stl.js ${ inputStlPath } -o ${ overrideFilePath }`)
			.then(function() {
				inputStlPath = overrideFilePath;
				return Promise.all([
					Promise.resolve(true),	//uploadSTL
					handler.grabTriCount(inputStlPath),
				]);
			})
			.then(function(results) {
				return results[1];
			})
		}
		else
			return handler.validateBinarySTL(inputStlPath);
	})
	.then(function(triCount) {
		// One triangle == 50 bytes in STL binary form
		// reduce to 40k triangles = 2 Mbytes
		reduceFactor = 40000 / triCount;
		reduceFactor = Math.round(10000*reduceFactor)/10000;
		console.log(">> Calculated reduceFactor = " + reduceFactor);

		if ( reduceFactor < 0.8 ) {
			// convert to OBJ, Simplify, and upload reduced STL to lpstl bucket
			response.reduced = true;

			//return execCmd(`${  __dirname }/assimp export ${ inputStlPath } ${ objPath }`);
			// FUCK assimp for now, use ours
			return handler.execCmd(`node --expose-gc ${ __dirname }/stl2obj.js ${ inputStlPath } -o ${ objPath } -f 5000000`)
			.then(function() {
				return handler.execCmd(`${ __dirname }/simplify ${ objPath } ${reducedStlPath } ${ reduceFactor }`);
			})
			.then(function() {
				return Promise.resolve(true);	//uploadSTL
			});
		}
		else {
			console.log(">> Skipping reduce");
			response.reduced = false;	//webapp needs to know if we actually reduced it or not
		}
	})
	.then(function() {
		response.status = 'OK';
	})
	.catch(function(err) {
		console.error(err);
		response.status = 'ERROR';
		if ( !response.info )
			response.info = 'unknown:'+err.name+':'+err.message;
	})
	.then(function() {
		callback(null, response);
		//handler.cleanup();
	});
}
