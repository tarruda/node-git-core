/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const fs = require('fs');
const path = require('path');
const temp = require('temp');
const zlib = require('zlib');
const glob = require('glob');
const wrench = require('wrench');
const {spawn} = require('child_process');
const {expect} = require('chai');
const {Blob, Tree, Commit, Tag, Pack} = require('../src');
const _zlib = require('../src/zlib');
const {patch, diff} = require('../src/delta');


const createGitRepo = function(done) {
  return temp.mkdir('test-repo', (err, path) => {
    this.path = path;
    const git = spawn('git', ['init', path]);
    return git.on('exit', () => done());
  });
};

const deleteGitRepo = function() { return wrench.rmdirSyncRecursive(this.path, true); };

const captureOutput = function(child, cb) {
  const out = [];
  const err = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => out.push(chunk));
  child.stderr.on('data', chunk => err.push(chunk));
  return child.stderr.on('end', () => cb(out.join(''), err.join('')));
};
  
const writeGitGraph = function(repo, root, refName, cb) {
  let count = 0;
  const writeCb = function() {
    count--;
    if (!count) { return cb(); }
  };
  const head = root.serialize(function(serialized) {
    count++;
    return writeGitObject(repo, serialized, writeCb);
  });
  if (refName) {
    let refType;
    if (head.getType() === 'tag') {
      refType = 'tags';
    } else {
      refType = 'heads';
    }
    const refPath = path.join(repo, '.git', 'refs', refType, refName);
    return fs.writeFileSync(refPath, head.getHash(), 'utf8');
  }
};
      
var writeGitObject = function(repo, serialized, cb) {
  const hash = serialized.getHash();
  const dir = path.join(repo, '.git', 'objects', hash.slice(0, 2));
  return fs.mkdir(dir, function() {
    const bufferPath = path.join(dir, hash.slice(2));
    const bufferFile = fs.createWriteStream(bufferPath, {mode: 0o444});
    const deflate = zlib.createDeflate();
    deflate.pipe(bufferFile);
    bufferFile.on('open', function() {
      deflate.end(serialized.getData());
      if (typeof cb === 'function') { return bufferFile.on('close', cb); }
    });
    return bufferFile.on('error', function(err) {
      if (typeof cb === 'function') { return cb(); }
    });
  });
};

const testObjects = function() {
  const d1 = new Date(1000000000);
  const d2 = new Date(2000000000);
  const d3 = new Date(3000000000);
  const d4 = new Date(4000000000);
  let str = '';
  for (let i = 0; i < 1000; i++) {
    str += 'test content/test content2/test content3\n';
  }
  this.b1 = new Blob(str);
  // this encode second blob as a delta of the first in packfiles
  this.b2 = new Blob(str + 'append');
  this.b3 = new Blob('subdir test content\n');
  this.t1 = new Tree({
    'file-under-tree': this.b3
  });
  this.t2 = new Tree({
    'some-file.txt': this.b2,
    'some-file2.txt': this.b1,
    'sub-directory.d': this.t1
  });
  this.t3 = new Tree({
    'another-file.txt': this.b1
  });
  this.c1 = new Commit({
    tree: this.t1,
    author: {
      name: 'Git Author',
      email: 'author@git.com',
      date: d1
    },
    message: 'Artificial commit 1'
  });
  this.c2 = new Commit({
    tree: this.t2,
    author: {
      name: 'Git Author',
      email: 'author@git.com',
      date: d2
    },
    message: 'Artificial commit 2',
    parents: [this.c1]
  });
  this.c3 = new Commit({
    tree: this.t3,
    author: {
      name: 'Git User',
      email: 'user@domain.com',
      date: d3
    },
    committer: {
      name: 'Git Commiter',
      email: 'committer@git.com',
      date: d4
    },
    message: 'Artificial commit 3',
    parents: [this.c2]
  });
  return this.tag = new Tag({
    object: this.c2,
    name: 'v0.0.1',
    tagger: {
      name: 'Git Tagger',
      email: 'tagger@git.com'
    },
    date: d2,
    message: 'Tag second commit'
  });
};

suite('object serialization/deserialization', function() {

  setup(testObjects);

  test('blob', function() {
    const serialized = this.b1.serialize();
    const [blob, hash] = Array.from(Blob.deserialize(serialized.getData()));
    expect(blob.contents.toString('utf8')).to.equal(this.b1.contents);
    return expect(hash).to.equal(serialized.getHash());
  });

  test('tree', function() {
    const serialized = this.t2.serialize();
    const [tree, hash] = Array.from(Tree.deserialize(serialized.getData()));
    expect(tree.children['some-file2.txt']).to.equal(this.b1.serialize().getHash());
    expect(tree.children['some-file.txt']).to.equal(this.b2.serialize().getHash());
    expect(tree.children['sub-directory.d']).to.equal(this.t1.serialize().getHash());
    return expect(hash).to.equal(serialized.getHash());
  });

  test('commit', function() {
    const serialized = this.c2.serialize();
    const [commit, hash] = Array.from(Commit.deserialize(serialized.getData()));
    expect(commit.tree).to.equal(this.t2.serialize().getHash());
    expect(commit.author).to.deep.equal(this.c2.author);
    expect(commit.parents[0]).to.equal(this.c1.serialize().getHash());
    expect(commit.message).to.equal(this.c2.message);
    return expect(hash).to.equal(serialized.getHash());
  });

  test('tag', function() {
    const serialized = this.tag.serialize();
    const [tag, hash] = Array.from(Tag.deserialize(serialized.getData()));
    expect(tag.object).to.equal(this.c2.serialize().getHash());
    expect(tag.type).to.equal('commit');
    expect(tag.name).to.equal(this.tag.name);
    expect(tag.tagger).to.deep.equal(this.tag.tagger);
    expect(tag.date.getTime()).to.equal(this.tag.date.getTime());
    expect(tag.message).to.equal(this.tag.message);
    return expect(hash).to.equal(serialized.getHash());
  });

  test('pack', function() {
    const pack = new Pack([this.c3, this.tag]);
    const serialized = pack.serialize();
    const deserialized = Pack.deserialize(serialized);
    return expect(serialized.toString('base64')).to.equal(
      deserialized.serialize().toString('base64'));
  });

  test('pack with deltas and base object', function() {
    let str = '';
    for (let i = 0; i < 1000; i++) {
      str += 'test content/test content2/test content3\n';
    }
    const b1 = new Blob(str);
    const b2 = new Blob(str + 'append\n');
    const b3 = new Blob(str + 'append\nappend2\n');
    const b4 = new Blob(str + 'append\nappend2\nappend3\n');
    // pack only b1 and deltas necessary for b2, b3 and b4
    const pack = new Pack([
      b1,
      b2.diff(b1),
      b3.diff(b2),
      b4.diff(b3)
    ]);
    const pack2 = Pack.deserialize(pack.serialize());
    expect(pack2.objects[0].contents.toString()).to.equal(b1.contents);
    expect(pack2.objects[1].contents.toString()).to.equal(b2.contents);
    expect(pack2.objects[2].contents.toString()).to.equal(b3.contents);
    return expect(pack2.objects[3].contents.toString()).to.equal(b4.contents);
  });

  return test('pack with deltas and no base object(thin pack)', function() {
    let str = '';
    for (let i = 0; i < 1000; i++) {
      str += 'test content/test content2/test content3\n';
    }
    const b1 = new Blob(str);
    const b2 = new Blob(str + 'append\n');
    const b3 = new Blob(str + 'append\nappend2\n');
    const b4 = new Blob(str + 'append\nappend2\nappend3\n');
    // pack only b1 and deltas necessary for b2, b3 and b4
    const pack = new Pack([
      b2.diff(b1),
      b3.diff(b2),
      b4.diff(b3)
    ]);
    let pack2 = null;
    // deserialize on thin pack will throw without a function 
    // second argument
    expect(() => pack2 = Pack.deserialize(pack.serialize())).to.throw();
    pack2 = Pack.deserialize(pack.serialize(), function(baseId) {
      // this function is called for resolving base objects
      // not found in the pack
      expect(baseId).to.equal(b1.serialize().getHash());
      return b1;
    });
    expect(pack2.objects[0].contents.toString()).to.equal(b2.contents);
    expect(pack2.objects[1].contents.toString()).to.equal(b3.contents);
    return expect(pack2.objects[2].contents.toString()).to.equal(b4.contents);
  });
});


suite('git repository manipulation', function() {

  suiteSetup(createGitRepo);

  suiteTeardown(deleteGitRepo);

  setup(function(done) {
    testObjects.call(this);
    // write objects to the repository
    return writeGitGraph(this.path, this.c3, 'master', () => {
      return writeGitGraph(this.path, this.tag, this.tag.name, done);
    });
  });

  test('check repository integrity', function(done) {
    const gitFsck = spawn('git', ['fsck', '--strict'], {cwd: this.path});
    return captureOutput(gitFsck, function(stdout, stderr) {
      expect(stdout).to.equal('');
      expect(stderr).to.equal('');
      return done();
    });
  });

  test('unpack objects in repository', function(done) {
    // delete all git objects written so git-unpack-objects will
    // actually unpack all objects
    const objectsDir = path.join(this.path, '.git', 'objects');
    const find = spawn('find', [objectsDir, '-type', 'f', '-delete']);
    return captureOutput(find, (stdout, stderr) => {
      expect(stdout).to.equal('');
      expect(stderr).to.equal('');
      // git-fsck should report errors since there are broken refs
      let gitFsck = spawn('git', ['fsck', '--strict'], {cwd: this.path});
      return captureOutput(gitFsck, (stdout, stderr) => {
        expect(stdout).to.equal('');
        expect(stderr).to.match(/HEAD\:\s+invalid\s+sha1\s+pointer/);
        // lets invoke git-unpack-objects passing our packed stream
        // so the repository will be repopulated
        const pack = new Pack([this.c3, this.tag]);
        const gitUnpack = spawn('git', ['unpack-objects', '-q', '--strict'],
          {cwd: this.path});
        gitUnpack.stdin.end(pack.serialize());
        return captureOutput(gitUnpack, (stdout, stderr) => {
          expect(stdout).to.equal('');
          expect(stderr).to.equal('');
          // git-fsck should be happy again
          gitFsck = spawn('git', ['fsck', '--strict'], {cwd: this.path});
          return captureOutput(gitFsck, (stdout, stderr) => {
            expect(stdout).to.equal('');
            expect(stderr).to.equal('');
            return done();
          });
        });
      });
    });
  });

  return test('parse repository packed object(with delta entries)', function(done) {
    const gitGc = spawn('git', ['gc'], {cwd: this.path});
    return captureOutput(gitGc, () => {
      const packDir = path.join(this.path, '.git', 'objects', 'pack');
      let files = glob.sync(packDir + '/*.pack');
      const packData = fs.readFileSync(files[0]);
      const pack = Pack.deserialize(packData);
      // delete de pack files
      files = glob.sync(packDir + '/*');
      for (let file of Array.from(files)) {
        fs.unlinkSync(file);
      }
      // git-fsck should report errors since there are broken refs
      let gitFsck = spawn('git', ['fsck', '--strict'], {cwd: this.path});
      return captureOutput(gitFsck, (stdout, stderr) => {
        expect(stdout).to.equal('');
        expect(stderr).to.match(/HEAD\:\s+invalid\s+sha1\s+pointer/);
        const gitUnpack = spawn('git', ['unpack-objects', '-q', '--strict'],
          {cwd: this.path});
        gitUnpack.stdin.end(pack.serialize());
        return captureOutput(gitUnpack, (stdout, stderr) => {
          expect(stdout).to.equal('');
          expect(stderr).to.equal('');
          // git-fsck should be happy again
          gitFsck = spawn('git', ['fsck', '--strict'], {cwd: this.path});
          return captureOutput(gitFsck, (stdout, stderr) => {
            expect(stdout).to.equal('');
            expect(stderr).to.equal('');
            return done();
          });
        });
      });
    });
  });
});



suite('zlib binding', () =>
  test('deflate/inflate some data synchronously', function() {
    const data = new Buffer(30);
    data.fill('a');
    const deflated = _zlib.deflate(data);
    const mixedData = Buffer.concat([
      deflated,
      new Buffer([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    ]);
    // the following code is the reason why this zlib binding was needed:
    // packfiles contain deflated data mixed with other data, so to
    // advance properly in the packfile stream, we need to know how
    // many bytes each deflated sequence uses
    // we also to pass the original data size (which is available
    // on packfiles)so inflate can efficiently allocate memory to
    // hold output
    const [inflated, bytesRead] = Array.from(_zlib.inflate(mixedData, data.length));
    expect(inflated.toString()).to.equal(data.toString());
    return expect(bytesRead).to.equal(deflated.length);
  })
);


suite('delta encoding/decoding', function() {
  test('encode/decode 1', function() {
    const a = new Buffer("text file line 1\ntext file line 2\na");
    const b = new Buffer("text file line 2\ntext file line 1\nab");
    const delta = diff(a, b);
    // the expected instructions to produce 'b' from 'a' are:
    // 1 - copy 17 bytes from offset 17
    // 2 - copy 17 bytes from offset 0
    // 3 - insert 'ab'
    // which encodes to hex values each section being an opcode sequence:
    // ----
    // 23  24 (header sizes)
    // ----
    // 91 = 80(copy) | 01(next byte) offset | 10(next byte) length
    // 11 = 17 offset
    // 11 = 17 length
    // ----
    // 90 = 80(copy) | 10(next byte) length
    // 11 = 17 length
    // ----
    // 02 = (insert) the next two bytes
    // 61 62 = a b
    expect(delta.toString('hex')).to.equal('23249111119011026162');
    const patched = patch(a, delta);
    return expect(patched.toString('hex')).to.equal(b.toString('hex'));
  });

  test('encode/decode 2', function() {
    const a = new Buffer(
      `\
some text
with some words
abcdef
ghijkl
mnopqr
ab
rst\
`
    );
    const b = new Buffer(
      `\
some text
words
abcdef
ghijkl
mnopqr
ba
rst
h\
`
    );
    const delta = diff(a, b);
    // the expected instructions to produce 'b' from 'a' are:
    // 1 - copy 10 bytes from offset 0
    // 2 - insert 'text file line 1'
    // 3 - copy 7 bytes from offset 25
    // 4 - insert 'h'
    // which encodes to:
    // 35  2d = (header sizes)
    // ----
    // 90 = 80(copy) | 10(next byte) length (matches "some words\nw"ords)
    // 0b = 11 length
    // ----
    // 05 = (insert) the next 5 bytes
    // 6f 72 64 73 0a = o r d s \n
    // ----
    // 91 = 80(copy) | 01(next byte) offset | 10(next byte) length
    // 1a = 26 offset
    // 15 = 21 length (abcdef\nghijkl\nmnopqr\n)
    // ----
    // 08 = (insert) next 8 bytes
    // 62 61 0a 72 73 74 0a 68 = b a \n r s t \n h
    //
    // observation:
    // while it might seem that the 'rst' substring should match,
    // notice that in the first buffer it actually is 'rst\n'
    const patched = patch(a, delta);
    expect(delta.toString('hex')).to.equal(
      '352d900b056f7264730a911a150862610a7273740a68');
    return expect(patched.toString('hex')).to.equal(b.toString('hex'));
  });

  return test('encode/decode binary data', function() {
    const a = new Buffer(1 << 14); // 16384 
    a.fill(200);
    const b = new Buffer((1 << 13) - 10); // 8182
    b.fill(200);
    const c = new Buffer(10);
    c.fill(199);
    let d = new Buffer(1 << 13); // 8192
    d.fill(200);
    d = Buffer.concat([b, c, d]);
    const delta = diff(a, d);
    // the expected instructions to produce 'd' from 'a' are:
    // 1 - copy 8182 bytes from offset 0
    // 2 - insert c7(199) 10 times and c8(200) 80 times(block size is 90)
    // 3 - copy 8112 bytes from offset 0
    // which encodes to:
    // 80 80 01  80 80 01 (header sizes)
    // ----
    // b0 = 80(copy) | 10(next byte) length | 20(next byte << 8) length
    // f6 = 246 length
    // 1f = (31 << 8) length (246 + (31 << 8)) == 8182
    // ----
    // 5a = (insert) next 90 bytes
    // c7 (10 times) c8 (80 times)
    // ----
    // b0 = 80(copy) | 10(next byte) length | 20(next byte << 8) length
    // b0 = 176 length
    // 1f = (31 << 8) length (176 + (31 << 8)) == 8112
    // ----
    // 8182 + 90 + 8112 = 16384
    const patched = patch(a, delta);
    return expect(patched.toString('hex')).to.equal(d.toString('hex'));
  });
});

