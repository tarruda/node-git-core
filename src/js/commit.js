var util = require('util')
  , common = require('./common');


function Commit(tree, author, committer, date, message, parents) {
  this.constructor.super_.call(this);
  this.tree = tree;
  this.author = author;
  this.committer = committer;
  this.date = date;
  this.message = message;
  this.parents = parents || [];
}
util.inherits(Commit, common.GitObject);

Commit.prototype.serialize = function(visitor, cb){
  var i, parent
    , ts = common.timestamp(this.date)
    , parents = this.parents.slice()
    , contentArray = []
    , _this = this;

  if (!this.tree) throw new Error('Git commit must reference a tree object');
  if (!this.author) throw new Error('Git commit needs an author');
  if (!this.committer) this.committer = this.author;
  if (!this.message)  throw new Error('Git commit needs a message');

  for (i = 0; i < parents.length; i++) {
    parent = parents[i];
    if (!(parent instanceof Commit) && !common.SHA1.test(parent.toString())) {
      throw new Error('parent must be a commit or string in sha1 hex format');
    }
  }

  function serializeTree() {
    _this.tree.serialize(visitor, function(tree) {
      contentArray.push("tree " + tree.hash);
      process.nextTick(serializeParent);
    });
  }

  function serializeParent() {
    if (!parents.length) {
      process.nextTick(end);
      return;
    }
    parent = parents.shift();
    if (typeof parent === 'string') {
      contentArray.push("parent " + parent);
      process.nextTick(serializeParent);
    } else if (parent instanceof Commit) {
      parent.serialize(visitor, function(commit) {
        contentArray.push("parent " + commit.hash);
        process.nextTick(serializeParent);
      });
    }
  }

  function end() {
    contentArray.push("author " + _this.author + " " + ts);
    contentArray.push("committer " + _this.committer + " " + ts);
    contentArray.push('\n');
    contentArray.push(_this.message);
    _this._writeBuffer(new Buffer(contentArray.join('\n')), visitor, cb);
  };

  process.nextTick(serializeTree);
};

Commit.prototype.typeCode = 1;

module.exports = Commit;
