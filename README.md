### node-git-core

Library that provides simple object-oriented api for working with git data at a
lower level, see [git internals](http://git-scm.com/book/en/Git-Internals) for more info:

#### Installation
```sh
npm install git-core
```

#### Usage

```js
git = require('git-core');
Blob = git.Blob;
Tree = git.Tree;
Commit = git.Commit;
Tag = git.Tag;
Pack = git.Pack;

b1 = new Blob('Some file');

b2 = new Blob(new Buffer([1,2,3,4,5])); // blob with binary data

b3 = new Blob('Another file\n');

// (For now file modes are not supported on trees, all blobs have mode 100644 and
// subtrees have mode 040000)

t1 = new Tree({
  'file-under-tree': b3
});

t2 = new Tree({
  'some-file.txt': b2,
  'some-file2.txt': b1,
  'sub-directory.d': t1
});

t3 = new Tree({
  'another-file.txt': b1
});

// Lets create some commmits

c1 = new Commit({
  tree: t1,
  author: {
    name: 'Git Author',
    email: 'author@git.com',
    date: d1
  },
  message: 'Artificial commit 1'
});

c2 = new Commit({
  tree: t2,
  author: {
    name: 'Git Author',
    email: 'author@git.com',
    date: d2
  },
  message: 'Artificial commit 2',
  parents: [c1]
});

c3 = new Commit({
  tree: t3,
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
  parents: [c2]
});

tag = new Tag({
  object: c2,
  name: 'v0.0.1',
  tagger: {
    name: 'Git Tagger',
    email: 'tagger@git.com'
  },
  date: d2,
  message: 'Tag second commit'
});

// Lets pack everything toguether

pack = new Pack([c3, tag]);
serializedPack = pack.serialize(); // this is a git packfile

// We only need to add a head to the pack, all other will be added
// automatically when serializing
```

This library is all about working with git data in-memory, no repositories are
needed. Above is an example
on how git objects can be created, connected and serialized, the inverse
is also supported:

```js
// Lets say 'buffer' contains a packfile data that you read from disk or
// received from 'git-fetch-pack'

pack = Pack.deserialize(buffer);

// pack now contains a ready-to-use git object graph

// print all blobs in the pack
for (var i = 0;i < pack.objects.length;i++) {
  var obj = pack.objects[i];
  if (obj instanceof Blob) {
    console.log(obj.serialize().getHash(), ':', obj.contents.toString()));
  }
}

// deserialization of 'thin packs' is also supported, you just have to pass a
// callback as a second argument to 'deserialize', which will be called with
// the sha1 id whenever a base object is required

pack = Pack.deserialize(buffer, function(baseSha1) {
  // fetch the object with 'baseSha1' id from somewhere and return
});
```

Delta compression is only fully supported on 'deserialization. If you need to
encode objects using delta compression then add the deltas manually:

```js
str = '';
for (i = _i = 0; _i < 1000; i = ++_i) {
  str += 'test content/test content2/test content3\n';
}

b1 = new Blob(str);
b2 = new Blob(str + 'append\n');
b3 = new Blob(str + 'append\nappend2\n');
b4 = new Blob(str + 'append\nappend2\nappend3\n');

pack = new Pack([
  b1,
  b2.diff(b1),
  b3.diff(b2),
  b4.diff(b3)
]);
pack.serialize();
```
