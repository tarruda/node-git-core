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

Commit.prototype.serialize = function(visitor) {
  var i, parent, buffer
    , ts = common.timestamp(this.date)
    , contentArray = [];

  buffer = this.tree.serialize(visitor);
  contentArray.push('tree ' + buffer.hash);

  for (i = 0; i < this.parents.length; i++) {
    parent = this.parents[i];
    if (typeof parent === 'string') {
      contentArray.push('parent ' + parent);
    } else if (parent instanceof Commit) {
      buffer = parent.serialize(visitor);
      contentArray.push('parent ' + buffer.hash);
    }
  }

  contentArray.push("author " + this.author + " " + ts);
  if (!this.committer) this.committer = this.author;
  contentArray.push("committer " + this.committer + " " + ts);
  contentArray.push('\n');
  contentArray.push(this.message);

  return this._serialize(new Buffer(contentArray.join('\n')), visitor);
};

Commit.prototype.typeCode = 1;

module.exports = Commit;
