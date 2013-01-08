var _zlib = require('../../build/Release/binding.node')
  , returnCodes = {
  Z_OK: binding.Z_OK,
  Z_STREAM_END: binding.Z_STREAM_END,
  Z_NEED_DICT: binding.Z_NEED_DICT,
  Z_ERRNO: binding.Z_ERRNO,
  Z_STREAM_ERROR: binding.Z_STREAM_ERROR,
  Z_DATA_ERROR: binding.Z_DATA_ERROR,
  Z_MEM_ERROR: binding.Z_MEM_ERROR,
  Z_BUF_ERROR: binding.Z_BUF_ERROR,
  Z_VERSION_ERROR: binding.Z_VERSION_ERROR
};

function checkBuffer(data) {
  if (!(data instanceof Buffer))
    throw new Error('expecting buffer');
}

function checkError(returnValue) {
  if (typeof returnValue === 'number')
    throw new Error(returnCodes[returnValue]);
}

function deflate(data) {
  var rv;

  checkBuffer(data);
  rv = _zlib.deflate(data);
  checkError(rv);
  
  return new Buffer(rv, rv.length, 0);
}

function inflate(data, inflatedsize) {
  var rv;

  checkBuffer(data);
  rv = _zlib.inflate(data, inflatedsize);
  checkError(rv);
  rv[0] = new Buffer(rv[0], rv[0].length, 0);

  return rv;
}


Object.keys(returnCodes).forEach(function(k) {
  returnCodes[returnCodes[k]] = k;
});

exports.deflate = deflate;
exports.inflate = inflate;
