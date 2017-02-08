
process.env.testing = true;
const handler = require('./index.js');

var response = {};

local({
	inputStlPath: "./tmp/ProfMcDuckley.stl.stl",
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

	return Promise.resolve(true)//return downloadSTL(stlBucket, event.inputStl.awsRef, inputStlPath)
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
					Promise.resolve(true),//uploadSTL(stlBucket, event.inputStl.awsRef, inputStlPath, event.inputStl.name),
					// supposedly faster than validateBinarySTL - we assume we don't have to validate stl2stl's output
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

		// Phase 2 = STL reduction
		// Errors occuring here are not critical

		// >> Start new nested promise
		return Promise.resolve(true)
		.then(function() {
			reduceFactor = handler.TARGET_TRIANGLES / triCount;
			reduceFactor = Math.round(10000*reduceFactor)/10000;
			console.log(">> Calculated reduceFactor = " + reduceFactor);

			if ( reduceFactor < handler.REDUCE_THRESHOLD ) {
				// convert to OBJ, Simplify, and upload reduced STL to lpstl bucket
				response.reduced = true;

				//return execCmd(`${  __dirname }/assimp export ${ inputStlPath } ${ objPath }`);
				// FUCK assimp for now, use ours
				return handler.execCmd(`node --expose-gc ${ __dirname }/stl2obj.js ${ inputStlPath } -o ${ objPath } -f 5000000`)
				.then(function() {
					return handler.execCmd(`${ __dirname }/simplify ${ objPath } ${reducedStlPath } ${ reduceFactor }`);
				})
				.then(function() {
					return Promise.resolve(true);//return uploadSTL(lpstlBucket, event.reducedStl.awsRef, reducedStlPath, event.reducedStl.name);
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
			// reduction error - STL won't be reduced
			console.error("ERROR in phase 2", err);
			response.status = 'OK';
			response.reduced = false;
			if ( !response.info )
				response.info = 'unknown:'+err.name+':'+err.message;
		});

	})
	.catch(function(err) {
		// critical error - STL is invalid
		console.error("ERROR in phase 1", err);
		response.status = 'ERROR';
		if ( !response.info )
			response.info = 'unknown:'+err.name+':'+err.message;
	})
	.then(function() {
		callback(null, response);
		//handler.cleanup();
	});
}
