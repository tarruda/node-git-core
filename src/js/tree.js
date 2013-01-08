var util = require('util')
  , common = require('./common');


function Tree(children) {
  this.constructor.super_.call(this);
  this.children = children || {};
}
util.inherits(Tree, common.GitObject);

Tree.prototype.serialize = function(visitor, cb){
  var contentArray = []
    , keys = Object.keys(this.children).sort()
    , _this = this;

  function serializeChild() {
    var key, value;
    if (!keys.length) {
      process.nextTick(end);
      return;
    }
    key = keys.shift();
    value = _this.children[key];
    value.serialize(visitor, function(obj) {
      var tmp;
      tmp = [];
      if (obj.type === 'blob') {
        tmp.push(new Buffer("100644 " + key));
      } else if (obj.type === 'tree') {
        tmp.push(new Buffer("40000 " + key));
      }
      tmp.push(common.NULL);
      tmp.push(new Buffer(obj.hash, 'hex'));
      contentArray.push(Buffer.concat(tmp));
      process.nextTick(serializeChild);
    });
  }

  function end() {
    if (!contentArray.length) {
      throw new Error('Git tree must have at least one child object');
    }
    _this._writeBuffer(Buffer.concat(contentArray), visitor, cb);
  }

  process.nextTick(serializeChild);
};

Tree.prototype.typeCode = 2;

module.exports = Tree;
