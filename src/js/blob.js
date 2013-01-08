var util = require('util')
  , common = require('./common');


function Blob(content) {
  this.constructor.super_.call(this);
  this.content = content;
}
util.inherits(Blob, common.GitObject);

Blob.prototype.toBuffer = function(visitor) {
  var content = this.content;
  
  if (typeof content === 'string') content = new Buffer(content, 'utf8');

  return this._toBuffer(content, visitor);
};

Blob.prototype.typeCode = 3;

module.exports = Blob;
