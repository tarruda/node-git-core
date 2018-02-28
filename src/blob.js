var util = require('util')
  , common = require('./common');


function Blob(contents) {
  this.constructor.super_.call(this);
  this.contents = contents;
}
util.inherits(Blob, common.GitObject);

Blob.prototype.serialize = function(visitor) {
  var contents = this.contents;
  
  if (typeof contents === 'string') contents = new Buffer(contents, 'utf8');

  return this._serialize(contents, visitor);
};

Blob.deserialize = function(contents) {
  var info = common.GitObject.getObjectInfo('blob', contents);

  return [new Blob(info.contents), info.hash];
};

module.exports = Blob;
