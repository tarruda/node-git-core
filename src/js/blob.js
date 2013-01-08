var util = require('util')
  , common = require('./common');


function Blob(content) {
  this.constructor.super_.call(this);
  this.content = content;
}
util.inherits(Blob, common.GitObject);

Blob.prototype.serialize = function(visitor, cb){
  this._writeBuffer(new Buffer(this.content || ''), visitor, cb);
};

Blob.prototype.typeCode = 3;

module.exports = Blob;
