var util = require('util')
  , common = require('./common');


function Tree(children) {
  this.constructor.super_.call(this);
  this.children = children || {};
}
util.inherits(Tree, common.GitObject);

// TODO add API to support file modes
Tree.prototype.serialize = function(visitor) {
  var key, value, serialized, i, type, hash
    , contentArray = []
    , keys = Object.keys(this.children).sort();

  for (i = 0; i < keys.length; i++) {
    key = keys[i];
    value = this.children[key];
    serialized = value.serialize(visitor); 
    type = serialized.getType();
    hash = serialized.getHash();
    if (type === 'blob') {
      contentArray.push(new Buffer("100644 " + key));
    } else if (type === 'tree') {
      contentArray.push(new Buffer("40000 " + key));
    }
    contentArray.push(common.NULL);
    contentArray.push(new Buffer(hash, 'hex'));
  }

  return this._serialize(Buffer.concat(contentArray), visitor);
};

Tree.prototype.resolveReferences = function(objectPool) {
  var k, v;
  
  for (k in this.children) {
    v = this.children[k];
    if (typeof v === 'string')
      this.children[k] = objectPool[v] || v;
  }
};

Tree.deserialize = function(contents) {
  var childName, hash, hashStart
    , match
    , pos = 0
    , children = {}
    , info = common.GitObject.getObjectInfo('tree', contents);

  while (pos < info.contents.length) {
    // find the blob/tree name/mode
    // FIXME for now this implementation is ignoring file modes
    match = /^\d+\s(.+)$/.exec(info.contents.slice(
      pos, common.findNull(info.contents, pos)).toString('utf8'));
    if (!match)
      throw new Error('could not parse tree');
    childName = match[1];
    hashStart = pos + Buffer.byteLength(match[0]) + 1; // skip NULL
    hash = info.contents.slice(hashStart, hashStart + 20); 
    children[childName] = hash.toString('hex');
    pos = hashStart + 20;
  }

  // pos should equal the length by now
  if (pos !== info.contents.length)
    throw new Error('could not parse tree');

  return [new Tree(children), info.hash];
};

module.exports = Tree;
