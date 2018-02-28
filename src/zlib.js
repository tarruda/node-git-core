var _zlib = require('zlib');
var returnCodes = {
    Z_OK: _zlib.Z_OK,
    Z_STREAM_END: _zlib.Z_STREAM_END,
    Z_NEED_DICT: _zlib.Z_NEED_DICT,
    Z_ERRNO: _zlib.Z_ERRNO,
    Z_STREAM_ERROR: _zlib.Z_STREAM_ERROR,
    Z_DATA_ERROR: _zlib.Z_DATA_ERROR,
    Z_MEM_ERROR: _zlib.Z_MEM_ERROR,
    Z_BUF_ERROR: _zlib.Z_BUF_ERROR,
    Z_VERSION_ERROR: _zlib.Z_VERSION_ERROR
};

// idea stolen from node.js zlib bindings
Object.keys(returnCodes).forEach(function(k) {
  returnCodes[returnCodes[k]] = k;
});


function checkBuffer(data) {
  if (!(data instanceof Buffer))
    throw new Error('expecting buffer');
}

function checkError(returnValue) {
  if (typeof returnValue === 'number')
    throw new Error(returnCodes[returnValue]);
}

function deflate(data) {
    checkBuffer(data);
    
    var info = _zlib.deflateSync(data, {info: true});

    return info.buffer;
}

function inflate(data, inflatedsize) {
    checkBuffer(data);
    
    var info = _zlib.inflateSync(data, {info: true});
    
    return [ info.buffer, info.engine.bytesRead ];
}

exports.deflate = deflate;
exports.inflate = inflate;
