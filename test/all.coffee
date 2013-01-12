fs = require 'fs'
path = require 'path'
temp = require 'temp'
zlib = require 'zlib'
glob = require 'glob'
wrench = require 'wrench'
{spawn} = require 'child_process'
{expect} = require 'chai'
{Blob, Tree, Commit, Tag, Pack} = require '../src/js'
_zlib = require '../src/js/zlib'
{patch, diff} = require '../src/js/delta'


createGitRepo = (done) ->
  temp.mkdir 'test-repo', (err, path) =>
    @path = path
    git = spawn 'git', ['init', path]
    git.on 'exit', ->
      done()

deleteGitRepo = -> wrench.rmdirSyncRecursive(@path, true)

captureOutput = (child, cb) ->
  out = []
  err = []
  child.stdout.setEncoding 'utf8'
  child.stderr.setEncoding 'utf8'
  child.stdout.on 'data', (chunk) ->
    out.push chunk
  child.stderr.on 'data', (chunk) ->
    err.push chunk
  child.stderr.on 'end', ->
    cb(out.join(''), err.join(''))
  
writeGitGraph = (repo, root, refName, cb) ->
  count = 0
  writeCb = ->
    count--
    cb() if !count
  head = root.serialize (serialized) ->
    count++
    writeGitObject(repo, serialized, writeCb)
  if refName
    if head.getType() == 'tag'
      refType = 'tags'
    else
      refType = 'heads'
    refPath = path.join(repo, '.git', 'refs', refType, refName)
    fs.writeFileSync(refPath, head.getHash(), 'utf8')
      
writeGitObject = (repo, serialized, cb) ->
  hash = serialized.getHash()
  dir = path.join(repo, '.git', 'objects', hash.slice(0, 2))
  fs.mkdir dir, ->
    bufferPath = path.join(dir, hash.slice(2))
    bufferFile = fs.createWriteStream(bufferPath, mode: 0o444)
    deflate = zlib.createDeflate()
    deflate.pipe(bufferFile)
    bufferFile.on 'open', ->
      deflate.end(serialized.getData())
      if typeof cb == 'function' then bufferFile.on('close', cb)
    bufferFile.on 'error', (err) ->
      if typeof cb == 'function' then cb()

testObjects = ->
  d1 = new Date 1000000000
  d2 = new Date 2000000000
  d3 = new Date 3000000000
  str = ''
  for i in [0...1000]
    str += 'test content/test content2/test content3\n'
  @b1 = new Blob str
  # this encode second blob as a delta of the first in packfiles
  @b2 = new Blob str + 'append'
  @b3 = new Blob 'subdir test content\n'
  @t1 = new Tree {
    'file-under-tree': @b3
  }
  @t2 = new Tree {
    'some-file.txt': @b2
    'some-file2.txt': @b1
    'sub-directory.d': @t1
  }
  @t3 = new Tree {
    'another-file.txt': @b1
  }
  author = 'Git User <user@domain.com>'
  @c1 = new Commit @t1, author, null, d1, "Artificial commit 1"
  @c2 = new Commit @t2, author, null, d2, "Artificial commit 2", [@c1]
  @c3 = new Commit @t3, author, null, d3, "Artificial commit 3", [@c2]
  @tag = new Tag @c2, 'v0.0.1', author, d2, 'Tag second commit'

suite 'object serialization/deserialization', ->

  setup testObjects

  test 'blob', ->
    serialized = @b1.serialize()
    [blob, hash] = Blob.deserialize serialized.getData()
    expect(blob.contents.toString 'utf8').to.equal @b1.contents
    expect(hash).to.equal serialized.getHash()

  test 'tree', ->
    serialized = @t2.serialize()
    [tree, hash] = Tree.deserialize serialized.getData()
    expect(tree.children['some-file2.txt']).to.equal @b1.serialize()
      .getHash()
    expect(tree.children['some-file.txt']).to.equal @b2.serialize()
      .getHash()
    expect(tree.children['sub-directory.d']).to.equal @t1.serialize()
      .getHash()
    expect(hash).to.equal serialized.getHash()

  test 'commit', ->
    serialized = @c2.serialize()
    [commit, hash] = Commit.deserialize serialized.getData()
    expect(commit.tree).to.equal @t2.serialize().getHash()
    expect(commit.author).to.equal @c2.author
    expect(commit.date.getTime()).to.equal @c2.date.getTime()
    expect(commit.parents[0]).to.equal @c1.serialize().getHash()
    expect(commit.message).to.equal @c2.message
    expect(hash).to.equal serialized.getHash()

  test 'tag', ->
    serialized = @tag.serialize()
    [tag, hash] = Tag.deserialize serialized.getData()
    expect(tag.object).to.equal @c2.serialize().getHash()
    expect(tag.type).to.equal 'commit'
    expect(tag.name).to.equal @tag.name
    expect(tag.tagger).to.equal @tag.tagger
    expect(tag.date.getTime()).to.equal @tag.date.getTime()
    expect(tag.message).to.equal @tag.message
    expect(hash).to.equal serialized.getHash()

  test 'pack', ->
    pack = new Pack [@c3, @tag]
    serialized = pack.serialize()
    deserialized = Pack.deserialize(serialized)
    expect(serialized.toString 'base64').to.equal(
      deserialized.serialize().toString('base64'))

suite 'git repository manipulation', ->

  suiteSetup createGitRepo

  suiteTeardown deleteGitRepo

  setup (done) ->
    testObjects.call @
    # write objects to the repository
    writeGitGraph @path, @c3, 'master', =>
      writeGitGraph @path, @tag, @tag.name, done

  test 'check repository integrity', (done) ->
    gitFsck = spawn 'git', ['fsck', '--strict'], cwd: @path
    captureOutput gitFsck, (stdout, stderr) ->
      expect(stdout).to.equal ''
      expect(stderr).to.equal ''
      done()

  test 'unpack objects in repository', (done) ->
    # delete all git objects written so git-unpack-objects will
    # actually unpack all objects
    objectsDir = path.join(@path, '.git', 'objects')
    find = spawn 'find', [objectsDir, '-type', 'f', '-delete']
    captureOutput find, (stdout, stderr) =>
      expect(stdout).to.equal ''
      expect(stderr).to.equal ''
      # git-fsck should report errors since there are broken refs
      gitFsck = spawn 'git', ['fsck', '--strict'], cwd: @path
      captureOutput gitFsck, (stdout, stderr) =>
        expect(stdout).to.equal ''
        expect(stderr).to.match /HEAD\:\s+invalid\s+sha1\s+pointer/
        # lets invoke git-unpack-objects passing our packed stream
        # so the repository will be repopulated
        pack = new Pack [@c3, @tag]
        gitUnpack = spawn 'git', ['unpack-objects', '-q', '--strict'],
          cwd: @path
        gitUnpack.stdin.end(pack.serialize())
        captureOutput gitUnpack, (stdout, stderr) =>
          expect(stdout).to.equal ''
          expect(stderr).to.equal ''
          # git-fsck should be happy again
          gitFsck = spawn 'git', ['fsck', '--strict'], cwd: @path
          captureOutput gitFsck, (stdout, stderr) =>
            expect(stdout).to.equal ''
            expect(stderr).to.equal ''
            done()

  test 'parse repository packed object(with delta entries)', (done) ->
    gitGc = spawn 'git', ['gc'], cwd: @path
    captureOutput gitGc, =>
      packDir = path.join @path, '.git', 'objects', 'pack'
      files = glob.sync packDir + '/*.pack'
      packData = fs.readFileSync files[0]
      pack = Pack.deserialize packData
      # delete de pack files
      files = glob.sync packDir + '/*'
      for file in files
        fs.unlinkSync(file)
      # git-fsck should report errors since there are broken refs
      gitFsck = spawn 'git', ['fsck', '--strict'], cwd: @path
      captureOutput gitFsck, (stdout, stderr) =>
        expect(stdout).to.equal ''
        expect(stderr).to.match /HEAD\:\s+invalid\s+sha1\s+pointer/
        gitUnpack = spawn 'git', ['unpack-objects', '-q', '--strict'],
          cwd: @path
        gitUnpack.stdin.end(pack.serialize())
        captureOutput gitUnpack, (stdout, stderr) =>
          expect(stdout).to.equal ''
          expect(stderr).to.equal ''
          # git-fsck should be happy again
          gitFsck = spawn 'git', ['fsck', '--strict'], cwd: @path
          captureOutput gitFsck, (stdout, stderr) =>
            expect(stdout).to.equal ''
            expect(stderr).to.equal ''
            done()



suite 'zlib binding', ->
  test 'deflate/inflate some data synchronously', ->
    data = new Buffer 30
    data.fill 'a'
    deflated = _zlib.deflate data
    mixedData = Buffer.concat [
      deflated
      new Buffer [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    ]
    # the following code is the reason why this zlib binding was needed:
    # packfiles contain deflated data mixed with other data, so to
    # advance properly in the packfile stream, we need to know how
    # many bytes each deflated sequence uses
    # we also to pass the original data size (which is available
    # on packfiles)so inflate can efficiently allocate memory to
    # hold output
    [inflated, bytesRead] = _zlib.inflate mixedData, data.length
    expect(inflated.toString()).to.equal data.toString()
    expect(bytesRead).to.equal deflated.length


suite 'delta encoding/decoding', ->
  test 'encode/decode 1', ->
    a = new Buffer "text file line 1\ntext file line 2\na"
    b = new Buffer "text file line 2\ntext file line 1\nab"
    delta = diff a, b
    # the expected instructions to produce 'b' from 'a' are:
    # 1 - copy 17 bytes from offset 17
    # 2 - copy 17 bytes from offset 0
    # 3 - insert 'ab'
    # which encodes to hex values each section being an opcode sequence:
    # ----
    # 23  24 (header sizes)
    # ----
    # 91 = 80(copy) | 01(next byte) offset | 10(next byte) length
    # 11 = 17 offset
    # 11 = 17 length
    # ----
    # 90 = 80(copy) | 10(next byte) length
    # 11 = 17 length
    # ----
    # 02 = (insert) the next two bytes
    # 61 62 = a b
    expect(delta.toString('hex')).to.equal '23249111119011026162'
    patched = patch a, delta
    expect(patched.toString 'hex').to.equal b.toString 'hex'

  test 'encode/decode 2', ->
    a = new Buffer(
      """
      some text
      with some words
      abcdef
      ghijkl
      mnopqr
      ab
      rst
      """
    )
    b = new Buffer(
      """
      some text
      words
      abcdef
      ghijkl
      mnopqr
      ba
      rst
      h
      """
    )
    delta = diff a, b
    # the expected instructions to produce 'b' from 'a' are:
    # 1 - copy 10 bytes from offset 0
    # 2 - insert 'text file line 1'
    # 3 - copy 7 bytes from offset 25
    # 4 - insert 'h'
    # which encodes to:
    # 35  2d = (header sizes)
    # ----
    # 90 = 80(copy) | 10(next byte) length (matches "some words\nw"ords)
    # 0b = 11 length
    # ----
    # 05 = (insert) the next 5 bytes
    # 6f 72 64 73 0a = o r d s \n
    # ----
    # 91 = 80(copy) | 01(next byte) offset | 10(next byte) length
    # 1a = 26 offset
    # 15 = 21 length (abcdef\nghijkl\nmnopqr\n)
    # ----
    # 08 = (insert) next 8 bytes
    # 62 61 0a 72 73 74 0a 68 = b a \n r s t \n h
    #
    # observation:
    # while it might seem that the 'rst' substring should match,
    # notice that in the first buffer it actually is 'rst\n'
    patched = patch a, delta
    expect(delta.toString 'hex').to.equal(
      '352d900b056f7264730a911a150862610a7273740a68')
    expect(patched.toString 'hex').to.equal b.toString 'hex'

  test 'encode/decode binary data', ->
    a = new Buffer 1 << 14 # 16384 
    a.fill 200
    b = new Buffer (1 << 13) - 10 # 8182
    b.fill 200
    c = new Buffer 10
    c.fill 199
    d = new Buffer 1 << 13 # 8192
    d.fill 200
    d = Buffer.concat [b, c, d]
    delta = diff a, d
    # the expected instructions to produce 'd' from 'a' are:
    # 1 - copy 8182 bytes from offset 0
    # 2 - insert c7(199) 10 times and c8(200) 80 times(block size is 90)
    # 3 - copy 8112 bytes from offset 0
    # which encodes to:
    # 80 80 01  80 80 01 (header sizes)
    # ----
    # b0 = 80(copy) | 10(next byte) length | 20(next byte << 8) length
    # f6 = 246 length
    # 1f = (31 << 8) length (246 + (31 << 8)) == 8182
    # ----
    # 5a = (insert) next 90 bytes
    # c7 (10 times) c8 (80 times)
    # ----
    # b0 = 80(copy) | 10(next byte) length | 20(next byte << 8) length
    # b0 = 176 length
    # 1f = (31 << 8) length (176 + (31 << 8)) == 8112
    # ----
    # 8182 + 90 + 8112 = 16384
    patched = patch a, delta
    expect(patched.toString 'hex').to.equal d.toString 'hex'

