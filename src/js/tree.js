var util = require('util')
  , common = require('./common');


function Tree(children) {
  this.constructor.super_.call(this);
  this.children = children || {};
}
util.inherits(Tree, common.GitObject);

Tree.prototype.serialize = function(visitor) {
  var key, value, buffer, i
    , contentArray = []
    , keys = Object.keys(this.children).sort();

  for (i = 0; i < keys.length; i++) {
    key = keys[i];
    value = this.children[key];
    buffer = value.serialize(visitor); 
    if (buffer.type === 'blob') {
      contentArray.push(new Buffer("100644 " + key));
    } else if (buffer.type === 'tree') {
      contentArray.push(new Buffer("40000 " + key));
    }
    contentArray.push(common.NULL);
    contentArray.push(new Buffer(buffer.hash, 'hex'));
  }

  return this._serialize(Buffer.concat(contentArray), visitor);
};

Tree.prototype.typeCode = 2;

module.exports = Tree;
