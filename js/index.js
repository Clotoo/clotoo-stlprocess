'use strict';

const path = require('path');
const fs = require('fs');
const exec = require('child_process').exec;

const AWS = require('aws-sdk');
var stlBucket;
var lpstlBucket;

const tmp = path.resolve('/tmp');

var response;

console.log('Loading function');

exports.handler = (event, context, callback) => {
	try {
		console.log('Received event:', JSON.stringify(event, null, 2));

		response = {};

		stlBucket = new AWS.S3({ params: { Bucket: event.stlBucket } });
		stlBucket = new AWS.S3({ params: { Bucket: event.lpstlBucket } });

		var inputFilePath = path.join(tmp, event.inputFile.awsRef);
		var outputFilePath = path.join(tmp, event.outputFile.awsRef);

		var objInputPath = path.join(tmp, event.inputFile.awsRef + ".obj");
		var objOutputPath = path.join(tmp, event.outputFile.awsRef + ".obj");

		downloadSTL(stlBucket, event.inputFile.awsRef, inputFilePath)
		.then(function() {
			return execCmd(`${  __dirname }/assimp export ${ inputFilePath } ${ objInputPath }`);
		})
		.then(function() {
			return execCmd(`${ __dirname }/simplify ${ objInputPath } ${outputFilePath }`);
		})
		.then(function() {
			return uploadSTL(lpstlBucket, event.outputFile.awsRef, outputFilePath, event.outputFile.name);
		})
		.then(function() {
			response.status = 'OK';
		})
		.catch(function(err) {
			console.error(err);
			response.status = 'ERROR';
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

function execCmd(cmd) {
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

function downloadSTL(bucket, key, filePath) {
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

function uploadSTL(bucket, key, filePath, name) {
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

function cleanup() {
	fs.readdir(tmp, function(err, files) {
		if ( !files ) return;
		files.forEach(function(f) {
			if ( f.toLowerCase().endsWith('.stl') )
				fs.unlink(path.join(tmp, f), function(err) { if ( err ) console.error(err); });
		});
	});
}
