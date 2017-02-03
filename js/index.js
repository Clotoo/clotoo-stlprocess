'use strict';

const path = require('path');
const fs = require('fs');
const exec = require('child_process').exec;

// One triangle == 50 bytes in STL binary form
// => reduce to 40k triangles = 2 Mbytes
const TARGET_TRIANGLES = 40000;
// Algorithm to reduce mesh is expensive (and jerky, for now)
// => only run if it is significant
const REDUCE_THRESHOLD = 0.8;

const AWS = require('aws-sdk');

const tmp = path.resolve('/tmp');

//for testing locally
//const tmp = path.resolve('./tmp');

var response = {};

console.log('Loading function');


exports.handler = (event, context, callback) => {
	try {
		console.log('Received event:', JSON.stringify(event, null, 2));

		response = {};

		var stlBucket = new AWS.S3({ params: { Bucket: event.stlBucket } });
		var lpstlBucket = new AWS.S3({ params: { Bucket: event.lpstlBucket } });

		var inputStlPath = path.join(tmp, event.inputStl.awsRef);
		var objPath = path.join(tmp, event.inputStl.awsRef + ".obj");
		var reducedStlPath = path.join(tmp, event.reducedStl.awsRef);
		var reduceFactor = 1.0;

		downloadSTL(stlBucket, event.inputStl.awsRef, inputStlPath)
		.then(function() {
			return checkSTLMode(inputStlPath)
		})
		.then(function(mode) {
			if ( mode == 'ascii' ) {
				var overrideFilePath = inputStlPath + ".stl";
				return execCmd(`node --expose-gc ${ __dirname }/stl2stl.js ${ inputStlPath } -o ${ overrideFilePath }`)
				.then(function() {
					inputStlPath = overrideFilePath;
					return Promise.all([
						uploadSTL(stlBucket, event.inputStl.awsRef, inputStlPath, event.inputStl.name),
						// supposedly faster than validateBinarySTL - we assume we don't have to validate stl2stl's output
						grabTriCount(inputStlPath),
					]);
				})
				.then(function(results) {
					return results[1];
				})
			}
			else
				return validateBinarySTL(inputStlPath);
		})
		.then(function(triCount) {
			reduceFactor = TARGET_TRIANGLES / triCount;
			reduceFactor = Math.round(10000*reduceFactor)/10000;
			console.log(">> Calculated reduceFactor = " + reduceFactor);

			if ( reduceFactor < REDUCE_THRESHOLD ) {
				// convert to OBJ, Simplify, and upload reduced STL to lpstl bucket
				response.reduced = true;

				//return execCmd(`${  __dirname }/assimp export ${ inputStlPath } ${ objPath }`);
				// FUCK assimp for now, use ours
				return execCmd(`node --expose-gc ${ __dirname }/stl2obj.js ${ inputStlPath } -o ${ objPath } -f 5000000`)
				.then(function() {
					return execCmd(`${ __dirname }/simplify ${ objPath } ${reducedStlPath } ${ reduceFactor }`);
				})
				.then(function() {
					return uploadSTL(lpstlBucket, event.reducedStl.awsRef, reducedStlPath, event.reducedStl.name);
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
			cleanup();
		});
	}
	catch (e) {
		response.status = 'ERROR';
		response.info = 'general:'+e.name+':'+e.message;
		callback(null, response);
	}
};


var checkSTLMode = exports.checkSTLMode = function(stlFile) {
	console.log(">> Checking STL mode for " + stlFile);
	return new Promise(function(_resolve, _reject) {
		function reject(err) {
			response.info = 'check:'+stlFile+':'+err.message;
			_reject(err);
		}
		function resolve(mode) {
			console.log(">> Mode is " + mode);
			_resolve(mode);
		}
		// Read first few bytes to check STL mode
		var buf = new Buffer(50);
		fs.open(stlFile, 'r', function(err, fd) {
			if ( err )
				return reject(err);

			fs.read(fd, buf, 0, buf.length, null, function(err, bytes) {
				if ( err )
					return reject(err);

				fs.close(fd);
				if ( buf.toString('utf-8').toLowerCase().startsWith('solid') )
					resolve('ascii');
				else
					resolve('binary');
			});
		});
	});
}


var grabTriCount = exports.grabTriCount = function(binaryStlFile) {
	console.log(">> Fetching triCount : " + binaryStlFile);
	return new Promise(function(_resolve, _reject) {
		function reject(err) {
			response.info = 'grab:'+binaryStlFile+':'+err.message;
			_reject(err);
		}
		function resolve(triCount) {
			console.log(">> Found triCount = " + triCount);
			_resolve(triCount);
		}
		// triCount is at offset 80
		var buf = new Buffer(84);
		fs.open(binaryStlFile, 'r', function(err, fd) {
			if ( err )
				return reject(err);

			fs.read(fd, buf, 0, buf.length, null, function(err, bytes) {
				if ( err )
					return reject(err);

				fs.close(fd);

				if ( bytes < 84 )
					reject(new Error('Invalid binary STL (too small)'));
				else
					resolve(buf.readUInt32LE(80));
			});
		});
	});
}


var validateBinarySTL = exports.validateBinarySTL = function(binaryStlFile) {
	console.log(">> Validating : " + binaryStlFile);
	return new Promise(function(_resolve, _reject) {
		function reject(err) {
			response.info = 'validate:'+binaryStlFile+':'+err.message;
			_reject(err);
		}
		function resolve(triCount) {
			console.log(">> OK (triCount = " + triCount + ")");
			_resolve(triCount);
		}
		fs.readFile(binaryStlFile, function(err, buf) {
			if ( buf.length < 84 )
				reject(new Error("File size too small (" + buf.length + ")"));

			var triCount = buf.readUInt32LE(80);
			if ( triCount <= 0 )
				reject(new Error("Invalid triangles count (" + triCount + ")"));

			var expectedSize = 84 + triCount*50;
			if ( buf.length != expectedSize )
				reject(new Error("Mismatch file size (" + buf.length + "/" + expectedSize + ")"));

			resolve(triCount);
		});
	});
}


var execCmd = exports.execCmd = function(cmd) {
	console.log(">> Executing `" + cmd + "`");
	return new Promise(function(resolve, reject) {
		var proc = exec(cmd, function(err, stdout, stderr) {
			if ( err ) {
				response.info = 'cmd:'+cmd;
				response.stderr = stderr;
				response.stdout = stdout;
				reject(err);
			}
			else {
				console.log(">> OK");
				resolve();
			}
		});
		proc.stdout.on('data', function(data) {
			console.log(data.toString('utf-8'));
		});
		proc.stderr.on('data', function(data) {
			console.error(data.toString('utf-8'));
		});
	});
}


var downloadSTL = exports.downloadSTL = function(bucket, key, filePath) {
	console.log(">> Downloading " + key);
	return new Promise(function(_resolve, _reject) {
		function reject(err) {
			response.info = 'download:' + key + ':' + err.message;
			_reject(err);
		}
		function resolve() {
			console.log(">> OK (" + key + ")");
			_resolve();
		}
		var out = fs.createWriteStream(filePath).on('error', reject);
		bucket.getObject({ Key: key })
			.createReadStream()
			.on('error', reject)
			.pipe(out)
			.on('finish', resolve);
	});
}


var uploadSTL = exports.uploadSTL = function(bucket, key, filePath, name) {
	console.log(">> Uploading " + key);
	return new Promise(function(_resolve, _reject) {
		function reject(err) {
			response.info = 'upload:'+key+':'+err.message;
			_reject(err);
		}
		function resolve() {
			console.log(">> OK");
			_resolve();
		}
		bucket.upload({
			Key: key,
			Body: fs.createReadStream(filePath).on('error', reject),
			ContentDisposition: 'attachment; filename="' + name + '"',
		}).send(function(err, data) {
			if ( err )
				reject(err);
			else
				resolve(data);
		});
	});
}


var cleanup = exports.cleanup = function() {
	fs.readdir(tmp, function(err, files) {
		if ( !files ) return;
		files.forEach(function(f) {
			if ( f.toLowerCase().endsWith('.stl') || f.toLowerCase().endsWith('.obj') )
				fs.unlink(path.join(tmp, f), function(err) { if ( err ) console.error(err); });
		});
	});
}
